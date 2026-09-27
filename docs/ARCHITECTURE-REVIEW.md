# 技术架构评审（2026-09-28）

> 范围：`kids-english` 全量源码（src/ 18,060 行，24 个测试文件 192 用例）。
> 立场：技术架构视角，客观。目标：**高内聚低耦合、为扩展做准备、组件库沉淀、路由、PWA**。
> 结论概览：分层骨架健康、PWA 与状态机设计成熟；主要风险集中在 **离线首装可靠性、目录归位、大容器组件、扩展路径规范化**。

---

## 1. 现状评估（做对的部分）

| 维度 | 现状 | 评价 |
|---|---|---|
| 分层 | views / components(layout·activities·ui) / composables / stores / utils / data | ✅ 方向正确，六层职责基本分明 |
| 状态机 | useLessonFlow（流程）+ useQuest（闯关身份）+ 各玩法 session（useQuizSession 等） | ✅ 高内聚低耦合的典范，玩法可独立测试 |
| 全局状态 | progress / rewards / streak 三个 Pinia store，职责互不重叠 | ✅ 边界清楚，持久化键独立 |
| 路由 | hash 模式（GH Pages 正确选择）+ 旧深链兼容 + catch-all | ✅ 部署环境适配到位 |
| PWA | network-first 导航、cache-first hash 资源、媒体 etag+Range、skipWaiting、首页静默刷新 | ✅ 策略成熟，注释详尽 |
| 工程 | guard-build 质量门、layout-audit、verify-pwa、CI test+type-check 后部署、TDD | ✅ 防白屏、防回归意识强 |

---

## 2. 问题与建议（分级）

### P0 —— 影响正确性 / 离线可靠性（建议优先）

**P0-1 首次安装后离线可能白屏：sw 预缓存不含 build assets**
- 现状：`sw.js` install 只 `addAll` 了 index.html / manifest / 图标，JS/CSS 走运行时 cache-first。安装完成立即断网打开 → 网络优先回退也无缓存 → 白屏。
- 建议：构建时生成 `dist/assets` 清单，注入 sw 的 `PRECACHE_ASSETS`（vite 插件已在做 BUILD_ID 注入，扩展 manifest 即可）。asset 文件名带哈希，预缓存零风险。
- 收益：离线可用性从"在线首开过才可用"升级为"安装即可离线"。

**P0-2 目录归位：HomePage 在 components/ 根、业务组件混杂**
- 现状：`HomePage.vue`（路由级页面）与 `GamePath/ChestReward/LessonResult` 等业务组件同放 `components/` 根；页面与组件、玩法与通用件边界不清，目录一致性被破坏。
- 建议：
  - `HomePage.vue` → `src/views/HomeView.vue`（router 同步）；
  - `GamePath.vue` → `src/components/game/`（游戏模式专属）或 `activities/`；
  - `ChestReward/LessonResult/MasteryTrend/HeroFormCard` → 按业务域归位（`components/rewards/`、`components/report/` 或统一 `components/ui/`），与 COMPONENT-LIBRARY.md 目录约定对齐。
- 收益：目录即契约，新成员一眼知道代码去哪。

### P1 —— 扩展性准备（中期）

**P1-1 玩法扩展路径：/lesson/:id 单路由承载 7 个玩法**
- 现状：stage 由 query（`?stage=learn`）驱动，路由层只有 `/lesson/:id`。当前 6+1 玩法可接受，但玩法增加/需要"直达分享"时，query 方案会越来越重。
- 建议：升级为 `/lesson/:id/:stage?` 子路径（v1 保持 query 兼容重定向），玩法直达、分享、独立埋点都可直接落 URL；状态共享仍由 useLessonFlow 承担，不破坏现有耦合权衡。
- 备选：维持 query 方案并在 DEVELOPMENT.md 明确"玩法路由化"的触发条件（如玩法数 >8 或出现跨课直达需求）。

**P1-2 无路由懒加载，单 bundle 283KB JS**
- 现状：全部页面打进一个 chunk（283KB JS / 133KB CSS）。低频页面（treasure/hero-detail/report）也进入首屏。
- 建议：`router/index.ts` 用 `import()` 懒加载低频页；**必须联动** sw 预缓存 assets 清单（P0-1），否则离线场景会命中未缓存 chunk。学习主链路（home/lesson）保持同步加载，保证离线首开稳定。
- 收益：在线首屏体积下降；离线体验不降级（预缓存兜底）。

