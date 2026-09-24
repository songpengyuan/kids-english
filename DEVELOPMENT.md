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
| 构建 | Vite 8 |
| 包管理 | pnpm |
| 后端 | 无，纯前端静态站点 |
| 语音 | 预生成神经网络发音（edge-tts，童声 AnaNeural）+ Web Speech API 回退；发音评分见 §6 |
| 动效 | canvas-confetti + CSS 关键帧 + Web Audio 合成音效 |
| 存储 | localStorage（星星与通关进度） |
| 部署 | GitHub Pages，子路径 `/<repo>/` |

```bash
pnpm install
pnpm dev      # 本地开发
pnpm build    # 产出 dist/（部署时带 GH_REPO 环境变量，见 §8）
```

---

## 2. 目录结构与职责

```
kids-english/
├── index.html
├── src/
│   ├── main.js                 # 入口：按序引入 tokens.css → base.css → App
│   ├── App.vue                 # 顶层状态机：首页 ↔ 课时页；读取调试深链
│   ├── styles/
│   │   ├── tokens.css          # ★ 设计 token：颜色/间距/字号/圆角/阴影 + 断点表注释
│   │   └── base.css            # ★ reset、应用外壳、跨页面共享 UI（.view/.k-btn/.topbar/进度条/动画）
│   ├── data/
│   │   └── lessons.js          # ★ 课时数据唯一入口，导出时统一补部署基路径
│   ├── store/
│   │   └── progress.js         # 星星/进度持久化（localStorage，模块级单例）
│   ├── composables/
│   │   ├── useViewport.js      # ★ 视口状态（模块级单例，尺寸 + 分档）
│   │   └── usePager.js         # ★ 通用分页逻辑
│   ├── utils/
│   │   ├── layout.js           # ★ 纯函数布局算法：fitGrid / pickColumns / splitBalanced
│   │   ├── speech.js           # 两级发音：预生成 mp3 优先，缺失回退浏览器 TTS
│   │   ├── speechScore.js      # 发音评分（ASR + 录音双模式）
│   │   └── effects.js          # 彩带与音效
│   ├── components/
│   │   ├── HomePage.vue        # 首页课时卡片（分页）
│   │   ├── LessonView.vue      # 单课状态机：菜单 ↔ 各玩法 ↔ 结算
│   │   ├── LearnView.vue       # 看图学词（★ 动态分页）
│   │   ├── QuizView.vue        # 听音选图（单题推进）
│   │   ├── MatchView.vue       # 图词连线（分组 + SVG 连线）
│   │   ├── SpeakView.vue       # 跟我读（ASR 打分 / 录音回放双模式）
│   │   ├── SongView.vue        # 童谣音频/视频
│   │   ├── TalkView.vue        # 亲子对话（点句听发音，家长/宝宝轮流说）
│   │   ├── WordCard.vue        # 可复用发音词卡
│   │   └── Pager.vue           # ★ 通用翻页控件（大箭头 + 圆点）
│   └── assets/
├── scripts/
│   ├── layout-audit.mjs        # ★ 多视口布局走查脚本（见 §9）
│   └── gen-word-audio.py       # ★ 生成单词发音 mp3（edge-tts，见 §5.1）
├── public/
│   ├── lessons/                # 课时素材目录（约定见 README）
│   └── avatars/                # 课时封面占位
└── DEVELOPMENT.md              # 本文档
```

标 ★ 的是本次响应式重构新增/重点改造的部分。

---

## 3. 架构总览

### 3.1 两层状态机，无路由

```
App.vue          currentId: null | 'l1'..'lN'      ←→  HomePage / LessonView
LessonView.vue   stage: menu | learn | quiz | match | speak | song | talk | result
```

- 状态都在内存里，**没有引入 vue-router**。理由：这是给 5 岁孩子用的单机应用，
  没有分享单课链接、浏览器后退的需求；引入路由只会增加复杂度。
- 需要在真机上直达某个页面时用**调试深链**（见 §9.1），不引入路由也能达到目的。

### 3.2 组件契约

| 组件 | props | emits | 说明 |
|---|---|---|---|
| HomePage | — | `open(id)` | 课时卡片，内部自己分页 |
| LessonView | `lesson` | `back` | 按 `stage` 渲染各玩法或结算页 |
| LearnView / QuizView / MatchView / SpeakView | `words` | `done(stars)` | 玩法结束上报星级（1~3） |
| SongView | `lesson` | `back` / `song-done` | 童谣页，星级固定 1 |
| WordCard | `word`, `size`, `speakZhHint` | — | 纯展示 + 点击朗读 |
| Pager | `page`, `total` | `prev` / `next` / `go` | 受控组件，不持有页码状态 |

玩法组件统一走 `words` 进、`done(stars)` 出，因此 LessonView 可以用同一个
`<component :is>` 挂载它们，新增玩法只要遵守这个契约即可零改动接入。

