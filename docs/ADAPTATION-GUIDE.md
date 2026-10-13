# 三端适配 + 暗黑主题 · 开发规范

> 本文件是「手机 / iPad / 网页端三端适配」与「暗黑主题」的**开发时硬约束**。
> 面向 5 岁孩子：大触控、一屏装下、可朗读、少点几下。
> 事实源：`src/styles/tokens.css`（颜色/字号 token）、`src/styles/base.css`（布局体系）、
> `src/components/layout/SafeBottom.vue`（底部安全区）。配套文档：`DESIGN-GUIDELINES.md`（交互设计）、`cross-device-testing.md`（测试计划）。

---

## 1. 三端目标与视口矩阵

| 端 | 视口（CSS px） | 布局策略 |
|---|---|---|
| iPhone（SE~Pro Max） | 375×667 ~ 430×932 | 默认紧凑档（单列卡片、2×2 选项格） |
| iPhone 横屏 | 844×390 | `@media (max-height:480px)` 矮屏档：收紧纵向、横向放宽 |
| iPad 竖屏 | 768×1024 | `@media (min-width:700px) and (orientation:portrait)`：`--pad-x` 放宽到 `clamp(20px,4vw,56px)`，课程卡可多列 |
| iPad 横屏 | 1024×768 | 宽而矮，靠 `min(Avh,Bvw)` 尺寸体系防空洞/防溢出 |
| 桌面 Web | 1440×900 / 2560×1440 | `#app` `max-width:1180px` 居中，内容不无限拉宽 |

**核心原则：一屏装下、不滚动**（参考多邻国）。词卡/选择题等一屏放不下的内容用**分页圆点**，不用滚动。

## 2. 布局体系（改样式前先读）

- `#app`：`max-width:1180px` 居中；`height:100dvh`；底部为 `--nav-h + env(safe-area-inset-bottom)` 预留。
- `.view`：玩法页/首页根容器（flex column）；`.view-body`（flex:1 占满剩余）；`.view-center`（**已含 `display:flex;flex-direction:column`**，用于结算/空态居中——不要删）。
- 尺寸一律用 token 与 `min(Avh, Bvw)` / `clamp()`，**禁止在组件里硬编码像素/颜色**（详见 DESIGN-GUIDELINES 第 3 节）。
- 滚动页：滚动条贴最右，内容居中；关卡地图课程标题 `gp-unit` 滚动吸顶（`.u-bar` 即吸顶条，注意不要脱离文档流遮挡内容）。

## 3. 安全区规范（手机/iPad 全面屏）

- **底部**：需要贴底留安全距离的容器用 `SafeBottom` 组件（`margin-top:auto` 推底 + `padding-bottom:max(var(--safe-gap,16px), env(safe-area-inset-bottom,0px)) !important`）。
  - ⚠️ 坑：同元素其他 class 用 `padding` **简写**会覆盖安全间距 → 迁移处把简写拆成 `padding-top/left/right`。
  - ⚠️ jsdom 不支持 `margin:auto` 与 `env()` 计算值 → SafeBottom 的测试只断行为不断样式。
- **顶部**：HeaderBar / AppHeader 带 `env(safe-area-inset-top)`；课程内答题页顶栏 = 关闭按钮 + 顶部进度条（进度条全页只有顶部一条）。
- **底部导航**（BottomNav）：固定底部、毛玻璃（`--bar-bg` + `--bar-blur(14px)`），点击区域 ≥ 64px。

## 4. 暗黑主题体系

### 4.1 机制
- 主题通过 `src/services/theme.js` 在 `<html>` 上切 `data-theme="dark"`。
- 优先级：用户手动选择（localStorage `kids-english-theme`）> 系统偏好（`prefers-color-scheme`）。
- `tokens.css` 里 `:root[data-theme="dark"]` 统一覆盖中性色（底/面/字）与 6 个卡片 hue（降亮度、降饱和，避免深底上"发光"刺眼）。

### 4.2 组件内暗色覆盖的规则
1. **默认走 token**：背景用 `--bg/--card-bg`，文字用 `--ink/--ink-soft/--ink-faint`，状态用 `--state-*`。走 token 的组件**不需要**写 dark 覆盖（token 自己会变）。
2. **只有硬编码了字面量颜色时才需要覆盖**，且覆盖块必须挂在 `:root[data-theme="dark"]` 下：
   ```css
   /* 例：动画场景里的纯白云朵，深底上刺眼 → 降透明度成夜云 */
   :root[data-theme="dark"] .cloud {
     background: rgba(235, 240, 250, 0.16);
   }
   ```
3. **装饰性小元素**（云朵、波浪、星光、金色角标、彩色小徽章）可保持亮色或轻微降透明度，**大面积白底/高亮色必须调暗**。
4. **状态色提亮**：暗色下 14% 透明度的高亮底色几乎不可见（如 `.spk.on` 蓝色选中态），暗色下提亮到 ~30%。

### 4.3 已知无需覆盖（已核实）
- `AppHeader.treasure-badge`：金色渐变底 + 深棕字，对比度独立于主题 ✓
- `GamePath.lv-star` 白色小角标：19px 徽章，暗色下保持白底 ✓
- `BaseDrawer` 黑色遮罩 `rgba(0,0,0,0.5)`：两主题通用 ✓

## 5. 每次改动后的走查清单（AI / 开发者通用）

### 布局
- [ ] 手机视口（≤430px）：无横向滚动（`scrollWidth <= clientWidth`）
- [ ] iPad 竖屏（768px）：`--pad-x` 放宽生效、多列不挤
- [ ] 桌面：`max-width:1180px` 居中
- [ ] 触控目标：主操作 ≥ 44×44px（顶栏返回/日历箭头等次级控件可 ≥36px）
- [ ] 顶栏返回 = 关闭图标（课程内答题页），无多余进度条

### 暗黑
- [ ] 切 `data-theme="dark"` 后：底/面/字对比度正常、大面积白底不刺眼
- [ ] 新增的**字面量颜色**是否已补 `:root[data-theme="dark"]` 覆盖（见 4.2）
- [ ] 彩色卡片 hue 在暗色下不"发光"

### 安全区
- [ ] 贴底容器用 SafeBottom，外部 class 不用 padding 简写
- [ ] 顶部不被刘海/灵动岛挡

## 6. 本次全界面走查结论（2026-10-13）

- **手机 390×844**：12 个主路由（学习/游戏地图/课程页/quiz/match/speak/磨耳朵/我的/连击/宝藏库/英雄/复习/歌词）全部**无横向溢出** ✓
- **iPad 768×1024**：主页/游戏地图/quiz/磨耳朵抽查无溢出 ✓
- **桌面 1280**：主要页面走查正常 ✓
- **暗黑**：主要页面全部正常；补漏 2 处 → SongStage 动画云朵、SpeakText 选中态（已修复）
- 已知次级小触控（低优先）：日历箭头 36px、英雄形态切换点 9px、顶栏返回 36px

## 7. 禁区（历史踩过的坑）

1. `.view-center` 缺 `display:flex` → align/justify 全部失效、内容偏左上（2026-10-13 已修，勿删）。
2. SafeBottom 上的 `padding` 简写会踩掉安全间距（2026-09 实测）。
3. `backface-visibility` 在项目渲染内核失效 → 翻卡用"翻转中点切换 visibility"方案，不要改用 perspective/inline 尝试。
4. 并行 agent 编辑时模板 `:class` 出现双引号嵌套 `{ "x": y }` → 语法错被 pre-push 拦截；模板属性内统一用单引号包对象键。
