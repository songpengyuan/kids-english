/**
 * ===== 课时数据（每节课 = 一首童谣 + 若干单词）=====
 *
 * 资源约定（每课的资源来源分两类）：
 *
 * 【你自己提供的课】l4、l5：
 *   public/lessons/<课时id>/song.mp3     童谣音频（你提供的）
 *   public/lessons/<课时id>/song.mp4     童谣视频（你提供的，音乐页默认先播它）
 *   public/lessons/<课时id>/words/*.png  单词图片（你提供的）
 *   public/lessons/<课时id>/audio/*.mp3  单词发音（可选，没有则浏览器 TTS 朗读）
 *   脚本不会覆盖这些文件；歌词高亮因为没有逐行时间轴，按比例映射。
 *
 * 【自研合成的课】l6 颜色 / l7 数字 / l8 字母：
 *   song.mp3 由 scripts/gen-songs.py 合成（自编曲，无版权风险，含逐行时间轴）
 *   words/*.svg 由 scripts/gen-word-art.py 生成（贴纸风简笔画）
 *   audio/*.mp3 由 scripts/gen-word-audio.py 生成（神经网络童声发音）
 *   资源找不到时 App 会自动降级为 emoji 占位图 / 浏览器语音朗读。
 *
 * 路径写法：下面一律写站点根路径形式（如 "/lessons/l4/song.mp3"），
 * 由文件末尾的 asset() 自动补上部署基路径，本地与 GitHub Pages 子路径部署通用。
 *
 * ⚠️ 配色不要在这里写十六进制！课时卡的底色统一由 `tone` 指定，
 * 只能取 tokens.css 卡片色调板里的 6 个 hue 之一：
 *   blue | green | orange | purple | pink | teal
 * 相邻课时尽量用不同 hue（孩子靠颜色+封面区分课时）。新课时加进来时循环取用即可。
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

/* 逐行歌词的时间轴（scripts/gen-songs.py 生成），用于 KTV 式精确高亮 */
import songTimings from "./song-timings.json";

