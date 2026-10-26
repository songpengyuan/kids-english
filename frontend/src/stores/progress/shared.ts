/**
 * 进度存储的共享契约：类型 + 存储格式（load 迁移 / 合并口径）。
 *
 * 持久化文档顶层（localStorage key 见 KEY）：
 * stars: { [lessonId]: { learn: 0-3, quiz: 0-3, memory: 0-3, match: 0-3, speak: 0-3, order: 0-3, song: 0|1, talk: 0|1 } }
 * words: { [lessonId]: { [wordId]: { seen, correct, wrong, lastAt } } }  ← 单词级掌握度
 * _daily: { date, durationSec, activities }                              ← 今日学情统计
 * _last: 最近进入的课时 id（首页「继续学习」入口）
 *
 * ⚠️ KEY 里的 kids-english 是**历史存储键名**，不要跟着应用显示名一起改。
 * 改了会读不到已有数据，孩子攒的星星就全没了。
 * 存储结构为增量演进：老数据（无 words/_daily/_last）在 load() 时自动补齐，
 * 历史星星不受影响。
 *
 * 各领域模块（course/words/daily/cloudSync）与 store 门面（index.ts）
 * 共用这里的类型与格式函数；本文件**不含任何业务行为**。
 */
import { seedFromCounts } from "../../utils/reviewSchedule";
import type { SrsState } from "../../utils/reviewSchedule";
import { lessons, migrateLegacyActivityKeys } from "../../data/lessons";

/** 单个单词的掌握度记录 */
export interface WordStat {
  /** 看到/点读过次数（看图学词） */
  seen?: number;
  /** 答对次数（听音选图/连线/跟读通过） */
  correct?: number;
  /** 答错次数（选错/连错/跟读 retry） */
  wrong?: number;
  /** 最近一次活动的毫秒时间戳（家长报告按"今天"过滤用） */
  lastAt?: number;
  /** 间隔重复：记忆阶段（0..4，4 = 已掌握）；老数据在 load() 时折算 */
  stage?: number;
  /** 间隔重复：下次到期时间戳（已掌握为 0） */
  dueAt?: number;
}

/** 单课进度：各玩法星数 + 玩过的玩法列表 + 单词掌握度 */
export interface LessonProgress {
  learn?: number;
  quiz?: number;
  memory?: number;
  match?: number;
  speak?: number;
  order?: number;
  song?: number;
  talk?: number;
  completed?: string[];
  words?: Record<string, WordStat>;
}

/** 今日学情（家长报告）：跨天自动重置 */
export interface DailyStats {
  /** 本地日期 YYYY-MM-DD */
  date: string;
  /** 今日累计学习时长（秒，按玩法会话计） */
  durationSec: number;
  /** 今日磨耳朵时长（秒，播放中每 5s 累加；可选=旧数据无此字段） */
  listenSec?: number;
  /** 今日完成的玩法数 */
  activities: number;
}

/** 每日快照：掌握度趋势曲线的数据点 */
export interface DailySnapshot {
  /** 当日累计学习时长（秒） */
  durationSec: number;
  /** 当日完成的玩法数 */
  activities: number;
  /** 当日结束时的"已掌握单词数"（累计值，用于趋势） */
  mastered: number;
  /** 当日磨耳朵时长（秒；可选=旧数据无此字段） */
  listenSec?: number;
}

/** 复习队列条目（不含词面信息，en/zh 由调用方查 lessons） */
export interface ReviewItem {
  lessonId: string;
  wordId: string;
  /** 记忆阶段 0..4（4 = 已掌握） */
  stage: number;
  /** 下次到期时间戳（已掌握为 0） */
  dueAt: number;
  correct: number;
  wrong: number;
  seen: number;
}

/**
 * 存储顶层：课程进度 map + 元字段。
 * 索引签名只收 LessonProgress：元字段用字面量键单独声明，
 * 这样 progress[id]（字符串变量）稳定推断为 LessonProgress。
 */
export type ProgressMap = Record<string, LessonProgress> & {
  _daily: DailyStats | null;
  _last: string | null;
  /** 每日快照（家长报告的掌握度趋势）：date → { durationSec, activities, mastered } */
  _dailyLog: Record<string, DailySnapshot>;
};

