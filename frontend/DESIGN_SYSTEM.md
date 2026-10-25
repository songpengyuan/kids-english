# Kids English 设计系统规范

> 一句话：**页面只做编排，视觉全部来自 token 与共享组件。**
> 页面里出现 `#xxx`、`12px`、`border-radius: 18px` 这类字面值，就说明这层约定被绕过了。

## 0. 分层

| 层 | 位置 | 职责 | 允许写什么 |
|----|------|------|-----------|
| ① Token | `src/styles/tokens.css` | 唯一的值来源 | 颜色 / 间距 / 圆角 / 字号 / 字重 / 阴影 / 时长 / 缓动 / 层级 |
| ② 工具类 | `src/styles/base.css` | 跨 3 处以上重复出现的样式 | `.tone-*` `.card` `.entry-row` `.icon-tile` `.badge` `.progress` `.k-btn` `.field` `.empty` `.round` … |
| ③ 基础组件 | `src/components/ui/` | 可复用积木 | `PageShell` `EmptyState` `EntryRow` `IconTile` `EmojiTile` `MetricTile` `SectionTitle` `SegmentedTabs` `SpeakWave` `BaseButton` `BaseDrawer` `AppDialog` |
| ④ 领域组件 | `src/components/{activities,lesson,game,rewards,treasure,report}/` | 玩法/业务块 | 可以有自己的布局，但颜色/尺寸仍走 ①② |
| ⑤ 页面 | `src/views/` | 编排：取数、串流程、摆积木 | 只允许写"这一个页面独有"的布局，不写色值/字号 |

新增样式时自上而下找：**token 里有就用 token → 工具类里有就用工具类 → 3 处以上重复就下沉到 ② 或 ③**。
上面这两条（"字面值不许进组件""层不能越级"）由 `scripts/guard-tokens.mjs` 在 CI 里强制，见 §14。

## 1. 设计原则

- **儿童优先**：触控目标 ≥ `--tap-min`（手机 52px / iPad 64px），圆角大，颜色饱和
- **一屏装下**：不滚动页面为主，尺寸用 `clamp(min(vh, vw))` 流体自适应
- **立体可爱**：卡片用 `box-shadow: 0 press 0 deep-color` 做厚度，按下下沉
- **少即是多**：每页不超过 3 个主要交互元素，避免孩子迷路

## 2. 颜色体系

### 2.1 中性色（亮色/暗色自动切换）

| Token | 用途 | 亮色 | 暗色 |
|-------|------|------|------|
| `--bg` | 页面背景 | `#fdf6e3` | `#171c2b` |
| `--card-bg` | 卡片/按钮面 | `#ffffff` | `#242b40` |
| `--ink` | 主文字 | `#4a3f35` | `#f0e9dc` |
| `--ink-soft` | 次要文字 | `#8a7f6f` | `#b0a99c` |
| `--ink-faint` | 弱化文字 | `#a89b86` | `#7f7a70` |
| `--line` | 分割线/轨道 | `#e8e0cf` | `#39415a` |

**禁止**在组件里写 `color: #fff` / `background: #333`，一律用变量。

### 2.2 品牌色（水蓝系）

**新代码一律用 `--brand` 系列**；`--green` / `--green-dark` 是历史别名（tokens.css 中已指向 `--brand`），只为兼容旧代码保留。

| Token | 用途 | 亮色 | 暗色 |
|-------|------|------|------|
| `--brand` | 品牌主色（主按钮/进度/导航/选中） | `#00a3ff` | `#2f9fe0` |
| `--brand-dark` | 立体投影/按压 | `#0086d6` | `#237bb0` |
| `--brand-deep` | 渐变端点/强调文字 | `#1e7fd0` | `#1a5c8f` |
| `--brand-bright` | 渐变亮端/高亮 | `#6cc3f5` | `#7cc7f0` |
| `--brand-soft` | 柔和底（选中 tab/浅蓝卡） | `#e3f5ff` | `#16344d` |
| `--brand-tint` | 更浅提示底 | `#d6efff` | `#1d3f5e` |
| `--brand-grad` | 标准品牌渐变 | `135deg #1e7fd0→#38a3e8→#6cc3f5` | `135deg #1a5c8f→#2f9fe0→#7cc7f0` |

### 2.3 语义反馈色 `--ok`（正确=绿）

| Token | 用途 | 亮色 | 暗色 |
|-------|------|------|------|
| `--ok` | 答对/完成/成功（边框、背景、文字） | `#58cc02` | `#7cc94a` |
| `--ok-dark` | 立体投影/深色文字 | `#46a302` | `#5fa838` |

**语义二分硬规则**：
- **判定/完成类**（答题答对、发音 perfect、配对完成线、宝箱收取/已收集、成功徽章、报告正确统计、掌握上升、今日目标完成、词卡已听过）→ **必须 `--ok`（绿）**；
- **进度/导航类**（关卡线、进度段、弹窗进度点、磨耳朵声波、主按钮、底部导航、翻页、Hero）→ **品牌蓝 `--brand*`**；
- 两者不可互换，走查时逐一核对。

