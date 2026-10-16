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
# 恢复后抽查一条：GET /api/v1/recordings/{id}/audio 应 200
```

### 6.3 服务/代码回滚

后端无 git 仓库，部署方式是 scp 具体文件 → `systemctl restart kids-api`。
若某次改动异常，用本地 git 仓库检出上一提交的文件重新 scp 即可（`git log --oneline` 找上版 commit）。

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
