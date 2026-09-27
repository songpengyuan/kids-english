# 跨端适配试飞计划

> 目标：iPad / 手机 / 桌面 Web 三端一屏装下、不滚动、按钮够大、安全区不被挡。

## 测试机型与视口

| 端 | 机型 | 视口（CSS px） | 重点 |
|---|---|---|---|
| iPad | iPad Air / 10.2" 竖屏 | 768×1024 | 卡片列数、分屏 |
| iPad | iPad Air 横屏 | 1024×768 | 横屏玩法不挤、不溢出 |
| iPad | iPad 分屏（1/3） | ~360×1024 | 窄屏不崩 |
| iPhone | SE (第3代) | 375×667 | 小屏不溢出 |
| iPhone | 14 Pro Max | 430×932 | 大屏、Dynamic Island 安全区 |
| iPhone | 横屏 | 844×390 | `max-height:480` 横屏档 |
| Web | 桌面 1440 | 1440×900 | max-width 1180 居中 |
| Web | 超宽 2560 | 2560×1440 | 不无限拉宽 |

## 检查项

### 1. 基础 HTML
- [ ] `viewport-fit=cover`（刘海屏安全区）
- [ ] `apple-mobile-web-app-status-bar-style`
- [ ] PWA manifest standalone

### 2. 安全区
- [ ] 顶部：HeaderBar / AppHeader 不被刘海/灵动岛挡
- [ ] 底部：LessonFooter / BottomNav 不被 Home 指示条挡
- [ ] `env(safe-area-inset-*)` 全局兜底

### 3. 首页（学习/游戏）
- [ ] 课程卡片网格在 iPad 竖屏 3 列、手机 1-2 列
- [ ] AppHeader 三数字徽章不挤不换行
- [ ] 底部 tab 大按钮够拇指点

### 4. 玩法页
- [ ] QuizView：2×2 图片格，横屏 4 列
- [ ] MatchView：三列布局在窄屏不挤
- [ ] SpeakView：麦克风够大，反馈按钮不溢出
- [ ] TalkView：对话卡片可滚动
- [ ] SongView：播放器不溢出

### 5. 子页面
- [ ] 宝藏罐：卡片网格自适应
- [ ] 我的：列表不溢出
- [ ] 报告/复习：表格/卡片不溢出

### 6. 交互
- [ ] 触摸：`touch-action: manipulation`，双击不缩放
- [ ] 桌面：hover 状态、鼠标点击
- [ ] 旋转/分屏：resize 重算不闪烁

## 执行顺序
1. 修 HTML meta
2. 修全局安全区 CSS
3. 逐页面对比视口截图
4. 修复发现的问题
5. 构建+测试+提交
