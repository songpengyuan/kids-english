# 丞丞英语乐园 · 开发文档

面向 5 岁孩子的儿童英语单词学习 Web 应用。每节课对应一首童谣，围绕童谣里的单词做
「看图学词 → 听音选图 → 图词连线 → 跟我读 → 唱童谣 → 亲子对话」的练习闭环
（亲子对话仅配置了 `phrases` 的课时显示）。

> 日常使用说明（怎么加课、传素材）看 [README.md](./README.md)；
> 本文档面向**开发与维护**，解释代码怎么组织、为什么这么设计。

---

## 1. 技术栈与运行

| 项 | 说明 |
|---|---|
| 框架 | Vue 3（`<script setup>` 组合式 API） |
| 路由 | vue-router，**hash 模式**（`/#/lesson/l4`；GitHub Pages 静态托管下 history 深链刷新会 404） |
| 状态 | Pinia 3 个 store：progress（进度/单词掌握度/今日学情）、streak（连击）、rewards（贝壳/贴纸） |
| 构建 | Vite 8 |
| 包管理 | pnpm |
| 后端 | 无，纯前端静态站点 |
| 语音 | 预生成神经网络发音（edge-tts，童声 AnaNeural）+ Web Speech API 回退；发音评分见 §6 |
| 动效 | canvas-confetti + CSS 关键帧 + Web Audio 合成音效 |
| 存储 | localStorage（进度 / 奖励 / 连击三键独立） |
| 部署 | GitHub Pages，子路径 `/<repo>/` |

```bash
pnpm install
pnpm dev      # 本地开发
pnpm test     # 单元测试（vitest）
pnpm build    # 产出 dist/（本地预览；部署时带 GH_REPO 环境变量，见 §9）
pnpm build:ci # 部署构建（强制要求 GH_REPO，防止子路径部署 404）
```

---

## 2. 目录结构与职责

```
kids-english/
├── index.html
├── src/
│   ├── main.js                 # 入口：主题 → Pinia → 路由 → 挂载；注册触感与错误上报
│   ├── App.vue                 # 顶层外壳：首页 KeepAlive 缓存（返回不丢模式/页码）
│   ├── router/
│   │   └── index.ts            # hash 路由：/ /me /treasure /report /review /lesson/:id
│   ├── styles/
│   │   ├── tokens.css          # ★ 设计 token：颜色/间距/字号/圆角/阴影 + 断点表注释
│   │   └── base.css            # ★ reset、应用外壳、跨页面共享 UI（.view/.k-btn/.topbar/进度条/动画）
│   ├── data/
│   │   └── lessons.js          # ★ 课时数据唯一入口，导出时统一补部署基路径 + activityKeys
│   ├── stores/
│   │   ├── progress.ts         # 进度 + 单词掌握度 + 今日学情 + 通关口径（Pinia）
│   │   ├── streak.ts           # 连击火焰（每日目标 + 连续天数，Pinia）
│   │   └── rewards.ts          # 贝壳 / 贴纸图鉴 / 贴纸商店（Pinia）
│   ├── composables/
│   │   ├── useViewport.js      # ★ 视口状态（模块级单例，尺寸 + 分档）
│   │   └── usePager.js         # ★ 通用分页逻辑
│   ├── utils/
│   │   ├── layout.js           # ★ 纯函数布局算法：fitGrid / pickColumns / splitBalanced
│   │   ├── speech.js           # 两级发音：按 (lessonId, wordId) 精确查 mp3，缺失回退浏览器 TTS
│   │   ├── speechScore.js      # 发音评分（ASR + 录音双模式）
│   │   ├── effects.js          # 彩带与音效
│   │   └── errors.js           # 未捕获错误本地环形缓冲（控制台 __kidsErrors()）
│   ├── components/
│   │   ├── HomePage.vue        # 首页：课时卡（分页）+ 复习/继续，模式由底部导航驱动
│   │   ├── BottomNav.vue      # 底部导航：自由/游戏/我的（App 常驻，课程内隐藏）
│   │   ├── MyView.vue         # 我的页（/me）：统计 + 宝藏/报告/复习入口
│   │   ├── LessonView.vue     # 单课状态机：菜单 ↔ 各玩法 ↔ 结算（含闯关模式）
│   │   ├── LearnView.vue       # 看图学词（★ 动态分页）
│   │   ├── QuizView.vue        # 听音选图（单题推进，错词落库）
│   │   ├── MatchView.vue       # 图词连线（分组 + SVG 连线，连错落库）
│   │   ├── SpeakView.vue       # 跟我读（ASR 打分 / 录音回放双模式）
│   │   ├── SongView.vue        # 童谣音频/视频 + 动画舞台
│   │   ├── TalkView.vue        # 亲子对话（首次引导 + 填词）
│   │   ├── ReviewView.vue      # 错词复习页（/review）
│   │   ├── ReportView.vue      # 家长学情页（/report）
│   │   ├── TreasureView.vue    # 宝藏罐（/treasure）：贝壳 + 图鉴 + 贴纸商店
│   │   ├── ChestReward.vue     # 开宝箱：三连击开箱 + 抛物线收取飞入顶部贝壳徽标
│   │   ├── GamePath.vue        # 游戏模式关卡路径图（Canvas，KeepAlive 下离开即停帧）
│   │   ├── WordCard.vue        # 可复用发音词卡
│   │   └── Pager.vue           # ★ 通用翻页控件（大箭头 + 圆点）
│   └── **/__tests__/           # vitest 单测：layout / speechScore / streak / usePager
├── scripts/
│   ├── layout-audit.mjs        # ★ 多视口布局走查脚本（见 §7.2）
│   ├── verify-pwa.mjs          # PWA 离线/更新 E2E 验证
│   ├── guard-build.mjs         # 部署构建防护（build:ci 用，强制 GH_REPO）
│   └── gen-word-audio.py       # ★ 生成单词发音 mp3（edge-tts，见 §5.1）
├── public/
│   ├── lessons/                # 课时素材目录（约定见 README）
│   └── avatars/                # 课时封面占位
└── DEVELOPMENT.md              # 本文档
```

标 ★ 的是本次响应式重构新增/重点改造的部分。

---

## 3. 架构总览

### 3.1 页面路由 + 两层状态机

```
router (hash)   / 首页(HomePage，KeepAlive 缓存)  /me  /lesson/:id  /treasure  /report  /review
                └── 底部导航 BottomNav（App.vue 全局挂载）：自由 / 游戏 / 我的
LessonView.vue   stage: menu | questStart | learn | quiz | match | speak | song | talk | result
```

- 页面级用 vue-router（hash 模式）：/me、/treasure、/report、/review、/lesson/:id 都是独立页面，
  深链刷新不掉链（GitHub Pages 静态托管下 history 模式深链会 404）。
- **底部导航常驻三入口**（App.vue 全局）：自由（/ 不带 query）/ 游戏（/?mode=game）/ 我的（/me）。
  首页的自由/游戏是同一路由的两种浏览模式，用 query 区分，URL 可直达可分享；
  /me、/treasure、/report、/review 高亮"我的"tab；/lesson/:id 沉浸学习不显示导航。
- 课程内**不逐玩法拆路由**：stage 仍在 LessonView 内部管理，玩法间共享大量状态，
  拆路由反而增加耦合；需要"直达/分享"某个玩法时再提为独立路由。
- 需要真机直达验收时用调试深链（见 §7.1）。

### 3.2 组件契约

| 组件 | props | emits | 说明 |
|---|---|---|---|
| BottomNav | — | — | 底部导航：自由/游戏/我的，路由高亮（App.vue 全局，玩法页隐藏） |
| HomePage | — | — | 课时卡片分页 + 复习/继续入口；模式由路由 query（?mode=game）驱动 |
| MyView | — | — | 独立页 /me：统计（星星/连击/贝壳/贴纸/今日学情）+ 宝藏/报告/复习入口 |
| LessonView | — | — | 按 `stage` 渲染各玩法或结算页；闯关模式有关卡卡（questStart） |
| LearnView / QuizView / MatchView / SpeakView | `words` | `done(stars)` | 玩法结束上报星级（1~3）；内部把错词记入 progress.words |
| SongView | `lesson` | `back` / `song-done` | 童谣页，星级固定 1（内部 markSong） |
| TalkView | `lesson` | `done(stars)` | 亲子对话，带首次引导 |
| ReviewView | — | — | 独立页 /review：到期词复习（间隔重复队列，复用 useQuizSession） |
| ReportView | — | — | 独立页 /report：今日学情 + 错词清单 + 宝藏概览 |
| TreasureView | — | — | 独立页 /treasure：贝壳 + 图鉴 + 贴纸商店 |
| ChestReward | — | `done` | 自包含三连击开箱 + 抛物线收取（flyCurve 纯函数轨迹），可跳过 |
| WordCard | `word`, `size`, `speakZhHint` | — | 纯展示 + 点击朗读（点读记 seen） |
| Pager | `page`, `total` | `prev` / `next` / `go` | 受控组件，不持有页码状态 |

玩法组件统一走 `words` 进、`done(stars)` 出，因此 LessonView 可以用同一个
`<component :is>` 挂载它们，新增玩法只要遵守这个契约即可零改动接入。
单词级记录（recordWord）由玩法组件直接调用 progress store，
不改变 `done(stars)` 契约——旧玩法/测试场景不受影响。

### 3.3 数据流

```
lessons.js ──(补 BASE_URL + activityKeys)──► 页面/玩法组件
                                                  │
                ┌─────────── recordWord / setGameStars / addDailyActivity ───────────┐
                ▼                                                                      ▼ done(stars)
        progress store (Pinia) ◄────────────── LessonView 结算
                │
                ▼
        localStorage (kids-english-progress-v1)
```

三个 store 均为 Pinia：

- **progress**：每课星级 + 玩过的玩法 + **单词级掌握度**（`words: { [wordId]: { seen, correct, wrong, lastAt } }`）
  + 今日学情（`_daily: { date, durationSec, activities }`）+ 最近课程（`_last`）。
  老数据在 load() 时增量迁移补字段，历史星星不丢。
- **streak**：每日目标 + 连续天数（独立键，跨天自动断档）。
- **rewards**：贝壳 / 贴纸图鉴 / 开箱次数（独立键）+ buySticker 消耗出口。

「通关」判定统一走 `activityKeys(lesson)`（learn/quiz/match/speak + [talk] + song）：
全部玩法玩过 **且** 星级达标（学/辨/连/读 ≥2，唱/对话 ≥1）。

---

## 4. 响应式与布局规范 ★

这一节是本次重构的核心，改动布局前**务必先读**。

### 4.1 第一原则：一屏装下，永不滚动

```css
html, body { overflow: hidden; overscroll-behavior: none; }
#app { height: 100dvh; overflow: hidden; }
```

这是刻意的产品选择（贴多邻国的"原生 App"手感，孩子不会误触滚动）。
它带来一个硬约束：**内容放不下时不能靠滚动兜底，必须重新排布或分页**。

由此推出两条实现纪律：

1. 所有页面根节点用 `.view`（`flex:1; min-height:0; flex-direction:column`），
   内容区用 `.view-body`（`flex:1; min-height:0`）。**不要**再在组件里手写这三个属性。
2. 任何"数量不定"的列表都必须能分页或能改列数，不许假设"反正放得下"。

### 4.2 尺寸写法：必须同时受 vh 和 vw 约束

只看高或只看宽都会在某个设备上翻车：

| 写法 | 翻车场景 |
|---|---|
| 只用 `vh` | iPad 横屏（宽而矮）元素偏小，宽度方向大片留白 |
| 只用 `vw` | 手机横屏（矮）元素被撑爆、直接溢出 |
| 固定 `px` | 完全不响应 |

**规范写法**：`clamp(下限, min(Xvh, Yvw), 上限)`

```css
/* 好 */
.pic { width: clamp(72px, min(23vh, 17vw), 170px); }

/* 坏 */
.pic { width: clamp(72px, 23vh, 170px); }
```

优先使用 `tokens.css` 里已定义好的变量（`--fs-*`、`--gap-*`、`--pad-*`、`--radius-*`），
不要在组件里重新算。新变量也请加到 tokens.css 集中管理。

