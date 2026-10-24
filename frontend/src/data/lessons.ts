/**
 * ===== 课时数据（每节课 = 一首童谣 + 若干单词）=====
 *
 * 资源约定（每课的资源来源分两类）：
 *
 * 【你自己提供的课】l4、l5：
 *   public/lessons/<课时id>/song.mp3     童谣音频（你提供的）
 *   public/lessons/<课时id>/song.mp4     童谣视频（你提供的，音乐页默认先播它）
 *   public/lessons/<课时id>/words/*.webp 单词图片（optimize-word-art.py 从 PNG 去白底转出）
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

export function asset(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^(https?:)?\/\//.test(path)) return path; // 外链原样返回
  return BASE + (path.startsWith("/") ? path : `/${path}`);
}

/* 逐行歌词的时间轴（scripts/gen-songs.py 生成），用于 KTV 式精确高亮 */
import songTimings from "./song-timings.json";

/* ===== 类型（阶段 2-4：lessons.js → TS 迁移，数据本体未改） ===== */
export type Tone = "blue" | "green" | "orange" | "purple" | "pink" | "teal";

export interface SongTrack {
  title: string;
  /** 轨道自己的中文名（缺省回退课程 titleZh；磨耳朵列表/视频列表的副标题用它） */
  titleZh?: string;
  audio?: string | null;
  video?: string | null;
  lyrics?: string[];
  /** 所属词群（l11：colors 颜色歌 / animals Brown Bear 动物歌） */
  group?: string;
}
export interface RawLessonSong {
  /** 第一轨歌曲名（可选；缺省时磨耳朵列表用课程名） */
  title?: string;
  audio?: string | null;
  video?: string | null;
  scene?: string;
  /** 所属词群：多词域课时（首例 l11：colors/animals）把这条轨道分给对应词群 */
  group?: string;
  lyrics?: string[];
  /** 多段音视频播放列表（一课多首童谣/课堂视频）。
   *  有 tracks 时播放器按轨道切换，旧 audio/video/lyrics 作为第一轨兼容。 */
  tracks?: SongTrack[];
}
export interface RawLessonWord {
  id: string;
  en: string;
  zh: string;
  emoji: string;
  image?: string;
  audio?: string;
  /** 所属词群（如 l11 的 colors/animals）；配合 lesson.wordGroups 分组展示 */
  group?: string;
  /** 颜色词：十六进制色值 */
  color?: string;
}
/* ===== 课时能力字段（capability fields）的扩展约定（ADR-007） =====
 * stageStyle / wordGroups / colorPairs / song.tracks / word.group / word.color
 * 都是"课时能力"的可缺省字段：不配 → 自动回退默认玩法；配了 → 启用对应变体
 * （首例 l11：颜色配对 / 词群分轨）。新增第 N 个能力时守住四条：
 *   1. 按能力命名（"词群""颜色配对"），不按课命名——注释里的 l11 只是首例，不是定义；
 *   2. 可缺省 + 缺省回退：老课数据一个字不改也必须照常可玩；
 *   3. 组合一致性必须能被 scripts/validate-data.mjs 校验（引用存在 / 闭包 / 枚举）；
 *   4. 同步进后端契约：backend/app/schemas.py 的 LessonOut 族 + pnpm export:lessons 重导种子。
 * 刻意**不做**嵌套 features 对象重排：这些字段已在生产 wire 格式（content API）上，
 * 观感收益抵不过破坏性改动——决策记录见 docs/adr/ADR-007。 */
export interface RawLesson {
  id: string;
  title: string;
  titleZh: string;
  emoji: string;
  tone?: Tone;
  date?: string;
  /** 学单词玩法样式：cards=看图点读（默认），dialog=亲子口语对话卡（l10 用） */
  stageStyle?: "cards" | "dialog";
  song: RawLessonSong;
  words: RawLessonWord[];
  phrases?: { en: string; zh: string }[];
  /** 颜色配对玩法：左列颜色圆 ↔ 右列图（练"什么颜色配什么"）。
   *  color 指向本课颜色词 id（非色值），色值取该词的 word.color。首例 l11 Brown Bear */
  colorPairs?: { color: string; wordId: string }[];
  /** 词群（如 颜色 / 动物）：词表按群分组展示与练习，歌曲轨道也可按群分轨 */
  wordGroups?: { key: string; name: string }[];
}