其余功能色：`--blue` 次要操作、`--yellow`/`--progress-hi` 进度高亮、`--red` 错误/删除。

### 2.4 卡片色调板（7 色，唯一彩色来源）

`.tone-blue` `.tone-green` `.tone-orange` `.tone-purple` `.tone-pink` `.tone-teal` `.tone-gold`

```html
<button class="entry-row tone-gold">…</button>
```

`.tone-*` 一次注入三件事，组件里不用再复述：**顶部高光渐变 + 同色调实心投影 + 文字色**（`--on-tone`，金色卡是更暖的深棕 `--on-gold`）。

- 每个 hue 在暗色下都有一份降亮降饱和的对应值；
- **不要在组件里写 `background: #xxx` 或自己的 `linear-gradient`**；也不要自定义与 `.tone-*` 同名的类——scoped 样式带 `[data-v-*]`，优先级更高，会**静默覆盖全站色板**（PracticeView 曾因此用了一整页的 `#4a90d9` 蓝）。
- 卡面上叠了大号 emoji 装饰时，文字用 `--tone-ink-shadow` 抬起来。
- ⚠️ **`.tone-*` 与「自己上底色的全局类」互斥，绝不能挂在同一个元素上**：
  `.card` / `.field` / `.k-btn-*`。两套方案特异性同为 `(0,1,0)`，胜负只由 base.css 里的
  **先后顺序**决定；而输的一方不会整块失效——`background` 简写会重置 `background-color/image`，
  但 `color: var(--on-tone)` 不是它声明的，于是苟活下来 → **白底白字**。
  症状就是「整页看起来是空的卡片」（LessonMenu 曾如此，且只有金色的那张正常，
  因为 `.tone-gold` 把 `--on-tone` 改写成了深棕）。组件自己的卡面请用独立类名（如 `.tile`），
  不要借用 `.card`。守卫第 ④ 项会拦这一条。

### 2.5 遮罩与覆盖层

| Token | 用途 |
|-------|------|
| `--mask-bg` | 全屏查看器（图片/视频）遮罩，`rgba(8,10,18,.92)` |
| `--mask-bg-soft` | 底部抽屉遮罩，`rgba(0,0,0,.5)`——要让人看得见被压住的页面 |
| `--mask-ink` / `--mask-ink-soft` / `--mask-control` | 遮罩内的文字与圆钮。遮罩恒为深色，这三个值**不随主题变化** |
| `--overlay` | 彩色卡面上的浅色悬浮徽章底（完成角标等） |
| `--scrim` | 彩色卡面上的半透明**深色**小徽章（视频卡播放键）。卡色深浅不定，只有固定黑幕能保证白图标对比度 |

### 2.6 音乐播放器

播放器跟随主题：`--player-bg-*` / `--player-surface` / `--player-text*` 都已指向主题变量，新代码直接引用即可，不要再写 `#1e293b` 这类固定深色。

**播放页（磨耳朵播放中，`/listen` + `player.nowPlaying`）自己带完整播放控制，不依赖底栏**，因此进播放态时**隐藏底部导航**（规则在 `components/layout/nav-visibility.ts` 的 `shouldShowNav(path, nowPlaying)`，单测 `nav-visibility.test.ts` 锁死），页面高度按 `--nav-h: 0` 计算。播放页尺寸走三个专用 token：`--fs-emoji-hero`（大封面）、`--play-btn`（播放主键）、`--slider-thumb`（进度条滑块）。

> ⚠️ 隐藏底栏的条件**必须同时锚定路径**（只有 `path === "/listen"` 才可能隐藏）。`nowPlaying` 是脱离路由的全局状态，从歌词页用系统返回手势离开 `/listen` 时它不会自己复位；若写成「三个首页 && !nowPlaying」，`/course` 上整条底栏会一起消失——屏幕上没有任何 tab，孩子彻底无路可退。配套：`App.vue` 里 watch `route.path`，离开 `/listen` 时 `closeLyrics()`。


### 2.7 绝对色与玩法插画色板

以上 2.1–2.6 都是**语义色**（表示"这是什么/什么状态"，随主题反转）。
另有两组不是语义色的颜色，同样集中在 tokens.css，组件里只允许 `var(…)` 取用：

| 组 | 前缀 | 用途 |
|----|------|------|
| 绝对色 | `--white` / `--black` | 少数场合要的是"绝对的白与黑"：`color-mix()` 的计算端点、视频信箱底、`mask-image` 的实色、插画里本来就该是白的面。**压在彩色面上的文字请用 `--on-tone`**（暗色下是暖白），不要用 `--white` |
| 玩法插画色板 | `--scene-*` `--backdrop-*` `--talk-*` `--mic-*` `--chest-*` `--path-*` `--ring-*` | 装饰插画里的颜色：童谣舞台的五个场景、卡通背景的太阳与山丘、对话玩法的角色气泡与麦克风、宝箱的木纹与金饰 |
| 结算页 | `--star-gold` `--star-dim` `--streak-*` | 结算页的三颗星、连击达成横幅 |

