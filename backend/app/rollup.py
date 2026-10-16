"""事件汇总与保留期清理（ADR-004）。

把 ``events`` 按天汇总进 ``daily_stats``（北极星只查汇总表，不扫原始事件），
并删除超过保留期的原始事件。CLI 入口在 ``scripts/rollup_events.py``（每日 cron 调用）。

口径见 ``docs/PROGRESS-DATA.md``：主动/被动由事件 payload 的 ``active`` 标志区分，
学习秒数取 ``activity_done`` 的 ``payload.seconds``。

**时间口径**（详见 ``app/timeutil.py``）：
- ``day`` 参数是 ``KIDS_TZ``（默认 ``Asia/Shanghai``）下的日期，不是 UTC 日；
- 查询先经 ``datetime()`` 归一 —— ``client_ts``（ISO 带 ``Z``）与
  ``server_ts``（空格分隔）两种格式**文本不可比较**，直接比会算错。
"""
import json
import os
from datetime import timedelta

from .timeutil import local_day_bounds_utc, to_sqlite, utc_now

RETENTION_DAYS = int(os.environ.get("KIDS_EVENT_RETENTION_DAYS", 180))


def rollup_day(conn, day: str) -> int:
    """把某天的事件累加进 daily_stats。幂等：先算后覆盖（可安全重跑/回填）。

    ``day`` 是本地（``KIDS_TZ``）日期字符串；内部换算成 UTC 半开区间再查。
    返回受影响的「孩子-日」数量。
    """
    start, end = local_day_bounds_utc(day)
    rows = conn.execute(
        """SELECT child_id, payload_json FROM events
           WHERE child_id IS NOT NULL
             AND datetime(COALESCE(client_ts, server_ts)) >= ?
             AND datetime(COALESCE(client_ts, server_ts)) < ?""",
        (start, end),
    ).fetchall()
    agg: dict[int, list[int]] = {}
    for r in rows:
        try:
            p = json.loads(r["payload_json"])
        except (ValueError, TypeError):
            continue
        if not isinstance(p, dict):
            continue
        try:
            sec = int(p.get("seconds") or 0)
        except (ValueError, TypeError):
            sec = 0
        a = agg.setdefault(r["child_id"], [0, 0, 0])
        if p.get("active"):
            a[0] += sec
        else:
            a[1] += sec
        a[2] += 1
    for cid, (act, pas, n) in agg.items():
        conn.execute(
            """INSERT INTO daily_stats (child_id, date, active_seconds, passive_seconds, activities)
               VALUES (?,?,?,?,?)
               ON CONFLICT(child_id, date) DO UPDATE SET
                 active_seconds=excluded.active_seconds,
                 passive_seconds=excluded.passive_seconds,
                 activities=excluded.activities""",
            (cid, day, act, pas, n),
        )
    return len(agg)


def purge(conn, keep_days: int = RETENTION_DAYS) -> int:
    """删除超过保留期的原始事件（汇总已落 daily_stats，明细不长期留）。

    同样经 ``datetime()`` 归一后再比，避免 ``server_ts`` 之外的格式混入时失准。
    """
    cutoff = to_sqlite(utc_now() - timedelta(days=keep_days))
    cur = conn.execute("DELETE FROM events WHERE datetime(server_ts) < ?", (cutoff,))
    return cur.rowcount
