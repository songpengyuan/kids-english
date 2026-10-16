"""录音保留期清理 CLI（ADR-005）—— 由每日 cron 调用。

用法（cwd=backend）：
    .venv/bin/python scripts/purge_media.py              # 删过期音频 + 清孤儿文件
    .venv/bin/python scripts/purge_media.py --keep-days 0 --dry-run   # 只看会做什么
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.api.recordings import MEDIA_ROOT  # noqa: E402
from app.db import connect  # noqa: E402
from app.retention import MEDIA_RETENTION_DAYS, purge_expired, purge_orphans  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep-days", type=int, default=MEDIA_RETENTION_DAYS)
    ap.add_argument("--dry-run", action="store_true", help="只统计，不实际删除")
    args = ap.parse_args()

    conn = connect()
    try:
        if args.dry_run:
            n = conn.execute(
                """SELECT COUNT(*) AS n FROM recordings
                   WHERE file_path != '' AND purged_at IS NULL""",
            ).fetchone()["n"]
            print(f"[media] 当前有音频的录音 {n} 条（dry-run，未删除）")
            return
        purged = purge_expired(conn, MEDIA_ROOT, args.keep_days)
        conn.commit()
        orphans = purge_orphans(conn, MEDIA_ROOT)
        conn.commit()
        print(f"[media] 清理过期音频 {purged} 条（保留分数）；清理孤儿文件 {orphans} 个")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
