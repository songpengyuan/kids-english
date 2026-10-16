# Kids English 设计系统规范

## 1. 设计原则

- **儿童优先**：触控目标 ≥52px（手机）/64px（iPad），圆角大，颜色饱和
- **一屏装下**：不滚动页面为主，尺寸用 `clamp(min(vh, vw))` 流体自适应
- **立体可爱**：卡片用 `box-shadow: 0 press 0 deep-color` 做出厚度，按下下沉
- **少即是多**：每页不超过 3 个主要交互元素，避免孩子迷路

## 2. 颜色体系

### 2.1 中性色（亮色/暗黑自动切换）

| Token | 用途 | 亮色 | 暗黑 |
|-------|------|------|------|
| `--bg` | 页面背景 | `#fdf6e3` | `#171c2b` |
| `--card-bg` | 卡片/按钮面 | `#ffffff` | `#242b40` |
| `--ink` | 主文字 | `#4a3f35` | `#f0e9dc` |
| `--ink-soft` | 次要文字 | `#8a7f6f` | `#b0a99c` |
| `--ink-faint` | 弱化文字 | `#a89b86` | `#7f7a70` |
| `--line` | 分割线/轨道 | `#e8e0cf` | `#39415a` |

**禁止**在组件里写 `color: #fff` 或 `background: #333`，一律用变量。

### 2.2 品牌色（水蓝系，2026-10-15 起脱离多邻国绿）

**品牌主色** = `--brand`（**新代码一律用 `--brand` 系列**；`--green`/`--green-dark` 为历史别名，仅兼容旧组件，tokens.css 中已改为 `var(--brand)` 引用，勿再用于新代码）：

| Token | 用途 | 亮色 | 暗黑 |
|-------|------|------|------|
| `--green` | 品牌主色（主按钮/进度/导航/选中） | `#00a3ff` | `#2f9fe0` |
| `--green-dark` | 立体投影/按压 | `#0086d6` | `#237bb0` |

**品牌辅助色 `--brand*`**（组件禁止写死 `#1e7fd0` 等，一律用 token）：

| Token | 用途 | 亮色 | 暗黑 |
|-------|------|------|------|
| `--brand` | 品牌主色（推荐使用） | `#00a3ff` | `#2f9fe0` |
| `--brand-dark` | 投影/按压 | `#0086d6` | `#237bb0` |
| `--brand-deep` | 渐变端点/强调文字 | `#1e7fd0` | `#1a5c8f` |
| `--brand-bright` | 渐变亮端/高亮 | `#6cc3f5` | `#7cc7f0` |
| `--brand-soft` | 柔和底（选中/浅蓝卡） | `#e3f5ff` | `#16344d` |
| `--brand-tint` | 更浅提示底 | `#d6efff` | `#1d3f5e` |
| `--brand-grad` | 标准品牌渐变（Hero/主卡/选中 tab） | `135deg #1e7fd0→#38a3e8→#6cc3f5` | `135deg #1a5c8f→#2f9fe0→#7cc7f0` |

**语义反馈色 `--ok`（正确=绿，独立于品牌蓝，防止孩子对错认知被污染）**：

| Token | 用途 | 亮色 | 暗黑 |
|-------|------|------|------|
| `--ok` | 答对/完成/成功（边框、背景、文字） | `#58cc02` | `#7cc94a` |
| `--ok-dark` | 立体投影/深色文字 | `#46a302` | `#5fa838` |

**语义二分硬规则**：
- **判定/完成类**（答题答对、发音 perfect、配对完成线、宝箱收取/已收集、成功徽章、报告正确统计、掌握上升、今日目标完成、词卡已听过）→ **必须 `--ok`（绿）**；
- **进度/导航类**（关卡线、进度段、弹窗进度点、磨耳朵声波、主按钮、底部导航、翻页、Hero）→ **品牌蓝 `--green`/`--brand*`**；
- 两者不可互换，走查时逐一核对。

其余功能色：`--blue` 次要操作、`--yellow` 进度高亮、`--red` 错误/删除、`--purple`/`--orange`/`--pink`/`--teal` 彩色卡片。

### 2.3 卡片色调板（6色，唯一色源）