/** 单词（映射后：补课时归属 + 资源路径化） */
export interface Word {
  id: string;
  en: string;
  zh: string;
  emoji: string;
  image?: string | null;
  audio?: string | null;
  /** 词归属的课时 id：发音注册表按 (lessonId, wordId) 精确定位 */
  lessonId: string;
  /** 所属词群（如 l11 的 colors/animals）；配合 lesson.wordGroups 分组展示 */
  group?: string;
  /** 颜色词：十六进制色值，WordCard 显示小色点而非大图 */
  color?: string;
}
export interface Phrase {
  en: string;
  zh: string;
  audio: string;
}
export interface LessonSong {
  /** 第一轨歌曲名（可选；缺省时磨耳朵列表用课程名） */
  title?: string;
  audio: string | null;
  video: string | null;
  scene: string;
  /** 第一轨所属词群（l11：animals） */
  group?: string;
  lyrics: string[];
  /** 该课节奏（gen-songs.py 生成；手工换过 mp3 时自动没有 → 回退比例映射） */
  timings: SongTiming | null;
  /** 多段音视频轨道（一课多首）。第一轨用顶层 audio/video/lyrics，后续在这里追加。 */
  tracks: SongTrack[];
}
/** 课时（映射后：tone 兜底 + 资源路径化 + 词/句补全） */
export type LessonType = "official" | "bonus";

export interface Lesson {
  id: string;
  title: string;
  titleZh: string;
  emoji: string;
  tone: Tone;
  type: LessonType;
  date?: string;
  /** 学单词玩法样式（默认看图点读；l10 为亲子口语对话卡） */
  stageStyle: "cards" | "dialog";
  song: LessonSong;
  words: Word[];
  phrases: Phrase[];
  /** 颜色配对（l11）：左列颜色圆 ↔ 右列动物图 */
  colorPairs?: { color: string; wordId: string }[];
  /** 词群（如 l11：颜色 / 动物）：词表按这两个部分分组展示与练习 */
  wordGroups?: { key: string; name: string }[];
}