### 4.3 断点表

分档阈值定义在两处，**改动必须同步**：
`src/styles/tokens.css` 末尾的注释、`src/composables/useViewport.js`。

**宽窄**（决定列数，纯样式用 `@media`，需改结构时用 JS）：

| 档 | 条件 | 典型设备 |
|---|---|---|
| narrow | `width < 600px` | 手机 |
| wide | `width >= 600px` | 平板 / 横屏手机 |

**高矮**（对"一屏装下"的形态更关键，决定行数与砍多少装饰）：

| 档 | 条件 | 典型设备 | 处理 |
|---|---|---|---|
| tiny | `height < 480px` | 手机横屏 | 压缩顶栏、隐藏副文案、改横排布局 |
| compact | `height < 640px` | 手机竖屏 | 收敛间距 |
| regular | `height < 900px` | 平板横屏 | 标准布局 |
| roomy | `height >= 900px` | 平板竖屏 | 标准布局 |

组件内的媒体查询示例（隐藏次要信息、切换行列方向）见各玩法页的
`@media (max-height: 480px)` 块。

### 4.4 布局算法（`src/utils/layout.js`，纯函数）

**`fitGrid(...)`** —— 反推"一页能放几个格子"。
给可用区域和每格最小可读尺寸，算出 `cols × rows`。
用于**点读页**（LearnView）：每页卡片数随屏幕变化，词多的课自动多翻几页。

**`pickColumns(...)`** —— 为 n 张卡片挑一个**均衡**的列数。
逐个候选列数算出卡片实际宽高，选**长宽比最接近目标**的那个。
用于**首页**和**课时菜单**。
⚠️ 这里不能用"最少列数"或"最多列数"的朴素贪心：
屏幕高时会算出 1 列（5 张卡被拉成 5 条超宽横幅），
屏幕矮时会算出一行摊 5 个（又窄又扁）。必须按长宽比找平衡点。

**`splitBalanced(list, min, max)`** —— 把列表尽量均分成若干组。
用于**连线页**（MatchView）按屏幕大小决定每组几对：
小屏 2~4 对、大屏 3~6 对，保证中间单词列始终可读。

### 4.5 分页机制

- **逻辑**：`usePager(source, perPageRef)` —— 返回 `items/page/total/isLast/...`。
  内部做了两个防御：每页容量变化（旋转屏幕）时把页码夹回合法范围；
  数据源变化（换课）时回到第一页。这两个坑不处理会出现"空白页"。
- **视图**：`Pager.vue` —— 大箭头 + 圆点 + 计数。
  面向 5 岁孩子刻意**不用滑动手势**：按钮有明确可见边界，比手势更容易被发现；
  也避免了与连线页的拖拽、跟读页的长按产生手势冲突。
- **接入方**：HomePage（课时卡）、LearnView（点读页）。
  QuizView 天然单题推进、MatchView 已有分组，无需再分页。

### 4.6 测量与再布局

需要"按可用空间算布局"的组件（HomePage / LessonView / LearnView）统一用这个模式：

```js
const stageEl = ref(null);            // 挂在一个 flex:1 的稳定容器上
let ro = new ResizeObserver(scheduleMeasure);
function scheduleMeasure() {          // rAF 合并，避免 ResizeObserver 循环告警
  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(measure);
}
```

两个注意点：

1. **ref 要挂在外层稳定容器上**，不要挂在内容随分页变化的网格上，否则测量值会随内容抖动。
2. **测量结果会反过来改变布局**，必须用 `requestAnimationFrame` 推到下一帧，
   否则 Chrome 会报 "ResizeObserver loop completed with undelivered notifications"。

---

## 5. 课时数据与资源

见 [README.md](./README.md) 的「新增/修改课时」。补充两条开发侧须知：

- `lessons.js` 里路径**一律写站点根路径形式**（`/lessons/l4/song.mp3`），
  导出时会统一补上 `import.meta.env.BASE_URL` 前缀。外链（`https://...`）会原样跳过。
- `progress.js` 的存储键是 `kids-english-progress-v1`，**不要**跟着应用改名一起改，
  否则孩子攒的星星会全部丢失。

### 5.1 单词发音的两级机制

`speech.js` 维护两级注册表（lessons.js 导出时自动构建）：

```
speak(text, { lessonId, wordId })
  ├─ 精确键 "lessonId:wordId" 命中 → Audio 播放 /lessons/<课>/audio/<单词id>.mp3（神经网络童声）
  │     └─ 播放失败（文件缺失/解码错误）──┐
  ├─ 兜底键 en 命中（兼容未带上下文的调用）─┴→ 浏览器 TTS 回退（Web Speech API）
  └─ 都未命中 ──────────────────────────→ 浏览器 TTS 回退
```

- 为什么按 `(lessonId, wordId)` 精确键：同一个词可能出现在多课（如 l4 与 l6 都有 blue），
  "先到先得"的 en 注册表会让后来者覆盖先者，若某课单独换过发音文件会全局串音。
  组件调用发音时带上 `{ lessonId: word.lessonId, wordId: word.id }`（word 对象由 lessons.js 注入）。
- 为什么预生成：浏览器 TTS 音色机械且**各端不一致**（桌面 Chrome 音色最少）；
  神经网络音色一次生成、永久使用、各端一致，30 个词共约 360KB，无运行时成本。
- 中文提示语（`speakZh`）不走注册表，始终用浏览器 TTS。
- **新增/换音色**：`pip install edge-tts` 后跑
  `python3 scripts/gen-word-audio.py`（增量）或 `--force --voice en-US-AriaNeural`（全量）。
  放对了文件名无需改任何代码。

### 5.2 自研课时资源流水线（l6 颜色 / l7 数字 / l8 字母）

后三课（l6 颜色、l7 数字 0-10、l8 字母）的音频和图片**全部是自己合成的**，
不引用任何第三方素材，避免版权问题、也保证整套风格统一：

| 资源 | 生成方式 | 脚本 |
|---|---|---|
| 童谣 mp3 + 逐行时间轴 | 自研合成器（numpy 生成玩具乐器音色 + lameenc 编码），旋律按歌词音节自动落点 | `scripts/gen-songs.py` |
| 单词贴纸图（SVG，共 29 张） | 手写 SVG：圆角贴纸底 + 粗白描边 + 会笑的眼睛；颜色/数字/字母三种画法 | `scripts/gen-word-art.py` |
| 单词与口语句发音 | edge-tts 神经网络童声（同 §5.1） | `scripts/gen-word-audio.py` |

```bash
# 改完 lessons.js 里的歌词/单词后，按这个顺序重跑
python3 scripts/gen-songs.py        # 覆盖 song.mp3 + 写回 song-timings.json
python3 scripts/gen-word-art.py     # 覆盖 public/lessons/{l6,l7,l8}/words/*.svg
python3 scripts/gen-word-audio.py   # 增量补发音（已存在会跳过）
```

- **为什么音频要自己合成**：`song-timings.json` 里的 `bpm` 与逐行 `timeline`
  是驱动「动画舞台对拍 + 卡拉 OK 字幕」的数据；只有自己生成，才能拿到
  精确到行的起唱时间（见 §3 的 `SongStage.vue`）。换第三方 mp3 时时间轴会失效，
  此时 `SongView` 自动回退成「按播放比例估算」。
- **歌词与旋律的对齐是硬校验**：`gen-songs.py` 会逐句断言
  `旋律音符数 == 音节数`，对不上直接报错，避免生成「跑调的伴奏」。
  音节数是脚本按元音规则估算的（如 `seven`/`zero` 算 2 个音节），
  改歌词后若报错，按提示调整该句的旋律轮廓即可。
- **图片与课的引用是硬校验**：`gen-word-art.py` 最后会读 `lessons.js`，
  核对「生成的文件」与「课里引用的路径」完全一致，多一个少一个都报错，
  防止改名字后留下 404。
- 生成物已提交进仓库（三课合计约 3.3MB），**运行时不依赖这些脚本**，
  只在需要改内容时重跑。

### 5.3 儿童字体（5 岁孩子友好）

| 用途 | 字体 | 说明 |
|---|---|---|
| 英文/数字 | **Baloo 2** | Google Fonts 开源圆体（OFL），latin 子集 32KB 离线打包 |
| 中文 | **ZCOOL KuaiLe 站酷快乐体** | 免费商用儿童圆体；全量 ~700KB，子集化后 116KB |

- 字体栈在 `src/styles/tokens.css`：`"Baloo 2", "ZCOOL KuaiLe", ...`——
  英文落到 Baloo 2（只含 latin），中文落到快乐体，互不干扰。
- **中文子集化**：`python3 scripts/subset-font.py` 扫描 `src/` 下所有
  `.vue/.ts/.js/.css` 里的汉字与全角标点，用 fonttools 子集化生成
  `src/assets/fonts/zcool-kuaile-subset.woff2`。
- ⚠️ **新增页面/文案后必须重跑子集脚本**，否则新字回退系统字体
  （子集只含项目当前出现过的字符；`pnpm build` 前的 guard 可加检查提示）。

---

## 6. 发音评分的双模式降级链路

`SpeakView` + `speechScore.js`：

```
启动 → asrSupported() ?
  ├─ 是 → ASR 模式（浏览器 SpeechRecognition 听写 + 编辑距离打分）
  │        ├─ 权限被拒 / 识别服务连不上 ──┐
  │        └─ 正常出分：🌟 perfect / 😊 good / 🔁 retry
  └─ 否 ────────────────────────────────┴─→ 录音模式（MediaRecorder 回放 + 家长判定）
```

- Chrome/Edge 的识别请求发往 Google 服务，**国内网络大概率失败**，
  所以降级路径不是异常处理，而是必须保证可用的主路径之一。
- 想接更专业的评分（讯飞少儿语音评测 / Azure Pronunciation Assessment），
  替换 `speechScore.js` 里的打分实现即可，`SpeakView` 不用动。

---

## 7. 调试技巧

### 7.1 调试深链

不用一路点进来，直接在真机上打开指定页面验收布局：

```
#/lesson/l4                    → 直接进第 4 课的菜单
#/lesson/l4?stage=learn        → 直达"看图学词"
#/lesson/l4?stage=quiz         → 直达"听音选图"
#/lesson/l4?stage=match        → 直达"图词连线"
#/lesson/l4?stage=speak        → 直达"跟我读"
#/lesson/l4?stage=song         → 直达"唱童谣"
#/lesson/l4?mode=quest         → 闯关模式（游戏地图进入）
#/me                           → 我的（个人中心）
#/review                       → 错词复习页
#/report                       → 家长学情页
#/treasure                     → 宝藏罐（图鉴 + 贴纸商店）
```

`stage` 取值：`learn | quiz | match | speak | song | talk`。仅在开发/验收时用，不影响正常流程。

### 7.2 多视口布局走查

```bash
# 1. 构建并起一个模拟 GitHub Pages 子路径的本地服务
GH_REPO=kids-english pnpm build
rsync -a --exclude='*.mp4' --exclude='*.mp3' dist/ /tmp/preview/kids-english/
cd /tmp/preview && python3 -m http.server 8801

# 2. 跑走查（需要本机装有 Chrome）
node scripts/layout-audit.mjs
```

脚本会用 CDP 驱动无头 Chrome，对 **6 种视口 × 7 个页面** 逐一切换、截图到 `/tmp/shots/`，
并**程序化检测**：

- 文档是否出现滚动（永远不该发生）
- `#app` 内部内容是否溢出
- 具体哪些元素越界（便于定位）

退出码非 0 即有页面不通过。**改完布局必须跑一遍**，肉眼只看截图很容易漏。

> ⚠️ 不要用 `chrome --screenshot --virtual-time-budget` 的方式截图：
> 页面里有无限循环的 CSS 动画（`anim-float`/`anim-wiggle`），
> 虚拟时间永远推进不到 idle，Chrome 会一直挂着不退出。

### 7.3 PWA / 离线验证

```bash
node scripts/verify-pwa.mjs
```

