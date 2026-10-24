---
name: ui-walkthrough
description: kids-english 前端 UI 改动后的走查验收——多视口布局、白屏冒烟、触感/PWA 通路、交互式 GUI 走查及其全部坑位。凡是：改完页面/样式/布局要验收、"帮我看看页面对不对"、走查发现白屏/点不动/样式跑偏、要用浏览器自动化测这个前端、jsdom 测试点击行为诡异——即使没说"走查"两个字也应触发。
---

# UI 走查（ui-walkthrough）

两层走查，**先脚本后交互**：脚本层便宜且覆盖广，交互层只补脚本够不着的体验问题。
面向 5 岁孩子的硬约束（一屏装下、大触控、可朗读）见 `docs/ADAPTATION-GUIDE.md`
（其第 8 节是试飞清单，本 skill 的验收基准）。

## 第一层：程序化脚本（每项改动的最低门槛）

```bash
cd frontend
node scripts/layout-audit.mjs    # 多视口 × 多页面截图 + 溢出检测；改布局必跑（肉眼漏，它不漏）
node scripts/smoke.mjs           # 构建产物白屏冒烟：真渲染、无 JS 异常、关键资源非 404
node scripts/verify-haptics.mjs  # Safari 触感叠加层不破坏布局/命中（动过可点元素后跑）
node scripts/verify-pwa.mjs      # 子路径部署 + SW 缓存 + 离线（动过媒体/SW/部署配置后跑）
```

视口矩阵与断网场景的验收标准都在 ADAPTATION-GUIDE 第 1/8 节，不要凭感觉过。

## 第二层：交互式 GUI 走查（ZCode 内置浏览器，全部实测踩过的坑）

1. **无限 CSS 动画元素（闯关地图节点/星星/宝箱）点击会一直等"元素稳定"而超时**——
   先 evaluate 量 `getBoundingClientRect` 中心，用 `tab.cua.click(坐标)`。
   反例：cua 偶发不触发 `@pointerdown`（色圆实测）——此时改页面内合成事件
   `dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))`，与上一条相反，
   两种都试过再下结论。
2. **注 localStorage 有竞态**：SPA 存活期间 Pinia store 随时 `save()` 写回内存态；
   且 hash 导航（goto 同站不同 hash）不换页、store 不重读。安全顺序：注入 →
   `goto("about:blank")` 销毁会话 → goto 目标页让新 boot 读。
3. **白屏排查第一反应**：长跑 dev server 经历文件删除/重拆后模块图脏（curl 全 200
   但 `import()` 失败、无 window.onerror）——`rm -rf node_modules/.vite` + 重启
   vite（只重启不一定够）。不是你的改动坏了，别顺着错误方向查。
4. **点击目标常在内层**：WordCard 点 `.pic`/`.word`，Pager 按钮文字在 `aria-label`——
   选择器一律用 class/aria-label，别用 textContent。
5. **evaluate 有 3s 上限**：长流程在页面里起 fire-and-forget 异步循环写
   `window.__drive`，外面轮询进度。
6. **验证发音**：TTS 链路探针 `window.speechSynthesis.speak = u => window.__said.push(u.text)`
   后读 `__said`；预生成 mp3 走 audio 元素，探不到，改听 `audio.play()` 是否触发。
7. **jsdom 单测的点击必须是完整"按下→抬起"序列**（down-up-down-up）：连按两张再一起
   抬会被多指手势路径吞掉，表现为"第一对能配、之后全失效"且错连断言假绿——纯测试
   陷阱，真实浏览器不受影响。
8. **双会话共用 dev server 时白屏**：先清 `.vite` 重启（同第 3 条），再怀疑对方改动；
   对方重构进行中时你的验证结果不可信，等它收工（进程 + mtime 双条件，见仓库 AGENTS.md）。

## 走查输出约定

逐条记录：页面 / 视口 / 现象 / 根因 / 修复 commit。修复后**重跑第一层脚本**再报完成，
肉眼确认不能替代 layout-audit 的溢出检测。