**P1-3 utils 混层：纯函数与全局副作用同目录**
- 现状：`utils/` 19 个文件混放"纯函数"（layout/quizSession/matchBoard/pathGeometry/reviewSchedule…）与"全局服务"（speech/sound/effects/haptics/theme/pwa，模块作用域持有可变全局态，如 speech 的 ttsSeq 竞态版本号）。
- 建议：拆两层——`utils/pure/`（纯函数，可任意引用）+ `services/`（带全局态的服务单例，显式接口、独立测试）。speech.ts 收敛为 `services/speechService.ts`（保留现有竞态修复语义）。
- 收益：纯函数可随处复用/测试；全局态有了明确归属，不再"散落 utils"。

**P1-4 LessonView 仍是大容器（411 行）**
- 现状：stage 机已在 useLessonFlow，但 LessonView 仍承担菜单模板、结算模板、进度写入、音效/朗读编排、7 个 stage 的条件渲染。
- 建议：拆出 `components/lesson/LessonMenu.vue`（玩法菜单）、`components/lesson/LessonResult.vue`（复用现有 LessonResult 增强）与 `useLessonProgress.ts`（进度/星数写入）；LessonView 只留"编排薄壳"。
- 收益：菜单/结算可独立演进；LessonView 回归"路由即组件"的薄层。

**P1-5 关键流程缺行为级测试**
- 现状：utils/composables/stores 测试扎实，但 views 只有挂载 smoke；LessonView 的 stage 迁移与结算链路没有单测（好在 useLessonFlow 已抽离，可直接补）。
- 建议：为 useLessonFlow 补 stage 迁移（深链/next/back/重置）与结算（星数→进度→连击）行为测试；新增 stage 玩法时强制配 session 测试（现状已如此）。

### P2 —— 工程规范（持续）

- **P2-1 ESLint/Prettier 缺位**：18k 行增长后一致性靠自觉。建议加 `eslint-plugin-vue + prettier`，进 CI 质量门（与 test/type-check 并列）。
- **P2-2 JS→TS 渐进**：main.js + 5 个 utils（theme/haptics/effects/pwa/useViewport）仍是 JS。建议按"被引用面从大到小"迁移，先 pwa（PWA 核心逻辑值得类型化）。
- **P2-3 数据层 schema 化**：lessons.ts / heroes.ts 是手写对象数组，内容扩展后易漂移。已加 `scripts/validate-data.mjs`（结构/引用/去重校验）纳入 build:ci；heroDetails.ts 已并入 heroes.ts ROSTER 单源化（加角色一处写完，不再靠 id 对齐第二份数据）。
- **P2-4 组件库落地二选一**：高频 UI（Button/Card/Badge/Progress）目前是全局 CSS 类（`.k-btn/.card/.star-badge/.progress`）。二选一：① 提升为 `components/ui/Button.vue` 等（多形态时值得）；② 在 COMPONENT-LIBRARY.md 明确登记"全局类即组件"，禁止页面内复制样式。短期选 ②，出现第 2 种形态时转 ①。
- **P2-5 路由 meta 与页面标题**：title 固定"丞丞ABC"。建议 `afterEach` 按路由 meta 设置 document.title（如"第 4 课 · 丞丞ABC"），PWA 书签/分享更友好。
- **P2-6 iOS 细节**：viewport-fit=cover 已加 ✅；缺 `apple-mobile-web-app-status-bar-style` 显式值可补（可选）。

---

## 3. 建议执行顺序

1. **P0-1 sw 预缓存 assets 清单** + **P0-2 目录归位**（同一轮重构窗口，纯增量，风险低）；
2. P1-2 路由懒加载（联动 P0-1 的清单注入）；
3. P1-3 utils 分层 / P1-1 玩法子路径 / P1-4 LessonView 拆分（按发布节奏穿插）；
4. P2 各项随日常迭代逐步落地。

## 4. 明确不做/暂缓

- 状态管理不引外部库（Pinia 够用）；不引入状态持久化中间件（本地存储直写已满足）。
- 不做多语言 i18n 框架（当前产品单语种；文案集中在组件内，未来可抽 `src/i18n/` 但不必现在做）。
- 不引入 CSS 框架/Tailwind（tokens.css 变量体系已覆盖）。
