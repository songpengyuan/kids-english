#!/usr/bin/env bash
# kids-english 健康检查（每 5 分钟）：
#  - API 存活（/api/ping）
#  - 磁盘空间（/www > 85% 告警）
#  - kids-api 服务状态
#  - **每日维护是否还在跑**（ADR-004/005）
# 异常写 /var/log/kids-health.log，供后续接入告警渠道。
#
# 为什么要检查"维护任务还在不在"：
#   cron 最阴险的故障不是"报错退出"，而是**静默地再也不执行** ——
#   脚本被改名、路径写错、部署时被 rsync --delete 带走，任务就无声消失了。
#   维护脚本会写心跳文件，这里用"心跳陈旧 / 上次状态非 ok"反查，
#   把这类静默故障变成一条日志。
# 路径可被环境变量覆盖，仅为**能在本地验证**这段逻辑（生产上不设，走默认值）。
# STATE 与 maintenance.sh 共用同一个变量名，便于把两者一起指向同一份心跳。
LOG="${KIDS_HEALTH_LOG:-/var/log/kids-health.log}"
STATE="${KIDS_MAINT_STATE:-/www/wwwroot/kids-english/backups/maintenance-state.json}"
MARK="${KIDS_HEALTH_MARK:-/var/log/kids-health.maintenance-mark}"
STALE_AFTER_H="${KIDS_MAINT_STALE_H:-26}"   # 每日 03:30 跑；漏一轮就该告警

ts() { date '+%Y-%m-%d %H:%M:%S'; }

# GNU stat 与 BSD/macOS stat 的参数不通用，取不到时返回空串 ——
# **不能兜成 0**：0 会成为"1970 年"，让"读不到时间"伪装成"永远陈旧"，
# 于是每 5 分钟误报一次。告警一旦长期误报，就会被无视，等于没有告警。
file_mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || echo ""; }

CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 5 http://127.0.0.1:8000/api/ping || echo 000)
if [ "$CODE" != "200" ]; then
  echo "[$(ts)] API_DOWN http=$CODE" >> "$LOG"
fi

if ! systemctl is-active --quiet kids-api; then
  echo "[$(ts)] SERVICE_DOWN" >> "$LOG"
fi

USED=$(df /www --output=pcent 2>/dev/null | tail -1 | tr -d ' %')
if [ -n "$USED" ] && [ "$USED" -gt 85 ]; then
  echo "[$(ts)] DISK_HIGH ${USED}%" >> "$LOG"
fi

# ---------- 每日维护心跳 ----------
# 去重：不按"每 5 分钟"重复刷日志，否则停摆一天就是 288 行噪音、反而淹没别的告警。
#   失败：每个不同的 last_run 只记一次（= 每次失败的运行恰好一行）；
#   陈旧：每小时最多记一次。
if [ ! -f "$STATE" ]; then
  echo "[$(ts)] MAINTENANCE_MISSING 无心跳文件 $STATE" >> "$LOG"
else
  LAST_RUN=$(sed -n 's/.*"last_run":"\([^"]*\)".*/\1/p' "$STATE")
  MSTATE=$(sed -n 's/.*"status":"\([^"]*\)".*/\1/p' "$STATE")
  MARK_LAST=$(sed -n '1p' "$MARK" 2>/dev/null || true)
  MARK_STALE=$(sed -n '2p' "$MARK" 2>/dev/null || true)
  [ -n "$MARK_STALE" ] || MARK_STALE=0

  DIRTY=0
  if [ -n "$MSTATE" ] && [ "$MSTATE" != "ok" ] && [ "$LAST_RUN" != "$MARK_LAST" ]; then
    echo "[$(ts)] MAINTENANCE_FAILED status=$MSTATE at=$LAST_RUN" >> "$LOG"
    MARK_LAST="$LAST_RUN"
    DIRTY=1
  fi

  NOW_EPOCH=$(date +%s)
  STATE_EPOCH=$(file_mtime "$STATE")
  if [ -z "$STATE_EPOCH" ]; then
    # 「读不到修改时间」是"未知"，不是"陈旧"——分开报，避免永久误报。
    echo "[$(ts)] MAINTENANCE_UNKNOWN 无法读取心跳文件修改时间 $STATE" >> "$LOG"
  else
    AGE_H=$(( (NOW_EPOCH - STATE_EPOCH) / 3600 ))
    if [ "$AGE_H" -gt "$STALE_AFTER_H" ] && [ "$(( NOW_EPOCH - MARK_STALE ))" -gt 3600 ]; then
      echo "[$(ts)] MAINTENANCE_STALE age=${AGE_H}h last_run=${LAST_RUN:-?}" >> "$LOG"
      MARK_STALE="$NOW_EPOCH"
      DIRTY=1
    fi
  fi

  # 标记文件的第 1/2 行分别是「已告警过的 last_run」与「上次陈旧告警的时间」，
  # 两者各自去重，所以任何一个变了都整体重写（文件极小，无需增量更新）。
  if [ "$DIRTY" = 1 ]; then
    printf '%s\n%s\n' "$MARK_LAST" "$MARK_STALE" > "$MARK"
  fi
fi

exit 0