插画色板是**刻意不随主题变化**的（场景就是那幅画）。要给某个玩法整体换配色，只改 tokens.css 一处即可。

**画在固定浅色面上的文字，必须用固定的深墨色**（`--talk-ink` / `--chest-ink`），
不能用 `--ink` / `--ink-soft`——它们在暗色主题会变成浅色，压在白/草绿气泡上就是白底白字
（实测 亲子对话框 `rgb(240,233,220)` on `rgb(255,255,255)`，对比度 1.05:1，完全不可读）。

金色实底（`--grad-gold`）在宝箱"收取"与语音页"再听一遍"两处共用——以前两处色值不同（`#f0a63a` vs `#f0b429`），已统一。
金底上的深棕字一律 `--on-gold`（历史散落的 `#6b4e00` / `#92400e` / `#b45309` 都已收编）。

**`--talk-*` 另有一组尺寸**（`--talk-bubble-fs` `--talk-pic` `--talk-av` `--talk-pad` `--talk-gap`
`--talk-bar-fs` `--talk-bar-h` `--talk-w`）。
为什么不用 `--fs-*` / `--gap-*`：那两组按 `min(vh, vw)` 取值，窄屏上一路压到最小值
（390 宽实测 `--fs-body=14px`、`--gap-s=6px`）。亲子对话的气泡是那块界面的主角，
跟着一起被压小就成了"占屏 70% 的大面板里装 15px 小字 + 140px 小图"。
这组锚 `vh`，窄屏不缩水；宽屏档（≥768px）再放大一档。**其他玩法要放大主元素时同理：
主角尺寸单独成组，别指望通用 token 在窄屏上留得出空间。**

**放大只放"内容"会露出层级倒挂**——2026-10-18 量出来：气泡已 18.7px，孩子每轮都要点的
录音键却写死 15px / 54px 高，主行动成了全屏最小的字；图下的单词标签 21px 反而比答句
18.7px 还大。所以又补了 `--talk-bar-fs` / `--talk-bar-h`：**主行动必须比它周围的文字大，
次要标签必须比它注解的句子小**。字号层级 = 信息层级。

奖励只有**一套**：宝藏罐（贝壳 + 英雄形态 + 贴纸）。2026-10-17 下线的「我的卡片」收集册
（`/me/cards`、`stores/cards`、`--rarity-*`）是并行维护的第二套货币，同一个孩子在两处看到
两种"我收集了什么"，说不清哪个才算数——**不要为了好玩再加一套收集系统**。

## 3. 间距

| Token | 用途 |
|-------|------|
| `--gap-xs` | 极小（图标内间距、徽章内边距） |
| `--gap-s` | 小（列表项之间、网格 gap） |
| `--gap-m` | 中（卡片内边距） |
| `--gap-l` | 大（大卡片内边距、区块间距） |
| `--pad-x` / `--pad-y` | 页面内边距（**只由 `.view` / `.lyrics-page` 这类页面壳负责一次**） |
| `--nav-h` | 底栏高度（`#app` 预留占位用） |

⚠️ 常见坑：`.view` 已经带了左右 `--pad-x`。子块再写一次 `padding: 0 var(--pad-x)` 就变成 **2 倍内缩**（ListenView 曾因此在 iPad 上两侧空掉近 100px）。

## 4. 圆角

| Token | 用途 |
|-------|------|
| `--radius` | 大卡片（课程卡、弹窗、抽屉、列表行） |
| `--radius-s` | 小卡片/按钮/图标砖 |
| `--radius-pill` | 胶囊（标签、进度条、正圆控件） |

正圆控件用 `.round` / `.round-sm`，**不要写 `border-radius: 50%`**——50% 在非正方元素上会拉成椭圆。

## 5. 字号与字重

| Token | 用途 |
|-------|------|
| `--fs-hero` | 大标题 / 结算页大数字 |
| `--fs-title` | 页面标题 / 图标尺寸（PathIcon 是 1em） |
| `--fs-body` | 正文 |
| `--fs-small` | 辅助说明 |
| `--fs-btn` | 按钮文字 |
| `--fs-emoji-xl` / `--fs-emoji-l` | 大 emoji |

字重只有三档：`400`（默认）、`--fw-mid: 700`、`--fw-strong: 800`。
⚠️ Baloo 2 的可变字重范围是 **400–800**，写 `font-weight: 900` 会触发浏览器"合成假粗体"，跨设备渲染不一致、中文发糊。**上限就是 `--fw-strong`。**

## 6. 阴影与立体

