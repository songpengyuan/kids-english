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

---

# 二次评审（2026-10-12）

> 范围：业务扩张至 4 域（学习/游戏/磨耳朵/我的）+ 宝藏图鉴 + 闯关地图后的**路由与导航信息架构**复审。
> 触发：游戏模式无主导航入口、`App.vue`/`BottomNav` 注释与实现不一致、命名同名冲突。

## 1. 本轮结论（已落地）

| 项 | 决策 | 落地 |
|---|---|---|
| 底部导航 | **维持 学习/磨耳朵/我的** 三主 tab；游戏**不做主 tab** | BottomNav 注释与模板同步 |
| 游戏入口 | 收在**学习页右上角"游戏"按钮**（金色胶囊，AppHeader 新增 `action` 插槽），进入 `#/game` 沉浸闯关，顶栏返回回学习 | AppHeader `slot name="action"`；LearnView/GameView |
| 学习域题型 | 从参数式 `:id/:stage?` 升级为**显式二级子路由**：`:id` 父路由（菜单）+ 6 个题型子路由（`/learn/l4/quiz` 等，URL 不变） | router/index.ts 嵌套；guard.test/pages.smoke mock 同步 |
| 命名消歧 | `components/activities/LearnView.vue` → **`LearnStage.vue`**（与 `views/learn/LearnView.vue` 消除同名） | git mv + 引用/测试同步 |
| 闯关身份 | `path.includes('/quest')` → **`route.name === 'quest'`** | useQuest.ts |

## 2. 本轮发现的经验教训（沉淀）

1. **"注释与实现不一致"是改版残留的信号**：`App.vue` 写"学习/游戏/我的"，`BottomNav` 模板还引用**未定义的 `isGame`**（学习 tab 高亮条件 `isHome && !isGame` 恒真）——导航中途改版没清干净。规则：**改导航结构时，同步搜索注释、aria 逻辑、已删除 tab 的残留变量**（本轮用 `grep isGame` 一次性定位）。
2. **主 tab 数量 = 产品信息架构决策，不能静默漂移**：三入口从"自由/游戏/我的"漂到"学习/磨耳朵/我的"期间，游戏入口消失了。规则：**非主 tab 的功能必须有一个显式、可发现的一级入口**（本轮：学习页右上角按钮），否则核心玩法会被"藏起来"。
3. **vue-router 嵌套"父带组件 + 子继承"的类型处理**：父路由带组件时，无组件的子路由不满足 `RouteRecordRaw` 类型联合；本项目子路由与父**共用 LessonView**（父按 `route.name` 分发题型，父模板无 `<router-view>` 故子不重复渲染）。规则：**子路由写 `component`（与父同组件）+ 注释说明分发机制**；若未来给 LessonView 加 `<router-view>` 必须同步改造。
4. **AppHeader 预留页面级操作位**：顶栏从"三 tab 共用、右侧固定徽章"扩展出 `action` 插槽——页面级入口（游戏）不污染三 tab 共用组件，组件库化沉淀（见 COMPONENT-LIBRARY.md 目录约定）。

## 3. 保持不动的好设计（勿回退）

- 四域子路由承载、6 题型独立 path（深链/分享友好）、KeepAlive 双壳缓存（LearnView/GameView）、懒加载 + SW 预缓存、旧路径迁移守卫（beforeEach）——均已达标。
- `pathLevels.ts` 作为 GamePath 与 LessonView 共享的关卡序列单源（高内聚低耦合典范）。

## 4. 遗留可选（未做，触发再做）

- `progress` store 436 行（课程进度/每日目标/星级混一店）——玩法类型 >8 或出现跨页共享状态时按"每日目标/课程进度"拆分。
- 6 题型共用 `LessonView`（现 274 行编排壳）——题型再增时拆按题型子组件（`components/lesson/stages/`）。

# 三次评审：声音系统重构（2026-10-12）

> 动因（用户诉求）：① 点到的文字都要发音，抽象一个声音组件读单词和文案；② 听音选图等进题即播；③ 预生成 mp3 3 秒内没播放就降级原生 TTS。

