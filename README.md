# 丞丞ABC

面向 5 岁孩子的儿童英语学习 Web 应用。每节课围绕一首童谣展开六步练习（看图学词 → 听音选图 → 连一连 → 跟我读 → 唱童谣 → 亲子对话），点图片/点单词都会朗读发音，答对有彩带和星星奖励。参考多邻国的即时反馈与激励节奏设计。

线上：**https://zelab.cn/app/**（GitHub Pages + 华为云双线部署）。

> **日常使用**看本文档。**架构、远端同步、排错**看 [DEVELOPMENT.md](./DEVELOPMENT.md)（16 章，含布局走查、调试深链、排错清单）。
> **设计规范**看 [frontend/DESIGN_SYSTEM.md](./frontend/DESIGN_SYSTEM.md)（设计 token、响应式断点、组件契约、CI 守卫）。
> **设计原则与走查 Checklist** 看 [docs/DESIGN-GUIDELINES.md](./docs/DESIGN-GUIDELINES.md)。
> **演进方向**看 [docs/ROADMAP.md](./docs/ROADMAP.md) / [docs/P1-BACKLOG.md](./docs/P1-BACKLOG.md)。

## 技术栈

**前端**（`frontend/`，独立 pnpm 项目）：Vue 3.5 + Vite 8 + Pinia 4 + vue-router（hash 模式）+ TypeScript。预生成童声 mp3（edge-tts）优先、Web Speech API 回退朗读；canvas-confetti 彩带、CSS 关键帧、Web Audio 合成音效；SVG + Pointer Events 做图词连线（鼠标与平板触屏同源）；PWA 可离线玩。

**后端**（`backend/`，独立 Python 项目）：FastAPI + SQLite（10 张表，版本化迁移），只做**跨设备同步**与埋点聚合，不是应用的运行前提。

> ⚠️ 这是**两个独立项目，不是 monorepo**：前端在 `frontend/` 用 pnpm、后端在 `backend/` 用 Python venv，各自管依赖，仓库根**没有** package.json。两边的命令要在各自目录里跑。

## 快速开始

```bash
# 前端（需要 nvm + pnpm）
cd frontend
pnpm install
pnpm dev          # 开发服务器
pnpm test         # 单测（vitest，偏逻辑层）
pnpm type-check   # vue-tsc
pnpm build:root   # 生产构建（自定义域名根路径部署）

# 后端（可选，只在需要跨设备同步时）
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000   # 健康检查 GET /api/ping
.venv/bin/python -m pytest tests/ -q                    # 后端单测（7 个测试文件）
```

**⚠️ 应用在 `/app/` 子路径下**：SPA 入口是 `frontend/app/index.html` 构建的 `/app/`，站点根路径 `frontend/public/index.html` 是备案落地页（标题"闲思杂记"）。本地预览、走查、日志排查都要带 `/app/`——在根路径看到落地页不是构建坏了。

## 功能面（hash 路由，四域）

| 域 | 路径 | 说明 |
|---|---|---|
| 课程 | `/course`（正式课/加餐两个 tab） | 课时卡片网格 |
| | `/course/:id` | 单课菜单（6 个玩法入口） |
| | `/course/:id/{learn,hear,match,speak,song,talk}` | 六种玩法，**复用同一个组件**，由 `meta.stage` 区分 |
| | `/course/:id/game` | 本课闯关地图（背景由 `meta.sky` 驱动） |
| | `/course/review` | 错词复习（间隔重复队列） |
| 游戏 | `/game`、`/game/quest/:id/:stage?` | 全局闯关入口 |
| 磨耳朵 | `/listen` | 童谣/动画视频播放 + 歌词页 |
| 我的 | `/me` | 星星·连击·贝壳·今日学情 |
| | `/me/calendar` | 学习日历（打卡） |
| | `/me/treasure`、`/me/treasure/hero/:id` | 宝藏罐 + 英雄图鉴 |
| | `/me/report`、`/me/parent` | 家长报告 / 家长中心（`requiresParent`，算术题门禁） |

另有 `/gate`（应用口令）与家长算术题两级门禁，见 `frontend/src/router/gateGuard.ts` / `parentGuard.ts`。

## 数据策略

**localStorage 是唯一真相源**（离线可用），后端只做跨设备同步，**合并口径是逐字段取 max**（学习时长只增不减），全链路可降级——后端挂了不影响孩子正常玩。

