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

### 1.1 定时任务总览（全部版本化在 `backend/deploy/`）

三条 cron 的定义文件都在仓库里，服务器 `/etc/cron.d/` 只是它们的**安装结果**：

| 时间（CST） | 仓库文件 → `/etc/cron.d/` | 脚本 | 作用 |
|---|---|---|---|
| 02:30 每日 | `kids-db-backup.cron` | `scripts/backup-db.sh` | DB 一致性快照 + media tar，保留 14 天（§3） |
| 03:30 每日 | `kids-maintenance.cron` | `scripts/maintenance.sh` | 事件汇总 + 过期媒体清理 + 过期事件清理（§3.1） |
| 每 5 分钟 | `kids-health.cron` | `scripts/health-check.sh` | API/服务/磁盘巡检 + **维护心跳反查**（§4） |

**为什么必须版本化**：`crontab -e` 改的是一份不透明的用户表。服务器一旦重装，
没人说得清当时跑的是什么。曾经 `kids-db-backup` / `kids-health` 就只存在于服务器上，
属于同类欠账 —— 现已补齐。`/etc/cron.d/` 里带点的文件名（如 `foo.old` / `foo.bak`）
会被 cron **忽略**，所以残留文件不会重复执行，但容易误导，应清理。

安装 / 校验（服务器上，代码部署后执行）：

```bash
cd /www/wwwroot/kids-english/backend
for f in kids-db-backup kids-maintenance kids-health; do
  install -m 644 deploy/$f.cron /etc/cron.d/$f
done
systemctl restart cron          # 注意：cron 无 reload job type，只能 restart

# 校验三件事：内容无漂移、调度行不含 `%`、cron 服务在跑
for f in kids-db-backup kids-maintenance kids-health; do
  diff /etc/cron.d/$f deploy/$f.cron && echo "$f: 一致 ✓"
done
grep -hE '^[0-9*]' /etc/cron.d/kids-* | grep -c '%'   # 期望 0（原因见 §3.1）
systemctl is-active cron
```

## 2. 数据库：WAL 加固（2026-10-16）

`app/db.py` 的 `connect()` 统一设置：

- `PRAGMA journal_mode=WAL`：读不阻塞写，多设备并发同步（progress/rewards）更稳
- `PRAGMA synchronous=NORMAL`：WAL 下的安全平衡点
- `PRAGMA busy_timeout=5000`：写锁等待 5 秒再报错
- `PRAGMA foreign_keys=ON`：外键约束生效

> WAL 会产生 `kids.db-wal` / `kids.db-shm` 伴随文件，属正常现象；备份用 sqlite backup
> API 自动合并，不受影响。

## 3. 备份策略（每日 02:30）

由 `backend/deploy/kids-db-backup.cron`（安装为 `/etc/cron.d/kids-db-backup`）
调用 `backend/scripts/backup-db.sh`：

1. **DB 在线一致性快照**：Python `sqlite3.backup()` API（替代早期直接 `cp`，杜绝拷贝不一致）
2. **完整性校验**：对快照执行 `PRAGMA integrity_check`，非 `ok` 即告警并退出非零
3. **录音资产打包**：`media/` 非空时打 `media-YYYYMMDD.tar.gz`（孩子发音是核心资产）
4. **保留 14 天**，日志 `backups/backup.log`

备份目录：`/www/wwwroot/kids-english/backups/`（服务器内，与部署目录分离防 rsync 误删）。

**异地双副本**：`backend/scripts/pull-backups.sh` 从服务器拉取到本机
`~/kids-english-backups/`（建议每周执行一次，或配置本机 launchd 定时）。

### 3.1 每日维护任务（ADR-004 / ADR-005）

两个每日任务**合并为一个入口脚本** `backend/scripts/maintenance.sh`：

| 顺序 | 内部脚本 | 作用 |
|---|---|---|
| 1 | `scripts/rollup_events.py` | 事件 → `daily_stats`（北极星口径，见 `PROGRESS-DATA.md §7`）；清理 >180 天的原始事件 |
| 2 | `scripts/purge_media.py` | 删 >90 天的音频文件（**行与分数保留**，见 ADR-005）；清理孤儿文件 |

**为什么不让 cron 直接调两个 python**（早期文档就是这么写的）：

1. **防重叠** —— cron 不保证上一轮跑完才起下一轮。两个实例同时写 SQLite，
   WAL 下"写-写"会互相等锁，`busy_timeout=5000` 一超时就报错。
   `maintenance.sh` 用 `flock` 保证同一时刻只有一个实例；拿不到锁记 `SKIP` 并退出 0
   （那是"正常跳过"，不是故障，不应触发告警）。
