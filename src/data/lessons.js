/**
 * ===== 课时数据（每节课 = 一首童谣 + 若干单词）=====
 *
 * 资源约定（你后续补充真实资源时，只需替换同名文件，无需改代码）：
 *   public/lessons/<课时id>/song.mp3     童谣音频
 *   public/lessons/<课时id>/song.mp4     童谣视频（可选，没有则显示"暂未提供视频"占位）
 *   public/lessons/<课时id>/words/<图片>  单词图片（建议 512x512 透明底 PNG / SVG）
 *   public/avatars/<课时id>.svg           课时封面（占位，可替换）
 *
 * 图片/音频找不到时，App 会自动降级为 emoji 占位图 / 浏览器语音朗读，
 * 所以现在全部用假数据也能完整试玩。
 */

export const lessons = [
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
  }
];

export function getLesson(id) {
  return lessons.find((l) => l.id === id) || null;
}
