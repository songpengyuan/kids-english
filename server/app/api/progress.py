"""进度：拉取/上报（/api/v1/progress），按 child 归属校验。"""
import json

from fastapi import APIRouter, Depends, HTTPException

from ..db import connect
from ..schemas import ProgressIn
from .auth import _require_family

router = APIRouter(prefix="/api/v1/progress", tags=["progress"])


def _child_belongs(conn, child_id: int, family_id: int) -> bool:
    return bool(
        conn.execute(
            "SELECT id FROM children WHERE id=? AND family_id=?", (child_id, family_id)
        ).fetchone()
    )


@router.get("/child/{child_id}")
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


@router.put("/child/{child_id}")
def put_progress(
    child_id: int, body: ProgressIn, family_id: int = Depends(_require_family)
):
    conn = connect()
    try:
        if not _child_belongs(conn, child_id, family_id):
            raise HTTPException(404, "孩子不存在")
        # 课程级进度：覆盖写入（前端每次上报该课完整对象，简单可靠）
        for lesson_id, obj in (body.data or {}).items():
            conn.execute(
                """INSERT INTO progress (child_id, lesson_id, data_json, updated_at)
                   VALUES (?,?,?,datetime('now'))
                   ON CONFLICT(child_id, lesson_id) DO UPDATE SET
                     data_json=excluded.data_json, updated_at=datetime('now')""",
                (child_id, lesson_id, json.dumps(obj, ensure_ascii=False)),
            )
        # 孩子级元数据（_daily/_last/_dailyLog）
        if body.meta:
            conn.execute(
                """INSERT INTO progress (child_id, lesson_id, data_json, updated_at)
                   VALUES (?,'__meta',?,datetime('now'))
                   ON CONFLICT(child_id, lesson_id) DO UPDATE SET
                     data_json=excluded.data_json, updated_at=datetime('now')""",
                (child_id, json.dumps(body.meta, ensure_ascii=False)),
            )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()