脚本自己负责构建（带 `GH_REPO`）→ 起 `vite preview`（4173 端口，模拟子路径）→ CDP 验证 → 杀进程。
覆盖：manifest 合法、SW 接管、壳缓存就位、媒体进缓存、**真·断网**（直接杀 preview 服务）后
首页可渲染 / 音频可读 / Range 请求返回 206、改 `dist/index.html` 立即生效（network-first）、
改 `dist/sw.js` 构建号后 SW 自动升级、玩法中不被强制刷新且回首页静默刷新。

---

## 8. PWA 架构（离线 + 及时更新）

文件：`src/sw.js`（SW 源码）→ 构建时由 `vite.config.js` 的 `kids-pwa` 插件原样输出为 `dist/sw.js`，
并把其中的构建占位符替换为当次构建 id（`BUILD_ID`）。

**为什么 SW 字节必须每次构建都变**：浏览器靠字节对比检测 SW 更新。构建 id 变了 →
下次打开浏览器就会装新 SW → SW 在 install 里 `skipWaiting`、activate 里 `clients.claim` 立即接管。
这是"部署后用户能及时拿到新版"的前提，别改成内容固定的静态文件。

缓存策略（详见 `src/sw.js` 顶部注释）：

| 请求 | 策略 | 原因 |
|---|---|---|
| 页面导航 | network-first（4s 超时回退缓存，后台继续拉新写缓存） | 新部署立刻生效；弱网秒开 |
| `/assets/*`（带哈希） | cache-first | 哈希即版本，永不取错 |
| `/lessons/*` 媒体 | 先缓存 + etag 条件校验（304 零下载）；支持 Range 切片 | 换同名素材不会被永久黏住；离线可拖进度条 |
| manifest / 图标 | SWR | 小文件，保新鲜 |

页面侧（`src/utils/pwa.js`）：注册 SW、切回标签页时 `reg.update()` 主动查新；
新版本接管后（`controllerchange`）**不打断玩法**——孩子在首页 → 立即静默 `location.reload()`；
在课时里 → 挂起，`back()` 回首页时再刷（`applyUpdateIfIdle`）。

**媒体缓存名固定为 `kids-media-v1`，不随构建变化**：否则每次更新都要重下几十 MB 音视频。
壳缓存 `kids-app-<buildId>` 每次 build 新建，activate 时保留最近 2 份、删更老的
（留 1 份旧的，避免更新瞬间旧页面拿不到自己的资源）。

**媒体缓存有容量上限**：activate 时会扫描 `kids-media-v1` 总大小，超过 100MB
按条目顺序删除最旧文件，直到降到 80MB 以下（`trimMediaCache`）——课程只增不减，
不加裁剪本地会无限膨胀。

**dev 模式默认不注册 SW**（避免干扰 HMR），要手动测时加 `?sw=1`；
dev 的 `/sw.js` 由插件中间件提供，不缓存任何 dev 模块。

注册图标：`public/manifest.webmanifest`（相对路径，天然适配子路径）+
`scripts/gen-icons.py`（从 192 原图提取闪电形状重绘 512 / maskable-512）。

---

## 9. 构建与部署

推送到 `main` 会自动触发 `.github/workflows/deploy.yml`：
安装依赖 → `GH_REPO=<仓库名> pnpm build:ci` → 上传 `dist/` → 部署到 GitHub Pages。

`GH_REPO` 环境变量决定 `vite.config.js` 里的 `base`，即部署子路径。
**本地构建如果不带这个变量，产物资源路径会指向根目录**，部署后必挂 —— 本地想复现线上就带上它。

三道防护：

1. `pnpm build`（本地预览）：不带 GH_REPO 只打**警告**，不拦截（本地静态预览 base 用 `/` 没问题）。
2. `pnpm build:ci`（部署构建）：`scripts/guard-build.mjs` 强制要求 GH_REPO，缺失直接报错退出。
3. CI（deploy.yml）总是传 `GH_REPO=<仓库名>`，并走 `build:ci`。

### 9.1 本地推送工作流（git）

**常规流程**（开发机在本机直跑，仓库 `origin = github.com/songpengyuan/kids-english`）：

```bash
git add <具体文件>        # 按文件加，不用 git add -A 一把梭
git commit -m "feat: 一句话说明改了什么/为什么"   # 前缀：feat / fix / refactor / docs
git push origin main      # 触发 GitHub Actions deploy.yml → Pages 自动发布（约 1~2 分钟生效）
```

**提交信息规范**：`feat:`（新功能）/ `fix:`（修 bug）/ `refactor:`（重构）/ `docs:`（文档）；
正文用中文写"做了什么 + 为什么"，复杂改动带关键细节（如存储键、兼容点）。

**验收节奏（本项目约定）**：功能在本机浏览器实测通过后，**由用户发话**才提交并推送；
没验证完或用户没开口，代码可以留在工作区/本地 commit，不要擅自上远程。

**网络问题处理（github.com 直连不稳定，最高频的坑）**：

- 症状：`Failed to connect to github.com port 443 after …` / `Recv failure: Operation timed out`。
- 处理：
  1. 先确认 commit 已落盘（`git log --oneline -3`）——push 失败**代码不丢**，只是没上远程。
  2. 稍等后重试：`sleep 5~30 && git push origin main`，最多 2~3 次，不无限重试。
  3. **报 fatal 不一定真的失败**：本项目出现过 push 报连接错误、实际已推送成功的情况。
     判断真实状态用对比，不要盲猜：
     ```bash
     git fetch origin
     git rev-parse --short origin/main   # 远程 HEAD
     git rev-parse --short HEAD          # 本地 HEAD
     git log origin/main..HEAD --oneline # 待推送清单（空 = 已同步）
     ```
- 推送前查看待推送内容：`git log origin/main..HEAD --oneline`；工作区干净度：`git status --short`。
- 推送成功后 Pages 自动构建发布，无需任何手动部署操作。

## 10. 单元测试

```bash
pnpm test   # vitest run，覆盖：
```

| 文件 | 覆盖 |
|---|---|
| `src/utils/__tests__/layout.test.js` | fitGrid / pickColumns / splitBalanced（一屏装下的核心承诺） |
| `src/utils/__tests__/speechScore.test.js` | 打分归一化 / 编辑距离 / 档位边界（0.85 / 0.55） |
| `src/stores/__tests__/streak.test.ts` | 连击：幂等 / 跨天 / 断档 / 持久化读回 / 损坏数据 |
| `src/composables/__tests__/usePager.test.js` | 分页切片 / 容量变化夹页码 / 数据源变化回第一页 |
| `src/utils/__tests__/pathGeometry.test.ts` | 游戏地图布局（buildPathGeometry）与命中判定（hitTestPath）+ S 形振幅上限 |
| `src/utils/__tests__/reviewSchedule.test.ts` | 间隔重复：1/3/7/14 天间隔、答对升级/答错打回、到期判定、老数据折算 |
| `src/utils/__tests__/quizSession.test.ts` | 听音选图：洗牌/出题（跨课干扰、复合键）、首次答对率→星级 |
| `src/utils/__tests__/learnSession.test.ts` | 看图学词：点读覆盖率→星级 |
| `src/utils/__tests__/speakSession.test.ts` | 跟我读：首次通过率→星级 |
| `src/utils/__tests__/matchBoard.test.ts` | 连一连：分组口径（随屏幕）+ 按连错次数→星级 |
| `src/stores/__tests__/progress.test.ts` | 单词 SRS 升/降级、老数据迁移、掌握度概览、每日快照（30 天上限） |
| `src/stores/__tests__/rewards.test.ts` | 贝壳 → 英雄形态：兑换/升级/满级、开箱掉落、全收集后行为、老贴纸折算、持久化 |
| `src/data/__tests__/heroes.test.ts` | 图鉴数据自检：角色→形态结构、id 唯一、价格与稀有度一致、图片路径、发音介绍文案 |
| `src/views/__tests__/pages.smoke.test.ts` | **页面冒烟**：7 个页面各挂载一次，断言关键内容渲染且无 Vue 报错（堵"改 store 字段后某页白屏"这类事故） |
| `src/composables/__tests__/useQuizSession.test.ts` | 会话状态机：答错不推进/标红自动消失、答对锁定、星级、重置、进度上报 |
| `src/components/**/__tests__/*.test.ts` | 组件：AppDialog 退场流程、Pager 受控翻页、WordCard 点读、MasteryTrend 趋势图、**LearnView 点读覆盖率整关行为** |

改动布局算法、评分阈值、连击逻辑、分页逻辑、**地图布局常量/命中规则**、
**间隔重复间隔/星级口径/每日目标**时必须补/跑对应测试。
组件测试用 `@vue/test-utils` + jsdom（文件头 `// @vitest-environment jsdom`），
jsdom 没有 ResizeObserver/布局尺寸时在测试里桩掉，组件会走保守兜底（每页 4 张）。

### 10.1 TDD 工作流（游戏闯关地图）

自 2026-09 起，地图相关的几何/命中逻辑以 **TDD** 方式开发，测试与文档实时同步：

1. **先写测试（红）**：在 `src/utils/__tests__/pathGeometry.test.ts` 用断言描述期望行为
   （布局坐标、命中边界），跑 `pnpm test` 确认失败。
2. **写最小实现（绿）**：改 `src/utils/pathGeometry.ts` 纯函数，直到测试全绿。
3. **组件接入**：`GamePath.vue` 只保留展示与交互，几何/命中一律调用纯函数，
   **不在组件里重复实现**（避免两处口径漂移）。
4. **浏览器实测**：按 §7 实测真实点击/滚动，与测试断言互相印证。
5. **文档同步**：布局常量、命中规则若有变化，本表与下文「口径」同步更新；
   测试用例新增/改名时同步改本文档对应描述。

> 基线案例（2026-09-26）：l5 课程横幅点击不跳转 —— 根因是 `geo` 内联循环
> 对最后一关也累加了 `ROW_H`（+84），导致 l4 之后的横幅/节点整体下移 84px、
> 只有 l4 因位于循环首项而碰巧正确。先写测试断言「l5 横幅 = 490+46 = 536」，
> 红 → 修复循环（末关不再累加）→ 绿 → 实测 l5 横幅/节点点击均跳转。

### 10.2 地图几何口径（与 pathGeometry.ts / 测试一一对应）

| 常量 | 值 | 含义 |
|---|---|---|
| `TOP` | 16 | 首课横幅中心到画布顶 |
| `BAR_H` | 56 | 课程横幅高度（居中整宽带） |
| `BAR_GAP` | 66 | 横幅底 → 首节点圆心（2026-09-26 由 26 逐次加大，避开节点光圈/解锁闪光遮挡横幅；首节点=横幅中心+94） |
| `ROW_H` | 84 | 关卡节点纵向步进 |
| `UNIT_BREAK` | 46 | 课末节点 → 下节横幅中心 |
| `R` | 28 | 节点圆半径（命中半径 R+10） |
| `BOTTOM` | 36 | 末节点到画布底 |

布局：`首节点 = 横幅中心 + BAR_H/2 + BAR_GAP(=94)`，之后每关 `+ROW_H`；
`下节横幅 = 本课末节点 + UNIT_BREAK`。命中：**关卡节点（圆心距离 ≤ R+10）优先于
课程横幅**（`px∈[0,w]` 且 `py∈[中心-34, 中心+34]`）。节点列：**等弧长 S 形**（多邻国式，2026-09-26 起），纯函数 `snakeNodes(width, n, startY, endY)`：
曲线 `x(t)=w/2+0.12w·sin(2πt)`、`y(t)=startY+(endY-startY)·t`，**沿曲线弧长等距取 n 个点** →
**每课首末关都在水平中线**、相邻节点间距视觉均匀（小振幅下弦长差异 < 20px 约 14%）；单关/零宽兜底居中。
每课节点组从该课首节点 buildPathGeometry y 起、跨 `(n-1)·ROW_H`。

> 2026-09-26 起地图**不再绘制节点间连线**（删除解锁金实线/锁定灰虚线），
> 只保留蜿蜒交替的圆节点与课程横幅（用户确认，参考多邻国式无连线排布）。

## 10.3 通关开宝箱交互（2026-09-26）