7 个 Pinia store：`progress`（进度/掌握度/今日学情，含云同步状态机）、`rewards`（贝壳与英雄形态）、`streak`（连击）、`player`（磨耳朵播放）、`auth`（家长登录与孩子档案）、`gate`（应用口令门禁）、`content`（课时种子）。

## 课时资源

7 节课：`l4` 水手出海去、`l5` 我是一个音乐人、`l6` 彩虹颜色歌、`l7` 跟我数数、`l8` 字母歌、`l9` 一根小手指、`l10` 丛林里散步（共 7 课）。其中 **l6/l7/l8 是"加餐"课**，其余为正式课（`BONUS_IDS`）。

资源按约定放好即自动生效，**不用改代码**：

```
frontend/public/lessons/<课时id>/
├── song.mp3          童谣音频
├── song.mp4          童谣视频（可选，有则音乐页先播视频）
├── audio/<单词id>.mp3 单词发音（可选，缺失回退浏览器 TTS）
└── words/<单词id>.png 单词图片（缺失回退 emoji 占位）
```

**l6/l7/l8 的音视频与图片全部是仓库自研合成的**（无版权风险）：`scripts/gen-songs.py` 合成童谣并写回逐行时间轴、`gen-word-art.py` 生成贴纸风 SVG、`gen-word-audio.py` 生成童声发音。改内容重跑脚本即可，没有素材也能完整试玩。⚠️ `gen-songs.py` **只**作用于 l6/l7/l8，不会覆盖你自己提供的 l4/l5。

**新增课时**：编辑 `frontend/src/data/lessons.ts` 的 `rawLessons`。一节课的结构见 `RawLesson` 接口，要点：

- `tone` **只能取 6 个卡片色调之一**（`blue|green|orange|purple|pink|teal`）——⚠️ 不要写十六进制色值，相邻课时用不同 hue，孩子靠颜色区分课程。
- 资源路径写站点根形式（`/lessons/l4/song.mp3`），文件末尾的 `asset()` 会自动补部署基路径，本地与子路径部署通用。
- `date` 与 `type`（`official`/`bonus`）会影响首页 tab 与排序。

## 激励闭环

- **星星**：每个玩法结算给 0–3 星；一课"全部通关"要求全部玩法都玩过**且**星级达标（学/辨/连/读 ≥2 星，唱/对话 ≥1 分），避免"只晃一圈就显示通关"。
- **宝箱**：每完成一个玩法都开一次宝箱，固定掉贝壳 3–6 个 + **25% 概率掉英雄卡片**；闯关地图上另有金色宝箱关卡（本课 6 个玩法全通后解锁）。
- **英雄图鉴**：贝壳的消耗出口。**世代 → 角色 → 形态**三级（昭和/平成/新生代/令和，41 位角色 / 81 个形态，如迪迦的复合型·强力型·空中型），按稀有度定价（常见 20 / 稀有 60 / 传说 120 贝壳）；重复兑换同一形态可升星（最高 ★★★），所以不会出现"集齐就没目标"。点形态卡朗读中英文介绍。
- **到期复习**：练习中答错/连错的词进入间隔重复队列，按 1/3/7/14 天回到复习页，连对 4 次算掌握并出队。
- **家长报告**：今日时长、完成玩法数、单词明细、错词清单、连击与宝藏概览。
- **英雄图片可自选**：图片命名为 `<形态id>.png` 放进 `frontend/public/heroes/` 即自动替换；缺图时用 `scripts/gen-hero-art.py` 生成的原创 SVG 占位（png 优先，加载失败自动回退 svg）。多姿势轮播用 `<形态id>-2.png`、`-3.png` 同理生效。仓库内形象**全部是原创占位**，真实角色图片由使用者自行放入并仅供家庭内部使用。取图脚本：

  ```bash
  python3 frontend/scripts/fetch-hero-art.py --auto --limit 5   # 先试 5 张看质量
  python3 frontend/scripts/fetch-hero-art.py --check            # 只看还缺哪些
  ```

  图源：必应 / 百度 / 萌娘百科 / Fandom（默认依次尝试）。脚本转 PNG、保留透明通道、最长边压到 512px，并输出 `frontend/public/heroes/fetch-report.tsv` 供复核（同一张图命中多个形态会标 ⚠️）。

