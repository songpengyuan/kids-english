# AGENTS.md — 本仓库 AI agent 常驻须知

> 面向所有在本仓库工作的 AI agent（ZCode / Claude Code / 其他兼容平台）。
> 这里只放**常驻规则**——不是某个任务的工作流；任务级工作流见下方「Skill 地图」。
> 人类协作者同样适用，但主要写给 agent。

## 项目一页纸

儿童英语学习 App（面向 5 岁孩子）：`frontend/`（Vue3 + Pinia + Vite，PWA）+
`backend/`（FastAPI，内容库与学习数据）。内容单元是「课时」（l1…l11…），
数据本体在 `frontend/src/data/lessons.json`（课时/词/句/歌歌词；lessons.ts 只留
类型与 normalize），媒体在 `frontend/public/lessons/<id>/`，
后端种子 `backend/seed/lessons.json` 由脚本从前端数据导出。
**隐私红线**：孩子发音录音是最敏感数据（`docs/DATA-INVENTORY.md` 第 3 节），
任何运行期数据（录音/数据库）不得入库——pre-commit 门禁会拦。

## 双会话协作纪律（本仓库常态，历史撞车多次）

用户习惯并行开两个 agent 会话写同一工作区，且对方会主动配合你（补契约、收编成果）：

1. **动手前先 `git status`**：看有没有外来 WIP（不是你改的文件）。暂存区里躺着别人的
   东西就会随你的 commit 走——提交前核对 staged 列表。
2. **`git add 明确路径`**，不用 `add -A` / `add .`。
3. **不 rebase / 不 reset 改历史**：双方都持有提交哈希，fix-forward 即可。
4. **pre-commit 跑全项目 vue-tsc**：被类型检查挡住 ≠ 你的问题，可能是对方 WIP——
   等几分钟再提，**不要去改对方的文件**。
5. **对方长任务静默 ≠ 干完**（如 faster-whisper 转录几分钟无文件变动）：判定收工看
   进程 + 文件 mtime 双条件。
6. **混合文件放弃拆 hunk**：你的改动和对方 WIP 在同一文件时，让它随对方的整文件
   提交走，别做手术式暂存。
7. **对方可能中途重构你正改的文件**：Edit 报 "File has been modified since read"
   就重读再改，并检查对方的新架构是否需要你同步接线（如新增 prop 要写进注册表）。
8. **push 前**：跑 `bash scripts/ci-local.sh`（含种子漂移检查），并与并行会话对齐时机。
9. seed 文件的正规同步通道是 `node frontend/scripts/export-lessons.mjs`；
   只有 seed 里有他人未提交的半成品挡路时，才做手术式文本替换（改完必须 json 校验）。

## 提交规范

Conventional Commits，中文描述 + 详尽 body（为什么改、踩了什么坑）。
单链原子提交：一个 commit 一个主题；素材与引用它的数据同 commit。
type 前缀：feat / fix / refactor / perf / docs / test / chore（+ scope，如
`fix(lyrics):`、`refactor(ts):`）。

## 验证命令

| 场景 | 命令 |
|---|---|
| 全量单测 | `cd frontend && npm run test` |
| 类型检查 | `cd frontend && npm run type-check` |
| 数据静态校验（课时 id 重复/资源 404/玩法引用） | `cd frontend && node scripts/validate-data.mjs` |
| 多视口布局走查（改布局必跑） | `cd frontend && node scripts/layout-audit.mjs` |
| 白屏冒烟（构建产物） | `cd frontend && node scripts/smoke.mjs` |
| push 前全套 | `bash scripts/ci-local.sh` |

## 文档地图

- `docs/ADAPTATION-GUIDE.md` — 三端适配 + 暗黑主题硬约束（改样式前必读，含试飞清单）
- `docs/DESIGN-GUIDELINES.md` / `frontend/DESIGN_SYSTEM.md` — 交互与视觉规范
- `docs/DATA-INVENTORY.md` — 数据清单与隐私边界
- `docs/ARCHITECTURE-REVIEW.md` / `ARCHITECTURE-EVOLUTION.md` / `adr/` — 架构决策
- `docs/LYRICS-WORKFLOW.md` — 歌词时间轴完整经验（skill 的深读版）
- `docs/COMPONENT-LIBRARY.md` / `PROGRESS-DATA.md` / `P1-BACKLOG.md` / `ROADMAP.md`

## Skill 地图（`.agents/skills/`，跨平台 Agent Skills 规范）

| Skill | 何时触发 |
|---|---|
| `lyrics-pipeline` | 新课配歌 / 歌词时间轴 / LRC / 卡拉OK高亮问题 |
| `new-lesson` | 新增或修改课时内容（词表/发音/词图/视频/歌曲/seed） |
| `ui-walkthrough` | UI 改动后的走查验收（脚本化 + 交互式坑位） |