const rawLessons: RawLesson[] = [
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
        "I come from far away,",
        "And I can play!",
        "What can you play?",
        "I play the piano!",
        "Pia, pia, piano, piano, piano,",
        "Pia, pia, piano, pia, piano!",
        "",
        "I am the Music Man,",
        "I come from far away,",
        "And I can play!",
        "What can you play?",
        /* 音频/视频里乐器顺序都是 钢琴→长号→小提琴（gen-lrc.py 识别核实），
         * 此前歌词把 violin 段放在第 2 段导致逐行时间轴无法对齐，已对调。 */
        "I play the trombone!",
        "Trom, trom, trombone, trombone, trombone,",
        "Trom, trom, trombone, trom, trombone!",
        "",
        "I am the Music Man,",
        "I come from far away,",
        "And I can play!",
        "What can you play?",
        "I play the violin!",
        "Vio, vio, violin, violin, violin,",
        "Vio, vio, violin, vio, violin!"
      ]
    },
    words: [
      { id: "violin", en: "violin", zh: "小提琴", emoji: "🎻", image: "/lessons/l5/words/violin.webp" },
      { id: "piano", en: "piano", zh: "钢琴", emoji: "🎹", image: "/lessons/l5/words/piano.webp" },
      { id: "musicman", en: "Music Man", zh: "音乐人", emoji: "🎹", image: "/lessons/l5/words/musicman.webp" },
      { id: "trombone", en: "trombone", zh: "长号", emoji: "🎺", image: "/lessons/l5/words/trombone.webp" },
      { id: "mantis", en: "mantis", zh: "螳螂", emoji: "🦗", image: "/lessons/l5/words/mantis.webp" },
      { id: "squirrel", en: "squirrel", zh: "松鼠", emoji: "🐿️", image: "/lessons/l5/words/squirrel.webp" },
      { id: "frog", en: "frog", zh: "青蛙", emoji: "🐸", image: "/lessons/l5/words/frog.webp" }
    ],
    phrases: [
      { en: "What can you play?", zh: "你会演奏什么呀？" },
      { en: "I can play the piano.", zh: "我会弹钢琴。" },
      { en: "I can play the violin.", zh: "我会拉小提琴。" },
      { en: "I can play the trombone.", zh: "我会吹长号。" }
    ]
  },
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
      /* 完整歌词（空字符串 = 段落分隔）
       * ⚠️ l4 的 mp3 是"整曲唱 3 遍"的课堂版（约 200s，每遍 66s），
       * 歌词必须重复 3 遍才能和音频全程对应（song-timings.json 的 l4 时间轴按 42 行生成）。 */
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

        "Was the bottom of the deep blue sea, sea, sea",

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

        "Was the bottom of the deep blue sea, sea, sea",

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
      { id: "seahorse", en: "seahorse", zh: "海马", emoji: "🐴", image: "/lessons/l4/words/seahorse.webp" },
      { id: "jellyfish", en: "jellyfish", zh: "水母", emoji: "🪼", image: "/lessons/l4/words/jellyfish.webp" },
      { id: "turtle", en: "turtle", zh: "海龟", emoji: "🐢", image: "/lessons/l4/words/turtle.webp" },
      { id: "octopus", en: "octopus", zh: "章鱼", emoji: "🐙", image: "/lessons/l4/words/octopus.webp" },
      { id: "shark", en: "shark", zh: "鲨鱼", emoji: "🦈", image: "/lessons/l4/words/shark.webp" },
      { id: "whale", en: "whale", zh: "鲸鱼", emoji: "🐳", image: "/lessons/l4/words/whale.webp" },
      { id: "sailor", en: "sailor", zh: "水手", emoji: "⛵", image: "/lessons/l4/words/sailor.webp" },
      { id: "sea", en: "sea", zh: "大海", emoji: "🌊", image: "/lessons/l4/words/sea.webp" },
      { id: "blue", en: "blue", zh: "蓝色", emoji: "🔵", image: "/lessons/l4/words/blue.webp" }
    ],
    phrases: [
      { en: "What do you see?", zh: "你看见什么啦？" },
      { en: "I see a ...", zh: "我看见了一只……" }
    ]
  },
  {
    id: "l9",
    title: "One Little Finger",
    titleZh: "一根小手指",
    emoji: "👆",
    tone: "teal",
    date: "2026-10-10",
    song: {
      audio: "/lessons/l9/song.mp3",
      video: "/lessons/l9/song.mp4",
      scene: "stage",
      lyrics: [
        "One little finger, one little finger, one little finger",
        "Tap tap tap!",
        "Point your finger up, point your finger down",
        "Put it on your head, head!",
        "",
        "One little finger, one little finger, one little finger",
        "Tap tap tap!",
        "Point your finger up, point your finger down",
        "Put it on your nose, nose!",
        "",
        "One little finger, one little finger, one little finger",
        "Tap tap tap!",
        "Point your finger up, point your finger down",
        "Put it on your chin, chin!",
        "",
        "One little finger, one little finger, one little finger",
        "Tap tap tap!",
        "Point your finger up, point your finger down",
        "Put it on your arm, arm!",
        "",
        "One little finger, one little finger, one little finger",
        "Tap tap tap!",
        "Point your finger up, point your finger down",
        "Put it on your leg, leg!",
        "",
        "One little finger, one little finger, one little finger",
        "Tap tap tap!",
        "Point your finger up, point your finger down",
        "Put it on your foot, foot!",
        "",
        "Put it on your leg, leg!",
        "Put it on your arm, arm!",
        "Put it on your chin, chin!",
        "Put it on your nose, nose!",
        "Put it on your head, head!",
        "",
        "Now let's wave goodbye!",
        "Goodbye!"
      ]
    },
    words: [
      { id: "nose", en: "nose", zh: "鼻子", emoji: "👃", image: "/lessons/l9/words/nose.webp" },
      { id: "arm", en: "arm", zh: "手臂", emoji: "💪", image: "/lessons/l9/words/arm.webp" },
      { id: "leg", en: "leg", zh: "腿", emoji: "🦵", image: "/lessons/l9/words/leg.webp" },
      { id: "foot", en: "foot", zh: "脚", emoji: "🦶", image: "/lessons/l9/words/foot.webp" },
      { id: "chin", en: "chin", zh: "下巴", emoji: "😊", image: "/lessons/l9/words/chin.webp" },
      { id: "finger", en: "finger", zh: "手指", emoji: "👆", image: "/lessons/l9/words/finger.webp" },
      { id: "head", en: "head", zh: "头", emoji: "🧑", image: "/lessons/l9/words/head.webp" }
    ],
    phrases: [
      { en: "Where is your finger?", zh: "你的手指在哪里？" },
      { en: "This is my head.", zh: "这是我的头。" },
      { en: "Put it on your nose.", zh: "把它放在鼻子上。" },
      { en: "Point your finger up.", zh: "手指向上指。" },
      { en: "Wave goodbye!", zh: "挥挥手说再见！" }
    ]
  },
  {
    id: "l10",
    title: "Walking In The Jungle",
    titleZh: "丛林里散步",
    emoji: "🐒",
    tone: "green",
    date: "2026-10-14",
    song: {
      audio: "/lessons/l10/song.mp3",
      /* 老师提供的课堂视频（Super Simple Songs 官方动画，带机构水印） */
      video: "/lessons/l10/song.mp4",
      /* 视频缺失时才用动画舞台；丛林暂无专属场景，用通用 stage */
      scene: "stage",
      /* 歌词：老师版 TPR 儿歌，一轮 4 段（walk→frog / stomp→monkey / jump→toucan / skip→tiger→Run）。
       * 音频实测只唱一轮（gen-lrc.py 识别核实：四个动物各出现一次，204s 含前后奏），
       * 此前按「唱 2 遍」重复了两轮，后半段在音频里不存在，已裁掉；
       * walk 段的 walking/afraid 音频里各唱两遍，歌词保留两遍。 */
      lyrics: [
        "Let's take a walk in the jungle.",
        "Walking in the jungle. Walking in the jungle.",
        "We're not afraid. We're not afraid.",
        "Walking in the jungle. Walking in the jungle.",
        "We're not afraid. We're not afraid.",
        "One step. Two steps. Three steps forward.",
        "One step. Two steps. Three steps back.",
        "Stop. Listen. What's that?",
        "It's a frog! We're not afraid!",
        "",
        "Let's stomp.",
        "Stomping in the jungle. Stomping in the jungle.",
        "We're not afraid. We're not afraid.",
        "Stomping in the jungle. Stomping in the jungle.",
        "We're not afraid. We're not afraid.",
        "One step, two steps, three steps forward.",
        "One step, two steps, three steps back.",
        "Stop! Listen! What's that?",
        "It's a monkey!",
        "We're not afraid!",
        "",
        "Let's jump!",
        "Jumping in the jungle. Jumping in the jungle.",
        "We're not afraid. We're not afraid.",
        "Jumping in the jungle. Jumping in the jungle.",
        "We're not afraid. We're not afraid.",
        "One step, two steps, three steps forward.",
        "One step, two steps, three steps back.",
        "Stop! Listen! What's that?",
        "It's a toucan!",
        "We're not afraid!",
        "",
        "Let's skip!",
        "Skipping in the jungle. Skipping in the jungle.",
        "We're not afraid. We're not afraid.",
        "Skipping in the jungle. Skipping in the jungle.",
        "We're not afraid. We're not afraid.",
        "One step, two steps, three steps forward.",
        "One step, two steps, three steps back.",
        "Stop! Listen! What's that?",
        "It's a tiger!",
        "Run!"
      ]
    },
    words: [
      /* 老师正式词表（2026-10-14 提供）：7 词；图片老师未提供，缺失自动回退 emoji */
      { id: "frog", en: "frog", zh: "青蛙", emoji: "🐸", image: "/lessons/l10/words/frog.webp" },
      { id: "monkey", en: "monkey", zh: "猴子", emoji: "🐒", image: "/lessons/l10/words/monkey.webp" },
      { id: "tiger", en: "tiger", zh: "老虎", emoji: "🐯", image: "/lessons/l10/words/tiger.webp" },
      { id: "toucan", en: "toucan", zh: "巨嘴鸟", emoji: "🦜", image: "/lessons/l10/words/toucan.webp" },
      { id: "afraid", en: "afraid", zh: "害怕的", emoji: "😨", image: "/lessons/l10/words/afraid.webp" },
      { id: "jungle", en: "jungle", zh: "丛林", emoji: "🌴", image: "/lessons/l10/words/jungle.webp" },
      { id: "listen", en: "listen", zh: "听", emoji: "👂", image: "/lessons/l10/words/listen.webp" }
    ],
    phrases: [
      /* 老师亲子口语模板：What's that? -- It's a ... .（配歌词里 4 个动物实例） */
      { en: "What's that?", zh: "那是什么？" },
      { en: "It's a frog.", zh: "那是一只青蛙。" },
      { en: "It's a monkey.", zh: "那是一只猴子。" },
      { en: "It's a tiger.", zh: "那是一只老虎。" },
      { en: "It's a toucan.", zh: "那是一只巨嘴鸟。" }
    ]
  },
  {
    id: "l11",
    title: "Brown Bear, Brown Bear",
    titleZh: "棕熊你看到了什么",
    emoji: "🐻",
    tone: "orange",
    date: "2026-10-21",
    song: {
      title: "Brown Bear Song",
      /* 两首歌按词群拆开：第一轨 = Brown Bear 动物歌（课堂演唱版），
       * 第二轨 = Colors Song 颜色歌（ELF 彩色圆点动画）。
       * 学童谣页顶部「Colors / Animals」切换时只放对应那一轨。 */
      audio: "/lessons/l11/brown-bear.mp3",
      video: "/lessons/l11/brown-bear.mp4",
      scene: "stage",
      group: "animals",
      /* 老师课堂绘本（2026-10-21）：一问一答重复句式，颜色+动物递进。
       * 歌词按绘本原句逐行，音频缺失时回退浏览器 TTS。 */
      lyrics: [
        "Brown bear, brown bear, what do you see?",
        "I see a red bird looking at me.",
        "Red bird, red bird, what do you see?",
        "I see a yellow duck looking at me.",
        "Yellow duck, yellow duck, what do you see?",
        "I see a blue horse looking at me.",
        "Blue horse, blue horse, what do you see?",
        "I see a green frog looking at me.",
        "Green frog, green frog, what do you see?",
        "I see a purple cat looking at me.",
        "Purple cat, purple cat, what do you see?",
        "I see a white dog looking at me.",
        "White dog, white dog, what do you see?",
        "I see a black sheep looking at me.",
        "Black sheep, black sheep, what do you see?",
        "I see a goldfish looking at me.",
        "Goldfish, goldfish, what do you see?",
        "I see a teacher looking at me.",
        "Teacher, teacher, what do you see?",
        "I see children looking at me."
      ],
      tracks: [
        {
          title: "Colors Song",
          titleZh: "颜色歌",
          audio: "/lessons/l11/song.mp3",
          video: "/lessons/l11/song.mp4",
          /* 歌词：whisper 识别草稿（gen-lrc.py 2026-10-25 转写），
           * 老师未提供歌词文本，上线前请对照音频人工校对一遍。 */
          lyrics: [
            "I see colors everywhere.",
            "I see colors everywhere.",
            "I see colors everywhere.",
            "What colors do you see?",
            "Red and blue!",
            "Red, red, hello red!",
            "Blue, blue, hello blue!",
            "Red, red, goodbye red!",
            "Blue, blue, see you later, blue!",
            "Yellow and green!",
            "Yellow, yellow, hello yellow!",
            "Green, green, hello green!",
            "Yellow, yellow, goodbye yellow!",
            "Green, green, see you later, green!",
            "Orange and pink!",
            "Orange, orange, hello orange!",
            "Pink, pink, hello pink!",
            "Orange, orange, goodbye orange!",
            "Pink, pink, see you later, pink!",
            "Purple and brown!",
            "Purple, purple, hello purple!",
            "Brown, brown, hello brown!",
            "Purple, purple, goodbye purple!",
            "Brown, brown, see you later, brown!",
            "Black and white!",
            "Black, black, hello black!",
            "White, white, hello white!",
            "Black, black, goodbye black!",
            "White, white, see you later, white!",
            "What colors do you see?",
            "I see colors everywhere.",
            "I see colors everywhere.",
            "I see colors everywhere.",
            "What colors do you see?"
          ],
          group: "colors"
        }
      ]
    },
    words: [
      /* 词表按绘本分两部分：颜色（colors）→ 动物（animals）。
       * 颜色图复用 l6 的彩色小熊（同一批颜色词），发音也是同一批 mp3；
       * 动物图是老师提供的绘本扫描件。 */
      { id: "brown", en: "brown", zh: "棕色", emoji: "🟤", image: "/lessons/l11/words/brown.svg", group: "colors", color: "#8B4513" },
      { id: "red", en: "red", zh: "红色", emoji: "🔴", image: "/lessons/l11/words/red.svg", group: "colors", color: "#E53935" },
      { id: "yellow", en: "yellow", zh: "黄色", emoji: "🟡", image: "/lessons/l11/words/yellow.svg", group: "colors", color: "#FDD835" },
      { id: "blue", en: "blue", zh: "蓝色", emoji: "🔵", image: "/lessons/l11/words/blue.svg", group: "colors", color: "#1E88E5" },
      { id: "green", en: "green", zh: "绿色", emoji: "🟢", image: "/lessons/l11/words/green.svg", group: "colors", color: "#43A047" },
      { id: "orange", en: "orange", zh: "橙色", emoji: "🍊", image: "/lessons/l11/words/orange.svg", group: "colors", color: "#FB8C00" },
      { id: "pink", en: "pink", zh: "粉色", emoji: "🌸", image: "/lessons/l11/words/pink.svg", group: "colors", color: "#EC407A" },
      { id: "purple", en: "purple", zh: "紫色", emoji: "🟣", image: "/lessons/l11/words/purple.svg", group: "colors", color: "#8E24AA" },
      { id: "white", en: "white", zh: "白色", emoji: "⚪", image: "/lessons/l11/words/white.svg", group: "colors", color: "#FFFFFF" },
      { id: "black", en: "black", zh: "黑色", emoji: "⚫", image: "/lessons/l11/words/black.svg", group: "colors", color: "#212121" },
      { id: "bear", en: "bear", zh: "棕熊", emoji: "🐻", image: "/lessons/l11/words/bear.webp", group: "animals" },
      { id: "bird", en: "bird", zh: "小鸟", emoji: "🐦", image: "/lessons/l11/words/bird.webp", group: "animals" },
      { id: "duck", en: "duck", zh: "鸭子", emoji: "🦆", image: "/lessons/l11/words/duck.webp", group: "animals" },
      { id: "horse", en: "horse", zh: "小马", emoji: "🐎", image: "/lessons/l11/words/horse.webp", group: "animals" },
      { id: "frog", en: "frog", zh: "青蛙", emoji: "🐸", image: "/lessons/l11/words/frog.webp", group: "animals" },
      { id: "cat", en: "cat", zh: "小猫", emoji: "🐱", image: "/lessons/l11/words/cat.webp", group: "animals" },
      { id: "dog", en: "dog", zh: "小狗", emoji: "🐶", image: "/lessons/l11/words/dog.webp", group: "animals" },
      { id: "sheep", en: "sheep", zh: "绵羊", emoji: "🐑", image: "/lessons/l11/words/sheep.webp", group: "animals" },
      { id: "goldfish", en: "goldfish", zh: "金鱼", emoji: "🐟", image: "/lessons/l11/words/goldfish.webp", group: "animals" }
    ],
    wordGroups: [
      { key: "colors", name: "Colors" },
      { key: "animals", name: "Animals" }
    ],
    phrases: [
      /* 老师亲子口语模板：问颜色 / 问动物 */
      { en: "What color is it?", zh: "这是什么颜色？" },
      { en: "It's brown.", zh: "是棕色。" },
      { en: "What animal is it?", zh: "这是什么动物？" },
      { en: "It's a bear.", zh: "是一只棕熊。" }
    ],
    /* 绘本颜色-动物配对：red bird / yellow duck / blue horse / green frog /
       purple cat / white dog / black sheep（连一连关卡用，练"什么颜色配什么动物"） */
    colorPairs: [
      { color: "red", wordId: "bird" },
      { color: "yellow", wordId: "duck" },
      { color: "blue", wordId: "horse" },
      { color: "green", wordId: "frog" },
      { color: "purple", wordId: "cat" },
      { color: "white", wordId: "dog" },
      { color: "black", wordId: "sheep" }
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
  },
];

