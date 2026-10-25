"""进度：拉取/上报（/api/v1/progress），按 child 归属校验。

多设备并发（v0.2）：上报从「覆盖写」改为「合并写」——
儿童场景数据只增不减，双设备各玩各的互不丢：星级取 max、
玩过列表取并集、单词逐词合并（计数 max + lastAt 取较新）、
今日统计/每日快照同日期取 max。
"""
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..db import connect
from ..schemas import ProgressIn, ProgressOut, ProgressPutOut
from .auth import _require_family

router = APIRouter(prefix="/api/v1/children/{child_id}", tags=["progress"])

# 合并时按结构保留的字段（星级之外的容器/列表字段，各有专门合并逻辑）。
# 数值键不设白名单——曾经手写 6 个旧玩法，memory/order 上线后漏进清单，
# 星数走了整键覆盖而非取 max，多设备同步时较低星会抹掉服务端的较高星
# （2026-10-25 接口评审发现）。任何"只增不减"的数值字段都按 max 合。
_STRUCT_KEYS = ("completed", "words")


def _child_belongs(conn, child_id: int, family_id: int) -> bool:
    return bool(
        conn.execute(
            "SELECT id FROM children WHERE id=? AND family_id=?", (child_id, family_id)
        ).fetchone()
    )


def _merge_word(existing: dict, incoming: dict) -> dict:
    """逐词合并：seen/correct/wrong 取 max；lastAt 取较新，SRS 状态跟随较新活动。"""
    merged = {**existing, **incoming}
    for k in ("seen", "correct", "wrong"):
        a, b = existing.get(k, 0) or 0, incoming.get(k, 0) or 0
        if a or b:
            merged[k] = max(a, b)
    a_at, b_at = existing.get("lastAt", 0) or 0, incoming.get("lastAt", 0) or 0
    if b_at >= a_at:
        merged["lastAt"] = b_at
        for k in ("stage", "dueAt"):
            if k in incoming:
                merged[k] = incoming[k]
    else:
        merged["lastAt"] = a_at
        for k in ("stage", "dueAt"):
            if k in existing:
                merged[k] = existing[k]
    return merged


def _merge_lesson(existing: dict, incoming: dict) -> dict:
    """一课合并：星数取 max、completed 取并集、words 逐词合并。"""
    merged = {**existing, **incoming}
    # 数值键一律取 max（不只是已知玩法：任何"计数只增不减"的数值字段都该这样合，
    # 结构字段除外——它们有各自的合并语义，绝不能按数字 max）
    for k in set(existing) | set(incoming):
        if k in _STRUCT_KEYS:
            continue
        a, b = existing.get(k), incoming.get(k)
        if isinstance(a, int) and isinstance(b, int):
            merged[k] = max(a, b)
    ca, cb = set(existing.get("completed", []) or []), set(incoming.get("completed", []) or [])
    if ca or cb:
        merged["completed"] = sorted(ca | cb)
    wa, wb = existing.get("words") or {}, incoming.get("words") or {}
    if wa or wb:
        words = {k: dict(v) for k, v in wa.items()}
        for wid, w in wb.items():
            if wid in words:
                words[wid] = _merge_word(words[wid], w)
            else:
                words[wid] = w
        merged["words"] = words
    return merged


def _merge_meta(existing: dict, incoming: dict) -> dict:
    """孩子级元数据合并：_daily 取较新日期（同日期取 max）、_dailyLog 逐日取 max、_last 取上报值。"""
    merged = dict(existing)
    da, db = existing.get("_daily") or {}, incoming.get("_daily") or {}
    if db.get("date"):
        same = da.get("date") == db["date"]
        newer = not da.get("date") or db["date"] >= da["date"]
        if newer:
            merged["_daily"] = {
                "date": db["date"],
                "durationSec": max(da.get("durationSec", 0) if same else 0, db.get("durationSec", 0) or 0),
                "activities": max(da.get("activities", 0) if same else 0, db.get("activities", 0) or 0),
                "listenSec": max(da.get("listenSec", 0) if same else 0, db.get("listenSec", 0) or 0),
            }
    la, lb = existing.get("_dailyLog") or {}, incoming.get("_dailyLog") or {}
    if la or lb:
        log = {k: dict(v) for k, v in la.items()}
        for date, snap in lb.items():
            if date not in log:
                log[date] = snap
                continue
            cur = log[date]
            log[date] = {
                "durationSec": max(cur.get("durationSec", 0) or 0, snap.get("durationSec", 0) or 0),
                "activities": max(cur.get("activities", 0) or 0, snap.get("activities", 0) or 0),
                "mastered": max(cur.get("mastered", 0) or 0, snap.get("mastered", 0) or 0),
                "listenSec": max(cur.get("listenSec", 0) or 0, snap.get("listenSec", 0) or 0),
            }
        merged["_dailyLog"] = log
    if "_last" in incoming:
        merged["_last"] = incoming["_last"]
    return merged


