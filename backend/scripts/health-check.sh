#!/usr/bin/env bash
# kids-english 健康检查（每 5 分钟）：
#  - API 存活（/api/ping）
#  - 磁盘空间（/www > 85% 告警）
#  - kids-api 服务状态
# 异常写 /var/log/kids-health.log，供后续接入告警渠道。
LOG=/var/log/kids-health.log

CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 5 http://127.0.0.1:8000/api/ping || echo 000)
if [ "$CODE" != "200" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] API_DOWN http=$CODE" >> "$LOG"
fi

if ! systemctl is-active --quiet kids-api; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] SERVICE_DOWN" >> "$LOG"
fi

USED=$(df /www --output=pcent 2>/dev/null | tail -1 | tr -d ' %')
if [ -n "$USED" ] && [ "$USED" -gt 85 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] DISK_HIGH ${USED}%" >> "$LOG"
fi

exit 0