## 1. 现状诊断
- ✅ 已有：数据层单词 `audio` 自动拼接 `public/lessons/<课>/audio/<词id>.mp3`（69 个神经网络童声 mp3）；`speech.ts` MP3 优先→失败回退 TTS、TTS 竞态修复（seq 版本号+60ms 延迟防“点 A 听 B”）、`stopSpeaking` 统一打断、`speakZh` 静音语义。
- ❌ 三个问题：
  1. **播放兜底语义 bug 级**：`playAudio` 10s 后**无条件 `resolve(true)`**——慢资源/404 时孩子干等且不降级 TTS，与“3s 没播换原生”诉求相反；
  2. **发音调用散落 ~20 处**（各玩法各自 import speak、各自维护 speaking 状态、各自传参），无统一组件；
  3. **进题自动播各自为政**（只有 QuizView 350ms 读题）。

## 2. 落地内容（已全部完成并推送）
### A. 服务层（src/services/speech.ts）
- `playAudio` 改为：监听 `playing`/`timeupdate`（首次出声=成功）；**`timeoutMs`（默认 3000ms）内未开始出声 → resolve(false) 降级 TTS**；onerror/play() 被拒 → 降级；移除 10s 无条件成功兜底。
- 统一入口：`speak`（保留签名，内置 3s 语义）+ `speakWord`（单词语义化别名）+ `speakText`（文案，默认 ttsOnly）。
- 导出响应式 `speaking` 状态（`stopSpeaking` 同步复位）。

### B. 统一点读组件（src/components/ui/SpeakText.vue，props 配置化）
- props：`text` / `zh` / `lessonId` / `wordId` / `ttsOnly` / `rate` / `lang` / `as`(span|button) / `timeoutMs` / `bypassMute`。
- 点击即读、再点打断重读；朗读波浪动画（局部 active，不全局闪烁）；span 形态自带 stopPropagation（点标题不触发宿主点击）；aria-label/aria-pressed。
- 已接入：**学习页课程卡标题点读**（点标题听英文课程名，点卡片进课）。

### C. 玩法接入
- 听音选图进题自动播已纳入统一链路（350ms 读题，自动获得 3s 降级）。
- LearnStage 单词卡 / Match 词卡 / Talk 句子 / Review 选项的现有点读**保持组件自带逻辑**（标记/连线/选对错），通过服务层统一入口自动获得 3s 降级——避免组件包裹破坏玩法语义。
- 页面自动朗读（角色介绍/技能名/导航提示）保持服务调用，不组件化（合理边界）。

## 3. 验证
- 测试 **224/224**（新增 5 个 SpeakText 组件用例 + 2 个 3s 降级用例：超时未播→降级 TTS / 3s 内开始播→不降级）。
- type-check 0、生产构建绿。
- 浏览器实测：学习页课程卡标题点读发声 ✓；quiz 进题自动播创建 mp3 Audio ✓；Audio.play 被拒（模拟自动播被拦/资源失败）→ **3s 内降级原生 TTS 出声** ✓。

## 4. 经验教训（沉淀）
1. **“超时兜底”必须区分“成功放行”与“失败降级”**：旧实现 10s 无条件 `resolve(true)` 把失败伪装成成功，调用方永远不降级——超时兜底默认应走降级路径，成功信号只来自真实事件（playing/onend）。
2. **统一点读入口要 props 配置化**：同一个“点文字发音”有 10 种变体（单词带定位/不带、纯文案、中文、语速、是否绕过静音……），组件把变体收敛为 props，页面只需声明意图。
3. **组件化与业务语义的边界**：WordCard 点读带着”标记已点/统计/入场动画”业务逻辑，强包 SpeakText 会破坏玩法；组件用于”纯点读文字”，带业务逻辑的点读保持服务层调用——先探结构再定边界。

# 四次评审：schema 治理与玩法舞台注册表（2026-10-24）

> 动因：架构师视角全面复核（全仓 + 文档 + CI + 近一个月提交）。先核销上轮风险，再处理三个新压力点。

## 1. 上轮（2026-10-17 ARCHITECTURE-EVOLUTION）风险核销——逐条到代码验证