2. **可追溯** —— cron 是静默的。统一写 `/var/log/kids-maintenance.log`
   （含开始/结束、时区、耗时、退出状态），并落心跳文件。
3. **时区显式** —— `KIDS_TZ` 决定「学习日」口径。
4. **失败不放大** —— 汇总失败时**跳过**媒体清理：清理是"减法"，
   在数据链路状态未知时先停一轮，比带着坏状态继续删安全（两者都幂等，下一轮会补上）。

**顺序敏感**：先汇总后清理。反过来会先删掉还没汇总的原始事件。

#### 时间口径：`KIDS_TZ`（默认 `Asia/Shanghai`）

`daily_stats.date` 是**用户感知的那一天**，不是 UTC 日。存储一律 UTC，
分桶时才按 `KIDS_TZ` 换算（见 `backend/app/timeutil.py`）。

> 为什么必须显式：生产服务器 TZ 恰好是 `Asia/Shanghai`，`date.today()` 看起来"对"——
> 但那是**巧合**。库里存的是 UTC，一旦换到 TZ=UTC 的机器，CST 00:00–08:00 与
> 21:00–24:00 两段使用高峰（上学前 / 睡前）就会被算到相邻日，
> 北极星「每周主动学习分钟数」随之失真，且**数值看着完全合理**，很难察觉。

改 `KIDS_TZ` 属于**口径变更**：只影响之后汇总的行，历史 `daily_stats` 不会自动重算。

#### 安装（服务器上执行一次）

```bash
install -m 644 /www/wwwroot/kids-english/backend/deploy/kids-maintenance.cron \
               /etc/cron.d/kids-maintenance
install -m 644 /www/wwwroot/kids-english/backend/deploy/kids-maintenance.logrotate \
               /etc/logrotate.d/kids-maintenance
```

cron 与 logrotate 的**定义文件随仓库版本化**（`backend/deploy/`），
不写进 `crontab -e` —— 后者是不透明的用户表，重建服务器时说不清当时跑的是什么。

> ⚠️ 改这两个文件时注意 **cron 行里的 `%` 有特殊含义**（第一个未转义的 `%` 之后
> 会变成该任务的标准输入，命令行就此截断，且**无任何报错**）。
> 需要 `%` 就写 `\%`；本项目的方式是 cron 行里完全不出现 `%`，逻辑都放脚本里。
> 实测踩过一次：自检任务看起来"没触发"，其实是命令被吃掉、输出被 cron 丢弃。
>
> 另外 `systemctl reload cron` 在这台机器上不可用（cron 无 reload job type），
> 改完用 `systemctl restart cron`；重启 cron 不会杀掉已在运行的任务。

#### 怎么确认它真的在跑

这是 cron 最容易失效的地方：**脚本还在、cron 还在，但永远不再执行**
（改了名、路径失效、被 `rsync --delete` 带走）。三层可见性：

```bash
# 1) 最近一次运行的结论与耗时
cat /www/wwwroot/kids-english/backups/maintenance-state.json
# 2) 明细（每轮 START/rollup/media/END 各一行）
tail -30 /var/log/kids-maintenance.log
# 3) 由 health-check.sh 每 5 分钟反查心跳，把静默故障变成日志
grep MAINTENANCE /var/log/kids-health.log
```

**心跳机制**：`maintenance.sh` 每轮结束原子地写 `backups/maintenance-state.json`
（`last_run` / `status` / `tz` / `duration_s`），`health-check.sh` 据此报三类异常：

| 日志标记 | 含义 |
|---|---|
| `MAINTENANCE_MISSING` | 心跳文件不存在（从未成功跑过，或目录被清） |
| `MAINTENANCE_FAILED status=…` | 上一轮非 ok（每个不同的 `last_run` 只记一次） |
| `MAINTENANCE_STALE age=…h` | 超过 26h 没更新（每小时最多记一次） |
| `MAINTENANCE_UNKNOWN` | 读不到心跳文件时间 —— **"未知"不当作"陈旧"**，避免永久误报 |

> 去重是刻意的：停摆一天若每 5 分钟记一行就是 288 行噪音，会把别的告警淹掉；
> 告警一旦长期误报/刷屏，就会被无视，等于没有告警。

日志轮转见 `backend/deploy/kids-maintenance.logrotate`（周轮转、留 8 份、
用 `copytruncate` 以适配"每次运行才 open 一次"的短命进程）。**不轮转的运维日志
最终会吃满磁盘**，而 `DISK_HIGH` 只能事后发现。

#### 手工执行