用 `.tone-blue` / `.tone-green` / `.tone-orange` / `.tone-purple` / `.tone-pink` / `.tone-teal` 类，**不要**自己写 `background: #xxx`。

```html
<button class="act tone-green">开始</button>
```

### 2.4 音乐播放器（固定深色，不随主题切换）

| Token | 值 |
|-------|-----|
| `--player-bg-1` | `#1e293b`（顶部） |
| `--player-bg-2` | `#0f172a`（底部） |
| `--player-text` | `#ffffff` |
| `--player-text-soft` | `rgba(255,255,255,0.5)` |
| `--player-text-faint` | `rgba(255,255,255,0.3)` |
| `--player-accent` | `var(--green)`（高亮/进度，随品牌水蓝，不再固定 #4ade80） |

## 3. 间距体系

所有间距用流体变量，**禁止写死 px**：

| Token | 用途 |
|-------|------|
| `--gap-xs` | 极小（图标内间距） |
| `--gap-s` | 小（列表项间距） |
| `--gap-m` | 中（卡片间距） |
| `--gap-l` | 大（区块间距） |
| `--pad-x` | 页面左右边距 |
| `--pad-y` | 页面上下边距 |

## 4. 圆角

| Token | 用途 |
|-------|------|
| `--radius` | 大卡片（课程卡、弹窗） |
| `--radius-s` | 小卡片/按钮 |
| `--radius-pill` | 胶囊（标签、进度条） |

## 5. 字号

| Token | 用途 |
|-------|------|
| `--fs-hero` | 大标题（结算页） |
| `--fs-title` | 页面标题 |
| `--fs-body` | 正文 |
| `--fs-small` | 辅助说明 |
| `--fs-btn` | 按钮文字 |
| `--fs-emoji-xl/l` | 大 emoji |

## 6. 阴影与立体

- 卡片：`box-shadow: var(--shadow-hard)`
- 彩色卡片：用 `.tone-*` 类自动注入
- 按压：`transform: translateY(calc(var(--press) - 1px)) scale(0.97)`

## 7. 动效

| Token | 用途 |
|-------|------|
| `--dur-fast` (0.12s) | 按压反馈 |
| `--dur-base` (0.22s) | 普通过渡 |
| `--dur-slow` (0.45s) | 弹入/结算 |
| `--ease-pop` | 弹性回弹 |
| `--ease-out` | 标准减速 |

动画工具类：`.anim-pop` `.anim-bounce` `.anim-shake` `.anim-wiggle` `.anim-fade-up`

## 8. 组件库

### 8.1 已有组件

**布局/导航**
| 组件 | 路径 | 用途 |
|------|------|------|
| `BottomNav` | `components/layout/BottomNav.vue` | 底部三tab（学习/磨耳朵/我的），激活态水蓝 |
| `SafeBottom` | `components/layout/SafeBottom.vue` | 手机/iPad 底部安全距离共用容器（所有带底栏页面包一层） |
| `HeaderBar` / `AppHeader` | `components/layout/*.vue` | 课程内/答题页顶栏（首页 /learn /listen /me **不使用**） |

**通用 UI**
| 组件 | 路径 | 用途 |
|------|------|------|
| `BaseButton` | `components/ui/BaseButton.vue` | 主按钮（variant: green/blue/orange/gray, block, size: lg） |
| `BaseDrawer` | `components/ui/BaseDrawer.vue` | 底部抽屉（dark属性切深色） |
| `AppDialog` | `components/ui/AppDialog.vue` | 居中弹窗 |
| `SegmentedTabs` | `components/ui/SegmentedTabs.vue` | 分段控件（正式课/加餐切换，滑块用 `--brand-grad`） |
| `SpeakText` | `components/ui/SpeakText.vue` | 跟读文字展示 |