| 上轮风险 | 状态 | 证据 |
|---|---|---|
| R1 内容双源漂移 | ✅ 已落地 | `deploy.yml` Content seed drift check + `ci-local.sh` 同构拦截；l11 新课两源一致，证明闸门在实际生效 |
| R2 危险 deploy-server.sh | ✅ 已落地 | exclude 已修对（.venv/.env/*.db/media）+ 交互确认，定位”本地应急部署” |
| R3 迁移无版本 | ✅ 已落地 | ADR-002，`schema_version=3` 生产回显 |
| R4/R5 错误上报与埋点 | 🟡 大幅改善 | `activity_done / lesson_enter / level_pass / listen_play` 已接入（10-17 时仅 2 个事件） |

## 2. 本轮落地（三笔提交）

| 项 | 发现 | 处置 | 提交 |
|---|---|---|---|
| 儿童录音曾入 git | 21 条录音（1.5MB）在 `.gitignore` 规则**之前**已被跟踪——规则对已跟踪文件不生效，”规则在、漏洞也在” | `git rm -r --cached`；`ci-local.sh` 快检新增「运行期数据入库检查」（实测拦截 `git add -f`）；ADR-005 补回执：**仓库转公开前必须 filter-repo 清史** | `5459b39` |
| LessonView 玩法分发 | 玩法已到 8 个（memory/order 一周内新增），撞上二次评审自定的拆分阈值；模板 7 层 v-else-if 随玩法数线性增长 | `STAGE_BINDINGS` 注册表 + `<component :is>`；`Record<PlayStage,...>` 穷举类型让”加玩法漏注册”编译期就红；词群重挂载语义与原 `:key` 完全一致；顺手清掉 colorPairs 对 quiz/speak 的 fallthrough 透传 | `7d3a15f` |
| 课时能力字段 entropy | l11 给顶层贡献了 wordGroups/tracks/colorPairs 等可选字段，注释全是”l11 用”；评审最初建议嵌套 features 重排，**实施前核查推翻**：字段已在生产 wire 格式（schemas.py + types/api.ts），组合校验大半已存在 | 扁平保留 + 四条扩展约定固化进 lessons.ts；MatchView 删本地 COLOR_HEX（与数据已实际漂移：white/brown 两处色值不一致）；validate-data 新增 7 项校验（枚举/色值格式/引用完整/配对唯一/轨道可播/音视频查盘）；决策记录 ADR-007，写明重开条件 | `bffa935` |

## 3. 遗留与观察项

- ~~progress store 拆分~~ **已落地**（2026-10-24 深夜补做，`stores/progress/` 五模块 + 门面 index）：shared（类型+存储格式）/ course / words / daily / cloudSync；单门面不拆多 store（持久化是同一份冻结键文档，daily 依赖 words、云同步读写全部域）；22 处消费方导入路径零改动；396 前端 + 116 后端测试全绿。
- **媒体播放子域**（ListenView + SongView + SongStage + player store ≈ 2300 行）：等 l11 多轨波动平息后抽 `useMediaPlayer` composable 三处共用。
- **GamePath.vue（1039 行）**：纯展示大头，下次触碰时再拆，不专门立项。
- **双会话同仓的协作教训（两轮，一次比一次贵）**：
  1. pre-commit 的 vue-tsc 是全项目检查，会被另一会话的半成品挡住；解法是按 hunk 精确暂存（`git diff` 过滤 + `git apply --cached`）分离两边的改动。
  2. **git index 是两会话共享的**：一边暂存的删除（progress.ts）与另一边暂存的资源（webp）被卷进了同一笔提交，且新文件未及入库时 HEAD 曾短暂处于”缺模块”状态。修复走 fix-forward（补提交），不 rebase（对方会话持有提交哈希）。**结论：两个会话不要共用一个工作区**——需要并行时用 `git worktree` 各占一份检出，或约定提交窗口。

# 五次评审：数据驱动收口——“加课 = 加数据”的查询面与机器验收（2026-10-25）

> 动因：用户提出”交互视图课和课尽量通用，加课只需要增加数据”。同期另一会话完成了
> 数据层抽离（课时内容 → `lessons.json`、加餐三课下线、路由课时本位 /course/:id）。

## 1. 立场（先划边界再动手）

**玩法类型 = 代码（少而稳）；课次内容 = 数据（多而增）。** 明确拒绝”配置解释器 /
JSON 驱动 UI”路线——8 种玩法、个位数变体的规模，代码注册表（STAGE_BINDINGS）就是
正确的抽象级别；解释器会把类型安全、动画手感、可调试性全部变成配置难题。
泛化门槛沿用 ADR-007：数据字段首例即通用命名；组件逻辑首例直写；**第二课出现才泛化**
（n=1 在猜边界，n=2 才在观察边界；AI 会话让写代码更便宜、让拆错误抽象更贵）。

## 2. 审计结论与落地

全仓按课分支审计：**玩法组件零课时 id 分支**，关卡由 buildLevels 自动派生——
内容驱动的完成度比体感高（约 7 成）。真正的债四处，全部落地：

| 项 | 落地 |
|---|---|
| 首页排序硬编码 `OFFICIAL_ORDER`（l10 上线漏改被排末尾——维护陷阱实锤） | 改为按 `date` 派生（= 培训班上课顺序），加课零改动；与 content store 的 id 数值序（”下一课”推进语义）双口径并存且注释写明 |
| 变体契约隐式（散在组件里，加课前只能翻代码回忆） | `docs/ACTIVITY-VARIANTS.md` 登记表：课时级字段 / 每玩法一行 / 5 课配置速览 / 加课决策流程；入口挂 lessons.ts 注释、AGENTS.md、ADR-007 三处 |
| 冒烟测试手抄路由表（/learn→/course 重构后测旧路径、memory/order 漏登记，漂移不可见） | router/index.ts 导出 `appRoutes`，冒烟用生产路由表 + 全新 memory router（守卫有专属测试）；断言全迁 /course |
| 加课无机器验收 | pages.smoke 参数化为 **lessons × activityKeys 全组合挂载**（5 课 × 8 玩法 = 40 例，加课自动长出）；补磨耳朵/口令页/家长中心/闯关页 4 个从未覆盖的页面 |

验收线写进 new-lesson skill：**标准新课（用既有玩法与变体）= 组件文件零改动**。

## 3. 测试整理的取舍

57 个测试文件**没有做目录级重排**：按模块就近 colocate 的结构本来就是对的，
重排是纯 churn。真正的腐烂在 smoke 的路由表与覆盖洞（已修）。测试数 400 → 495，
全绿 4.8s。

# 六次评审：全端适配走查（2026-10-25，交互设计 + 前端视角）

> 动因：用户提出"站在交互设计师/前端开发角度做各端适配的全面走查"。
> 方法：按 ui-walkthrough skill 两层走查——脚本层 layout-audit 全量
> （15 视口 × 19 页 = 285 组合）+ 视觉复核（截图 → 视觉模型评审），辅以代码层审查。

## 1. 基线结论

**适配质量高于预期**：285 组合仅 1 处 9px 亚像素溢出（memory 网格裸 1fr 的
min-content 地板，iPad 分屏半宽触发，`minmax(0,1fr)` 修复）。架构四件套
（token / 断点白名单 / 审计脚本 / 守卫）正确。真问题集中在**工具链可信度**与
**三个未覆盖维度**（PWA、暗黑、审计脚本自身的正确性）。

## 2. 本轮发现与修复（按严重度）

| 级别 | 发现 | 修复 |
|---|---|---|
| **P0 生产 bug** | SW 离线壳地址指向站点根——双根部署后根是备案页，**孩子断网打开 App 会兜底到博客页** | SHELL_URL 改指 scope 下 `app/` |
| P0 | verify-pwa 按旧布局导航（打开的是不注册 SW 的备案页，14 项全挂）且不在任何门禁——静默腐烂一周 | 按双根现实重写（14/14 绿）+ 纳入 ci-local 第 8 步 |
| P0 | SW 媒体缓存 100/80MB 上限被 80MB 视频击穿——天天裁剪、顶掉孩子看过的视频 | 提到 200/160MB（预算写进注释） |
| P1 | VideoPlayer 手机横屏（390 高）整体超高 ~44px 上下裁切 | `min(58vh, calc(100dvh - 240px))` 双重限高 |
| P1 | 5 处旧断点（700/900/max-600/600+640/420+340） | 全部收口（见 DESIGN_SYSTEM §11.6），受控清单清零；新批准 `600+portrait` 复合档 |
| 工具 | layout-audit：BASE 少 `/app/` 曾整轮拍备案页；hash 导航竞态致 37 张串页；页面清单过期于路由重构 | 补前缀 + 标题防呆 + hash 轮询 + 补 4 页（memory/order/菜单视图/视频浮层） |

## 3. 新能力

- **暗黑机器基线**：`AUDIT_THEME=dark`（截图独立落盘）。首轮 5 视口 × 19 页 =
  101 张零溢出，视觉抽查（学单词/我的）对比度优秀——暗黑从"人工印象"升级为"有基线"。
- 走查经验沉淀：ui-walkthrough skill 与记忆均已更新。

## 4. 观察项（有触发条件）

| 项 | 触发 |
|---|---|
| 电视直连浏览器的 10-foot 放大（控制面板 clamp 随视口） | 确认真有人用 TV 浏览器直连（投屏不点页面 UI，无需） |
| 横屏看视频的覆盖式控制条（视频区偏小） | 孩子常用横屏看视频再做 |
| SE 竖屏菜单 8 瓷片需滚动（一屏 ~6） | 产品决策：接受滚动（推荐）/ 3 列紧凑 / 折叠 |