| Token | 语义 |
|-------|------|
| `--shadow-hard` | 贴在地面的**实心厚度**（中性卡片） |
| `--shadow-soft` | 更轻的实心厚度（次级卡片、徽章） |
| `--shadow-float` | **模糊型悬浮投影**（大图舞台、浮层） |
| `--shadow-chip` | **模糊型小控件**（箭头、胶囊、圆钮） |
| `--shadow-bar-up` | 贴底栏的向上投影 |
| `--sticker` | 彩色卡片的白描边（由 `.tone-*` 注入） |
| `--press` | 立体按钮的下压深度 |

- 中性卡片：`.card`
- 彩色卡片：`.tone-*`
- 按下：`transform: translateY(calc(var(--press) - 1px)) scale(0.97)`（`.tone-*` / `.k-btn` / `.entry-row` 已内置，页面不要再写）

## 7. 动效

| Token | 用途 |
|-------|------|
| `--dur-fast` (0.12s) | 按压反馈 |
| `--dur-base` (0.22s) | 普通过渡、抽屉进出 |
| `--dur-slow` (0.45s) | 弹入/结算/大元素位移 |
| `--ease-pop` / `--ease-out` / `--ease-in-out` / `--ease-bounce` | 弹性 / 减速 / 对称 / 强回弹 |

动画工具类：`.anim-pop` `.anim-bounce` `.anim-shake` `.anim-wiggle` `.anim-float` `.anim-fade-up`（都已处理 `prefers-reduced-motion`）。

## 8. 层级（z-index）

| Token | 用途 |
|-------|------|
| `--z-inner` (1) | 卡片内文字压住绝对定位的装饰 |
| `--z-banner` (9) | 页面内固定小挂件（主题/声音开关） |
| `--z-bar` (30) | 顶栏、歌词全屏页——**必须低于底部导航** |
| `--z-floating` (40) | 底部导航、组间过场横幅 |
| `--z-drawer` (95) | 抽屉 / 底部弹层 |
| `--z-mask` (100) | 全屏模态（图片查看器、视频播放） |

不要在组件里写裸数字 `z-index`。

## 9. 组件库

### 9.1 布局 / 导航

| 组件 | 路径 | 用途 |
|------|------|------|
| `BottomNav` | `components/layout/BottomNav.vue` | 底部三 tab（学习 / 磨耳朵 / 我的），三个都是 `<button>`。中间位**恒为磨耳朵入口**（全站唯一入口），整格只有一种行为 = 进/留在 `/listen`；**只有图标随播放状态变**：没在播 → 🎧，正在播 → 三根跳动的声波条（`--brand` 色，`prefers-reduced-motion` 下退化为静态高矮波）。**中间位不放播放/暂停键** |
| `SafeBottom` | `components/layout/SafeBottom.vue` | 底部安全距离共用容器 |
| `HeaderBar` | `components/layout/HeaderBar.vue` | **全站唯一子页面顶栏**；返回钮 `--tap-min` 正圆 + 标题占中列（flex 分配，装不下省略号）+ 右侧 `showBadges` 徽章或 `#right` 插槽。标题**不再绝对居中**：右侧簇宽的页面（课程详情 3 徽章+切换 ≈192px）在 390px 下绝对居中必然重叠，flex 中列让重叠在结构上不可能发生 |

### 9.2 通用 UI（③ 层）

| 组件 | 用途 |
|------|------|
| `PageShell` | **页面骨架**。`title/icon` + `@back` → 带顶栏；`bare` → 无顶栏首页；`scroll` → 内容超出可滚；`center` → 居中空态/结算；`fill` → 内容区交给页面参与 flex 分配 |
| `EmptyState` | 空状态（`title` + `desc` + `#icon` 插槽 + 默认插槽放按钮） |
| `EntryRow` | 入口行（图标砖 + 主/副文案 + 箭头 / `extra`）；`primary` 变体一页只能有一个 |
| `IconTile` | 图标砖（圆角色块 + lucide 图标），用于**界面装饰** |
| `EmojiTile` | emoji 底座，用于**内容本身**就是 emoji 的场合（歌曲/课程封面）。与 `IconTile` 分工见组件注释 |
| `MetricTile` | 指标块（大数字 + 小分母 + 标签） |
| `SectionTitle` | 页面级分区小标题（卡片组**之外**） |
| `SegmentedTabs` | 分段控件（正式课/加餐、歌曲/视频） |
| `SpeakWave` | 「正在朗读 / 正在播放」声波，`size: sm/md/lg`，`tone` 默认跟随 `currentColor` |
| `SpeakText` | 跟读文字展示 |
| `BaseButton` | 主按钮（`variant: green/blue/orange/gray`、`block`、`size: lg`）。**只做类名映射，样式全在 base.css** |
| `BaseDrawer` | 底部抽屉（`dark` 属性切深色） |
| `AppDialog` | 居中弹窗 |

### 9.3 领域组件（④ 层）

