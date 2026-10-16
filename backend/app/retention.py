"""录音保留期与孤儿文件清理（ADR-005）。

**关键取舍：删音频，留分数。**
家长长期需要的是"孩子这句话越读越准"的**趋势**（分数序列），而不是三个月前那段
听不清的 webm。音频是即时的、可再生的（重录即可）；分数是不可再生的历史。
所以清理时：删音频文件 + 把 ``file_path`` 置空 + 标记 ``purged_at``，
**保留行与 ``scores_json``**。这让"隐私最小化"与"家长价值"同时成立，而不是二选一。

⚠️ 注意：14 天滚动备份窗口内，被删除的音频仍存在于历史快照里 —— 不能在对外说明中
声称"删除后立即不可恢复"（见 docs/DATA-INVENTORY.md）。
"""
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

# 默认保留 90 天。倾向"按总量封顶"而非无限延长天数（天数增长不可控）。
MEDIA_RETENTION_DAYS = int(os.environ.get("KIDS_MEDIA_RETENTION_DAYS", 90))


def _abs_path(media_root: Path, stored: str) -> Path:
    p = Path(stored)
    return p if p.is_absolute() else media_root / p


def purge_expired(conn, media_root: Path, keep_days: int = MEDIA_RETENTION_DAYS) -> int:
    """删除超过保留期的音频文件；行与分数保留（file_path 置空 + purged_at）。"""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=keep_days)).strftime("%Y-%m-%d %H:%M:%S")
    rows = conn.execute(
        """SELECT id, file_path FROM recordings
           WHERE file_path != '' AND purged_at IS NULL AND created_at < ?""",
        (cutoff,),
    ).fetchall()
    purged = 0
    for r in rows:
        p = _abs_path(media_root, r["file_path"])
        try:
            p.unlink(missing_ok=True)
        except OSError:
            continue  # 文件删不掉就下次再来，不标记 purged
        conn.execute(
            "UPDATE recordings SET file_path='', purged_at=datetime('now') WHERE id=?",
            (r["id"],),
        )
        purged += 1
    return purged


def purge_orphans(conn, media_root: Path) -> int:
    """删除 media 下无人引用的文件（上传成功但入库失败的半成品等）。"""
    if not media_root.is_dir():
        return 0
    referenced = {
        str(_abs_path(media_root, r["file_path"]))
        for r in conn.execute("SELECT file_path FROM recordings WHERE file_path != ''")
    }
    removed = 0
    for child_dir in media_root.iterdir():
        if not child_dir.is_dir():
            continue
        for f in child_dir.iterdir():
            if f.is_file() and str(f) not in referenced:
                try:
                    f.unlink()
                    removed += 1
                except OSError:
                    pass
    return removed
