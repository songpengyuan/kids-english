# 丞丞英语乐园 · 儿童英语单词学习 Web

面向 5 岁孩子的线下培训班作业补充应用。每节课对应一首童谣，孩子围绕童谣里的单词进行「看图学词 → 听音选图 → 图词连线 → 跟我读 → 唱童谣 → 亲子对话」的趣味练习，点图片/点单词都会朗读发音，答对有彩带和星星奖励。参考多邻国的即时反馈与激励节奏设计。

> **开发者请看 [DEVELOPMENT.md](./DEVELOPMENT.md)** —— 架构说明、响应式与分页规范、调试深链、布局走查脚本、排错清单都在那里。本文档只讲日常使用。

## 技术栈

- Vue 3 + Vite（纯前端，无后端）
- Web Speech API 朗读单词发音（浏览器内置 TTS，零成本、任意单词可读）
- canvas-confetti 彩带 + CSS 关键帧动画 + Web Audio 合成音效
- SVG 实现图词连线，Pointer Events 兼容鼠标与平板触屏
- localStorage 保存星星与通关进度

## 快速开始

```bash
pnpm install
pnpm dev      # 本地开发，浏览器打开终端提示的地址
pnpm build    # 产出 dist/，可静态托管或双击预览
```

## 目录结构

```
kids-english/
├── src/
│   ├── styles/                # 设计 token + 基础样式（响应式规范的落点）
│   ├── composables/           # useViewport 视口分档 / usePager 分页
│   ├── data/lessons.js        # ★ 课时数据（每节课：童谣 + 单词表）
│   ├── components/
│   │   ├── HomePage.vue       # 首页课时卡片（分页）
│   │   ├── LessonView.vue     # 单课流程与活动菜单
│   │   ├── LearnView.vue      # 看图学词（按屏幕大小自动分页）
│   │   ├── QuizView.vue       # 听音选图
│   │   ├── MatchView.vue      # 图词连线（分组随屏幕大小变化）
│   │   ├── SpeakView.vue      # 跟我读（发音打分/录音回放）
│   │   ├── SongView.vue       # 童谣音频/视频
│   │   ├── TalkView.vue       # 亲子对话（点句听发音）
│   │   ├── WordCard.vue       # 可复用的发音词卡
│   │   └── Pager.vue          # 通用翻页控件
│   ├── utils/                 # layout.js 布局算法 / speech / effects / speechScore
│   └── store/progress.js      # 星星/进度持久化
├── scripts/layout-audit.mjs   # 多视口布局走查脚本
└── public/lessons/            # ★ 课时资源目录（见下）
```

## 你后续要补充的资源（重要）

每节课一个子文件夹，命名与 `src/data/lessons.js` 里的 `id` 对应（当前 l4–l8）。**只要文件同名放入，应用自动加载，无需改代码。**

```
public/lessons/
└── l4/
    ├── song.mp3            童谣音频
    ├── song.mp4            童谣视频（可选）
    ├── audio/              单词发音 mp3（gen-word-audio.py 生成）
    │   └── sailor.mp3      与单词 id 对应
    └── words/
        ├── sailor.png      与单词 id 对应的图片（建议 512×512 透明底）
        └── ...
```

- 图片找不到时会自动显示单词的 emoji 占位；音频/视频缺失时会显示「未上传」占位并可点按钮领星星——所以现在没有真实素材也能完整试玩。
- 单词发音：优先播放 `audio/` 下的预生成 mp3（童声），缺失时自动回退浏览器 TTS。
- **l6 颜色 / l7 数字 / l8 字母 三课的音频与图片都是仓库自己合成的**
  （`scripts/gen-songs.py` 生成童谣与时间轴、`scripts/gen-word-art.py` 画 29 张 SVG 贴纸），
  改内容时重跑脚本即可，无需外部素材；细节见 [DEVELOPMENT.md](./DEVELOPMENT.md) §5.2。

## 新增/修改课时

编辑 `src/data/lessons.js` 的 `lessons` 数组即可。一节课的结构：

```js
{
  id: "l4",
  title: "Row Row Row Your Boat",
  titleZh: "划小船",
  emoji: "🚣",
  color: "#4bc6f0",
  song: { audio: "/lessons/l4/song.mp3", video: "/lessons/l4/song.mp4" },
  words: [
    { id: "boat", en: "boat", zh: "小船", emoji: "🚣", image: "/lessons/l4/words/boat.png" },
    { id: "river", en: "river", zh: "河流", emoji: "🏞️", image: "/lessons/l4/words/river.png" }
  ]
}
```

| 字段 | 含义 |
|---|---|
| `id` | 课时唯一标识，同时是资源文件夹名 |
| `en` / `zh` | 单词英文（发音用）/ 中文释义 |
| `image` | 图片路径，放进 `words/` 即自动生效 |
| `emoji` | 图片未就绪时的占位 |

## 离线与更新（PWA）

应用已 PWA 化：加到主屏幕后以独立窗口打开，**断网也能玩**（页面壳 + 单词图片/发音 + 童谣音视频都会被缓存）。

- 装到桌面：手机/iPad 浏览器里「添加到主屏幕」即可；安卓桌面端会用 `manifest.webmanifest` 里的图标（含 maskable 版）。
- 缓存策略见 `src/sw.js` 顶部注释：页面导航永远 network-first（新部署立刻生效），哈希资源 cache-first，媒体"先用缓存 + etag 条件校验"（304 零成本）。
- **换素材/发新版本**：正常 `pnpm ship` 即可。用户端下次打开/切回应用就会拿到新版；如果更新发生孩子正在玩的时候，会等他回到首页再静默刷新，不打断玩法。
- 注意：替换**同名**媒体文件后，客户端最多会多播一次旧版本（SWR 语义），再刷新即是新的。

## 跟我读（发音打分）

孩子按住大麦克风跟读单词，松开后系统判断读得准不准，给三档反馈：🌟 很棒 / 😊 不错 / 🔁 再试一次。采用**双模式自动降级**：

1. **自动打分模式（首选）**：使用浏览器内置语音识别（Web Speech API `SpeechRecognition`）听写孩子的发音，与目标单词做编辑距离相似度打分。免费、零配置。
   - ⚠️ 注意：Chrome/Edge 的识别请求要发往 Google 服务。**国内网络环境下可能识别失败，此时应用会自动切换到下面的录音模式**，不会卡死。
   - 首次使用需允许麦克风权限（localhost / 文件打开均允许；局域网 http 访问可能被浏览器拒权，建议 https 或本机打开）。
2. **录音回放模式（降级）**：识别不可用时，孩子按住录音、松手后回放给自己听，由家长/老师点 👍 或 🔁 判定——保证任何环境下玩法闭环。

**想要更专业的发音评分**（逐音素打分、准确评估小朋友发音），当前方案是够用的免费近似；后续可接入讯飞开放平台「少儿语音评测」或 Azure Pronunciation Assessment，需要在 `src/utils/speechScore.js` 里替换打分实现（需注册获取 API Key，属付费/配额服务）。

## 已知边界

- iOS Safari 需在用户点击后才会播放音频（已用点击触发规避）；系统未安装英文语音包时发音音色会变。
- 进度保存在本机浏览器，换设备/清缓存会重置；如需跨设备记录需另接后端。
- 当前为纯前端静态应用，不含账号与班级管理。
