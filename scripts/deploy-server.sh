#!/usr/bin/env bash
# kids-english 一键部署到华为云服务器（110.41.61.4）
# 用法：bash scripts/deploy-server.sh   （先 push 代码后执行，或 push 前后均可）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="hw"
REMOTE_REPO="/www/wwwroot/kids-english/repo"

echo "==> [1/3] 同步代码到服务器（增量）"
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .git \
  --exclude .DS_Store --exclude .vite --exclude '*.log' \
  --exclude server/.venv --exclude server/.env --exclude server/__pycache__ \
  "$ROOT/" "$HOST:$REMOTE_REPO/"

echo "==> [2/3] 服务器安装依赖并构建"
ssh "$HOST" 'bash /www/wwwroot/kids-english/deploy.sh'

echo "==> [3/3] 完成 ✅  访问 http://110.41.61.4/"
