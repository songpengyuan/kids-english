#!/usr/bin/env bash
# ============================================================================
# kids-english 本地「应急」部署 —— 仅在 CI 不可用时手工使用
# ============================================================================
# 常规部署由 .github/workflows/deploy.yml 负责：
#   push → 门禁 → 前端 rsync 到 www/ + 后端 rsync 到服务器 → systemctl restart
#   → /api/ping 健康校验（详见 ADR-003）。
# 本脚本是**兜底通道**：CI 到服务器的 SSH 通道故障时，从本机把代码同步到服务器。
#
# ⚠️ 红线：代码同步，数据与凭据**永不同步**。
#    生产库（*.db / *.db-wal / *.db-shm）、录音（media/）、凭据（.env）、
#    虚拟环境（.venv）只属于服务器，任何情况下都不随本脚本上传，也不允许被删。
#
#    历史 bug（本次修复）：旧版排除项写作 server/.venv / server/.env / server/__pycache__，
#    但目录早已从 server/ 改名为 backend/ —— 三条 exclude 全部落空；且 ROOT 只上溯一级、
#    实际只同步 frontend/。二者叠加后，旧脚本曾有**用本地开发库覆盖生产库**的能力
#    （rsync 不读 .gitignore）。
#
# 用法：
#   bash frontend/scripts/deploy-server.sh              # 交互确认后同步
#   bash frontend/scripts/deploy-server.sh --yes        # 跳过确认（谨慎）
#   DRY_RUN=1 bash frontend/scripts/deploy-server.sh    # 只打印将同步什么，不动服务器
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"   # frontend/scripts/ → 仓库根
HOST="${DEPLOY_HOST:-hw}"
REMOTE_REPO="${REMOTE_REPO:-/www/wwwroot/kids-english/repo}"

# 代码同步，数据与凭据永不同步。
# 新增服务器侧文件类型时，回来补这里 —— 这是白名单思路维护的排除列表。
EXCLUDES=(
  --exclude '.git'
  --exclude 'node_modules'
  --exclude 'dist'
  --exclude '.vite'
  --exclude '.DS_Store'
  --exclude '*.log'
  --exclude '.venv'
  --exclude '.env'
  --exclude '.env.*'
  --exclude '*.db'
  --exclude '*.db-wal'
  --exclude '*.db-shm'
  --exclude 'media/'
  --exclude '__pycache__/'
  --exclude '.pytest_cache/'
  --exclude 'backups/'
)

RSYNC_ARGS=(-az --delete "${EXCLUDES[@]}")

echo "==> 目标：$HOST:$REMOTE_REPO"

if [ "${DRY_RUN:-}" = "1" ]; then
  echo "==> [DRY_RUN] 以下是将要同步的内容（不会改动服务器）："
  rsync "${RSYNC_ARGS[@]}" --dry-run --itemize-changes "$ROOT/" "$HOST:$REMOTE_REPO/"
  exit 0
fi

if [ "${1:-}" != "--yes" ]; then
  cat <<'EOF'
⚠️  即将把仓库代码同步到生产服务器（--delete 会删除服务器侧多出的**代码**文件）。
    数据库、录音、.env、.venv 已被排除：不会上传，也不会被删除。
    确认请输入 yes：
EOF
  read -r ans
  [ "$ans" = "yes" ] || { echo "已取消。"; exit 1; }
fi

echo "==> [1/2] 同步代码到服务器 staging"
rsync "${RSYNC_ARGS[@]}" "$ROOT/" "$HOST:$REMOTE_REPO/"

# 服务器侧 deploy.sh 不在本仓库内（含 venv 依赖安装 / 前端构建 / 服务重启）。
# 执行前请确认其行为 —— 本脚本只负责把代码送上去。
echo "==> [2/2] 触发服务器侧部署（/www/wwwroot/kids-english/deploy.sh）"
ssh "$HOST" 'bash /www/wwwroot/kids-english/deploy.sh'

echo "完成 ✅  http://110.41.61.4/"