### 3.3 数据流

```
lessons.js ──(补 BASE_URL)──► LessonView ──► 各玩法组件
                                  │
                                  ▼ done(stars)
                             progress.js ──► localStorage
```

`progress.js` 是模块级单例（不是 Pinia）：状态就一个对象 + 几个方法，
不值得为它引一个状态库。

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

`speech.js` 按单词的 `en` 名查注册表（lessons.js 导出时自动构建），播放分两级：

```
speak("star")
  ├─ 注册表命中 → Audio 播放 /lessons/<课>/audio/<单词id>.mp3（神经网络童声）
  │     └─ 播放失败（文件缺失/解码错误）──┐
  └─ 未命中 ─────────────────────────────┴→ 浏览器 TTS 回退（Web Speech API）
```

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
/?lesson=l4                  → 直接进第 4 课的菜单
/?lesson=l4&stage=learn      → 直达"看图学词"
/?lesson=l4&stage=quiz       → 直达"听音选图"
/?lesson=l4&stage=match      → 直达"图词连线"
/?lesson=l4&stage=speak      → 直达"跟我读"
/?lesson=l4&stage=song       → 直达"唱童谣"
```

`stage` 取值：`learn | quiz | match | speak | song`。仅在开发/验收时用，不影响正常流程。

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

**dev 模式默认不注册 SW**（避免干扰 HMR），要手动测时加 `?sw=1`；
dev 的 `/sw.js` 由插件中间件提供，不缓存任何 dev 模块。

注册图标：`public/manifest.webmanifest`（相对路径，天然适配子路径）+
`scripts/gen-icons.py`（从 192 原图提取闪电形状重绘 512 / maskable-512）。

---

## 9. 构建与部署

推送到 `main` 会自动触发 `.github/workflows/deploy.yml`：
安装依赖 → `GH_REPO=<仓库名> pnpm build` → 上传 `dist/` → 部署到 GitHub Pages。

`GH_REPO` 环境变量决定 `vite.config.js` 里的 `base`，即部署子路径。
**本地构建如果不带这个变量，产物资源路径会指向根目录**，部署后必挂 —— 本地想复现线上就带上它。

---

## 10. 排错清单

| 症状 | 原因 | 处理 |
|---|---|---|
| 线上音频/视频/图片 404，但 `dist/` 里文件都在 | `public/` 目录的文件**不经过** Vite 路径重写，代码里写死的 `/lessons/...` 在子路径部署下被解析到站点根目录 | 路径必须经 `lessons.js` 的 `asset()` 补前缀，不要在新代码里裸写根路径 |
| 本地构建的产物部署后白屏 | 构建时没带 `GH_REPO`，`base` 是 `/` 而非 `/<repo>/` | 带 `GH_REPO=kids-english pnpm build` |
| 某页面在某个设备上内容被截断 | 违反 §4：列表没分页、或尺寸只用了一个维度 | 跑 §7.2 的走查脚本定位溢出元素 |
| 改完样式个别元素尺寸没变 | 写死了 `px`，没走 token | 换成 `clamp(..., min(Xvh, Yvw), ...)` 或 tokens 里的变量 |
| 发音识别总是失败并提示切换录音模式 | 国内网络连不上 Google 识别服务 | 预期行为，录音回放模式是可用的主路径 |
| 某个单词发音机械（走了 TTS） | 对应 mp3 没生成（`public/lessons/<课>/audio/<单词id>.mp3` 缺失） | 跑 `python3 scripts/gen-word-audio.py` 补齐 |
| iOS 上点第一次没声音 | iOS Safari 要求用户手势后才能播放音频 | 已用点击触发规避，勿改成自动播放 |
| 孩子的星星丢了 | localStorage 被清（换设备/清缓存）或存储键被改动 | 不要改 `progress.js` 里的 KEY |

| 孩子的星星丢了 | localStorage 被清（换设备/清缓存）或存储键被改动 | 不要改 `progress.js` 里的 KEY |
| 手机上一直看到旧版本 | SW 被浏览器停用或更新被挂起（正在玩法里） | 回到首页即刷新；或在浏览器设置里清除该站点数据 |
| 换了同名媒体文件但客户端还是旧的 | 媒体是 SWR，最多旧一次 | 刷新一次页面即可；要彻底立即可见可改文件名 |

---

## 11. 可选的后续方向

- **滑动手势翻页**：点读页可加左右滑动（注意与连线页拖拽的手势边界）。
- **发音评分升级**：接入讯飞少儿语音评测或 Azure Pronunciation Assessment，逐音素打分。
- **跨设备同步进度**：需要一个后端（当前纯前端，进度只在本机）。
- **素材管理**：补素材放进对应课时目录，无需改代码即可生效。