**玩法**：`WordCard` `QuizView` `SpeakView` `MatchView` `Pager` `SongView`/`SongStage` `TalkView` `LearnStage` `LessonFooter`
**玩法顶部信息行**：`StageHead`（左进度 `3 / 7`、右玩法标签）——**所有逐项推进的玩法都用它**，
进度位置因此是结构保证的一致；别在某个玩法里另造一条顶栏进度条（`TalkView` 曾这么干，
和「跟我读」的页内位置对不上，2026-10-17 收编）。
**课程**：`LessonMenu` `LessonProgressHeader` `LessonResult`
**奖励/报告/门禁**：`ChestReward` `MasteryTrend` `ParentGate`
**宝藏**：`HeroPoseStage` `HeroFormThumbs` `HeroInfoPanel` `HeroZoomViewer`

> `LessonQuestMap` 与 `LessonView` 的 `questMap` 阶段已于 2026-10 删除：闯关已改为独立的 `/course/:id/game`（本课地图，URL 归属课程域），课内不再画地图。

### 9.4 通用 CSS 类（② 层，base.css）

| 类 | 用途 |
|----|------|
| `.view` / `.view-body` / `.view-body--scroll` / `.view-center` / `.view-body--fill` | 页面容器（页面壳只负责一次，块之间不要再补 margin） |
| `.card` / `.card--soft` / `.card--flat` | 中性卡片（**与 `.tone-*` 互斥**，见 §2.4） |
| `.tone-*` | 彩色卡片 / 图标砖 / 徽章配色（**与 `.card` 等自带上底色的类互斥**） |
| `.entry-row` / `.entry-row--primary` / `.entry-row__*` | 入口行 |
| `.icon-tile` / `.icon-tile--sm` | 图标砖 |
| `.metric` / `.metric__*` | 指标块 |
| `.badge` + `.star-badge` / `.treasure-badge` / `.streak-badge` | 数字徽章（形状 + 配色分成两个类） |
| `.section-title` | 分区小标题（卡片组之外） |
| `.card-title` | 卡片内标题（卡片之内） |
| `.empty` / `.empty__title` / `.empty__desc` | 空状态 |
| `.field` | 表单输入（跟随主题） |
| `.k-btn` + `.k-btn-blue` / `.k-btn-orange` / `.k-btn-gray` / `.k-btn-green`(默认) / `.k-btn-block` / `.k-btn-lg` | 按钮 |
| `.progress` + `.fill` | 进度条 |
| `.round` / `.round-sm` | 正圆控件 |
| `.k-ico` | 图标（1em 见方，随 `font-size` 缩放） |
| `.anim-*` | 动画工具类 |

### 9.5 新增组件约定

- 放 `src/components/ui/`，命名 `BaseXxx.vue` 或语义名（`EmojiTile`）
- Props 用 `defineProps<{}>()`，事件用 `defineEmits`
- **组件自身不写 `.k-btn` / `.card` 这类全局类的样式**——那会让同一个类有两处定义（BaseButton 曾经如此）
- 样式 scoped + 只用 token

## 10. 布局约定

- 页面根：`<PageShell>`；需要"每个分支不同 body 类"的页面（如 ReviewView 三个分支）才直接用 `<div class="view">` + `.view-body`。
- **首页无顶栏**：`/course`、`/listen`、`/me` 用 `<PageShell bare>`。
- **带返回的二级页**：一律 `HeaderBar`（= `PageShell` 默认模式），答题中用 `close`（房子图标）。
- 底部导航只在三个首页显示；闯关入口在「我的」页。
- **磨耳朵播放中隐藏底栏**：`shouldShowNav()` 里只有 `path === "/listen" && nowPlaying` 才隐藏，其它路径永远保留（见 §2.6 的警告）。播放页自带播放/进度/歌词，再留一条底栏只会分走视线与纵向空间。
- **底栏中间位是磨耳朵的唯一入口**，它的第一职责是导航，任何播放状态下都不能失效——`/listen` 的 `router.push` 全站只出现在 `BottomNav.vue`。中间位**只表达状态、不承载动作**：播放中把图标换成声波条，整格点下去永远是导航。
- **tab 里不允许塞第二颗可点控件**。一颗带 `@click.stop` 的内层键会吃掉整格唯一的命中区（52px 图标位 ≈ 整格 60% 高度），而孩子不会精确区分"图标"与"空白"。暂停不需要这颗键：磨耳朵列表里当前那首自带 `.sr-play`，播放页有完整 transport。
- **键面必须等于行为**：长得像暂停键、点下去却是导航（或反过来）都是 bug。播放键只在磨耳朵页出现，那里点它真的暂停；别的 tab 上放的是 🎧 + 在播小圆点，点它就是导航。
- **tab 的命中区不能被内层控件吃掉**：`@click.stop` 的键若盖住整格唯一命中区（图标位约占整格 60% 高度），用户点上去只会触发那个键，导航形同消失。要么整格一个 handler（`onMiddle()` 按位置分派），要么把内层键缩到不会误导的尺寸。
- 带底栏页面的底部安全距离用 `SafeBottom`，不各自写 `env(safe-area-inset-bottom)`。

## 11. 三端适配

