# 稳定性与灾难恢复手册（STABILITY）

> 更新时间：2026-10-16。本手册描述 kids-english 生产环境（服务器 `hw`，宝塔面板）的
> 备份、监控、恢复与加固现状。**任何配置变更后请同步更新本手册。**

## 1. 架构与运行环境

| 项 | 现状 |
|---|---|
| 服务器 | 宝塔面板 Linux，磁盘 40G（当前用 18%） |
| 后端 | FastAPI + uvicorn，systemd 服务 `kids-api`（127.0.0.1:8000，nginx 反代） |
| 数据库 | SQLite `backend/kids.db`（WAL 模式） |
| 录音资产 | `backend/media/`（webm/wav 等原始音频，孩子隐私数据） |
| 前端 | 静态产物 `/www/wwwroot/kids-english/www/`（nginx 伺服） |
| 部署 | 前端与后端均由 CI（`.github/workflows/deploy.yml`）rsync 到服务器；后端重启后强制 `/api/ping` 健康校验（ADR-003） |
| 公网 | 家庭账号 JWT 鉴权；录音回放同样走鉴权，禁止 nginx 直出 media |

## 2. 数据库：WAL 加固（2026-10-16）

`app/db.py` 的 `connect()` 统一设置：

- `PRAGMA journal_mode=WAL`：读不阻塞写，多设备并发同步（progress/rewards）更稳
- `PRAGMA synchronous=NORMAL`：WAL 下的安全平衡点
- `PRAGMA busy_timeout=5000`：写锁等待 5 秒再报错
- `PRAGMA foreign_keys=ON`：外键约束生效

> WAL 会产生 `kids.db-wal` / `kids.db-shm` 伴随文件，属正常现象；备份用 sqlite backup
> API 自动合并，不受影响。

## 3. 备份策略（每日 02:30）

由 `/etc/cron.d/kids-db-backup` 调用 `backend/scripts/backup-db.sh`：

1. **DB 在线一致性快照**：Python `sqlite3.backup()` API（替代早期直接 `cp`，杜绝拷贝不一致）
2. **完整性校验**：对快照执行 `PRAGMA integrity_check`，非 `ok` 即告警并退出非零
3. **录音资产打包**：`media/` 非空时打 `media-YYYYMMDD.tar.gz`（孩子发音是核心资产）
4. **保留 14 天**，日志 `backups/backup.log`

备份目录：`/www/wwwroot/kids-english/backups/`（服务器内，与部署目录分离防 rsync 误删）。

**异地双副本**：`backend/scripts/pull-backups.sh` 从服务器拉取到本机
`~/kids-english-backups/`（建议每周执行一次，或配置本机 launchd 定时）。

### 3.1 每日维护任务（ADR-004 / ADR-005）

同一 cron 体系下另有两个每日任务（cwd = `backend`）：

| 任务 | 脚本 | 作用 |
|---|---|---|
| 事件汇总 + 明细清理 | `scripts/rollup_events.py` | 事件 → `daily_stats`（北极星口径，见 `PROGRESS-DATA.md §7`）；清理 >180 天的原始事件 |
| 录音保留期清理 | `scripts/purge_media.py` | 删 >90 天的音频文件（**行与分数保留**，见 ADR-005）；清理孤儿文件 |

服务器 `/etc/cron.d/kids-maintenance` 示例（按实际路径调整）：

```cron
30 3 * * * root cd /www/wwwroot/kids-english/backend && .venv/bin/python scripts/rollup_events.py >> /var/log/kids-maintenance.log 2>&1
40 3 * * * root cd /www/wwwroot/kids-english/backend && .venv/bin/python scripts/purge_media.py >> /var/log/kids-maintenance.log 2>&1
```

> **保留期的影响**：`media/` 不再单调增长（音频 90 天滚动 × 14 份快照），
> 备份体积与恢复时间变为**可预测**。数据边界与删除能力详见 `docs/DATA-INVENTORY.md`。