## 跟我读（发音打分）

按住大麦克风跟读，松开后给三档反馈：🌟 很棒 / 😊 不错 / 🔁 再试一次。双模式自动降级：

1. **自动打分（首选）**：浏览器内置 `SpeechRecognition` 听写，与目标单词做编辑距离相似度打分，免费零配置。Chrome/Edge 的识别请求发往 Google 服务，国内可能失败——**失败会自动切录音模式，不会卡死**。
2. **录音回放（降级）**：识别不可用时由家长/老师点 👍 / 🔁 判定，任何环境下玩法都闭环。

更专业的逐音素评分需接讯飞少儿语音评测或 Azure Pronunciation Assessment（付费），替换 `frontend/src/utils/speechScore.ts` 里的打分实现。

## 提交门禁与部署

`.husky/pre-commit` 与 `pre-push` 都调同一个实现 **`scripts/ci-local.sh`**（本地门禁与 CI 跑的是同一套 [1]–[7] 步检查，前面失败就短路，按 mode 决定跑到哪一步）。

- **pre-commit**：冲突标记 / 误提交 `.only` / 密钥泄漏 / 暂存区类型检查 / 设计系统守卫 —— 秒级。
- **pre-push**：额外跑全量（前端 test + type-check → 后端 pytest → OpenAPI 契约 diff → 课程种子 diff → 生产构建 → 白屏冒烟），**约 2 分钟**。

> 钩子跑在非交互 shell 里，nvm 不会被自动加载；脚本自己会 source nvm 再 `nvm use`。若本机找不到 node/pnpm，它会直接报错而不是假装通过。

另外 `frontend/scripts/guard-tokens.mjs`（独立可跑 `pnpm guard:tokens`）强制五项设计系统规则，其中值得一提的两条：**样式里除 `src/styles/` 外不许有硬编码颜色**、**`@media` 断点必须在批准清单内**（`(max-height:480px)` / `(min-width:600px)` / `(min-width:768px)+landscape` / 指针设备 / 减动效）。

> 断点记法：**改"值"用 600，改"结构"用 768 + landscape**。600 是 iPad/手机的宽窄分界（与 `useViewport.isNarrow` 同刀口，iPad mini 竖屏 744 也算平板）；768+landscape 才是允许分栏/加列的结构档。详见 DESIGN_SYSTEM §11.4。

部署由 `.github/workflows/deploy.yml` 单 workflow 做双线：GitHub Pages（zelab.cn）+ rsync 到华为云 `110.41.61.4`（前端静态 + 后端代码同步、`requirements.txt` 有变化才装依赖、重启 systemd 后健康探测）。

服务器侧的定时任务是**版本化的**（`backend/deploy/*.cron`，安装到 `/etc/cron.d/`，可以用 `diff` 校验是否与仓库漂移）——这是刻意的：`crontab -e` 改的是一份服务器上不透明的表，机器挂了就再也说不清当时跑的是什么。

| 任务 | 频率 | 做什么 |
|---|---|---|
| `kids-db-backup` | 每天 02:30 | SQLite 备份（在维护之前，要的是"当天已跑完"的快照） |
| `kids-maintenance` | 每天 03:30 | 事件汇总 + 录音保留期清理；用 `flock` 保证不与上一轮重叠 |
| `kids-health` | 每 5 分钟 | API 存活 / systemd 状态 / 磁盘水位 |

运维细节值得一看（都在脚本注释里）：cron 行里**不能出现 `%`**（会被当标准输入、命令被截断且不报错）；健康检查还承担**维护任务的心跳反查**，把"脚本还在、cron 还在，但永远不再执行"这类静默故障变成 `MAINTENANCE_MISSING/FAILED/STALE` 日志。

## 已知边界

- iOS Safari 需用户点击后才播放音频（已用点击触发规避）；系统未装英文语音包时发音音色会变。
- 进度默认存本机浏览器；跨设备记录需要后端在线并已绑定孩子档案。
- iOS 触感依赖系统开关；为保证点击可靠，**导航类按钮在 iOS 上不给震动**，震动只用于玩法反馈。
- 打卡日历历史从 2026-09-28 起积累，更早日期无法回溯。
- 录音文件存服务器本地磁盘（未上云），90 天后删除音频但保留分数。