- **三连击开箱**：点宝箱区域 = 敲一下（宝箱晃动 + 音效 + 下方三个图标逐个高亮），
  第 3 下开箱（开盖 + 金光 + 撒花 + 奖励入账）→ 展示奖励与「收取」按钮。
- **抛物线收取**：点「收取」后宝石/贝壳从宝箱位置沿抛物线逐个飞向顶部贝壳徽标
  （右上角 fixed，72px 避开 topbar 主题切换按钮）；轨迹为二次贝塞尔纯函数
  `parabola()`（`src/utils/flyCurve.ts`，TDD 4 用例）。
- **徽标接收动画**：每个贝壳落地时徽标脉冲（scale 1→1.35）+ 数字按步长递增
  （`step=ceil(shells/n)`，最后一次对齐余额）；全部收完动画停止 → `done`。
- **跳过**：保留「跳过」按钮（奖励照常入账，直接进 reward 展示）。
- 测试基线：`flyCurve.test.ts` 4 用例；全量 `npx vitest run` 51 passed。


---

## 11. 排错清单

| 症状 | 原因 | 处理 |
|---|---|---|
| 线上音频/视频/图片 404，但 `dist/` 里文件都在 | `public/` 目录的文件**不经过** Vite 路径重写，代码里写死的 `/lessons/...` 在子路径部署下被解析到站点根目录 | 路径必须经 `lessons.js` 的 `asset()` 补前缀，不要在新代码里裸写根路径 |
| 本地构建的产物部署后白屏 | 构建时没带 `GH_REPO`，`base` 是 `/` 而非 `/<repo>/` | 部署用 `GH_REPO=<仓库名> pnpm build:ci`（CI 已强制） |
| 某页面在某个设备上内容被截断 | 违反 §4：列表没分页、或尺寸只用了一个维度 | 跑 §7.2 的走查脚本定位溢出元素 |
| 改完样式个别元素尺寸没变 | 写死了 `px`，没走 token | 换成 `clamp(..., min(Xvh, Yvw), ...)` 或 tokens 里的变量 |
| 发音识别总是失败并提示切换录音模式 | 国内网络连不上 Google 识别服务 | 预期行为，录音回放模式是可用的主路径 |
| 某个单词发音机械（走了 TTS） | 对应 mp3 没生成（`public/lessons/<课>/audio/<单词id>.mp3` 缺失） | 跑 `python3 scripts/gen-word-audio.py` 补齐 |
| iOS 上点第一次没声音 | iOS Safari 要求用户手势后才能播放音频 | 已用点击触发规避，勿改成自动播放 |
| 孩子的星星丢了 | localStorage 被清（换设备/清缓存）或存储键被改动 | 不要改 `stores/progress.ts` 里的 KEY；老数据会在 load() 增量迁移 |

| 孩子的星星丢了 | localStorage 被清（换设备/清缓存）或存储键被改动 | 不要改 `stores/progress.ts` 里的 KEY；老数据会在 load() 增量迁移 |
| 手机上一直看到旧版本 | SW 被浏览器停用或更新被挂起（正在玩法里） | 回到首页即刷新；或在浏览器设置里清除该站点数据 |
| 换了同名媒体文件但客户端还是旧的 | 媒体是 SWR，最多旧一次 | 刷新一次页面即可；要彻底立即可见可改文件名 |

---

## 12. 可选的后续方向

- **滑动手势翻页**：点读页可加左右滑动（注意与连线页拖拽的手势边界）。
- **发音评分升级**：接入讯飞少儿语音评测或 Azure Pronunciation Assessment，逐音素打分。
- **跨设备同步进度**：需要一个后端（当前纯前端，进度只在本机）；届时 `errors.js` 的上报通道
  也只需把 localStorage 落盘换成 POST 即可。
- **素材管理**：补素材放进对应课时目录，无需改代码即可生效。
- **弱词算法调优**：`getWeakWords` 目前是"答错且正确 ≤ 错误"，可升级为间隔重复
  （按 lastAt 与错误率排复习顺序）。

## 13. 三阶段全面优化（2026-09-26）

面向"架构合理、交互直觉、细节打磨、向业界优秀案例看齐"的三阶段改造。全部 TDD + 本机浏览器实测通过。

### 13.1 阶段 1：体验快赢

| 项 | 内容 |
| --- | --- |
| 1-1 emoji 清理 | 新增 `flame` 矢量图标（lucide Flame path）到 pathIcons；HomePage/LessonView/ChestReward/TreasureView/ReviewView/ReportView/SpeakView/MatchView/QuizView 全部改为 PathIcon 矢量图标。**铁律：界面一律不用 emoji/符号表情，用统一图标库**（底部 tab、我的、各玩法、宝藏罐、报告全部矢量）。教学内容 emoji（课程封面 emoji）与童谣漂浮装饰保留为氛围元素。 |
| 1-2 HeaderBar 统一 | 新建 `components/layout/HeaderBar.vue`（showBack/backLabel props + #title/#right 插槽，44px 圆钮、min-height 56px），替换 LessonView/TreasureView/ReportView/ReviewView/MyView 五页手写 topbar。 |
| 1-3 LessonResult 统一 | 抽 `components/LessonResult.vue`：闯关（关卡完成大画面：第 N 关/星星/连击横幅/ChestReward/返回地图&下一关）与自由（星星/连击横幅/ChestReward/再选玩法&下一课）两套结算合一。 |
| 1-4 空状态 | ReviewView 空态、ReportView"今天还没有学习记录"、玩法首屏 tip、HomePage"建议家长陪同"逐一核对补齐。 |
| ReviewView bug 修复 | /review 直接进入时弱词响应式晚到 → 模板 target null 白屏。修复：`watch(words)` 晚到时自动 start + `(target?.en ?? '')` 兜底。 |

### 13.2 阶段 2：架构重组

| 项 | 内容 |
| --- | --- |
| 2-1 目录分层 | `src/views/`（页面级）+ `src/components/activities/`（玩法）+ `src/components/layout/`（HeaderBar/ThemeToggle/BottomNav）+ `src/composables/`（逻辑）。20+ 组件搬移 + import 全量重写。 |
| 2-2 HomePage 拆分 | 壳 + PracticeView（自由练习：课程卡/继续学习/quick 入口）+ GameView（游戏闯关地图，canvas 蜿蜒路径 + 关卡 + 星星/连击顶栏）。URL 兼容 `#/` 与 `#/?mode=game`，BottomNav 语义不变。 |
| 2-3 composables | `useLessonFlow.ts`（stage 机：菜单→玩法→结算 + 结算/测量/引导，从 LessonView 711 行抽离）+ `useQuest.ts`（闯关身份：模式/关卡序列/当前关/下一关）。LessonView 瘦身为流程编排层（~150 行）。 |
| 2-4 JS→TS | 数据/工具全量 TS 化：`lessons.ts`（Lesson 类型 + words 生成）、`layout.ts`、`usePager.ts`、`speech.ts`（SpeakOptions/类型化 Audio）、`speechScore.ts`（SRImpl/RecorderLike 接口）。核心组件 script 转 `lang="ts"`（LessonView 等）。**迁移规则：Vite 不认显式 `.js` 后缀 import，迁移后重启 dev server 清旧依赖图。** |

### 13.3 阶段 3：体验精修

| 项 | 内容 |
| --- | --- |
| 3-1 动效 tokens | `tokens.css` 新增 `--dur-fast/--dur-base/--dur-slow/--dur-fly` + `--ease-pop/--ease-out/--ease-in-out/--ease-bounce`。新增动效先查 tokens 再写值，禁止散用魔法时长。base.css 高频过渡已改 tokens。 |
| 3-2 点击区/触感/音效 | `--tap-min: 52px` 全局；haptic 32 处覆盖（tap/成功/错误/连击/宝箱）；WebAudio 音效体系（sfxCorrect/sfxWrong/sfxTap/sfxMatch/sfxChestOpen/sfxCoin/sfxSticker）已接到全部玩法（Quiz 对错/Match 连线/Speak 判定/Learn 完成/宝箱三连击/收取入袋）。 |
| 3-3 可达性 + PWA | BottomNav tab aria-label + role=tablist/aria-selected；HeaderBar back aria-label；ThemeToggle 双语 aria；star-badge role=img。PWA：manifest（name/icons/maskable/theme_color）+ SW 注册已有并保持。 |

### 13.4 铁律沉淀（每次改动对照）

1. **TDD**：先写失败测试 → 实现 → 绿 → 同步 DEVELOPMENT.md；无测试保护的组件重构用"浏览器实测 + type-check"双门。
2. **实测通过 → 用户发话才 commit/push**。
3. **图标统一**：界面禁止 emoji/符号表情 → PathIcon 矢量库；新增图标先查 pathIcons.ts 是否有，没有再加（lucide path）。
4. **高内聚低耦合**：逻辑进 composables（useQuest/useLessonFlow），页面瘦身；数据进 data/，几何进 utils/，样式进 tokens/。
5. **TS 渐进**：新代码必须 TS；核心数据/工具逐步迁移，测试保护下进行。
6. **儿童向**：字体（站酷快乐体 + Baloo 2）、点击区 ≥ 52px、音效温柔（正弦波、不刺耳）、错误不打击（只标红不揭示答案）。
### 13.5 交互问题修复（2026-09-26 部署后反馈）

| 问题 | 根因 | 修复 |
| --- | --- | --- |
| 底部切换反应慢/失败 | HomePage v-if 切换时 GameView 每次全量重建 canvas（1862×5668 重绘 ~500ms）；重复导航 NavigationDuplicated 未捕获 | HomePage 双视图包 `<KeepAlive>`（切回秒开 ~80ms，保留 canvas 状态与滚动位置）；BottomNav 全部 `router.push().catch(()=>{})` 静默容错 |
| 游戏关卡点不进去 | 可玩关卡滚动后点击实测正常；真正原因是 **locked 关卡点击只有震动（桌面/无震动设备无反馈）**，误以为失效 | GamePath 加锁关可见提示条「先完成前面的关卡就能解锁啦」（1.6s 自动消失，role=status） |
### 13.6 关卡地图 Canvas → DOM 改造（2026-09-26 用户反馈）

**背景**：用户反馈游戏关卡滚动不顺、点击偶发失效——根因是整幅 1862×5668 大 canvas 作为滚动内容（超大图层 + hitTest 模拟交互）。

**改造**（GamePath.vue 515 行 → 501 行 DOM 版）：
- 移除 canvas 整绘与 rAF 逐帧循环；每个关卡 = 原生 `<button>`（绝对定位，坐标来自 snakeNodes），课程 = 全宽渐变横幅 div。
- **滚动**：普通 DOM 滚动（惯性/贴边浏览器原生处理），滚动条贴最右缘；滚动位置记忆保留（模块级 savedGameTop）。
- **交互**：点击/聚焦/键盘/aria 全部原生（button + aria-label「第 N 关…（可玩/未解锁/已通关）」+ 显式 @keydown.enter/space）。
- **动画 CSS 化**：active 金色光圈脉动（lv-pulse keyframes）、解锁金色闪光（lv-flash forwards）、锁定 grayscale。
- 几何与状态逻辑零改动：buildPathGeometry/snakeNodes/ROW_H/BAR_GAP（TDD 测试继续保护）；hitTestPath 保留（测试用）。
- 新增 lock/play 矢量图标（lucide path）到 pathIcons。
- 布局只随容器宽度重算（ResizeObserver + w ref），不再每帧重绘。
### 13.7 App 化布局（2026-09-26 用户反馈手机端底部切换切不动）

**背景**：用户手机端实测底部 tab 切换依旧无响应。排查：flex 流内 BottomNav 在特定布局（内容超高/窄视口）下会被挤出视口或被内容遮挡；桌面 bu 用 ref 点击绕过遮挡，掩盖了问题。

**重构（App 三明治布局）**：
- **BottomNav → position: fixed 底栏**：脱离文档流钉在视口底部（z-index 40、max-width 1180 居中、safe-area、背景 var(--bg) + 顶部细阴影）。**任何内容高度下 nav 永远可见可点**。
- **内容区让位**：tokens 新增 `--nav-h: 76px`；#app padding-bottom 改为 `calc(var(--nav-h) + env(safe-area-inset-bottom))`——各页滚动容器自动让位（容器底 = nav 顶）。
- **HeaderBar → position: sticky 顶栏**：课程页/带顶栏页面滚动时 header 固定（z-index 30、背景 var(--bg)）。
- HomePage hero 原本已是 sticky，保持不变。
### 13.8 关卡 UI 优化（2026-09-26 用户需求）