### 11.1 适配轴是「视口档位」，不是「设备型号」

同一台 iPad 在不同形态下落进不同档位，所以**不要按 PC / iPad / 手机拆适配文件**：

| 场景 | 视口 | 档位 | 若按设备拆文件 |
|---|---|---|---|
| iPad 横屏 | 1024×768 | wide · regular | PC 文件 |
| Mac 浏览器 | 1180×800 | wide · regular | PC 文件 |
| **iPad 分屏** | 507×768 | narrow · regular | 手机文件 ← 错配（它是 iPad，触控该给 64px） |
| **iPhone 横屏** | 844×390 | wide · tiny | PC 文件 ← 错配（宽够 768 但高只有 390） |
| iPhone 竖屏 | 390×844 | narrow · regular | 手机文件 |

档位定义在 `src/composables/useViewport.js`（模块级单例，避免 N 份 resize 监听），
阈值与 `tokens.css` 注释里的断点表一致：

- **宽**（决定列数）：`narrow` < 600 / `wide` ≥ 600
- **高**（决定行数与砍多少装饰）：`tiny` < 480 / `compact` < 640 / `regular` < 900 / `roomy` ≥ 900

### 11.2 三端的处理方式

- **手机**（竖屏）：按 `clamp(min(vh, vw))` 流体缩放，触控 ≥52px
- **iPad**：触控 ≥64px，内容居中限宽，间距/字号整体上调一档（`@media (min-width: 600px)`）
- **网页/Mac**：`#app` 限宽 1180px 居中 —— 所以 Mac 只是"wide + regular"，
  真正有 Mac/iPad 专属**结构**的只有 3 处：PracticeView（4 列宫格）、
  ListenView（grid 两栏重排）、LessonMenu（分列）

### 11.3 按「变的是什么」分层，不要按设备分文件

| 变化类型 | 做法 | 是否拆文件 |
|---|---|---|
| **值变**（尺寸/间距/字号） | 改 token，让 `clamp()` 流体缩放自己适应 | ❌ 不拆 |
| **样式变**（同一结构微调） | 留在组件 `<style>` 内的 `@media`，紧挨被覆盖的规则 | ❌ 不拆 |
| **结构变**（DOM 本身不同） | 拆成档位组件 `XxxView.landscape.vue` / `XxxView.tiny.vue` | ✅ 才拆 |

跨ViewController文件的适配文件不可取：Vue scoped 的 scope hash 让外部 CSS 够不到
组件内部类，只能 `:deep()` 或放弃 scoped（→ 特异性战争）；且组件改名/删除后，
适配文件里会**静默留存死规则**。同类坑已经踩过：§13 记着的
"LessonResult 曾有一份 48 行的逐字重复"。

### 11.4 允许的断点（超出即 CI 失败）

`scripts/guard-tokens.mjs` 检查项 ⑤ 强制执行，只有这 5 个：

```
(max-height: 480px)                              tiny   —— 手机横屏，压高度
(min-width: 600px)                               wide   —— iPad/Mac，token 放大一档
(min-width: 600px) and (orientation: portrait)   平板竖屏 —— 竖向大屏专属的值级放宽（2026-10-25 增）
(min-width: 768px) and (orientation: landscape)  宽横屏 —— 允许分栏 / 加列
(hover: hover) and (pointer: fine)               非触屏 —— hover 效果
(prefers-reduced-motion: reduce)                 无障碍 —— 与布局无关，单独放行
```

**一句话记法：改「值」用 600，改「结构」用 768 + landscape。**

- `600` = `useViewport.isNarrow`（`width < 600`）的同一刀口。只放大 token
  （字号/间距/触控/圆角），不改任何列数或分栏 —— 所以可以放心覆盖到 600 起的
  所有视口，包括 iPad mini 竖屏（744）和桌面窄窗。
- `768 + landscape` = 需要**真实横向余量**的结构改动（PracticeView 4 列宫格、
  ListenView 双栏重排）。故意不降到 600：iPhone SE 横屏是 667×375，
  一旦命中就会挤爆（4 列方形卡只露 1.5 行且无滚动提示）。

新增断点**必须**同时改三处：`BREAKPOINT_APPROVED`、本文档 §11.4，以及在
iPad 横向 / iPad 竖向 / iPad 分屏 / 手机竖向四个形态下验证。

### 11.5 已定案（2026-10-19）：600–767 宽的判定不一致 → 取方案 A

**曾经的矛盾**：`useViewport.isNarrow` 用 `width < 600`，而 CSS 的宽屏 token 放大
挂在 `min-width: 768px` —— 两者对 **600–767** 这一段给出的答案相反。

这一段是真实存在的设备：**iPad mini 竖屏 744×1133**。它上面会出现：

- JS 走"平板/桌面"分支（`fitLearnGrid`，按允许的最大卡片数分页）
- CSS 却是手机档（--tap-min 52px 而非 64px，课程网格 2 列而非 3 列）

