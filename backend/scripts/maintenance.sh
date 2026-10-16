#!/usr/bin/env bash
# kids-english 每日维护：事件汇总（ADR-004）+ 录音保留期清理（ADR-005）
#
# 为什么收成**一个入口脚本**、而不是让 cron 直接调两个 python：
#
#   1) 防重叠 —— cron 不保证上一轮跑完了才起下一轮（手工补跑、或某天数据量大跑慢了）。
#      两个实例同时写 SQLite，WAL 下"写-写"会互相等锁，
#      `busy_timeout=5000` 一超时就报错。这里用 flock 保证同一时刻只有一个实例。
#
#   2) 可追溯 —— cron 是**静默**的：没有 MAILTO 收件人、也没有输出重定向的话，
#      出错就是彻底无声。这里统一写日志，并落一份心跳文件，
#      让 health-check.sh 能发现「它已经很久没跑了」——这是最容易发生的故障模式：
#      脚本还在、cron 还在，但某次改动让路径失效，于是永远不再执行。
#
#   3) 时区显式 —— KIDS_TZ 决定「学习日」口径（见 app/timeutil.py）。
#      cron 的环境变量极简（无 PATH/HOME），显式声明的比继承来的可靠。
#
# 由 /etc/cron.d/kids-maintenance 每日 03:30 CST 调用。
# 手工验证：
#   bash /www/wwwroot/kids-english/backend/scripts/maintenance.sh
#   tail -20 /var/log/kids-maintenance.log; cat /www/wwwroot/kids-english/backups/maintenance-state.json
set -euo pipefail

# 路径可被环境变量覆盖，只为**能在本地/预发验证**（硬编码 = 无法验证 = 不鲁棒）。
# 生产上不设这些变量，走默认值。
APP="${KIDS_APP_ROOT:-/www/wwwroot/kids-english}"
BE="$APP/backend"
PY="${KIDS_PY:-$BE/.venv/bin/python}"
LOG="${KIDS_MAINT_LOG:-/var/log/kids-maintenance.log}"
LOCK="${KIDS_MAINT_LOCK:-/var/lock/kids-maintenance.lock}"
STATE="${KIDS_MAINT_STATE:-$APP/backups/maintenance-state.json}"

export KIDS_TZ="${KIDS_TZ:-Asia/Shanghai}"
export PYTHONUNBUFFERED=1

mkdir -p "$(dirname "$STATE")" "$(dirname "$LOG")" 2>/dev/null || true

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG"; }

START=$(date +%s)
log "START tz=$KIDS_TZ pid=$$"

STATUS=ok

# ---- 前提检查（缺依赖必须**响亮失败**，不能变成静默空转）----
# 早期写法是 `if ! flock -n 9; then ... echo SKIP; exit 0; fi`。
# 坑在于：flock 命令**不存在**时 shell 同样返回非 0，于是被误判成
# "上一轮还在跑"，脚本从此每轮都静默跳过 —— 缺依赖伪装成了正常运行。
# 所以先把"工具在不在"和"锁拿不拿得到"分开。
if ! command -v flock >/dev/null 2>&1; then
  STATUS=flock_missing
  log "FAILED 找不到 flock（util-linux）—— 无法保证不与上一轮重叠，本轮不执行任何维护"
elif ! : >>"$LOCK" 2>/dev/null; then
  STATUS=lock_unwritable
  log "FAILED 无法写入锁文件 $LOCK —— 本轮不执行任何维护"
else
  # fd 9 上的锁随进程退出自动释放，比"写 pid 文件 + 判断进程是否存活"可靠得多
  # （后者会被 pid 复用、以及 kill -9 留下的陈旧锁坑到）。
  exec 9>"$LOCK"
  if ! flock -n 9; then
    # 拿不到锁 = 上一轮仍在跑。这不是故障，不该触发告警，也不该算失败。
    log "SKIP 上一轮维护仍在运行，本轮跳过"
    exit 0
  fi

  OUT_ROLLUP=""
  if ! OUT_ROLLUP=$(cd "$BE" && "$PY" scripts/rollup_events.py 2>&1); then
    STATUS=rollup_failed
  fi
  log "rollup ${OUT_ROLLUP:-（无输出）}"

  if [ "$STATUS" = ok ]; then
    OUT_MEDIA=""
    if ! OUT_MEDIA=$(cd "$BE" && "$PY" scripts/purge_media.py 2>&1); then
      STATUS=media_failed
    fi
    log "media  ${OUT_MEDIA:-（无输出）}"
  else
    # 汇总失败就**不**再动媒体：清理是"减法"，在数据链路状态未知时先停一轮，
    # 比"带着坏状态继续删"安全。下一轮自然会补上（汇总幂等、清理幂等）。
    log "media  （跳过：汇总失败，不在异常状态下执行删除）"
  fi
fi

DUR=$(($(date +%s) - START))
log "END status=$STATUS duration=${DUR}s"

# 心跳：先写临时文件再 mv（同目录 rename 是原子的），
# 避免 health-check.sh 恰好读到写了一半的 JSON。
printf '{"last_run":"%s","status":"%s","tz":"%s","duration_s":%s}\n' \
  "$(date -Iseconds)" "$STATUS" "$KIDS_TZ" "$DUR" >"$STATE.tmp"
mv -f "$STATE.tmp" "$STATE"

# 非零退出：让失败对调用方可见。注意"上一轮还在跑"走 exit 0 —— 那不算失败。
[ "$STATUS" = ok ]