@router.get("/progress", response_model=ProgressOut)
def get_progress(child_id: int, family_id: int = Depends(_require_family)):
    conn = connect()
    try:
        if not _child_belongs(conn, child_id, family_id):
            raise HTTPException(404, "孩子不存在")
        rows = conn.execute(
            "SELECT lesson_id, data_json FROM progress WHERE child_id=?", (child_id,)
        ).fetchall()
        data: dict = {}
        meta: dict = {}
        for r in rows:
            obj = json.loads(r["data_json"])
            if r["lesson_id"] == "__meta":
                meta = obj
            else:
                data[r["lesson_id"]] = obj
        return {"ok": True, "data": data, "meta": meta}
    finally:
        conn.close()


@router.put("/progress", response_model=ProgressPutOut)
def put_progress(
    child_id: int, body: ProgressIn, family_id: int = Depends(_require_family)
):
    conn = connect()
    try:
        if not _child_belongs(conn, child_id, family_id):
            raise HTTPException(404, "孩子不存在")
        # 课程级进度：合并写（星级 max / completed 并集 / words 逐词合并），多设备互不覆盖
        for lesson_id, obj in (body.data or {}).items():
            row = conn.execute(
                "SELECT data_json FROM progress WHERE child_id=? AND lesson_id=?",
                (child_id, lesson_id),
            ).fetchone()
            existing = json.loads(row["data_json"]) if row else {}
            merged = _merge_lesson(existing, obj)
            conn.execute(
                """INSERT INTO progress (child_id, lesson_id, data_json, updated_at)
                   VALUES (?,?,?,datetime('now'))
                   ON CONFLICT(child_id, lesson_id) DO UPDATE SET
                     data_json=excluded.data_json, updated_at=datetime('now')""",
                (child_id, lesson_id, json.dumps(merged, ensure_ascii=False)),
            )
        # 孩子级元数据（_daily/_last/_dailyLog）：按日期/数值合并
        if body.meta:
            row = conn.execute(
                "SELECT data_json FROM progress WHERE child_id=? AND lesson_id='__meta'",
                (child_id,),
            ).fetchone()
            existing = json.loads(row["data_json"]) if row else {}
            merged_meta = _merge_meta(existing, body.meta)
            conn.execute(
                """INSERT INTO progress (child_id, lesson_id, data_json, updated_at)
                   VALUES (?,'__meta',?,datetime('now'))
                   ON CONFLICT(child_id, lesson_id) DO UPDATE SET
                     data_json=excluded.data_json, updated_at=datetime('now')""",
                (child_id, json.dumps(merged_meta, ensure_ascii=False)),
            )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


class CalendarDayOut(BaseModel):
    date: str
    durationSec: int = 0
    listenSec: int = 0
    activities: int = 0
    mastered: int = 0


class CalendarOut(BaseModel):
    ok: bool = True
    year: int
    month: int
    days: list[CalendarDayOut] = []


@router.get("/calendar", response_model=CalendarOut)
def get_calendar(
    child_id: int,
    year: int = Query(ge=2020, le=2100),
    month: int = Query(ge=1, le=12),
    family_id: int = Depends(_require_family),
):
    """学习日历：返回指定年月每天的学习时长/磨耳朵时长/玩法数。"""
    conn = connect()
    try:
        if not _child_belongs(conn, child_id, family_id):
            raise HTTPException(404, "孩子不存在")
        row = conn.execute(
            "SELECT data_json FROM progress WHERE child_id=? AND lesson_id='__meta'",
            (child_id,),
        ).fetchone()
        if not row:
            return {"ok": True, "year": year, "month": month, "days": []}
        meta = json.loads(row["data_json"])
        log = meta.get("_dailyLog") or {}
        prefix = f"{year}-{month:02d}"
        days: list[CalendarDayOut] = []
        for date, snap in sorted(log.items()):
            if not date.startswith(prefix):
                continue
            days.append(CalendarDayOut(
                date=date,
                durationSec=snap.get("durationSec", 0),
                listenSec=snap.get("listenSec", 0),
                activities=snap.get("activities", 0),
                mastered=snap.get("mastered", 0),
            ))
        return {"ok": True, "year": year, "month": month, "days": days}
    finally:
        conn.close()
