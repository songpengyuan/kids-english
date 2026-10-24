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

/* 逐行歌词的时间轴（真人演唱课由 gen-lrc.py 对齐产出；合成曲课已下线），用于 KTV 式精确高亮 */
import songTimings from "./song-timings.json";
import lessonsData from "./lessons.json";

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
  /** 该课节奏（song-timings.json；缺失时回退比例映射） */
  timings: SongTiming | null;
  /** 多段音视频轨道（一课多首）。第一轨用顶层 audio/video/lyrics，后续在这里追加。 */
  tracks: SongTrack[];
}
/** 课时（映射后：tone 兜底 + 资源路径化 + 词/句补全） */
/** 课时类型：加餐课（l6/l7/l8 自研合成曲）已于 2026-10-25 下线删除，
 *  现在只剩培训班教材课。字段保留是内容契约（后端 schema/export）的一部分。 */
export type LessonType = "official";

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


/**
 * 课时数据本体在 lessons.json（本文件只留类型、normalize 与查询函数）。
 * 加课/改词/改歌词只动 JSON；生成脚本（gen-word-art.py /
 * gen-word-audio.py）与后端种子导出（export-lessons.mjs）同读这一份。
 * （2026-10-25：此前 608 行数据字面量占着本文件 72%，review diff 一直被淹没。）
 */
const rawLessons = lessonsData as RawLesson[];

// 逐行时间轴索引化（json 字面量类型无 index signature，转 Record 再取）
/** song-timings.json 的课时节奏结构 */
export interface SongTiming {
  bpm: number;
  beatsPerBar: number;
  duration: number;
  timeline: number[];
}
const songTimingsMap = songTimings as unknown as Record<string, SongTiming | null>;

export const lessons: Lesson[] = rawLessons.map((lesson) => ({
  ...lesson,
  type: "official" as const,
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
    // 该课的节奏与逐行时间轴（缺失时回退比例映射）
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
