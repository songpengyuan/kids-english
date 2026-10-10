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

### 2.2 品牌色

| Token | 用途 |
|-------|------|
| `--green` | 主按钮（确认/继续） |
| `--blue` | 次要操作（返回/信息） |
| `--yellow` | 进度条/高亮 |
| `--red` | 错误/删除 |
| `--purple` / `--orange` / `--pink` / `--teal` | 彩色卡片 |

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
| `--player-accent` | `#4ade80`（高亮/进度） |

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

| 组件 | 路径 | 用途 |
|------|------|------|
| `AppHeader` | `components/layout/AppHeader.vue` | 顶栏（标题+徽章+返回） |
| `BottomNav` | `components/layout/BottomNav.vue` | 底部三tab |
| `BaseButton` | `components/ui/BaseButton.vue` | 主按钮（variant: green/blue/orange/gray, block, size: lg） |
| `BaseDrawer` | `components/ui/BaseDrawer.vue` | 底部抽屉（dark属性切深色） |
| `AppDialog` | `components/ui/AppDialog.vue` | 居中弹窗 |
| `ChestReward` | `components/rewards/ChestReward.vue` | 开宝箱 |

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

- 页面根：`<div class="view">`
- 内容区：`<div class="view-body">`
- 顶栏：`<AppHeader title="xxx" />`（`hide-badges` 隐藏徽章，`show-back` 显示返回）
- 底部导航只在 `/learn` `/listen` `/me` 三个首页显示
- 子页面（课程、答题、宝藏等）不显示底部导航，沉浸进入

## 10. 暗黑模式

- 由 `src/utils/theme.js` 切换 `<html data-theme="dark">`
- 所有颜色用 CSS 变量，自动适配
- 播放器是固定深色主题，不随系统切换
- 新增颜色时必须在 `:root` 和 `:root[data-theme="dark"]` 各加一份

## 11. 禁止事项

- ❌ 组件里写 `#xxx` 颜色值（播放器深色主题除外，用 `--player-*` 变量）
- ❌ 写死像素间距（用 `--gap-*`）
- ❌ 自己写卡片渐变/阴影（用 `.tone-*` 或 `--shadow-hard`）
- ❌ 底部导航出现在非首页