**需求**：①未学习关卡只显示锁；②开宝箱成为地图独立关卡；③关卡外增加分段进度圆环（学一部分亮一部分）。

**实现**（TDD：新增 pathLevels.test.ts 13 用例 + pathGeometry 7 关几何）：
- **数据层（pathLevels.ts）**：每课追加 1 个宝箱关（id `${lessonId}-chest`，actKey `chest`，名称「开宝箱」）→ 全图 30→35 关；chest 状态：该课 6 玩法全 done → active（可开箱）、completed 含 chest → done（已领取）、否则 locked；**nextLevelAfter 跳过 chest**（玩法→玩法推进不受影响）；lessonDoneCount/单元进度只数玩法（chest 不计入 x/y）。
- **进度圆环**：每关按钮外包 SVG 3 段弧（circle + pathLength=100 + rotate 分段）；点亮段数 = done→星级数（1-3 段金）/ active→1 段蓝 / locked→0；宝箱关：已领取 3 段、可开 1 段、锁定 0。
- **锁样式**：locked 关卡主体只显示大锁（lv-ico-lock），玩法图标不展示，玩法名保留小字。
- **宝箱关卡**：金色礼物节点（PathIcon chest，lucide Gift path）；点击直接在地图弹 ChestReward overlay；收取完成 markChest（progress store 新增）→ 宝箱关变 done（一次性奖励）。
- **LessonResult quest 分支移除自动宝箱**：宝箱只在地图宝箱关卡触发（每关完成不再弹）。
- 几何自动适应 7 关/课（snakeNodes 等弧长，首末居中），pathGeometry 测试更新为 7 关口径。
### 13.9 关卡地图改文档流布局（2026-09-26）

**需求**：关卡地图应使用文档流、居中对齐，再通过左右相对位移形成 S 形；非必要避免脱离文档流。

**实现**：
- **布局方式**：`.gp-unit`（课横幅）与 `.lv-wrap`（关卡）全部改为文档流块（不再 absolute left/top 定位）。
  - 课横幅：全宽块（margin 20px 0 38px），按 buildPathGeometry 顺序与关卡**交替渲染**（单一 v-for over layout，保证 unit → levels → unit → levels 真实阅读顺序）。
  - 关卡：`.lv-wrap` 默认 `margin: 0 auto` 水平居中，`transform: translateX(var(--dx))` 左右摆动成 S 形；`--dx = x - width/2`（snakeNodes 等弧长 x 相对容器中心）。
  - 垂直间距：`.lv-wrap + .lv-wrap { margin-top: 28px }`（圆心距 = 28+56 = ROW_H=84，节点间等距）；首关距横幅底 38px（= BAR_GAP-28）。
- **状态类迁移**：done/active/locked/chest/flash 等类从 `.gp-level` 移到 `.lv-wrap`（CSS 选择器同步更新）。
- **滚动**：容器高度由文档流自然撑开（35 关 + 5 横幅 scrollHeight≈3390），不再手动 pathH 撑高；滚动记忆/ResizeObserver 逻辑不变。
- 实测：交替顺序 U→7L、无 absolute 节点（absCount=0）、S 形位移 [0,+91,+91,0,-91,-91,0]、垂直等距、滚动与点击（进关/锁关提示）均正常。
### 13.10 多端适配 + 关卡按钮放大/圆环对齐（2026-09-27）

**需求**：iPhone/iPad/Mac 三端都良好展示；手机/iPad 按儿童使用尺寸设计；关卡按钮放大；进度圆环与按钮对齐（active 关圆环偏移）。

**多端适配**：
- **tokens.css 新增宽屏档** `@media (min-width: 768px)`（iPad 竖屏起 / Mac 桌面）：字号（body 14-19→16-26、title/hero/btn/emoji 同步）、间距 gap、圆角、press、`--tap-min 52→64`、`--nav-h 76→92` 整体放大一档，儿童友好大尺寸；手机（narrow）保持原流体值。
- **GamePath 地图**宽屏 max-width 440→600（实际地图宽度由 GameView 的 gp-slot 全宽接管，S 形摆动随容器宽自动放大）；LessonView 闯关开始卡 420→560；BottomNav 宽屏图标/文字放大。
- **桌面 hover（Mac）**：`@media (hover:hover) and (pointer:fine)` 给 k-btn、彩色卡片、课时卡、玩法卡加轻微上浮/增亮反馈；触屏（iPad/iPhone）不触发。
- 实测：iPhone 390 窄档（tap 52/nav 76）、iPad/Mac 宽屏档（tap 64/nav 92、底栏 13px、bodyFs 新 clamp）均正确。

**关卡按钮放大 + 圆环对齐**：
- `.gp-level` 56→64px；`.lv-ring` 72→80px（viewBox 80、r 34、stroke 6）；图标/大锁/礼物 30→34、角标/星徽章/关卡名放大；节点间距 84→96。
- **圆环从 button 移到 lv-wrap 层**：button active 时 4px border 会使 absolute 子元素（基于 padding box）偏移 4px——实测 active 关 dx=-4/dy=-4；移到无边框的 lv-wrap 后所有状态恒定同心（dx=0/dy=0）。
### 13.11 关卡地图细节优化（2026-09-27）

- **角标精简**：关卡旁不再显示小锁 / 播放角标，仅已完成（done）关卡显示 ✓ 对勾；未解锁直接看大锁主体，进行中无角标。
- **课程横幅英文**：地图课程横幅由中文（titleZh）改为英文课程名（title，如 "A Sailor Went to Sea"）；aria-label 双语（英文＋中文）。
- **地图背景纹理**：`.game` 背景加多邻国式彩色圆点（radial-gradient 6 层，固定位置不随内容滚动）；浅色主题半透明彩色点、暗色主题提亮一档（`:root[data-theme="dark"] .game`）。
- 说明：地图顶部横条为**课程横幅**（显示课程名＋进度 x/y＋已完成数，点击进入课程），非多余 UI。
### 13.12 通用对话框抽离 + 锁关交互从简（2026-09-27）

- **抽离通用对话框 `AppDialog`**（src/components/ui/AppDialog.vue）：遮罩 + 居中面板 + role="dialog" + aria-label，统一处理弹入（anim-pop）/收起（leaving 过渡后 emit close）动画与遮罩点击关闭；父组件只管 v-if 与内容（slot 提供 close）。TalkView 亲子对话首次玩法引导卡重构复用，删除其自写的 guide-overlay/guide-card。
- **点击未解锁关卡交互从简**：移除"先完成前面的关卡就能解锁啦"文字提示（locked-tip），改为异常音效（sfxWrong 温柔下行音，内含触感震动）+ 关卡左右抖动动画 + 锁图标摆动（0.5s，保留 --dx 平移基准）；地图关与课程横幅锁关点击均走同一 shakeLocked。
### 13.13 修复关卡名脱离文档流遮挡课程横幅（2026-09-27）

- 现象：关卡名（lv-name，absolute 定位）溢出关卡节点底部约 24px，被下一个课程横幅（gp-unit margin-top 20px）顶边遮挡（如 I Am the Music Man 遮住上方开宝箱文字下半）。
- 修复：`.lv-name` 改为参与文档流（lv-wrap 改 flex column + gap 8px，name 排在按钮正下方，不再 absolute 溢出）；`.lv-wrap + .lv-wrap` margin-top 32→10px，圆心距保持 ≈96px 不变。
- 实测：开宝箱文字底部与下一横幅顶间隔 20px 无遮挡；连续节点圆心距 96/96/96 均匀。
### 13.14 修复课程横幅进度条错位（2026-09-27）

- 现象：`.u-bar`（absolute 进度条）锚到外层容器，三个横幅的进度条叠在页面同一位置，不在横幅内。
- 根因：`.gp-unit` 未设 position，absolute 子元素向上找定位上下文失败。
- 修复：`.gp-unit { position: relative }`，进度条回归各自横幅底部（bottom 10px / 左右 16px）。
### 13.15 进度环留空隙 + 课程横幅滚动吸顶（2026-09-27）

- **进度环与按钮留空隙**：环 circle r 34→30（viewBox 80），环内缘距按钮外缘 5px，不再贴边。
- **课程横幅滚动吸顶**：`.gp-unit` 由 relative 改 `position: sticky; top: 8px; z-index: 5`——滚动到下一课时上一课横幅固定留在滚动区顶部（多邻国式替换）；同时仍为 u-bar 提供绝对定位上下文。实测：滚动后横幅吸在滚动区顶部（top = slotTop+8），后续课程横幅依序顶替。
### 13.16 跟我读交互布局优化（2026-09-27）

- **录音按钮靠下**：`.mic-zone` 加 margin-top:auto 推至玩法容器底部（贴近屏幕底部，孩子拇指好按），底部留安全区 padding（env safe-area）；反馈区（mic 隐藏时）同样靠下。
- **图片/单词放大**：图片 clamp 72~170 → 88~240px（手机竖屏约 94px，iPad/桌面更大）；单词字号 clamp 20~34 → 24~42px；麦克风 64~110 → 72~124px。
- 实测（iPhone 390 视口）：图片 94px、单词 24px、麦克风距容器底部 34px。
### 13.17 跟我读录音回放去进度条 + 复读（2026-09-27）

- record 模式松手回放：`<audio>` 去掉 `controls`（不展示原生进度条/时间，小朋友无需看到），保留 autoplay 自动播放。
- 回放后动作：新增"再听一遍"（replayRec 重播本词录音），与"读得棒/再试一次"并列，读完直接复读或重录。
- 说明：录音/回放流程逻辑未动；audio 无控件时浏览器不渲染 UI，.replay 尺寸样式无副作用。
### 13.18 关卡完成改多邻国式底部反馈：继续按钮由小朋友自决（2026-09-27）

- **交互**：玩法完成后不再自动切全屏结算页；在当前玩法页底部显示多邻国式反馈（参考图：绿色反馈条 + 绿色继续按钮）：
  - 反馈条：`✓ 第 N 关完成，获得 X 颗星！`（闯关）/ `✓ 你太棒了！获得 X 颗星`（自由）；今日目标达成时反馈条上方亮橙色连击横幅。
  - 底部绿色大按钮"继续"：小朋友自己点，点后才进入下一关（闯关，有下一关直接开玩/无则回地图）；自由模式点继续进结算页。
- **实现**：useLessonFlow 加 `donePending`（完成待继续）+ `continueAfter()`；afterGame/afterSong 不再切 result 而置 donePending；防重复结算（donePending 时 afterGame 直接返回）。LessonView 加 .done-zone（反馈条/连击横幅/继续按钮样式，底部安全区）。
- 实测（l4 学单词关）：完成后反馈条+继续按钮显示，玩法内容保留；点继续 → 自动进入下一关（step=quiz）。64 测试通过。
### 13.19 听音选词每题完成显示"继续"（多邻国式每步确认）（2026-09-27）

- 此前：答对一题自动 1.3s 后跳下一题，只在关卡（玩法）完成后才有"继续"。
- 现在：**每一步（每题）答对后**，底部出现绿色反馈条（✓ 太棒了）+ 绿色"继续"按钮，由小朋友点继续进入下一题；答错仍只标红提示重听（无继续）。最后一题点继续 → 关卡完成反馈条（§13.18）。
- 实现：QuizView 去掉自动跳转（setTimeout），答对锁题显示 .judge-zone（反馈条 + 继续按钮，推至底部 + 安全区）。
- 实测（l4 听音选词）：答对 → 太棒了+继续出现（进度不跳）；点继续 → 下一题（进度 11%）。
### 13.20 听音选词"太棒了"反馈弱化（2026-09-27）

- 答对后的"太棒了！"由全宽绿色大条改为轻量绿色小字（fs-small、无背景、无内边距），视觉重点留给底部"继续"按钮。
- 实测：反馈文字 11px 无背景，继续按钮 67px 主视觉。
### 13.21 听音选词错误标记短暂显示后消失（2026-09-27）

