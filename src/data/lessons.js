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
    id: "l1",
    title: "Twinkle Twinkle Little Star",
    titleZh: "小星星",
    emoji: "⭐",
    color: "#f6c445",
    song: { audio: "/lessons/l1/song.mp3", video: "/lessons/l1/song.mp4" },
    words: [
      { id: "star", en: "star", zh: "星星", emoji: "⭐", image: "/lessons/l1/words/star.png" },
      { id: "sky", en: "sky", zh: "天空", emoji: "🌌", image: "/lessons/l1/words/sky.png" },
      { id: "world", en: "world", zh: "世界", emoji: "🌍", image: "/lessons/l1/words/world.png" },
      { id: "diamond", en: "diamond", zh: "钻石", emoji: "💎", image: "/lessons/l1/words/diamond.png" },
      { id: "little", en: "little", zh: "小小的", emoji: "🐣", image: "/lessons/l1/words/little.png" },
      { id: "shine", en: "shine", zh: "发光", emoji: "✨", image: "/lessons/l1/words/shine.png" }
    ]
  },
  {
    id: "l2",
    title: "Baby Shark",
    titleZh: "鲨鱼家族",
    emoji: "🦈",
    color: "#4bc6f0",
    song: { audio: "/lessons/l2/song.mp3", video: "/lessons/l2/song.mp4" },
    words: [
      { id: "baby", en: "baby", zh: "宝宝", emoji: "👶", image: "/lessons/l2/words/baby.png" },
      { id: "shark", en: "shark", zh: "鲨鱼", emoji: "🦈", image: "/lessons/l2/words/shark.png" },
      { id: "mommy", en: "mommy", zh: "妈妈", emoji: "👩", image: "/lessons/l2/words/mommy.png" },
      { id: "daddy", en: "daddy", zh: "爸爸", emoji: "👨", image: "/lessons/l2/words/daddy.png" },
      { id: "grandma", en: "grandma", zh: "奶奶", emoji: "👵", image: "/lessons/l2/words/grandma.png" },
      { id: "ocean", en: "ocean", zh: "大海", emoji: "🌊", image: "/lessons/l2/words/ocean.png" },
      { id: "run", en: "run", zh: "跑", emoji: "🏃", image: "/lessons/l2/words/run.png" },
      { id: "happy", en: "happy", zh: "开心", emoji: "😄", image: "/lessons/l2/words/happy.png" }
    ]
  },
  {
    id: "l3",
    title: "Old MacDonald Had a Farm",
    titleZh: "老麦克唐纳的农场",
    emoji: "🚜",
    color: "#8fd94b",
    song: { audio: "/lessons/l3/song.mp3", video: "/lessons/l3/song.mp4" },
    words: [
      { id: "farm", en: "farm", zh: "农场", emoji: "🚜", image: "/lessons/l3/words/farm.png" },
      { id: "cow", en: "cow", zh: "奶牛", emoji: "🐄", image: "/lessons/l3/words/cow.png" },
      { id: "duck", en: "duck", zh: "鸭子", emoji: "🦆", image: "/lessons/l3/words/duck.png" },
      { id: "pig", en: "pig", zh: "小猪", emoji: "🐷", image: "/lessons/l3/words/pig.png" },
      { id: "sheep", en: "sheep", zh: "绵羊", emoji: "🐑", image: "/lessons/l3/words/sheep.png" },
      { id: "horse", en: "horse", zh: "马", emoji: "🐴", image: "/lessons/l3/words/horse.png" },
      { id: "seed", en: "seed", zh: "种子", emoji: "🌱", image: "/lessons/l3/words/seed.png" }
    ]
  },
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