**玩法组件（activities/）**
| 组件 | 用途 |
|------|------|
| `WordCard` | 词卡（可点发音，已听过角标 `--ok`） |
| `QuizView` | 选择题（答对 `--ok`/答错红） |
| `SpeakView` | 跟我读（评分 perfect=绿 `--ok`） |
| `MatchView` | 连一连（完成连线/横幅 `--ok`） |
| `Pager` | 翻页 + 圆点 |
| `SongView` / `SongStage` | 唱歌页（进度渐变蓝） |
| `TalkView` | 亲子对话 |
| `LearnStage` | 学习弹窗（进度点蓝） |
| `LessonFooter` | 底部主按钮（灰→蓝状态机；成功徽章 `--ok`） |

**课程/关卡**
| 组件 | 用途 |
|------|------|
| `LessonMenu` | 课程菜单 |
| `LessonQuestMap` | 关卡地图（已通光线品牌蓝） |
| `LessonProgressHeader` | 关卡进度头（完成段品牌蓝） |
| `LessonResult` | 关卡总结 |

**奖励/报告/门禁**
| 组件 | 用途 |
|------|------|
| `ChestReward` | 开宝箱（收取页/已收集 `--ok` 绿） |
| `MasteryTrend` | 掌握度趋势（上升 `--ok`） |
| `ParentGate` | 家长算术门禁（答对 `--ok`） |
| `GateView` | 应用入口口令门禁（家长手机号） |

### 8.2 通用CSS类（base.css）

| 类 | 用途 |
|----|------|
| `.k-btn` | 主按钮（`.blue` `.orange` `.gray` 变体） |
| `.progress` | 进度条 |
| `.view` / `.view-body` / `.view-center` | 页面容器 |
| `.k-ico` | 图标（1em 见方） |

### 8.3 新增组件约定

- 放 `src/components/ui/` 下
- 命名：`BaseXxx.vue`（基础组件）
- Props 用 `defineProps<{}>()`，事件用 `defineEmits`
- 样式用 scoped + CSS变量，不硬编码颜色

## 9. 布局约定

- 页面根：`<div class="view">`；内容区：`<div class="view-body">`
- **首页无顶栏**：`/learn`（学习）、`/listen`（磨耳朵）、`/me`（我的）三首页不显示 HeaderBar/AppHeader（2026-10-15 起）；`/me` 顶部补刘海安全区 padding-top
- 课程内/答题页顶栏：`<AppHeader title="xxx" />`（`hide-badges` 隐藏徽章，`show-back` 显示返回），答题页 = 关闭按钮 + 顶部进度条
- 底部导航只在 `/learn` `/listen` `/me` 三个首页显示；**闯关挑战入口在「我的」页**（stat-row 下紫色卡片）
- 手机/iPad 底部安全距离：所有带底栏页面用共用组件 `SafeBottom` 包裹，不各自写 `env(safe-area-inset-bottom)`
- 子页面（课程、答题、宝藏等）不显示底部导航，沉浸进入

## 9.1 三端适配

- **手机**（竖屏，主场景）：内容按 `clamp(min(vh, vw))` 流体缩放，触控 ≥52px
- **iPad**：触控 ≥64px，内容居中限宽，底栏高度加 SafeBottom
- **网页/Mac**：内容区限宽居中（~720px），卡片可横向排列更多列

## 10. 暗黑模式

- 由 `src/utils/theme.js` 切换 `<html data-theme="dark">`
- 所有颜色用 CSS 变量，自动适配；品牌辅助色 `--brand*` 与语义色 `--ok` 在 `:root[data-theme="dark"]` 有对应降亮降饱和值（深水蓝 `--brand-deep:#1a5c8f` 等、暗绿 `--ok:#7cc94a`）
- 播放器是固定深色主题，不随系统切换
- 新增颜色时必须在 `:root` 和 `:root[data-theme="dark"]` 各加一份

## 11. 禁止事项

- ❌ 组件里写 `#xxx` 颜色值（播放器深色主题除外，用 `--player-*` 变量）
- ❌ 判定/完成语义（答对、perfect、配对成功、已收集、目标完成）用 `--green`——**必须 `--ok`（绿）**，避免孩子对错认知被品牌蓝污染
- ❌ 写死像素间距（用 `--gap-*`）
- ❌ 自己写卡片渐变/阴影（用 `.tone-*` / `--shadow-hard` / `--brand-grad`）
- ❌ 底部导航出现在非首页
- ❌ 首页（/learn /listen /me）出现顶栏