- 此前选错项持续标红直到答对；现在选错只短暂标红（约 0.6s 后从 wrongPicks 移除）+ shake，随后红边与"再听一次哦～"提示消失，孩子可继续选其他选项。
- 实测：选错 ~120ms 红标出现，~700ms 后消失。
### 13.22 听音选词"继续"按钮常驻底部（多邻国式）（2026-09-27）

- 按钮不再只在答对后出现：**始终渲染在底部同一位置**；未作答时灰色禁用（文案"听一听再选"），答对后变绿色激活（"继续"），状态切换不跳动。
- 实测：未作答灰（disabled），答对变绿（可点），judge-zone 距底 76px 恒定。
### 13.23 听音选词未作答按钮文案改"检查"（2026-09-27）

- 未作答/答错时底部灰色按钮文案由"听一听再选"改为"检查"（多邻国 Check 语义）；答对后仍为绿色"继续"。
### 13.24 连一连图标更换为链环（2026-09-27）

- 连一连（match）关卡图标由 2×2 方格改为"两个链环相连"（Link2 语义），直观表达"连接/匹配"，缩小时仍清晰。
- 实测：图标 3 条 path 渲染正常（30px）。
### 13.25 关卡完成进总结页 + 玩法页顶部改"关闭"（2026-09-27）

- **总结页**：玩法题做完后不再在最后一题内显示底部反馈条，改为进入独立总结页（LessonResult）：显示"第 N 关完成！"+ 玩法名 · 获得 X 颗星 + 返回闯关地图 / 下一关按钮；撤销 done-zone/donePending 机制（每题"继续"按钮保留）。
- **顶部关闭**：玩法页（learn/quiz/match/speak/talk）顶栏按钮由返回箭头改为"关闭"（✕，多邻国式，HeaderBar 新增 close 模式）；菜单/总结页仍为返回箭头。
- 实测：quiz 顶栏 aria=关闭 + X 图标；走完听音选图 → "第 2 关完成！听音选图 · 获得 3 颗星" 总结页。
### 13.26 玩法页顶栏精简：进度条上移 + 隐藏课程标题/暗黑切换（2026-09-27）

- 玩法页（答题中）顶栏不再显示课程标题；听音选词的进度条由内容区上移到顶栏（✕ 旁，多邻国式），进度由 QuizView 每报 emit("progress") 驱动（初始 0%，答对推进）。
- 玩法页顶栏隐藏暗黑模式切换按钮（ThemeToggle 仅课程菜单/总结页显示）；星数徽章保留。
- 修复：QuizView 新增 watch 调用漏 import（ReferenceError: watch is not defined → setup 崩溃白屏）。
- 实测：顶栏 ✕ + 进度条（0% → 答对 1 题后 25px 增长）+ 星数；无标题、无暗黑切换。
### 13.27 顶栏关闭/返回图标统一走项目图标库（PathIcon）（2026-09-27）

- 关闭（✕）与返回（←）图标加入 pathIcons.ts（APP_ICON_PATHS.close / back），HeaderBar 由 lucide X/ChevronLeft 改为 PathIcon 渲染，与玩法/课程/底部导航图标同源。
- 实测：关闭按钮 svg.path-icon 22px、stroke-width 2.2 渲染正常。
### 13.28 修复答题页双进度条（2026-09-27）

- 此前 QuizView 本地进度条删除未落盘（脚本中途崩溃），答题页出现顶栏 + 内容区两条进度条；已补删本地进度条，答题页仅保留顶部（✕ 旁）一条。
- 实测：页面 progress 条仅 1 个（hdr-progress，y=37）。
### 13.29 庆祝收敛：撒花只在关卡完成时（2026-09-27）

- **规则**：单个"题目/步骤"完成只给音效 + 触感反馈（sfxCorrect / sfxMatch），**撒花（celebrate）只在玩法/关卡完成时**触发（useLessonFlow：闯关 finishQuestStep → bigCelebrate；自由模式满分 bigCelebrate、其余 celebrate）。
- 移除的逐题撒花：QuizView 答对一题、MatchView 配对成功一对、SpeakView 读对一个词（ASR 打分 + 家长判定两条路径）。learn/song 的撒花本就在本关结束时触发，未动。
- **错词复习（ReviewView）**：原来只逐题撒花、整轮结束不撒花 —— 改为逐题不撒花，整轮做完（finished=true）补 bigCelebrate，避免"练完整轮反而没有庆祝"。
- 自动化：`pnpm test` 64 用例 + `pnpm type-check` 全通过。浏览器实测口径：答对 1 题只有音效无礼花，走完本关总结页出现礼花（待用户走一遍确认）。
### 13.30 关卡地图：外圈 = 该关进度 + 3D 立体按钮（2026-09-27）

**需求**（用户参考图）：关卡外圈显示该关进度、每个关卡圆要有投影、**只有有进度时才显示外圈**。

**进度环（GamePath.vue）**

- 形状改为参考图样式：**6 段断开圆弧**，圆头（stroke-linecap: round）、段间留缝（dasharray `12.2 4.467` / pathLength 100），未点亮段是浅灰轨道 `rgba(128,128,128,0.18)`。
- 语义：**每颗星 = 2 段**（1 星 ≈ 1/3 圈，3 星满圈）；宝箱关已领取 = 6 段。`ringOf()` 返回 0..6，**返回 0 时整个 `<svg class="lv-ring">` 不渲染** —— 未玩过的当前关（active）与锁定关都没有环，与参考图的锁定节点一致。
- 几何：`viewBox 0 0 100 100`、圆心线 r=43、描边 6，环盒 105×91（椭圆，见 §13.31），**环内缘距按钮外缘 8px**。定位用 `left:50% + margin-left:-52.5px`（**不能用 inset**：关卡名比按钮宽时 lv-wrap 会变宽，inset 会让环偏心；用 margin 而非 transform，把 transform 留给呼吸动画）。
- 出现时 `ring-in` 淡入，避免进度环突然蹦出来。

**3D 立体按钮**

- `.gp-level` 改为 token 化立体按钮：`--face`（顶面）/ `--base`（底座色）/ `--depth`（厚度 = 底座下移量），`box-shadow: 0 var(--depth) 0 var(--base), 0 calc(var(--depth)+5px) 14px rgba(0,0,0,.12)` —— 第一层实心圆下移即圆柱侧壁，第二层是落地投影。默认 depth 7px、base `rgba(0,0,0,.22)`；宝箱关改 `--face` 金色渐变 + 棕色底座。
- 按下（`:active`）底座压到 1px + 整体下移 5px，模拟按下去；`:focus-visible` 保留底座再叠焦点环。
- **暗色主题**：深底上黑色半透明底座几乎不可见 → `:root[data-theme="dark"] .gp-level { --base: rgba(0,0,0,.55) }`，空段提亮到 `rgba(210,210,210,.2)`。
- 节点纵向间距随环放大：lv-wrap `gap` 8→18px、`margin-top` 10→20px（圆心距 ≈109，等距不变），保证环（含呼吸放大 1.05）不压到相邻关卡名。

**实测**（无头 Chrome + 注入进度数据，375×667 / 390×844 / 1024×768 / 390×844 暗色共 4 组）：

- 环：done 关 `ring=Y segs=星数×2/6`、active/locked `ring=n`；`环与按钮间隙 x/y≈8–10`（呼吸中）、`ringCenterOffsetMax=0`（恒同心）；`docOverflowX=0 / stageOverflowX=0`（最窄 375px 也不横向溢出）。
- `pnpm test` 64 用例 + `pnpm type-check` + `GH_REPO=kids-english pnpm build:ci` 全通过。
- 走查脚本口径：本轮用一次性 CDP 脚本截图 + 量几何（非 layout-audit.mjs），脚本用完已删。
### 13.34 背景质感三层化 + 毛玻璃顶栏/底栏（2026-09-27）

**问题**：全站背景是一层纯色 `var(--bg)`，大屏上很"糊"；而且 **地图页 `.game` 铺了不透明底色**，
把 `CuteBackdrop`（云朵/星星/圆点）整片盖住 —— 页面之间背景语言还不一致。

**三层质感**（都在 `CuteBackdrop` 这一层，纯 CSS + 一个内联 SVG，无图片资源、无网络请求）：

1. **微渐变打底**：`linear-gradient(180deg, var(--bg), color-mix(in srgb, var(--bg) 92%, #000))`
   —— 顶部与 `--bg` 完全一致（状态栏 `theme-color` 不会跳色），向下压暗 8% 产生纵深。
2. **柔光**：顶部环境光（`#fff 45%`）+ 三团超大半径品牌色柔光（blue 15% / pink 13% / purple 13%）。
   暗色主题单独调（深底上低不透明度看不见）：环境光换成蓝色 14%、品牌柔光提到 16~20%、底压暗 12%。
3. **细颗粒**：`.backdrop::after` 用内联 `feTurbulence`（`stitchTiles` 保证 140px 无缝平铺）+ `feColorMatrix saturate 0`
   转灰度，`opacity: .045`（暗色 .07）—— 像纸张纹理，消掉渐变的"塑料感"。
   只用 `z-index:-1` 压在下层：**父元素背景之上、云朵/星星/圆点之下**（负 z 子层的绘制顺序）。

**层级修正**：`.game` 底色改 `transparent`（地图本来有自绘彩色圆点，不需要再铺底色）。
**规则**：页面级容器不要铺不透明 `var(--bg)`，否则质感层被整片盖掉。

**毛玻璃**：顶栏（`HeaderBar`、首页 `.hero`）与固定底栏（`BottomNav`）改为
`background: var(--bar-bg)`（`color-mix(--bg 80%, transparent)`，暗色 74%）+ `backdrop-filter: blur(var(--bar-blur))`，
让质感透上来、滚动内容在栏下呈磨砂虚化（`-webkit-` 前缀一并写，iOS Safari 兼容）。

**实测**：无头 Chrome 截「首页 / 地图 / 课程菜单」× 浅色/暗色 6 张 + 地图滚动态 2 张，
确认质感可见但不抢内容、滚动内容在顶栏下正确虚化、`color-mix`/`backdrop-filter` 不兼容时分别退化为纯色底与纯色栏。
### 13.35 奖励经济改版：贝壳 → 英雄图鉴（角色 → 形态）（2026-09-27）

**背景**：原奖励是 10 张 emoji 贴纸、统一 20 贝壳、买空就没目标（评审时就标为"奖励经济单薄"）。
用户提出"攒贝壳换各种奥特曼"，并要求**一个角色分多个形态**、**点卡片有发音介绍**。

**数据层 `src/data/heroes.ts`**
- 结构：**世代（era）→ 角色（Hero）→ 形态（HeroForm）**，每个形态是独立收集品。
  完整名录 **41 位角色 / 81 个形态**，按昭和（12 位，多为单形态）/ 平成（12 位）/ 新生代（16 位）/ 令和（1 位）分段。
  唯一数据源是同文件顶部的 `ROSTER`：加角色只需追加一行 `{ id, name, en, era, color, forms: [[id, 中文名, 英文名]] }`。
- **稀有度与主色自动派生**（别再手写）：`rarityByIndex(i)` —— 第 1 个形态常见、第 2~3 个稀有、第 4 个起传说；
  `formColor(base, i)` 用 `mixHex` 逐形态微调主色（同一角色的卡不会全一个色）。
- 稀有度定价：常见 20 / 稀有 60 / 传说 120 贝壳（全收集 660）。
- 每个形态带 `name` + `en`（发音介绍要念英文，顺便当英语输入）+ `color`（卡片主色）。
- `ALL_FORMS` 扁平化后供图鉴/商店/开箱遍历；`introOf(id)` 给出"英文 + 中文"两段介绍文案。

**素材约定（关键：改图不用改代码）**
- 默认形象是项目自带的**原创** SVG 占位图 `public/heroes/<formId>.svg`，
  由 `scripts/gen-hero-art.py` 生成（15 个形态按配色/体型/头型/姿势参数化，同角色不同形态一眼能分辨）。
