# Emoji 字体：跨平台一致渲染

## 问题

项目里的内容 emoji（课程封面 🚌、词卡、拟声图形 🌀〰️😭、界面小图标 🎤🧩）在
不同系统上由不同字体渲染：

| 平台 | 实际字体 | 表现 |
|---|---|---|
| macOS / iOS | Apple Color Emoji | 立体高光风 |
| Windows | Segoe UI Emoji | 扁平线面风 |
| Android / Linux | Noto Color Emoji | 与 Windows 版 Segoe 又不同 |

三个后果：

1. **风格不一致**：同一屏在 iPad 和 Windows 上是两副面孔，视觉设计没法收敛。
2. **缺字形变豆腐块**：Unicode 15 之后的新 emoji（如 🪼 水母、🪿 鹅）在
   Windows 10 / 旧版 Win11 上完全没有字形，浏览器直接画空框。
3. **尺寸/基线不齐**：各平台 emoji 的 advance width 与基线不同，
   与中英文字号并排时会错位。

## 做法

自托管 **Noto Color Emoji**（Google 开源，SIL OFL 1.1，可免费商用与再分发），
按 `unicode-range` 切成多片，浏览器只下载页面真正出现的码位对应的分片。

| 位置 | 作用 |
|---|---|
| `frontend/scripts/build-emoji-font.py` | 生成脚本：扫描真实码位 → 拉 Google 分片 → 精确子集化 → 写字体与 CSS |
| `frontend/public/fonts/noto-emoji/*.woff2` | 子集字体（当前 9 片，合计约 61KB） |
| `frontend/src/styles/emoji-font.css` | `@font-face` 声明，由脚本生成，不要手改 |
| `frontend/src/styles/tokens.css` | 全局字体栈里 `"Noto Color Emoji"` 排在系统 emoji 字体之前 |
| `frontend/src/sw.js` | `fonts/` 走 `cacheFirst`，断网时 emoji 不回退系统字体 |

字体栈顺序是关键：Noto 必须排在 `system-ui` / `sans-serif` 之前，
否则系统 emoji 字体先命中，等于没装。

## 新增 emoji 之后

数据（`src/data/lessons.json` 的 `emoji` 字段）和源码里硬编码的字面量都会被扫描，
其中硬编码只认「后面跟 U+FE0F」的符号（`↔️ ⚠️ ⬆️` 算 emoji，裸 `↔ ⚠ →` 仍归正文字体）。

```bash
cd frontend && python3 scripts/build-emoji-font.py   # 需要网络
```

脚本会重算码位、重写 `emoji-font.css`、并删除不再需要的旧分片。跑完看输出里的
总字节数没有异常膨胀即可（几十个码位通常几十 KB）。

## 不是 emoji 的那些符号

`→ ← ✓ ✕ ★ ⚠ ↑ ↓ ✦` 这类排版符号由正文字体负责，不要塞进 emoji 子集——
它们本来就没有彩色 emoji 呈现，混进来只会白白拉大字体体积。

界面装饰仍遵循既有约定：一律用 `IconTile`（lucide 矢量图标），
只有内容本身就是 emoji 的场合才用 `EmojiTile`。

## 已知边界

- **COLRv1 支持**：字体是 COLRv1 矢量化彩色字形。Chrome 98+、Firefox 107+、
  Safari 16.4+ 都支持；更老的 Safari（iOS 15 及以下）渲染会退化为空白。
  项目目标设备（近几年的 iPad / Windows / Android）不受影响。
- **风格统一 = 主动放弃各平台原生观感**：装上 Noto 后 macOS 也从苹果风变成
  Google 扁平风。这是刻意的取舍——一致优先于各端原生。