```bash
# 正常跑一轮（幂等，可安全重跑/回填）
bash /www/wwwroot/kids-english/backend/scripts/maintenance.sh
# 只看媒体清理会做什么，不实际删除
cd /www/wwwroot/kids-english/backend && .venv/bin/python scripts/purge_media.py --dry-run
# 回填最近 7 天的事件汇总
cd /www/wwwroot/kids-english/backend && .venv/bin/python scripts/rollup_events.py --days 7
```

> **保留期的影响**：`media/` 不再单调增长（音频 90 天滚动 × 14 份快照），
> 备份体积与恢复时间变为**可预测**。数据边界与删除能力详见 `docs/DATA-INVENTORY.md`。

## 4. 健康检查（每 5 分钟）

`backend/deploy/kids-health.cron`（安装为 `/etc/cron.d/kids-health`）
→ `backend/scripts/health-check.sh`：

- API 存活：curl `/api/ping` 非 200 → 告警
- 服务状态：`kids-api` 非 active → 告警
- 磁盘：`/www` 使用率 > 85% → 告警
- **维护心跳反查**：比对 `backups/maintenance-state.json` 的状态与新鲜度，
  把「脚本还在、cron 还在，但永远不再执行」这类静默故障变成一条日志：
  `MAINTENANCE_MISSING` / `MAINTENANCE_FAILED` / `MAINTENANCE_STALE`（超 26h 未更新）

告警写入 `/var/log/kids-health.log`（后续可接邮件/飞书/企业微信 webhook）。

> 只管告警、**不自动重启**：重启是"动作"，误判时会把正在自愈的服务打断。
> 自愈交给 systemd（§5），巡检只负责让人知道。
>
> `MAINTENANCE_*` 带**去重**（失败按 `last_run` 去重、陈旧按小时去重），
> 避免同一异常每 5 分钟刷一条，把日志淹掉、让人开始忽略它。

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

> ⚠️ **rsync 用了 `--delete`，而 rsync 不读 `.gitignore`。**
> 意味着 `backend/` 下**任何不在 git 里的文件，下次部署都会被删掉**。
> 服务器侧新增脚本/配置后必须同时提交到仓库，否则它会在下一次 push 时静默消失
> （表现是"任务突然不再执行"，而文件已经没了）。
> 排除项只有 `.venv` / `.env*` / `*.db*` / `media/` / `__pycache__` / `.pytest_cache`
> —— 数据与凭据在排除名单里，这就是「代码同步、数据与凭据永不同步」的落地方式。

应急通道（CI 到服务器的 SSH 不可用时）：`bash frontend/scripts/deploy-server.sh`
—— 从本机把代码同步到服务器 staging（已排除数据与凭据，执行前二次确认），
再触发服务器侧 `deploy.sh`。注意该脚本**只做 staging 同步**，服务器侧如何装配见
`/www/wwwroot/kids-english/deploy.sh`（不在本仓库内）。

### 6.4 整机重建（最坏情况）

1. 宝塔面板 + Python 3.x + nginx
2. scp `backend/`（含 `.env`、`kids.db`、`media/`）与 `www/` 产物
3. `pip install`（requirements.txt）+ 建立 systemd 单元
4. **恢复 cron**：cron 定义已随仓库版本化，逐个安装即可（不再依赖记忆）：

   ```bash
   for f in /www/wwwroot/kids-english/backend/deploy/*.cron; do
     install -m 644 "$f" "/etc/cron.d/$(basename "${f%.cron}")"
   done
   install -m 644 /www/wwwroot/kids-english/backend/deploy/kids-maintenance.logrotate \
                  /etc/logrotate.d/kids-maintenance
   systemctl is-active cron && ls -l /etc/cron.d/kids-*
   ```

   > 三条 cron 现已全部收进仓库（`kids-db-backup` / `kids-maintenance` / `kids-health`），
   > 上面这个 `for` 循环会把它们一次装齐，重建不再依赖记忆。

5. 验证：`/api/ping` 200（且带 `schema_version`）、登录接口可用、录音回放 200、
   手工跑一次 `maintenance.sh` 后心跳文件出现且 `status=ok`

## 7. 已知边界与后续（P4 稳定性 backlog）

- 单机部署：SQLite 单写者，`uvicorn` 单 worker 是有意为之（多 worker 反而竞争写锁）；
  多设备并发写已通过服务端合并写 + WAL 缓解
- 告警目前只有日志，无主动推送；接入 webhook 后更新第 4 节
- 异地备份未自动化（需本机 launchd）；用户量上来后可考虑 OSS 冷备（media 大文件）
