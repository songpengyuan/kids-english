"""事件汇总 CLI（ADR-004）—— 由每日 cron 调用。

用法（cwd=backend）：
    .venv/bin/python scripts/rollup_events.py              # 汇总最近 2 天 + 清理
    .venv/bin/python scripts/rollup_events.py --days 7     # 回填最近 7 天
    .venv/bin/python scripts/rollup_events.py --day 2026-10-17

时间口径：``--day`` / 默认「今天」都是 ``KIDS_TZ``（默认 Asia/Shanghai）下的日期，
不是 UTC 日。见 ``app/timeutil.py``。
"""
import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import connect, init_db  # noqa: E402
from app.rollup import RETENTION_DAYS, purge, rollup_day  # noqa: E402
from app.timeutil import TZ_NAME, local_today  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", help="只汇总指定日期（YYYY-MM-DD，KIDS_TZ 口径）")
    ap.add_argument("--days", type=int, default=2, help="汇总最近 N 天（默认 2，覆盖迟到事件）")
    ap.add_argument("--keep-days", type=int, default=RETENTION_DAYS, help="原始事件保留天数")
    args = ap.parse_args()

    # 不假设"服务已经启动过、表已建好"：init_db() 幂等（CREATE IF NOT EXISTS + 已记账的迁移），
    # 顺带把「代码比库新」的情况也补上。否则从备份恢复、或换机重建时，
    # 这个每日任务会在 03:30 静默失败——正是最难被发现的一类故障。
    init_db()

    if args.day:
        days = [args.day]
    else:
        # 用 KIDS_TZ 口径的今天，而不是 date.today()（进程本地时区 = 换机器就变）。
        today = date.fromisoformat(local_today())
        days = [(today - timedelta(days=i)).isoformat() for i in range(args.days)]

    conn = connect()
    try:
        touched = 0
        for d in days:
            touched += rollup_day(conn, d)
        conn.commit()
        removed = purge(conn, args.keep_days)
        conn.commit()
        print(
            f"[rollup] tz={TZ_NAME} 汇总 {len(days)} 天（{'、'.join(days)}）"
            f"/ 涉及 {touched} 个「孩子-日」；清理 {removed} 条过期事件"
        )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
