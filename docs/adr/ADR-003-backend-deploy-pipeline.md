# ADR-003: 后端纳入 CI 部署流水线

## Status
Proposed

## Context

前端的交付已经高度自动化：`.github/workflows/deploy.yml` 里 `build` → 质量门禁 → `build:root` →
`upload-pages-artifact` + `rsync dist/` 到华为云 → `deploy-pages`。

后端的交付仍是**手工的**。STABILITY.md §6.3 原文：

> 后端无 git 仓库，部署方式是 scp 具体文件 → `systemctl restart kids-api`。
> 若某次改动异常，用本地 git 仓库检出上一提交的文件重新 scp 即可。

这带来三个具体后果：

1. **生产状态不可复现**：无法回答"线上跑的是哪个 commit"。前端可以，后端不行。
2. **回滚依赖记忆**：要记得"上版是哪个 commit"、改了哪几个文件。
3. **代码与库可能错配**：迁移在启动时跑（ADR-002），意味着"代码版本 = schema 版本"，
   而代码是手工逐个文件传的，极其容易传一半。

### 顺带发现的一个高危遗留物

`frontend/scripts/deploy-server.sh` 自称"一键部署"，其排除列表是**失效的**：

```bash
--exclude server/.venv --exclude server/.env --exclude server/__pycache__
```

目录早已从 `server/` 改名为 `backend/`，所以这三条 exclude 全部落空。实测本机对应文件：

| 路径 | 大小 | 是否会随该脚本上服务器 |
|---|---|---|
| `backend/.venv/` | 34M | ✅ 会（平台相关的二进制，会破坏服务器自己的 venv） |
| `backend/.env` | 4K | ✅ 会（含讯飞凭据与 JWT 密钥） |
| `backend/kids.db` | 128K | ✅ **会**（本地开发库） |
| `backend/media/` | 当前不存在 | 未来会有（儿童录音） |

且脚本用的是 `rsync -az --delete`，目标是服务器上的 `repo/` 目录。**生产影响取决于服务器上的
`deploy.sh`（该文件不在仓库内，本次未能核实）**——如果它会从 `repo/` 同步到运行目录，
那么这个脚本有能力用**本地开发数据库覆盖生产数据库**。

`.gitignore` 里写了 `backend/*.db`，但 **rsync 不读 .gitignore**，这个保护在这里无效。
目前该脚本在任何文档里都没有被引用（仅存在于自身头注释），属于事实上的孤儿脚本，
但它就在仓库里、可执行、且声称"一键部署"。

## Decision

1. **给后端与前端同等的交付待遇**：在 `deploy.yml` 的 `build` job 内，`be-gate` 通过后，
   增加一步 rsync + 重启 + **健康校验**，复用已有的 `DEPLOY_KEY` secret 与 `host hw` 配置。
2. **明确的数据保护排除项**（不是"顺手抄前端那份"）：
   ```
   --exclude '.venv' --exclude '.env' --exclude '*.db' --exclude '*.db-*'
   --exclude 'media/' --exclude '__pycache__/' --exclude '.pytest_cache/'
   ```
   原则：**代码同步，数据与凭据永不同步**。生产库、录音、.env 只属于服务器。
3. **部署后必须验证，不允许"重启完就绿"**：
   ```bash
   ssh hw 'systemctl restart kids-api'
   for i in $(seq 1 15); do curl -sf http://110.41.61.4/api/ping && break || sleep 2; done
   ```
   不为 200 即让 job 失败。这一步直接把"迁移失败导致服务起不来"变成**可见的 CI 失败**——
   否则 Actions 报绿、服务其实是死的，正是本项目已经踩过两次的那类"沉默的绿"。
4. **立即处置孤儿脚本**：把 `frontend/scripts/deploy-server.sh` 移除，或改写为
   "本地紧急部署（仅在 CI 不可用时使用）"并修好 exclude + 加二次确认。
   二选一必须做，不能留着现在这个样子。
5. **回滚路径写进文档**：rollback = 在 Actions 里对**上一版 commit** 重跑 `workflow_dispatch`
   （`workflow_dispatch` 已存在）。无需自建版本目录或蓝绿部署。
6. 同步更新 STABILITY.md §6.3（那句"后端无 git 仓库"将不再成立）。

## Consequences

**变容易**
- 前后端交付心智统一：**push → 门禁 → 部署 → 健康校验**，同一个模型。
- 每次部署产出一个可追溯的 run（含 commit SHA），回滚从"翻记忆"变成"点一次重跑"。
- 迁移失败不再静默（在启动时失败 + 部署后 `/api/ping` 校验）。
- 消灭了那个能覆盖生产库的脚本。

**变难 / 新债**
- 后端开始依赖 CI 可用的 SSH 通道。若 CI 到服务器的 SSH 不通，后端就发不了版——
  需要保留一条**明确的**手工应急通道（这就是第 4 条里"改写而非删除"那个选项的价值）。
- `rsync --delete` 对 `backend/` 是双刃剑：能删掉废弃的 `.py` 文件（好事），
  也可能误删服务器上手工放的东西。因此 exclude 列表必须是白名单思路维护的，
  并且**每次新增服务器侧文件类型时都要回来补 exclude**。
- 不解决"零停机"：`systemctl restart` 有几秒不可用。对家庭用户可接受，
  列入 P4 再议（触发条件：出现付费用户的在线时段）。
- 需要在服务器上保证 `kids-api.service` 的 `ExecStart` 指向被 rsync 的目录——
  部署前应核对一次（本次未核实该单元文件内容）。

## Alternatives considered

| 方案 | 取舍 | 结论 |
|---|---|---|
| **A. 维持手工 scp** | 灵活、零 CI 依赖；但不可复现、回滚靠记忆、易错配 | ❌ 已是当前最薄弱的一环 |
| **B. 纳入 CI：rsync + 重启 + 健康校验（本方案）** | 与前端一致；引入 SSH 通道依赖 | ✅ **采纳** |
| **C. 容器化（Docker + compose）** | 可复现性最强、依赖自包含、回滚=切镜像 tag | ⏸ 当前单机 + 34M venv + SQLite 文件库，容器化会把"数据卷/权限/宝塔共存"变成新问题；触发条件：需要第二台机器或本地与生产环境差异再出事故 |
| **D. 服务器上建 git 仓库，push 即拉取** | 无需 CI 通道；但服务器要持有写权限凭据、无质量门禁、无审计 | ❌ 比手工 scp 更危险 |
