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
| `BottomNav` | `components/layout/BottomNav.vue` | 底部三 tab（学习 / 磨耳朵 / 我的）；播放中中间位升级为迷你播放条 |
| `SafeBottom` | `components/layout/SafeBottom.vue` | 底部安全距离共用容器 |
| `HeaderBar` | `components/layout/HeaderBar.vue` | **全站唯一子页面顶栏**；返回钮 `--tap-min` 正圆 + 标题绝对居中 + 右侧 `showBadges` 徽章或 `#right` 插槽 |

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
**课程**：`LessonMenu` `LessonProgressHeader` `LessonResult`
**奖励/报告/门禁**：`ChestReward` `MasteryTrend` `ParentGate`
**宝藏**：`HeroPoseStage` `HeroFormThumbs` `HeroInfoPanel` `HeroZoomViewer`

> `LessonQuestMap` 与 `LessonView` 的 `questMap` 阶段已于 2026-10 删除：闯关已改为独立的 `/game/lesson/:id`，课内不再画地图。

### 9.4 通用 CSS 类（② 层，base.css）

| 类 | 用途 |
|----|------|
| `.view` / `.view-body` / `.view-body--scroll` / `.view-center` / `.view-body--fill` | 页面容器（页面壳只负责一次，块之间不要再补 margin） |
| `.card` / `.card--soft` / `.card--flat` | 中性卡片 |
| `.tone-*` | 彩色卡片 / 图标砖 / 徽章配色 |
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
- 带底栏页面的底部安全距离用 `SafeBottom`，不各自写 `env(safe-area-inset-bottom)`。

## 11. 三端适配

- **手机**（竖屏，主场景）：按 `clamp(min(vh, vw))` 流体缩放，触控 ≥52px
- **iPad**：触控 ≥64px，内容居中限宽，间距/字号整体上调一档（`@media (min-width: 768px)`）
- **网页/Mac**：`#app` 限宽 1180px 居中

## 12. 暗色模式

- 由 `src/utils/theme.js` 切 `<html data-theme="dark">`
- 所有颜色用 CSS 变量自动适配
- **新增颜色必须在 `:root` 与 `:root[data-theme="dark"]` 各加一份**；语义上"两种主题下都该是同一个值"的（`--mask-*`、`--scrim`）只写 `:root`，并在注释里写明原因。

## 13. 禁止事项

- ❌ 组件里写 `#xxx` 颜色值（唯一例外：遮罩内的白/黑是刻意的，用 `--mask-*` / `--scrim`）
- ❌ 判定/完成语义用 `--brand`——**必须 `--ok`（绿）**
- ❌ 写死像素间距/字号/圆角（用 `--gap-*` / `--fs-*` / `--radius*`）
- ❌ 自己写卡片渐变/阴影（用 `.tone-*` / `--shadow-*`）
- ❌ 自定义与全局同名的类（`.tone-*`、`.card`、`.star-badge`…）——scoped 会静默覆盖
- ❌ 引用 tokens.css 里不存在的变量（`var(--tint)` 曾让抽屉关闭按钮一直没有底色）
- ❌ `border-radius: 50%`（用 `.round`）
- ❌ `font-weight: 900`（超出 Baloo 2 的 400–800 范围）
- ❌ 在 `.view` 内部再补一次 `--pad-x`
- ❌ 底部导航出现在非首页；首页出现顶栏