// 逐行时间轴索引化（json 字面量类型无 index signature，转 Record 再取）
/** song-timings.json 的课时节奏结构（gen-songs.py 生成） */
export interface SongTiming {
  bpm: number;
  beatsPerBar: number;
  duration: number;
  timeline: number[];
}
const songTimingsMap = songTimings as unknown as Record<string, SongTiming | null>;

/** 自定义课（非培训班教材）：颜色/数字/字母 */
const BONUS_IDS = new Set(["l6", "l7", "l8"]);

export const lessons: Lesson[] = rawLessons.map((lesson) => ({
  ...lesson,
  type: BONUS_IDS.has(lesson.id) ? "bonus" : "official",
  stageStyle: lesson.stageStyle ?? "cards",
  // 缺失时兜底成蓝色，避免 class 变成 tone-undefined 导致卡片没有底色
  tone: lesson.tone || "blue",
  song: {
    title: lesson.song.title,
    audio: asset(lesson.song.audio),
    video: lesson.song.video ? asset(lesson.song.video) : null,
    scene: lesson.song.scene || "stage",
    group: lesson.song.group,
    lyrics: lesson.song.lyrics || [],
    // 该课的节奏与逐行时间轴（gen-songs.py 生成；手工换过 mp3 时会自动没有 → 回退比例映射）
    timings: songTimingsMap[lesson.id] || null,
    // 多段音视频轨道：第一轨用顶层 audio/video/lyrics，后续在 tracks 里追加
    tracks: (lesson.song.tracks || []).map((t) => ({
      title: t.title,
      titleZh: t.titleZh,
      audio: t.audio ? asset(t.audio) : null,
      video: t.video ? asset(t.video) : null,
      lyrics: t.lyrics || [],
      group: t.group
    }))
  },
  // 亲子对话口语句（TalkView 用），发音文件为 ph-<序号>.mp3，缺失时回退 TTS
  phrases: (lesson.phrases || []).map((p, i) => ({
    ...p,
    audio: asset(`/lessons/${lesson.id}/audio/ph-${i + 1}.mp3`) ?? ""
  })),
  words: lesson.words.map((word) => ({
    ...word,
    // 词归属的课时 id：发音注册表按 (lessonId, wordId) 精确定位，
    // 单词级掌握度（progress.words）也依赖它；跨课同词（如 l4/l6 的 blue）不再串音
    lessonId: lesson.id,
    image: asset(word.image),
    // 预生成的神经网络童声发音（public/lessons/<id>/audio/<wordId>.mp3），
    // 文件不存在时 speech.js 会自动回退到浏览器 TTS
    audio: asset(`/lessons/${lesson.id}/audio/${word.id}.mp3`) ?? undefined
  }))
}));

