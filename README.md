# 宝宝英语乐园 · 儿童英语单词学习 Web

面向 5 岁孩子的线下培训班作业补充应用。每节课对应一首童谣，孩子围绕童谣里的单词进行「看图学词 → 听音选图 → 图词连线 → 唱童谣」的趣味练习，点图片/点单词都会朗读发音，答对有彩带和星星奖励。参考多邻国的即时反馈与激励节奏设计。

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
│   ├── data/lessons.js        # ★ 课时数据（每节课：童谣 + 单词表）
│   ├── components/
│   │   ├── HomePage.vue       # 首页课时卡片
│   │   ├── LessonView.vue     # 单课流程与活动菜单
│   │   ├── LearnView.vue      # 看图学词
│   │   ├── QuizView.vue       # 听音选图
│   │   ├── MatchView.vue      # 图词连线
│   │   ├── SongView.vue       # 童谣音频/视频
│   │   └── WordCard.vue       # 可复用的发音词卡
│   ├── utils/{speech,effects}.js
│   └── store/progress.js      # 星星/进度持久化
└── public/lessons/            # ★ 课时资源目录（见下）
```

## 你后续要补充的资源（重要）

每节课一个子文件夹，命名与 `src/data/lessons.js` 里的 `id` 对应（当前示例 l1/l2/l3）。**只要文件同名放入，应用自动加载，无需改代码。**

```
public/lessons/
├── l1/
│   ├── song.mp3            童谣音频
│   ├── song.mp4            童谣视频（可选）
│   └── words/
│       ├── star.png        与单词 id 对应的图片（建议 512×512 透明底）
│       ├── sky.png
│       └── ...
├── l2/ ...
└── l3/ ...
```

- 图片找不到时会自动显示单词的 emoji 占位；音频/视频缺失时会显示「未上传」占位并可点按钮领星星——所以现在没有真实素材也能完整试玩。
- 单词发音用浏览器 TTS，无需为每个单词准备音频。

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

## 已知边界

- iOS Safari 需在用户点击后才会播放音频（已用点击触发规避）；系统未安装英文语音包时发音音色会变。
- 进度保存在本机浏览器，换设备/清缓存会重置；如需跨设备记录需另接后端。
- 当前为纯前端静态应用，不含账号与班级管理。