- 家长把图片命名为 `<formId>.png` 放进 `public/heroes/` 即自动替换：卡片先试 png，
  `@error` 时回退内置 svg（与单词图片"缺图回退 emoji"同一套写法）。
- **命名与素材的责任边界**：角色名/形态名是**使用者（家长）指定的私人数据**（用户明确要求用真实角色名）；
  仓库内不含任何受版权保护的角色素材——`public/heroes/*.svg` 全部是 `gen-hero-art.py` 生成的原创占位图，
  真实图片由使用者自行放入 `public/heroes/<id>.png`，仅供家庭内部使用。

**奖励逻辑 `src/stores/rewards.ts`（重写）**
- 状态从 `stickers: string[]` 改为 `forms: Record<formId, 星级>`（1..3 星）。
- `buyForm(id)`：未收集 → 解锁；已收集未满 → 升星；满星/贝壳不足/非法 id 各自返回明确结果且**不改状态**。
- `rollChest()`：贝壳 3~6 + **25% 概率**掉一个未收集形态（全收集后改为给已收集形态升星；全满星则只给贝壳）。
- 老数据迁移：`stickers` 里的 emoji 按当年售价（20 贝壳/张）折算成贝壳并落盘，孩子不白攒。

**UI**
- `TreasureView` 重写成**三级图鉴**：世代分段（昭和/平成/新生代/令和）→ 角色 → 形态。
  单形态角色（昭和 12 位）用**紧凑卡网格**（一屏 4 个），多形态角色一角色一段并列其形态；
  这样 41 位角色 / 81 个形态的整页高度从 ~9500px 压到 ~6450px，仍然一览到底。
- 形态卡抽成 `components/HeroFormCard.vue`（三态：未收集剪影 + 兑换价/"再攒 N"、已收集 ★ + 升级、满星"已满级"；
  图片 png→svg 回退也收在组件内），`TreasureView` 只负责分组与数据装配。
- 点卡片 → `speak("Blaze Warrior, Sky Form")` 再 `speakZh("烈焰战士，空中型")`（英文在前，当听力输入）。
- `ChestReward` 的奖励面板改为展示掉到的形态（图片 + 角色·形态名 + "新形态！/升星！"角标）。

**顺手修掉一个真 bug**：`ChestReward` 的根节点原来是 `position: relative`，
嵌在游戏地图的滚动容器里时整个开箱界面会被排到**地图内容末尾**（实测 y≈4400）——
孩子在"开宝箱"关卡点开后什么都看不到（结算页里看不出来，所以一直没暴露）。
改成 `position: fixed` + 磨砂遮罩（`--bg` 80% + blur 6px）+ `overflow-y: auto`。

**贝壳图标改为 🐚（用户要求）**：矢量贝壳在 12~20px 下像一对括号，孩子/家长都认不出。
新增 `components/ShellIcon.vue` 单点承载这枚 emoji，**这是"界面不用 emoji"铁律的唯一例外**，
范围仅限贝壳货币；无障碍仍带 `role="img" aria-label="贝壳"`。

**测试**：`rewards.test.ts`（12 例，含开箱用可控 rng 断言掉落、迁移不重复折算）+ `heroes.test.ts`（7 例，数据护栏）。
总数 146 → **165**；`type-check` + `build:ci` 通过；无头 Chrome 实测宝藏罐（浅/暗各 2 张）+ 开箱掉形态 1 张。

### 13.36 事故复盘：奖励 store 改字段 →「我的」页白屏（2026-09-27）

**现象**：用户反馈点「我的」路由是空白页。

**根因**：§13.35 把 rewards store 的状态从 `stickers: string[]` 换成 `forms: Record<id, 星级>`，
删掉了 `stickers / stickerTotal / stickerPrice / buySticker`。但 `MyView.vue` 与 `ReportView.vue`
仍在读 `rewards.stickers.length` → 渲染期 `Cannot read properties of undefined` → 白屏（两页都白）。

**为什么没被拦住**：
1. 这两个页面当时还是 **JS 模式的 SFC**（`<script setup>` 没写 `lang="ts"`），
   `vue-tsc --noEmit` 对它们**不做类型检查**，读已删除字段不会报错；
2. 组件测试只覆盖了少数组件（Pager/WordCard/…），**没有"每页挂一次"的页面级测试**；
3. 人类走查也只截了宝藏罐/地图等页面，恰好漏了这两个。

**修复**：
- `MyView` / `ReportView` 改读 `rewards.ownedCount` + `FORM_TOTAL`（文案同步改为「英雄图鉴」）；
- 两个页面转成 `<script setup lang="ts">`，顺手补上隐式 any 的类型标注 —— **从此它们受 type-check 保护**；
- 新增 `src/views/__tests__/pages.smoke.test.ts`：7 个页面（首页两种模式 / 我的 / 报告 / 宝藏罐 / 到期复习 / 课程页）
  各挂载一次，断言关键文案存在 + 没有 Vue 报错（`console.error` 与 `Unhandled error` 都算失败）。
  这类"store 改字段 → 某页白屏"的事故以后会在 CI 直接红。

**教训（写进铁律）**：**删改 store 的对外字段时，必须跑一遍页面冒烟**；
新写的页面组件默认 `lang="ts"`，JS 模式的 SFC 等于游离在类型检查之外。

### 13.37 英雄素材获取脚本 `scripts/fetch-hero-art.py`（2026-09-27）

用户要求"帮忙把 81 张角色图下载归位"，同时坚持私人使用。交付方式：**给工具、不给素材**。

- **四种图源 + 自动依次尝试**（`--source fandom,bing,baidu,moegirl`，默认按此顺序）：
  1. `fandom`：MediaWiki API（`list=search` 找页面 → `prop=pageimages&piprop=original` 取主图，
     主图不合适时用 `action=parse&prop=images` 按形态关键词打分兜底）——形态覆盖最全，但**形态页常不存在**，
     容易把角色主图套给所有形态；
  2. `bing`：`cn.bing.com/images/async` 解析 `murl`（.png 优先）——按关键词搜"角色+形态"，形态命中率更高；
  3. `baidu`：`image.baidu.com/search/acjson`（中文关键词；返回的 JSON 偶尔带尾逗号不合法，代码有正则兜底）；
  4. `moegirl`：萌娘百科 MediaWiki API（中文条目图；图片站防盗链，下载自动带 Referer）。
  图源根地址可用环境变量 `HERO_*_BASE` 覆盖 —— 本地用 mock 服务器验证过四种解析路径。
- **另外两种取图方式**（可与 `--auto` 混用，按 id 去重）：
  2. `--urls urls.txt`：每行 `formId URL`（浏览器复制的直链）；
  3. `--from-dir DIR [--map map.txt]`：本地已下载图片（无映射表时按"文件名含 formId"自动匹配）。
- **规整**：`sips -s format png --resampleHeightWidthMax 512` —— 转 PNG、保留透明通道、超长边压到 512px
  （卡片最大显示 ~88px，512 足够；保持长宽比，卡片本身就是 `object-fit: contain`）。
- **避免整批卡死**：显式给了清单（urls/from-dir）时**只处理清单里的 id**，不再顺手联网搜剩下的；
  自动模式连续 3 次网络失败即熔断并提示改用清单方式；单 id 超时 15s。
- **可复核**：输出 `public/heroes/fetch-report.tsv`（id / 来源 / 尺寸 / 状态），自动匹配会有误命中（logo/剪影），
  所以报告是给人工过一遍用的；**同一张图被多个形态命中时会在来源列标 `⚠️ 与 xxx 同图`**
  （自动搜图最容易犯的错就是把角色主图套给它的所有形态，标出来就知道哪些必须手动换）。
- **下载校验按文件头**（PNG/JPEG/GIF/WebP/SVG）而不是看大小：防盗链或错误页会返回 HTML，
  按文件头判断才能给出"下载内容不是图片（开头：<html…>）"这样的可用报错。
- **版权与分发边界**：脚本只做"下载 + 归位"，素材由使用者自行获取与承担；
  `.gitignore` 已加 `public/heroes/*.png` —— 下载的图片默认**不进公开仓库**，
  想让线上也显示，要么删掉那行自行提交，要么把图片放自己的图床、`heroes.ts` 里改 https 绝对地址
  （`asset()` 对 http(s) 链接原样返回）。
- **实测**（本机网络当前拦截 fandom/wikimedia，只有 github/npm 通）：
  本地归位链路跑通（同一张测试图 → `tiga-multi.png` 439×512 PNG + 报告）；
  自动模式按预期降级：打印"连不上图片源"提示 + 三种替代方案，不静默失败。
### 13.31 关卡按钮改椭圆（参考图的透视圆柱）+ 进度环呼吸微动画（2026-09-27）

**用户反馈**：参考图里的按钮**并不是正圆**（是俯视透视的圆柱：横向略宽、纵向略扁），另外关卡周围的进度环希望有轻微的大小动画。

**椭圆顶面**

- `.gp-level`：64×64 正圆 → **68×57 椭圆**（≈ 参考图 230:190 的透视比例），仍 `border-radius: 50%`。3D 底座（下移的实心椭圆）与落地投影自然跟着变成椭圆圆柱。
- 进度环同步改椭圆：SVG 仍是 `viewBox 0 0 100 100` 的圆弧，但元素盒设成 **105×91 + `preserveAspectRatio="none"`**，把正圆投影拉伸成椭圆 —— 与 68×57 的椭圆按钮四周保持**均匀 8px 间隙**（105×0.4 − 34 = 8）。
- 角标/图标配比跟着调小：玩法图标 30→27px、锁定大锁 34→30px、★N 角标 20→19px、✓ 角标 22→20px，角标回到椭圆"边缘上"（right 2 / top 3），既不压住图标、也不飘在按钮外的空隙里。

**进度环呼吸微动画**

- `.lv-ring` 加 `ring-breathe`：3.4s 无限循环、`scale(1 ↔ 1.05)`，缓动用 `--ease-in-out`；`will-change: transform` 提示合成层。
- 各关按序号错峰 `--ring-delay: (地图序号 % 7) × 0.18s` → 地图上像一道缓慢的波浪，而不是 35 个环整齐同步跳。
- 进场的 `ring-in` 只保留淡入（不再做缩放），避免与呼吸动画争同一个 `transform`。
- 动画放在 **SVG 整体**（每关 1 个元素）而不是 6 段圆弧（每关 6 个元素）：35 关最多 35 个动画元素，滚动/性能可控。

**实测**：4 组视口（375/390/1024/暗色）—— 按钮 `68x57`、环盒实测 105–110 × 91–96（呼吸到 1.05 时 110×96，说明动画在跑）、`ringCenterOffsetMax=0`、`docOverflowX=0`、节点圆心距 109（课内等距）。`pnpm test` 64 用例 + `pnpm type-check` + `build:ci` 全通过。
### 13.32 课程横幅右侧固定"课本"图标（2026-09-27）

**用户需求**：游戏闯关里每课的横幅（课程标题条）最右侧放一个**固定的** icon，可以用类似一本书的图标。

- `data/pathIcons.ts` 的 `APP_ICON_PATHS` 新增 `book`（lucide Book：合上的书）。**刻意不用 `ICON_PATHS.learn`** —— 那个是"学单词"玩法的**打开的书**，同一个图标两处用会混淆。
- GamePath 课程横幅结构变为 `[课程图标][课程名 (flex:1)][已完成 x/y][书 icon]`，最右侧的书本对每门课都一样（"固定的 icon"，不随课程 tone/图标变化），表示"进入这门课"。
- 样式 `.u-go`：22px、白色描边、opacity .92、`flex: none`（不被课程名挤扁）；图标 `aria-hidden`，无障碍描述沿用横幅自身的 `aria-label`。

**实测**：iPhone/iPad 截图确认横幅右侧稳定出现书本图标（`I Am the Music Man … 2/6` + 书本），长课程名（A Sailor Went to Sea）下图标未被挤出；`docOverflowX=0`。

### 13.33 阶段 4：评级可信度 + 间隔重复 + 交互补齐 + 逻辑分层（2026-09-27）

用户按上一轮评审逐条立项，本轮完成 5 条（内容流水线、奖励经济两条留待后续）。