## 4. 健康检查（每 5 分钟）

`/etc/cron.d/kids-health` → `backend/scripts/health-check.sh`：

- API 存活：curl `/api/ping` 非 200 → 告警
- 服务状态：`kids-api` 非 active → 告警
- 磁盘：`/www` 使用率 > 85% → 告警

告警写入 `/var/log/kids-health.log`（后续可接邮件/飞书/企业微信 webhook）。

## 5. 服务自愈与日志

- `systemd kids-api.service`：`Restart=always` + `RestartSec=3`（进程崩溃 3 秒后自动拉起）
- uvicorn 日志走 systemd journal（`journalctl -u kids-api -n 100`）
- `.env` 含讯飞/密钥等敏感信息：权限 600，仅 root 可读，不入 git

## 6. 灾难恢复演练步骤

### 6.1 数据库恢复

```bash
ssh hw
cd /www/wwwroot/kids-english
# 1. 停服（避免旧连接写库）
systemctl stop kids-api
# 2. 回滚当前库，用最新备份
cp backend/kids.db backend/kids.db.corrupt   # 先保留现场
cp backups/kids-YYYYMMDD.db backend/kids.db
# 3. 校验
cd backend && .venv/bin/python -c "from app.db import connect; c=connect(); print(c.execute('PRAGMA integrity_check').fetchone())"
# 4. 恢复服务
systemctl start kids-api && systemctl status kids-api
```

### 6.2 录音资产恢复

```bash
ssh hw
cd /www/wwwroot/kids-english
tar xzf backups/media-YYYYMMDD.tar.gz -C backend/   # 解出 backend/media/
# 恢复后抽查一条：GET /api/v1/children/{child_id}/recordings/{rid}/audio 应 200
```

### 6.3 服务/代码回滚

后端已纳入 CI 部署（ADR-003）：push → 门禁 → `rsync backend/` 到
`/www/wwwroot/kids-english/backend/` → `systemctl restart kids-api` → `/api/ping` 健康校验。
生产状态由 Actions run 的 commit SHA 决定 —— **不再是"后端无 git 仓库"**。

回滚路径：在 Actions 里对**上一版 commit** 重跑 `workflow_dispatch`
（GitHub → Actions → Deploy to GitHub Pages → Run workflow，或 revert 一次并 push）。
无需自建版本目录或蓝绿部署。

> ⚠️ 迁移**只增不减**（ADR-002）：回滚代码**不会**回滚表结构。
> 若某次迁移与旧代码不兼容，需同时处理数据（见 §6.1）。
> `/api/ping` 会回显 `schema_version`，可用来确认生产库当前的 schema 版本。

应急通道（CI 到服务器的 SSH 不可用时）：`bash frontend/scripts/deploy-server.sh`
—— 从本机把代码同步到服务器 staging（已排除数据与凭据，执行前二次确认），
再触发服务器侧 `deploy.sh`。注意该脚本**只做 staging 同步**，服务器侧如何装配见
`/www/wwwroot/kids-english/deploy.sh`（不在本仓库内）。

### 6.4 整机重建（最坏情况）

1. 宝塔面板 + Python 3.x + nginx
2. scp `backend/`（含 `.env`、`kids.db`、`media/`）与 `www/` 产物
3. `pip install`（requirements.txt）+ 建立 systemd 单元 + 恢复 cron（本文档第 3/4 节）
4. 验证：`/api/ping` 200、登录接口可用、录音回放 200

## 7. 已知边界与后续（P4 稳定性 backlog）

- 单机部署：SQLite 单写者，`uvicorn` 单 worker 是有意为之（多 worker 反而竞争写锁）；
  多设备并发写已通过服务端合并写 + WAL 缓解
- 告警目前只有日志，无主动推送；接入 webhook 后更新第 4 节
- 异地备份未自动化（需本机 launchd）；用户量上来后可考虑 OSS 冷备（media 大文件）
