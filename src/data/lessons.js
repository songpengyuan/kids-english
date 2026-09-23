/**
 * ===== 课时数据（每节课 = 一首童谣 + 若干单词）=====
 *
 * 资源约定（你后续补充真实资源时，只需替换同名文件，无需改代码）：
 *   public/lessons/<课时id>/song.mp3     童谣音频
 *   public/lessons/<课时id>/song.mp4     童谣视频（可选，没有则显示"暂未提供视频"占位）
 *   public/lessons/<课时id>/words/<图片>  单词图片（建议 512x512 透明底 PNG / SVG）
 *   public/lessons/<课时id>/audio/<单词id>.mp3  单词发音（可选，没有则浏览器 TTS 朗读）
 *   public/avatars/<课时id>.svg           课时封面（占位，可替换）
 *
 * 图片/音频找不到时，App 会自动降级为 emoji 占位图 / 浏览器语音朗读，
 * 所以现在全部用假数据也能完整试玩。
 *
 * 路径写法：下面一律写站点根路径形式（如 "/lessons/l4/song.mp3"），
 * 由文件末尾的 asset() 自动补上部署基路径，本地与 GitHub Pages 子路径部署通用。
 */

/**
 * public/ 目录下的文件不会经过 Vite 的路径重写，若部署在子路径
 * （GitHub Pages 的 /<repo>/），写死的 "/lessons/..." 会被浏览器解析到
 * 站点根目录，导致音频/视频/图片全部 404。这里统一补 BASE_URL 前缀：
 * 本地 dev/build 时 BASE_URL 为 "/"，子路径部署时为 "/<repo>/"。
 */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function asset(path) {
  if (!path) return path;
  if (/^(https?:)?\/\//.test(path)) return path; // 外链原样返回
  return BASE + (path.startsWith("/") ? path : `/${path}`);
}

const rawLessons = [
  {
    id: "l4",
    title: "A Sailor Went to Sea",
    titleZh: "水手出海去",
    emoji: "🌊",
    color: "#1cb0f6",
    date: "2026-09-18",
    song: { audio: "/lessons/l4/song.mp3", video: "/lessons/l4/song.mp4" },
    words: [
      { id: "seahorse", en: "seahorse", zh: "海马", emoji: "🐴", image: "/lessons/l4/words/seahorse.png" },
      { id: "jellyfish", en: "jellyfish", zh: "水母", emoji: "🪼", image: "/lessons/l4/words/jellyfish.png" },
      { id: "turtle", en: "turtle", zh: "海龟", emoji: "🐢", image: "/lessons/l4/words/turtle.png" },
      { id: "octopus", en: "octopus", zh: "章鱼", emoji: "🐙", image: "/lessons/l4/words/octopus.png" },
      { id: "shark", en: "shark", zh: "鲨鱼", emoji: "🦈", image: "/lessons/l4/words/shark.png" },
      { id: "whale", en: "whale", zh: "鲸鱼", emoji: "🐳", image: "/lessons/l4/words/whale.png" },
      { id: "sailor", en: "sailor", zh: "水手", emoji: "⛵", image: "/lessons/l4/words/sailor.png" },
      { id: "sea", en: "sea", zh: "大海", emoji: "🌊", image: "/lessons/l4/words/sea.png" },
      { id: "blue", en: "blue", zh: "蓝色", emoji: "🔵", image: "/lessons/l4/words/blue.png" }
    ],
    phrases: [
      { en: "What do you see?", zh: "你看见什么啦？" },
      { en: "I see a ...", zh: "我看见了一只……" }
    ]
  },
  {
    id: "l5",
    title: "I Am the Music Man",
    titleZh: "我是一个音乐人",
    emoji: "🎺",
    color: "#ff9f43",
    date: "2026-09-16",
    song: { audio: "/lessons/l5/song.mp3", video: "/lessons/l5/song.mp4" },
    words: [
      { id: "violin", en: "violin", zh: "小提琴", emoji: "🎻", image: "/lessons/l5/words/violin.png" },
      { id: "piano", en: "piano", zh: "钢琴", emoji: "🎹", image: "/lessons/l5/words/piano.png" },
      { id: "musicman", en: "Music Man", zh: "音乐人", emoji: "🎹", image: "/lessons/l5/words/musicman.png" },
      { id: "trombone", en: "trombone", zh: "长号", emoji: "🎺", image: "/lessons/l5/words/trombone.png" },
      { id: "mantis", en: "mantis", zh: "螳螂", emoji: "🦗", image: "/lessons/l5/words/mantis.png" },
      { id: "squirrel", en: "squirrel", zh: "松鼠", emoji: "🐿️", image: "/lessons/l5/words/squirrel.png" },
      { id: "frog", en: "frog", zh: "青蛙", emoji: "🐸", image: "/lessons/l5/words/frog.png" }
    ],
    phrases: [
      { en: "What can you play?", zh: "你会演奏什么呀？" },
      { en: "I can play the piano.", zh: "我会弹钢琴。" },
      { en: "I can play the violin.", zh: "我会拉小提琴。" },
      { en: "I can play the trombone.", zh: "我会吹长号。" }
    ]
  }
];

export const lessons = rawLessons.map((lesson) => ({
  ...lesson,
  song: {
    audio: asset(lesson.song.audio),
    video: asset(lesson.song.video)
  },
  // 亲子对话口语句（TalkView 用），发音文件为 ph-<序号>.mp3，缺失时回退 TTS
  phrases: (lesson.phrases || []).map((p, i) => ({
    ...p,
    audio: asset(`/lessons/${lesson.id}/audio/ph-${i + 1}.mp3`)
  })),
  words: lesson.words.map((word) => ({
    ...word,
    image: asset(word.image),
    // 预生成的神经网络童声发音（public/lessons/<id>/audio/<wordId>.mp3），
    // 文件不存在时 speech.js 会自动回退到浏览器 TTS
    audio: asset(`/lessons/${lesson.id}/audio/${word.id}.mp3`)
  }))
}));

export function getLesson(id) {
  return lessons.find((l) => l.id === id) || null;
}
