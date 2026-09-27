# 组件库规范（Component Library）

> 目标：**沉淀可复用的 UI，杜绝"手写第二份"**。
> 阅读对象：AI 生成者、开发者、走查者。与 [DESIGN-GUIDELINES.md](./DESIGN-GUIDELINES.md)（设计总纲）、`src/styles/tokens.css`（视觉 token）配套使用。
>
> **一句话原则**：先找组件，再写代码；新组件进库要过门槛，页面里出现的 UI 只允许"用组件"和"造新组件"两种来源，不允许"复制样式重写一遍"。

---

## 1. 目录约定（组件进哪里）

| 目录 | 放什么 | 例子 |
|---|---|---|
| `src/components/layout/` | 全局框架件：顶栏、底栏、全局开关 | `AppHeader`、`HeaderBar`、`BottomNav`、`SoundToggle`、`ThemeToggle` |
| `src/components/activities/` | 学习玩法（一课内的子玩法/环节） | `LearnView`、`QuizView`、`MatchView`、`SpeakView`、`SongView`、`WordCard`、`Pager`、`LessonFooter` |
| `src/components/game/` | 游戏闯关模式专属 | `GamePath` |
| `src/components/lesson/` | 课内流程件（菜单/结算等） | `LessonResult` |
| `src/components/rewards/` | 奖励反馈（开箱/庆祝） | `ChestReward` |
| `src/components/treasure/` | 宝藏/英雄图鉴 | `HeroFormCard` |
| `src/components/report/` | 家长报告图表 | `MasteryTrend` |
| `src/components/ui/` | 跨页面复用的通用件（按钮、卡片、徽章等） | `AppDialog`、`CuteBackdrop`（逐步把高复用件收进来） |
| `src/views/` | 页面（路由级），**不放可复用件** | `HomeView`、`MyView`、`HeroDetailView`… |

## 2. 现有组件清单（先查这里，再决定造不造）

**顶栏/导航（页面头部一律从这里选，禁止手写 topbar）**
- `AppHeader` —— **主 tab 页**顶栏（学习/游戏/我的）：左侧 tab 名 + 右侧⭐🐚🔥徽章，无返回按钮。
- `HeaderBar` —— **子页面**顶栏：返回按钮（左）+ 标题（**绝对居中**，与右侧徽章无关）+ 右侧插槽。子页面返回去向由父组件决定。
- `BottomNav` —— 底部三 tab 导航（学习/游戏/我的）；子页面隐藏（见 `App.vue` 的 `no-bottom-nav`）。

**全局开关（"我的"页设置区）**
- `SoundToggle` —— 静音开关（只关音效+中文提示语，单词发音保留）。
- `ThemeToggle` —— 亮/暗主题开关。

**活动组件（activities）**：`LearnView`(看图学词)、`QuizView`(听音选图)、`MatchView`(图词连线)、`SpeakView`(跟我读)、`SongView`/`SongStage`(童谣)、`TalkView`(亲子对话)、`WordCard`(词卡)、`Pager`(翻页控件)、`LessonFooter`(课内底部栏)。

**其它通用件**：`PathIcon`(路径图标集)、`ShellIcon`(贝壳图标)、`CuteBackdrop`(背景)。
**业务域组件**（按目录归位）：`HomeView`(首页壳，views/)、`GamePath`(闯关地图，game/)、`HeroFormCard`(英雄形态卡，treasure/)、`ChestReward`(开箱奖励，rewards/)、`LessonResult`(闯关结算，lesson/)、`MasteryTrend`(掌握度趋势，report/)。

## 3. 沉淀规则（新组件进库的门槛）

遇到"页面里需要的 UI 没有现成组件"时：

1. **先复用**：翻第 2 章清单 + `src/components/` 全目录（`grep -rln "className" src/components`）。同款结构/交互已有 → 直接用，不重写。
2. **再抽象**：同一个 UI 在 ≥2 个页面会用到 → 必须抽成组件放 `src/components/ui/`（或对应目录），**不允许**复制两份样式。
3. **进库门槛**：
   - 视觉值只取 `tokens.css` 的变量（`--gap-*`/`--fs-*`/`--radius-*`/`--shadow-*`/`--c-*`），不硬编码；
   - 关键行为配测试（`src/components/**/__tests__/`）；
   - 顶栏/导航/开关类**强制**用 `layout/` 下的现成件，不得手写。
4. **改造公共组件**：改 `HeaderBar`/`AppHeader`/`BottomNav` 等全局件前，先确认全部使用页（`grep -rln "HeaderBar" src/views`），保证改动后所有页面一致，再补走查。

## 4. 组件统一性约定（当前已固化的标准）

- **子页面顶栏**：`HeaderBar` 标题**始终居中**（`position:absolute; left:50%`），与右侧有没有徽章无关——连击日历（带"今日目标"徽章）与宝藏罐/报告（无右侧内容）标题位置完全一致。
- **主 tab 页顶栏**：`AppHeader`，标题在左、徽章在右。
- **完成/返回**：返回按钮统一 `PathIcon name="back"` 圆钮（44px 触控区），关闭态用 `close`（36px 弱化）。
- 新页面加入时，先想好它属于"主 tab 页（AppHeader）"还是"子页面（HeaderBar）"，直接引用，不新写 header。

## 5. 评审/走查清单（提交前过一遍）

- [ ] 页面里没有手写 topbar / 手写开关 / 手写导航；
- [ ] 新增 UI 已查过组件清单，重复结构已抽象；
- [ ] 新组件在 `docs/COMPONENT-LIBRARY.md` 第 2 章登记；
- [ ] 视觉值全部来自 `tokens.css`；
- [ ] 改动全局组件后，所有使用页实测一致（含带/不带右侧插槽两种情况）。