实测截图确认：744 与 768 只差 24px，课程首页却是完全不同的两套构图。
`tokens.css` 顶部的断点表写的是「wide: width >= 600」，与 JS 一致 —— 说明是
**CSS 实现偏离了约定**，而不是约定本身有歧义。

**已采用方案 A（CSS 对齐 JS）**，改动如下：

| 文件 | 原 | 现 | 说明 |
|---|---|---|---|
| `styles/tokens.css` | `min-width: 768px` | `min-width: 600px` | 宽屏 token 档（值） |
| `components/game/GamePath.vue` | `min-width: 768px` | `min-width: 600px` | 地图限宽（值） |
| `views/learn/practice/PracticeView.vue` | `min-width: 768px` | `min-width: 600px` | 3 列宫格（值级列数，随档位） |
| 同上，4 列规则 | `768 + landscape` | **保持 768** | 结构改动，需真实余量（见 §11.4） |
| `views/listen/ListenView.vue` | `768 + landscape` | **保持 768** | 双栏重排，同上 |

**曾担心但实测不成立的缺口**：iPad 分屏 2/3 横屏约 678×768 —— 宽够 600 拿到宽屏
token，却够不到 768 拿不到播放页双栏。按 ListenView 注释里的「单列约 850px」推算
应该裁掉播放键，**实测 678×768 单列播放器完整装下**：封面与字号随宽度收缩，
总高远不到 850px（850 是 1024 宽下的数）。`layout-audit` 已把播放器纳入常驻页面
（`listen-player`），13 个视口全过，不会再靠推算。

### 11.6 断点收口完成（2026-10-25）：受控清单清零

五处旧值全部迁入批准清单（`BREAKPOINT_LEGACY` 已清空），迁移方式与实测依据：

| 文件 | 旧 | 新 | 实测 |
|---|---|---|---|
| base.css | `700 + portrait` 放宽留白 | `600 + portrait` | 600-700 竖屏（分屏 2/3 的 678 宽）新命中，split_two_thirds 视口验证 |
| LessonMenu | `900` → 4 列 | `768 + landscape` | 768-900 横屏（手机横屏 844）从 3 列变 4 列，phone 组验证 |
| MatchView | `max-width:600` 窄屏图片 74% | 反转为 mobile-first：默认 74%，`min-width:600` 覆盖 62%（原块内两条 flex 与基础样式同值，是死代码已删） | 行为等价 |
| MatchView | `600 + min-height:640` 方卡 | `600`（去掉高度门槛） | 手机横屏 667×375 / 844×390 实测棋盘自适应行数、方卡不溢出 |
| WordCard | `420/340` 藏点读图标 | `480`（批准 tiny 档） | 420-480 横屏机型一并隐藏（正是挤的形态）；<340 宽设备实际不存在 |

## 12. 暗色模式

- 由 `src/utils/theme.js` 切 `<html data-theme="dark">`
- 所有颜色用 CSS 变量自动适配
- **新增语义色必须在 `:root` 与 `:root[data-theme="dark"]` 各加一份**；语义上"两种主题下都该是同一个值"的（`--mask-*`、`--scrim`、`--white`/`--black`、玩法插画色板）只写 `:root`，并在注释里写明原因。

## 13. 禁止事项

- ❌ **样式里写 `#xxx` 颜色值**——颜色字面值只允许出现在 `src/styles/`（tokens.css / base.css），
  即唯一的"上色层"。检查对象是 `.vue` 的 `<style>` 与 `.css`；
  `rgba()` / `color-mix()` 这类带透明度的投影、描边不算"色板"，是光效，允许。
  不在检查范围的两类：JS 里必须给字面值的地方（canvas 彩带、`<meta theme-color>`）、
  `data/` 里的英雄配色素材（那是内容不是规范）。
- ❌ 判定/完成语义用 `--brand`——**必须 `--ok`（绿）**
- ❌ 写死像素间距/字号/圆角（用 `--gap-*` / `--fs-*` / `--radius*`）
- ❌ 自己写卡片渐变/阴影（用 `.tone-*` / `--shadow-*`）
- ❌ 自定义与全局同名的类（`.tone-*`、`.card`、`.star-badge`…）——scoped 会静默覆盖
- ❌ **同一个元素上同时挂 `.tone-*` 和 `.card` / `.field` / `.k-btn-*`**——两套上色方案互相覆盖，
  结果是**白底白字**（LessonMenu 的整页空白卡片就是这么来的；只有金卡侥幸可见）
