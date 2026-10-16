#!/usr/bin/env bash
# 从服务器拉取 kids-english 备份到本机（异地双副本）。
# 用法：bash backend/scripts/pull-backups.sh [目标目录]
# 默认拉到 ~/kids-english-backups/（不进项目 git）。
# 建议每周手动跑一次，或加入本机计划任务（macOS: launchd）。
set -euo pipefail

DEST="${1:-$HOME/kids-english-backups}"
HOST="${KIDS_HOST:-hw}"
mkdir -p "$DEST"

scp -r "${HOST}:/www/wwwroot/kids-english/backups/." "$DEST/" 2>/dev/null || rsync -av "${HOST}:/www/wwwroot/kids-english/backups/" "$DEST/" 2>/dev/null || {
  echo "拉取失败：确认 ssh hw 可用（scp 与 rsync 均失败）" >&2
  exit 1
}

echo "已拉取到 $DEST"
ls -lat "$DEST" | head -6