/** localStorage 键（历史键名，冻结不改——改了孩子星星全丢） */
export const KEY = "kids-english-progress-v1";

/** 顶层元字段（不是课程 id）——任何"遍历所有课程"的地方都要跳过它们 */
export const META_KEYS = new Set(["_daily", "_last", "_dailyLog"]);

/** 该 key 是否为课程 id（非元字段） */
export function isLessonKey(k: string): boolean {
  return !META_KEYS.has(k);
}

/**
 * 单课星数 = 除 completed/words 外的所有数值字段之和。
 * 故意按对象遍历而不是手写 key 列表：新增玩法（memory/order…）时星数自动计入，
 * 不会出现"新关卡拿了星但顶栏/我的页总星数不动"的静默漏算。
 */
export function sumStars(l: LessonProgress | undefined): number {
  if (!l) return 0;
  let sum = 0;
  for (const [k, v] of Object.entries(l)) {
    if (k === "completed" || k === "words") continue;
    if (typeof v === "number") sum += v;
  }
  return sum;
}

export function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * 读旧数据并做增量迁移：
 * - 每课的 words 字段补齐为空对象（旧数据没有）
 * - 顶层补 _daily / _last 元字段
 * 迁移是就地补字段，不丢任何已有星星。
 */
export function load(): ProgressMap {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    for (const k of Object.keys(raw)) {
      if (k === "_daily" || k === "_last" || k === "_dailyLog") continue;
      const l = raw[k];
      if (l && typeof l === "object" && !(l as LessonProgress).words) {
        (l as LessonProgress).words = {};
      }
      // 单词级 SRS 增量迁移：老数据只有 correct/wrong，折算成 stage/dueAt
      const words = (l as LessonProgress | undefined)?.words;
      if (words) {
        const now = Date.now();
        for (const wid of Object.keys(words)) {
          const w = words[wid];
          if (typeof w.stage === "number" && typeof w.dueAt === "number") continue;
          const seeded = seedFromCounts(w, now);
          w.stage = seeded.stage;
          w.dueAt = seeded.dueAt;
        }
      }
      // 词群入口化迁移（2026-10-25）：分组课的老裸玩法键（learn/quiz/…）
      // 复制到每个词群的复合键下（learn:colors / learn:animals），
      // 孩子攒的星星不丢。getLesson 在同文件域内直接查静态数据。
      const lesson = lessons.find((x) => x.id === k);
      if (lesson) {
        const migrated = migrateLegacyActivityKeys(lesson, l as unknown as Record<string, unknown>);
        if (migrated) Object.assign(l as object, migrated);
      }
    }
    if (raw._daily === undefined) raw._daily = null;
    if (raw._last === undefined) raw._last = null;
    if (!raw._dailyLog || typeof raw._dailyLog !== "object") raw._dailyLog = {};
    return raw as ProgressMap;
  } catch {
    return { _daily: null, _last: null, _dailyLog: {} } as ProgressMap;
  }
}

/** 每日快照逐字段取 max（跨设备合并的唯一口径：时长只增不减，本地旧值不得盖住云端较大值） */
export function maxSnapshot(a: DailySnapshot, b: DailySnapshot): DailySnapshot {
  return {
    durationSec: Math.max(a.durationSec ?? 0, b.durationSec ?? 0),
    activities: Math.max(a.activities ?? 0, b.activities ?? 0),
    mastered: Math.max(a.mastered ?? 0, b.mastered ?? 0),
    listenSec: Math.max(a.listenSec ?? 0, b.listenSec ?? 0),
  };
}

/** 单词的 SRS 状态（老数据兜底折算一次，保证读到的永远合法） */
export function srsOf(w: WordStat, now: number): SrsState {
  if (typeof w.stage === "number" && typeof w.dueAt === "number") {
    return { stage: w.stage, dueAt: w.dueAt };
  }
  return seedFromCounts(w, now);
}

export function countsOf(w: WordStat) {
  return { correct: w.correct || 0, wrong: w.wrong || 0, seen: w.seen || 0 };
}
