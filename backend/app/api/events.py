"""埋点事件接收（ADR-004）：客户端行为的事件流 + 前端错误上报的目的地。

与 progress 的分工：
- ``events`` 是**高频追加**，且客户端可伪造 → 必须限流 + 尺寸上限 + 归属校验；
- ``progress`` 是**低写入量合并**（孩子进度红线，只增不减）。
  两者的合并语义绝不能互相污染，所以事件走独立表。

北极星（每周主动学习分钟数）**不直接扫本表** —— 由每日 cron 汇总进 ``daily_stats``
（``scripts/rollup_events.py``），查询走汇总表，避免全表扫描。
"""
import json

from fastapi import APIRouter, Depends, HTTPException

from ..db import connect
from ..schemas import EventsIn, EventsOut
from ..timeutil import normalize_client_ts
from ._common import child_belongs
from .auth import _require_family

router = APIRouter(prefix="/api/v1", tags=["events"])

MAX_PAYLOAD_BYTES = 1024
MAX_TYPE_LEN = 40


@router.post("/events", response_model=EventsOut, status_code=201)
def create_events(body: EventsIn, family_id: int = Depends(_require_family)):
    """批量接收埋点事件。按 ``client_event_id`` 幂等；跨家庭一律 404。

    单次条数上限由 ``EventsIn`` 的 ``max_length``（50）保证 —— 超限在请求校验层
    直接 422，契约里可见。
    payload 超 1KB 时截断（保留 ``_truncated`` 标记），避免客户端把大对象塞进事件表
    把单 worker 的写入路径拖慢。

    ``client_ts`` 写入前归一成与 ``server_ts`` 相同的 UTC 格式
    （见 ``app/timeutil.py``）—— 两种格式并存会让按时间的范围查询静默算错。
    归一失败不拒收，落 ``NULL`` 由 ``COALESCE`` 退回 ``server_ts``。
    """
    conn = connect()
    try:
        # 归属校验：本批出现的所有 child_id 必须属于本家庭（同 recordings 的模式）。
        # 任一条越权即整批 404 —— 不做部分写入，避免产生难以解释的"半批数据"。
        for cid in {e.child_id for e in body.events if e.child_id is not None}:
            if not child_belongs(conn, cid, family_id):
                raise HTTPException(404, "孩子不存在")

        accepted = 0
        for e in body.events:
            payload = e.payload if isinstance(e.payload, dict) else {}
            raw = json.dumps(payload, ensure_ascii=False)
            if len(raw.encode("utf-8")) > MAX_PAYLOAD_BYTES:
                raw = json.dumps({"_truncated": True, "len": len(raw)}, ensure_ascii=False)
            cur = conn.execute(
                """INSERT OR IGNORE INTO events
                   (client_event_id, family_id, child_id, type, payload_json, client_ts, app_version)
                   VALUES (?,?,?,?,?,?,?)""",
                (
                    e.client_event_id,
                    family_id,
                    e.child_id,
                    e.type[:MAX_TYPE_LEN],
                    raw,
                    normalize_client_ts(e.client_ts),
                    e.app_version,
                ),
            )
            accepted += cur.rowcount  # 重复的 client_event_id 会被 IGNORE（rowcount=0）
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "received": len(body.events), "accepted": accepted}