#### 1) 星级语义修复 + CI 质量门禁

两个"评级失真"的根因（探索性评审时发现）：

| 问题 | 根因 | 修复 |
|---|---|---|
| 听音选图**恒 3 星** | 玩法是"答错不推进、必须选对才下一题"，`rightCount/total` 结束必然 = 1 | 改成**首次答对率**（第一下就选对的比例），`utils/quizSession.starsForFirstTry`：≥90% 3 星 / ≥60% 2 星 / 其余 1 星 |
| 看图学词**恒 1 星** → "全部通关"永远不可达 | `emit("done")` 不传星 → 兜底 1 星，而通关口径要求 learn ≥ 2 | 改成**点读覆盖率**（点过发音的词占比，`utils/learnSession.learnStars`），并把星数真的上报 |

- 星级口径统一沉淀：`utils/stars.starsForRatio` 为公共档位（90%/60%）；连线按连错次数、跟读按首次通过率（80%/50%）各有专门函数，全部带单测。
- **CI 门禁**：`.github/workflows/deploy.yml` 在 build 前新增 `Quality gate (test + type-check)` 步骤（install → test → type-check → build）。
  此前 CI 只 build，白屏级错误（文档里记过两次：漏 import、注释残留）都能直接上线。
- 图标：界面禁用 emoji 的铁律保持；本轮新增 `APP_ICON_PATHS.book`（见 §13.32）。

#### 2) 交互补齐（面向 5 岁孩子 + 家长）

| 改动 | 为什么 |
|---|---|
| **进地图自动定位当前关** | 35 关 ≈ 4 屏，孩子不该自己翻。首次进入 / 在别处通关后回来 → 滚到当前关居中；解锁新关时用平滑滚动；没变化则恢复上次位置（`lastSeenLevelId` 模块级记忆） |
| ~~中途退出确认~~ | 一度加了"要退出这一关吗？"确认框，**用户实测后要求去掉**（多一次点击反而打断节奏）→ 已还原为 ✕ 直接退出。教训：给孩子用的应用，**退出要一步到位**，用"误触代价低"（重新玩一关只要 1 分钟）换"零打断" |
| **静音开关** | `utils/sound.ts` + `components/layout/SoundToggle.vue`（首页顶栏 + 我的页设置行）。**只关音效与中文提示语**，单词/童谣/对话发音保留（静音就没法练听力了） |
| **去掉 ✓ 冗余角标** | 进度环（有环 = 做过的关）已在表达同一件事，★N 保留（星数是具体信息） |
| **听音选词：答对后其他选项仍可点** | 孩子答对后常想再点点别的图听发音。`useQuizSession.pick()` 在锁定态返回 `explore` → 只朗读 + 记一次点读，**不改判定、不计错、不推进、不影响星级**；同时去掉原来给其他选项的 `opacity: .45`（"能点"的卡不该看起来像"不能点"） |

#### 3) 学习闭环：间隔重复 + 每日目标 + 掌握度趋势

- **SRS（`utils/reviewSchedule.ts`，纯函数 + 单测）**：答错打回 stage 0（1 天后到期），答对逐级 3 → 7 → 14 天，
  连对 4 次 = 已掌握、移出队列。练习时答错的词**第二天**才到期，不再当天反复打扰。
- **老数据迁移**（`progress.load()`）：老的 `correct/wrong` 折算成 stage = clamp(correct-wrong)；
  老的"弱词"（错≥对）= stage 0 且**立即到期**，升级后马上出现在复习队列；历史星星完全不动。
- **复习页**改用到期队列（`getReviewQueue`），答对一次计入今日目标；结算文案改为"还有 N 个词在排队"。
- **每日目标**（`stores/streak.ts` 重写）：**复习 N 个到期词 + 新学 1 关**。
  N = min(5, 今天到期数)，由复习页 `syncReviewGoal(到期数 + 今日已复习数)` 同步（保证"边复习边缩小的 due"不会让目标缩水，且目标只增不减）。
  "新学"只认**首次通关**（重刷不算）。跨天：`refreshDay()` + App.vue 的 `visibilitychange` 触发
  （computed 不会因日期变化自动失效 → 必须有显式触发点，这是本轮修掉的一个真实缺陷）。
- **掌握度趋势**：`progress._dailyLog`（每天一条快照：时长/玩法数/已掌握词数，保留 30 天）+
  `components/MasteryTrend.vue`（7 根柱子，柱顶是当天掌握词数，柱下是星期）+ 报告页概览（已掌握/学习中/今天到期）。
  待巩固清单改为"未掌握 + 记忆阶段 + 下次到期日"。

#### 4) 逻辑分层 + 测试

| 玩法 | 抽出 | 组件剩余职责 |
|---|---|---|
| 听音选图 | `composables/useQuizSession.ts` + `utils/quizSession.ts` | 模板 + 音效/朗读/store 注入 |
| 到期复习 | 复用 `useQuizSession`（`distractors` 跨课、`keyOf` 复合键） | 结算页 + 自动下一题节奏 |
| 看图学词 | `composables/useLearnSession.ts` + `utils/learnSession.ts` | 模板 + 音效 |
| 跟我读 | `composables/useSpeechSession.ts` + `utils/speakSession.ts` | 模板 + 音效/落库 |
| 连一连 | `utils/matchBoard.ts`（分组 + 星级；拖拽/命中仍留在组件） | 测量/连线/拖拽 |

测试从 8 文件 73 用例 → **19 文件 137 用例**（新增 store 的 progress、组件层 AppDialog/Pager/WordCard/MasteryTrend/LearnView、composable 的 useQuizSession）。
`@vue/test-utils@2.5.1` 进 devDependencies（CI 的 `--frozen-lockfile` 已同步）。

#### 5) 关卡地图视觉等距（两轮）

**第一轮：横向摆幅**。实测（无头 Chrome 注入进度）发现问题：**纵向圆心距恒定 109，但相邻斜距差异很大**
——手机 109/114，iPad **109/136**，超宽窗口更大（S 振幅曾是 `0.12 × 容器宽`，宽屏摆到 ±80~±145）。
修复：`SNAKE_SWING = 46` 把振幅与纵向节奏绑定（`A = min(0.12w, 46)`），各设备路径形状一致。
复测：手机与 iPad 完全一致（`dX=0/33`、斜距 114/119，差 4%）。

**第二轮：可见留白统一**（用户反馈"统一"）。固定 margin 下，含环/无环的可见轮廓高度差 34px，
留白实测 **环→环 28 / 环→无环 43 / 无环→无环 50**（2 倍差）。
改成**按相邻两关形态动态算间距**：`pathGeometry.marginBefore(prev, cur)` 让
`margin + LABEL_GAP + LABEL_H - prev.bottom - cur.top ≡ VISUAL_GAP(40px)`，
四种组合的可见留白都恒等于 40px（单测 `visualGapOf` 直接断言这个恒等式）。
代价：圆心距不再恒定（131/114/121/104），但**眼睛量的是留白不是圆心**，而间距变化有
`transition` 平滑过渡（通关后环出现的重排不会跳）。
常量（`NODE_BASE/RING_OVERHANG/LABEL_GAP/LABEL_H`）与 GamePath.vue 的 CSS 一一对应，
改样式必须同步改常量（单测里有一条"常量与 CSS 口径一致"守着）。
### 13.38 交互细节修 6 项（2026-09-27）
用户实测反馈，逐条修：

1. **底栏「游戏」图标换掉**：手柄 → **折页地图**（`pathIcons.game`）。这个 tab 打开的是关卡路径图，地图比手柄直观。
2. **课程页课程名出现两次**：顶栏已经是「🌊 A Sailor Went to Sea」，封面卡又写一遍 → 封面只留大 emoji（`--fs-emoji-l`），名字只在顶栏显示一次。
3. **宝箱开完没有关闭按钮**：`ChestReward` 右上角加固定 ✕（`aria-label="关闭"`）。语义：还没开箱就点关闭 → 奖励照常入账（与"跳过"一致）；已开箱 → 直接收起。避免"只有收取一条路"。
4. **地图课程横幅左侧图标与「自由练习」不一致**：原来用矢量图标（`PathIcon :name=lessonId`），自由页用的是课程 emoji → 统一成 emoji（`.u-emoji`），两页一眼能对上。
5. **连一连新增「听音」模式**（用户要求"不显示单词的形式也要有，两种切换着来"）：
   - 顶部加「看词 / 听音」分段切换（`localStorage: kids-english-match-mode` 记住选择）；
   - 听音模式中间列只显示 🔊（`aria-label` 保留单词，读屏可用），点一下**先播放发音**；
   - **听音模式下点声音卡只做"播放 + 选中"，不直接判定配对** —— 孩子想逐个听一遍再连，不能把"听一下"算成连错（配对仍由点图片完成）。
6. **亲子对话互相遮挡**：定位于矮屏/大屏实测 —— 小屏 360×640 下句式列表压住标题 6px、iPad 下压住词库 9px。根因是 `.phrase-list`（`.view-body` 给了 `flex:1`）用 `justify-content: center`，内容超出时向上下两端溢出。改为 `justify-content: safe center` + `overflow-y: auto`（放得下仍居中，放不下从顶部开始并可内部滚动）。

**验收**（无头 Chrome）：宝箱关闭按钮 `hasClose=true aria=关闭`；连一连听音模式 `modeBtns=2 / soundIcons=3 / 单词文本为空`；
亲子对话重叠检测（**与滚动容器求交后的可见区域**才算，避免把滚出可视区误报成重叠）在 360×640 与 iPad 上均为「无重叠」；全流程 0 页面异常。
### 13.39 修复宝箱"已收进宝藏罐"后卡死（2026-09-27）
用户反馈：宝箱收进宝藏罐后**没有关闭按钮、界面卡住**。

- 根因：`LessonResult` 把宝箱挂载成 `<ChestReward />` —— **没接 `@done`**。`collect()` 收完动画后 emit `done` 没人理，
  组件仍停在 `collected` 态；而我上一轮加的 ✕ 又是 `v-if="phase !== 'collected'"`（收完就隐藏）→ 唯一出口也没了。
- 修复两处：
  1. `LessonResult` 接 `@done="chestDone = true"`，收取完即卸载宝箱（结算页回归星星+按钮）；
  2. `ChestReward` 的 ✕ **所有阶段都显示**（含 collected）—— 即便父级没接 `@done`，用户也永远有出口。
- 验收：无头 Chrome 走「自由练习 → 学单词 → 结算页 → 开箱 → 收取」，收取后 `chestStillMounted=false`、结算页仍在；
  修复前该状态会一直停在"宝石飞向宝藏罐/已收进宝藏罐"。
### 13.29 底部导航"自由"改"学习"+ 书本图标 + 移动端点击加固（2026-09-27）

- 底部导航第一个 tab：标签"自由"→"学习"（aria-label 同步），图标由靶心改为书本（闭合，lucide Book 语义，与学单词玩法"打开的书"区分）。
- 移动端点击加固：BottomNav 按钮加 touch-action: manipulation / tap-highlight 透明 / user-select none，消除轻滑被当成滚动、双击缩放导致 click 丢失（"手机上有时点不过去"）。
- 确认：开宝箱关闭按钮已在 805323b 提供（chest-close 左上角 ✕，z70 > 遮罩 z60；未开箱关闭＝奖励照常入账，已开箱直接收起）。
### 13.30 全站文字点击发音（2026-09-27）

- 需求：目前没发音的可点文字，点击都应发音（如底部导航标题等）。
- 合理处理原则：**英文内容读英文、中文 UI 读中文**——
  - 学习页课程卡片 / 游戏地图课程横幅 / 课程菜单顶栏标题（英文课程名）→ 点击 speak()（预生成音频优先，回退 TTS）；
  - 底部导航 tab（学习/游戏/我的）与玩法卡片（学单词/听音选图…）→ 点击 speakZh()（中文，归音效开关，静音不读）；
  - 单词点读（LearnView/QuizView/ReviewView 等）此前已有，不重复接入。
- 实现：PracticeView.enter、GamePath.enterUnit、LessonView.sayTitle/openSound、BottomNav goPractice/goGame/goMe。