- ❌ 组件自己的卡面借用 `.card` 这个全局中性卡片类——想有独立外观就用独立类名（如 `.tile`）
- ❌ 引用 tokens.css 里不存在的变量（`var(--tint)` 曾让抽屉关闭按钮一直没有底色）
- ❌ 写 `var(--x, 兜底值)` 来"假装"变量存在——兜底掩盖了变量名写错（`--yellow, #ffd87a` 就是这种情况）
- ❌ 把 CSS 写在 `</style>` 之后——**SFC 解析器不报错，直接丢弃**（GamePath 曾因此丢掉 31 行 `.lv-guide`，线上从未生效）
- ❌ 把整块规则复制第二遍放在媒体查询里（LessonResult 曾有一份 48 行的逐字重复）——要覆盖就只写要覆盖的那几条
- ❌ `border-radius: 50%`（用 `.round`）
- ❌ **全局 `button` reset 只清 `border` 不清 `background`**——浏览器会给 `<button>` 兜底 `buttonface` 灰（`rgb(239,239,239)`），于是「是按钮」的 tab / 抽屉行偷露灰底，而旁边同款的 `<div role="tab">` 没有，一行里深浅不一（底栏三 tab 曾因此左右灰、中间白）。base.css 的 `button` reset 必须带 `background: transparent`；任何自绘按钮类也要显式给 `background`。
- ❌ `font-weight: 900`（超出 Baloo 2 的 400–800 范围）
- ❌ 在 `.view` 内部再补一次 `--pad-x`
- ❌ 底部导航出现在非首页；首页出现顶栏
- ❌ 让某状态下 tab 变得不可导航（如「有歌就整体换成播放键」，命中区被 `@click.stop` 的键吃掉）——tab 的第一职责是导航，任何状态都不能失效
- ❌ 在 tab 里塞第二颗可点控件（内层键会吃掉整格命中区）——状态用**图标形状 + 动画**表达，不要借一颗可点控件的脸
- ❌ 把主题态文字色（`--ink` / `--ink-soft` / `--ink-faint`）用在**固定浅色的插画面**上（对话气泡、宝箱、舞台场景）——暗色主题下变浅色即白底白字，要用 `--talk-ink` / `--chest-ink` 这类固定深墨色。同一条踩过两次：先是气泡里的 `--ink`（1.05:1），再是"宝宝"小标签的 `--ink-faint`（亮色 2.19:1 / 暗色 3.47:1）
- ❌ **在 `overflow: auto` 的 flex 容器上写 `justify-content: flex-end`**（想让"消息/列表沉底"）——flex 的经典陷阱：内容一超出就被顶到起始边**之上**，`scrollHeight` 仍等于 `clientHeight`、`scrollTop` 恒为 0，**永远滚不回去**。亲子对话 5 条消息时首条落在 -766px，家长问句再也看不到。要沉底就给首个子项 `margin-top: auto`（内容超出时余量归零，溢出方向变回向下）
- ❌ 用**脱离路由的全局状态**决定导航可见性（`showNav` 曾因 `nowPlaying` 残留，在 `/course` 上整条底栏消失）——可见性判断必须有路径锚点
- ❌ 键面写"按住…"却只接 `@click`（点击切换）——键面必须等于行为。`LearnStage` / `TalkView` 的麦克风键与 `useSpeechSession` 注释都曾写"按住说话，松开停止"，实际是点一下开始、再点一下结束

## 14. 守卫（把规范变成会失败的检查）

`frontend/scripts/guard-tokens.mjs` 检查五件事，前四项任何一项都会让 CI 失败：

1. 引用了不存在的 CSS 变量（且没有 fallback）——这类声明会被**静默丢弃**
2. **样式里的硬编码颜色**：`.vue` 的 `<style>` / `.css` 中除 `src/styles/` 之外一个都不许有
3. `.vue` 里有"飘"在 `<template>`/`<script>`/`<style>` 之外的代码——典型是 `</style>` 写早了，
   解析器**不报错、直接丢弃**
4. **同一个元素上把 `.tone-*` 和「会自己上底色的全局类」混用**——会互相覆盖成白底白字。
   互斥清单（`.card` / `.field` / `.k-btn-*`）不写死在脚本里，而是**从 base.css 现推**：
   凡是单类选择器且声明里带 `background` 的，就是独立的一套上色方案；以后新增这类面类自动纳入。
5. **使用了白名单外的 `@media` 断点**（详见 §11.4）——布局由视口档位决定，
   散落的魔法数字会让"改一个档位"变成靠人肉 grep 同步的活儿。
   当前登记在 `BREAKPOINT_LEGACY` 的旧断点**只告警不阻断**，收口一项就从清单删一项。

前四项是构建、类型检查、单测全都看不见的静默失效，只有真机看一眼才发现
「某个底色/描边/文字没了」。所以它们的价值全在于"不用靠人肉走查发现"。

2026-10 分四批推进，当前状态：**除 `src/styles/` 外，整个 `src/` 零硬编码颜色**
（views → components/ui+layout → activities/rewards/game/CuteBackdrop → lesson/gate，已全部收口）。

接入点：
- `npm run build:ci`（`guard-build` → `validate-data` → `guard-tokens` → `vite build`）——CI 跑的就是它
- `npm run guard:tokens` 单独跑
- `scripts/ci-local.sh --commit`：暂存区含 `.vue`/`.css`/`.js`/`.mjs` 时自动跑一次