const rawLessons = [
  {
    id: "l4",
    title: "A Sailor Went to Sea",
    titleZh: "水手出海去",
    emoji: "🌊",
    tone: "blue",
    date: "2026-09-18",
    song: {
      audio: "/lessons/l4/song.mp3",
      /* 视频：你自己提供的素材，放 public/lessons/l4/song.mp4 即自动生效，
       * 音乐页会出现「视频 / 动画」两个页签，默认先播视频。
       * ⚠️ l4、l5 的音视频与图片一律用你提供的文件，scripts/gen-songs.py
       *    只负责合成新课（l6~l8），不会覆盖这两课。 */
      video: "/lessons/l4/song.mp4",
      /* 动画舞台的场景：sea = 大海和小帆船 / stage = 小小演奏会
       * （视频缺失时才会用到，见 SongStage.vue） */
      scene: "sea",
      /* 完整歌词（空字符串 = 段落分隔） */
      lyrics: [
        "A sailor went to sea, sea, sea",
        "To see what he could see, see, see",
        "But all that he could see, see, see",
        "Was the bottom of the deep blue sea, sea, sea",
        "",
        "A sailor went to sea, sea, sea",
        "To see what he could see, see, see",
        "But all that he could see, see, see",
        "Was the bottom of the deep blue sea, sea, sea",
        "",
        "A sailor went to sea, sea, sea",
        "To see what he could see, see, see",
        "But all that he could see, see, see",
        "Was the bottom of the deep blue sea, sea, sea"
      ]
    },
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
    tone: "orange",
    date: "2026-09-16",
    song: {
      audio: "/lessons/l5/song.mp3",
      /* 视频：你自己提供的素材（同上） */
      video: "/lessons/l5/song.mp4",
      scene: "stage",
      lyrics: [
        "I am the Music Man,",
        "I come from down your way,",
        "And I can play!",
        "What can you play?",
        "I play the piano!",
        "Pia, pia, piano, piano, piano,",
        "Pia, pia, piano, pia, piano!",
        "",
        "I am the Music Man,",
        "I come from down your way,",
        "And I can play!",
        "What can you play?",
        "I play the violin!",
        "Vio, vio, violin, violin, violin,",
        "Vio, vio, violin, vio, violin!",
        "",
        "I am the Music Man,",
        "I come from down your way,",
        "And I can play!",
        "What can you play?",
        "I play the trombone!",
        "Trom, trom, trombone, trombone, trombone,",
        "Trom, trom, trombone, trom, trombone!"
      ]
    },
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
  },
  {
    id: "l6",
    title: "A Rainbow of Colors",
    titleZh: "彩虹颜色歌",
    emoji: "🎨",
    tone: "pink",
    date: "2026-09-24",
    song: {
      audio: "/lessons/l6/song.mp3",
      video: null,
      /* 动画舞台场景：rainbow = 彩虹和彩色泡泡（见 SongStage.vue） */
      scene: "rainbow",
      lyrics: [
        "Red, red, a red red apple",
        "Yellow, yellow, the yellow sun",
        "Blue, blue, the blue blue sky",
        "I see a rainbow in the sky",
        "",
        "Green, green, the green green tree",
        "Orange, orange, an orange cat",
        "Purple, purple, a purple grape",
        "I see a rainbow in the sky",
        "",
        "Pink, pink, a pink pink flower",
        "White, white, a white white cloud",
        "Black, black, a black black hat",
        "I see a rainbow in the sky"
      ]
    },
    words: [
      { id: "red", en: "red", zh: "红色", emoji: "🍎", image: "/lessons/l6/words/red.svg" },
      { id: "yellow", en: "yellow", zh: "黄色", emoji: "🍋", image: "/lessons/l6/words/yellow.svg" },
      { id: "blue", en: "blue", zh: "蓝色", emoji: "🫐", image: "/lessons/l6/words/blue.svg" },
      { id: "green", en: "green", zh: "绿色", emoji: "🥝", image: "/lessons/l6/words/green.svg" },
      { id: "orange", en: "orange", zh: "橙色", emoji: "🍊", image: "/lessons/l6/words/orange.svg" },
      { id: "purple", en: "purple", zh: "紫色", emoji: "🍇", image: "/lessons/l6/words/purple.svg" },
      { id: "pink", en: "pink", zh: "粉色", emoji: "🌸", image: "/lessons/l6/words/pink.svg" },
      { id: "white", en: "white", zh: "白色", emoji: "🥛", image: "/lessons/l6/words/white.svg" },
      { id: "black", en: "black", zh: "黑色", emoji: "🐧", image: "/lessons/l6/words/black.svg" }
    ],
    phrases: [
      { en: "What color is it?", zh: "它是什么颜色呀？" },
      { en: "It's red.", zh: "它是红色的。" },
      { en: "I like blue.", zh: "我喜欢蓝色。" },
      { en: "Look at my rainbow!", zh: "看我的彩虹！" }
    ]
  },
  {
    id: "l7",
    title: "Count With Me",
    titleZh: "跟我数数 0-10",
    emoji: "🔢",
    tone: "green",
    date: "2026-09-24",
    song: {
      audio: "/lessons/l7/song.mp3",
      video: null,
      /* 动画舞台场景：numbers = 数数的小气球 */
      scene: "numbers",
      lyrics: [
        "Zero, zero, zero!",
        "One, two, three",
        "Four, five, six",
        "Seven, eight, nine",
        "Nine, and ten",
        "",
        "Let's count again",
        "One, two, three",
        "Four, five, six",
        "Seven, eight, nine",
        "Nine, and ten",
        "",
        "Ten, nine, eight",
        "Seven, six, five",
        "Four, three, two",
        "One, and zero!",
        "We counted to ten"
      ]
    },
    words: [
      { id: "zero", en: "zero", zh: "零", emoji: "0️⃣", image: "/lessons/l7/words/zero.svg" },
      { id: "one", en: "one", zh: "一", emoji: "1️⃣", image: "/lessons/l7/words/one.svg" },
      { id: "two", en: "two", zh: "二", emoji: "2️⃣", image: "/lessons/l7/words/two.svg" },
      { id: "three", en: "three", zh: "三", emoji: "3️⃣", image: "/lessons/l7/words/three.svg" },
      { id: "four", en: "four", zh: "四", emoji: "4️⃣", image: "/lessons/l7/words/four.svg" },
      { id: "five", en: "five", zh: "五", emoji: "5️⃣", image: "/lessons/l7/words/five.svg" },
      { id: "six", en: "six", zh: "六", emoji: "6️⃣", image: "/lessons/l7/words/six.svg" },
      { id: "seven", en: "seven", zh: "七", emoji: "7️⃣", image: "/lessons/l7/words/seven.svg" },
      { id: "eight", en: "eight", zh: "八", emoji: "8️⃣", image: "/lessons/l7/words/eight.svg" },
      { id: "nine", en: "nine", zh: "九", emoji: "9️⃣", image: "/lessons/l7/words/nine.svg" },
      { id: "ten", en: "ten", zh: "十", emoji: "🔟", image: "/lessons/l7/words/ten.svg" }
    ],
    phrases: [
      { en: "How many apples?", zh: "有几个苹果呀？" },
      { en: "Let's count together.", zh: "我们一起数一数。" },
      { en: "I can count to ten.", zh: "我能数到十。" },
      { en: "Give me five!", zh: "击个掌！" }
    ]
  },
  {
    id: "l8",
    title: "The ABC Song",
    titleZh: "字母歌 ABC",
    emoji: "🔤",
    tone: "purple",
    date: "2026-09-24",
    song: {
      audio: "/lessons/l8/song.mp3",
      video: null,
      /* 动画舞台场景：letters = 飞来飞去的字母积木 */
      scene: "letters",
      lyrics: [
        "A B C D E F G",
        "H I J K L M N O P",
        "Q R S T U V",
        "W X Y and Z",
        "Now I know my ABC",
        "Next time won't you sing with me",
        "",
        "A B C D E F G",
        "H I J K L M N O P",
        "Q R S T U V",
        "W X Y and Z",
        "Now I know my ABC",
        "Next time won't you sing with me"
      ]
    },
    words: [
      { id: "apple", en: "apple", zh: "苹果（A）", emoji: "🍎", image: "/lessons/l8/words/apple.svg" },
      { id: "ball", en: "ball", zh: "皮球（B）", emoji: "⚽", image: "/lessons/l8/words/ball.svg" },
      { id: "cat", en: "cat", zh: "小猫（C）", emoji: "🐱", image: "/lessons/l8/words/cat.svg" },
      { id: "dog", en: "dog", zh: "小狗（D）", emoji: "🐶", image: "/lessons/l8/words/dog.svg" },
      { id: "egg", en: "egg", zh: "鸡蛋（E）", emoji: "🥚", image: "/lessons/l8/words/egg.svg" },
      { id: "fish", en: "fish", zh: "小鱼（F）", emoji: "🐟", image: "/lessons/l8/words/fish.svg" },
      { id: "grape", en: "grape", zh: "葡萄（G）", emoji: "🍇", image: "/lessons/l8/words/grape.svg" },
      { id: "hat", en: "hat", zh: "帽子（H）", emoji: "🎩", image: "/lessons/l8/words/hat.svg" },
      { id: "icecream", en: "ice cream", zh: "冰淇淋（I）", emoji: "🍦", image: "/lessons/l8/words/icecream.svg" }
    ],
    phrases: [
      { en: "What letter is it?", zh: "这是什么字母呀？" },
      { en: "It's letter A.", zh: "这是字母 A。" },
      { en: "A is for apple.", zh: "A 是 apple（苹果）。" },
      { en: "Let's sing ABC!", zh: "我们一起唱字母歌！" }
    ]
  }
];

export const lessons = rawLessons.map((lesson) => ({
  ...lesson,
  // 缺失时兜底成蓝色，避免 class 变成 tone-undefined 导致卡片没有底色
  tone: lesson.tone || "blue",
  song: {
    audio: asset(lesson.song.audio),
    video: lesson.song.video ? asset(lesson.song.video) : null,
    scene: lesson.song.scene || "stage",
    lyrics: lesson.song.lyrics || [],
    // 该课的节奏与逐行时间轴（gen-songs.py 生成；手工换过 mp3 时会自动没有 → 回退比例映射）
    timings: songTimings[lesson.id] || null
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