/**
 * 一课的全部玩法 key（按课时菜单/闯关序列顺序）。
 * 「通关」判定与家长报告都需要它——progress store 不感知玩法编排，
 * 由数据层给出统一口径，避免 PracticeView / GamePath / LessonView 各写一份。
 *
 * ⚠️ **顺序即课程内闯关关卡顺序**：必须与 LessonView 的 `activities` 编排一致
 * （童谣打头建立兴趣 → 学单词 → 听音选图 → 连一连 → 跟我读 → 亲子对话）。
 * 曾经这里把 song 排在最后，而菜单/闯关玩法却按 song 打头；
 * 结果同一课出现两条“关卡顺序”，地图的「从这里开始」与下一关推进对不上。
 */
export function activityKeys(lesson: Pick<Lesson, "phrases">): string[] {
  const base = ["song", "learn", "quiz", "memory", "match", "speak"];
  if (lesson.phrases?.length) base.push("order", "talk");
  return base;
}

/**
 * 按 lesson.wordGroups 把词表拆成若干组（颜色 / 动物…）。
 * 没配 wordGroups 的课返回空数组（调用方按原来的平铺词表走）。
 * 词在两个组都没登记时会被漏掉，所以配套测试要求"分组并集 = 全部词"。
 */
export function wordGroupsOf(lesson: Lesson): { key: string; name: string; words: Word[] }[] {
  const groups = lesson.wordGroups ?? [];
  return groups.map((g) => ({
    key: g.key,
    name: g.name,
    words: lesson.words.filter((w) => w.group === g.key),
  }));
}

export function getLesson(id: string): Lesson | null {
  return lessons.find((l) => l.id === id) || null;
}
