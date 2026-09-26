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
| ReviewView | — | — | 独立页 /review：从 progress 捞弱词集中复习 |
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
| `src/utils/__tests__/pathGeometry.test.ts` | 游戏地图布局（buildPathGeometry）与命中判定（hitTestPath），13 用例 |

改动布局算法、评分阈值、连击逻辑、分页逻辑、**地图布局常量/命中规则**时必须补/跑对应测试。

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
