#!/usr/bin/env bash
# kids-english 每日安全备份
#  - kids.db：sqlite3 在线备份 API（一致性快照，替代直接 cp）+ 完整性校验
#  - media/  ：孩子录音资产打包（tar.gz）
#  - 保留 14 天；日志 backups/backup.log
# 由 /etc/cron.d/kids-db-backup 每日 02:30 调用。
set -euo pipefail

APP=/www/wwwroot/kids-english
BK="$APP/backups"
PY="$APP/backend/.venv/bin/python"
TODAY=$(date +%Y%m%d)
LOG="$BK/backup.log"
mkdir -p "$BK"

"$PY" - "$BK" "$APP" "$TODAY" <<'PY'
import pathlib
import sqlite3
import sys
import tarfile

bk, app, today = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3]
db = app / "backend" / "kids.db"
dbk = bk / f"kids-{today}.db"
log_path = bk / "backup.log"


def write_log(msg: str) -> None:
    with log_path.open("a") as f:
        f.write(f"[{today}] {msg}\n")


if not db.exists():
    write_log("FAILED: kids.db not found")
    raise SystemExit(1)

# 1) 在线一致性快照（sqlite3 backup API，WAL 下同样安全）
src = sqlite3.connect(str(db))
dst = sqlite3.connect(str(dbk))
try:
    src.backup(dst)
finally:
    dst.close()
    src.close()

# 2) 完整性校验（直接对快照文件执行）
try:
    chk = sqlite3.connect(str(dbk)).execute("PRAGMA integrity_check").fetchone()[0]
except sqlite3.Error as e:
    write_log(f"FAILED: integrity check error {e}")
    raise SystemExit(1)
if chk != "ok":
    write_log(f"FAILED: integrity={chk}")
    raise SystemExit(1)

# 3) media 录音资产打包（非空才打）
media = app / "backend" / "media"
if media.is_dir() and any(media.iterdir()):
    with tarfile.open(bk / f"media-{today}.tar.gz", "w:gz") as tar:
        tar.add(str(media), arcname="media")

write_log(f"ok db={db.stat().st_size}B backup={dbk.stat().st_size}B integrity={chk}")
PY

# 4) 保留 14 天
find "$BK" \( -name "kids-*.db" -o -name "media-*.tar.gz" \) -mtime +14 -delete
exit 0
