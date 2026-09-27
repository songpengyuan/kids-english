/**
 * 学习进度 store（Pinia + TS，localStorage 持久化）
 * stars: { [lessonId]: { learn: 0-3, quiz: 0-3, match: 0-3, speak: 0-3, song: 0|1, talk: 0|1 } }
 * words: { [lessonId]: { [wordId]: { seen, correct, wrong, lastAt } } }  ← 单词级掌握度
 * _daily: { date, durationSec, activities }                              ← 今日学情统计
 * _last: 最近进入的课时 id（首页「继续学习」入口）
 *
 * ⚠️ KEY 里的 kids-english 是**历史存储键名**，不要跟着应用显示名一起改。
 * 改了会读不到已有数据，孩子攒的星星就全没了。
 *
 * 说明：从 src/store/progress.js 迁移而来（行为与存储键完全一致），
 * 统一进 Pinia 是为了"游戏模式"上线后进度/奖励/模式状态共用一套响应式基建。
 * 存储结构为增量演进：老数据（无 words/_daily/_last）在 load() 时自动补齐，
 * 历史星星不受影响。
 */
import { defineStore } from "pinia";
import { computed, reactive } from "vue";
import {
  isMastered,
  onCorrect,
  onWrong,
  seedFromCounts,
  type SrsState,
} from "../utils/reviewSchedule";

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
  match?: number;
  speak?: number;
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
  /** 今日完成的玩法数 */
  activities: number;
}

/**
 * 存储顶层：课程进度 map + 两个元字段。
 * 索引签名只收 LessonProgress：元字段用字面量键单独声明，
 * 这样 progress[id]（字符串变量）稳定推断为 LessonProgress。
 */
type ProgressMap = Record<string, LessonProgress> & {
  _daily: DailyStats | null;
  _last: string | null;
  /** 每日快照（家长报告的掌握度趋势）：date → { durationSec, activities, mastered } */
  _dailyLog: Record<string, DailySnapshot>;
};

/** 每日快照：掌握度趋势曲线的数据点 */
export interface DailySnapshot {
  /** 当日累计学习时长（秒） */
  durationSec: number;
  /** 当日完成的玩法数 */
  activities: number;
  /** 当日结束时的"已掌握单词数"（累计值，用于趋势） */
  mastered: number;
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

const KEY = "kids-english-progress-v1";

/** 顶层元字段（不是课程 id）——任何"遍历所有课程"的地方都要跳过它们 */
export const META_KEYS = new Set(["_daily", "_last", "_dailyLog"]);

/** 该 key 是否为课程 id（非元字段） */
export function isLessonKey(k: string): boolean {
  return !META_KEYS.has(k);
}

function today(): string {
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
function load(): ProgressMap {
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
    }
    if (raw._daily === undefined) raw._daily = null;
    if (raw._last === undefined) raw._last = null;
    if (!raw._dailyLog || typeof raw._dailyLog !== "object") raw._dailyLog = {};
    return raw as ProgressMap;
  } catch {
    return { _daily: null, _last: null, _dailyLog: {} } as ProgressMap;
  }
}

export const useProgressStore = defineStore("progress", () => {
  /** 必须用 reactive 包装：LessonView/HomePage 里的 computed 依赖它，
   *  普通对象不会建立响应式依赖，进度更新后 computed 缓存永不失效 */
  const progress = reactive<ProgressMap>(load());

  function save() {
    localStorage.setItem(KEY, JSON.stringify(progress));
  }

  const totalStars = computed(() =>
    Object.keys(progress)
      .filter(isLessonKey)
      .reduce(
        (sum, id) =>
          sum +
          (progress[id].learn || 0) + (progress[id].quiz || 0) + (progress[id].match || 0) +
          (progress[id].speak || 0) + (progress[id].song || 0) + (progress[id].talk || 0),
        0
      )
  );

  /** 一课的总星数（菜单进度条/关卡图用） */
  function lessonStars(id: string): number {
    const l = progress[id];
    if (!l) return 0;
    return (
      (l.learn || 0) + (l.quiz || 0) + (l.match || 0) + (l.speak || 0) +
      (l.song || 0) + (l.talk || 0)
    );
  }

  function setGameStars(id: string, game: string, stars: number) {
    const prev = progress[id] || {};
    // game 只会是玩法名（learn/quiz/...），不会是 completed 数组字段
    const key = game as Exclude<keyof LessonProgress, "completed" | "words">;
    if ((prev[key] || 0) < stars) prev[key] = stars;
    prev.completed = prev.completed || [];
    if (!prev.completed.includes(game)) prev.completed.push(game);
    progress[id] = prev;
    save();
  }

  /** 宝箱关领取记录：completed 含 chest（地图宝箱关卡一次性奖励） */
  function markChest(id: string) {
    const prev = progress[id] || {};
    prev.completed = prev.completed || [];
    if (!prev.completed.includes("chest")) prev.completed.push("chest");
    progress[id] = prev;
    save();
  }

  /** 童谣完成：只记 1 分，同时计入"玩过的玩法" */
  function markSong(id: string) {
    const prev = progress[id] || {};
    prev.song = 1;
    prev.completed = prev.completed || [];
    if (!prev.completed.includes("song")) prev.completed.push("song");
    progress[id] = prev;
    save();
  }

  /**
   * "学完"判定（新口径）：该课全部玩法都玩过 **且星级达标**——
   * learn/quiz/match/speak 需 ≥2 星，song/talk 需 ≥1 分。
   * 旧的"玩过 ≥3 种玩法"口径会让 1 星的课也显示"全部通关"，语义失真。
   * @param keys 该课的玩法 key 列表（data/lessons.js 的 activityKeys 提供）
   */
  function isCompleted(id: string, keys: string[]): boolean {
    const l = progress[id];
    if (!l) return false;
    // 提出来再判空：闭包内访问 reactive 属性 TS 不做收窄
    const completed = l.completed;
    if (!completed || keys.length === 0) return false;
    if (keys.some((k) => !completed.includes(k))) return false;
    return keys.every((k) => {
      const stars = (l as unknown as Record<string, number>)[k] || 0;
      return k === "song" || k === "talk" ? stars >= 1 : stars >= 2;
    });
  }

  /** 玩过该课（有任一玩法记录）——游戏模式解锁下一关的依据 */
  function isPlayed(id: string): boolean {
    const l = progress[id];
    return !!(l && l.completed && l.completed.length > 0);
  }

  /**
   * 游戏模式关卡解锁：第一课总是解锁；其余需前一课玩过任一玩法。
   * @param lessonIds 按出场顺序的课程 id 列表
   */
  function isUnlocked(id: string, lessonIds: string[]): boolean {
    const idx = lessonIds.indexOf(id);
    if (idx <= 0) return true;
    return isPlayed(lessonIds[idx - 1]);
  }

  /* ---------- 单词级掌握度 ---------- */

  /**
   * 记录一个单词的一次学习事件（幂等累加）。
   * @param lessonId 词所属课时
   * @param wordId   词 id
   * @param delta    本次事件：{ seen?: 1, correct?: 1, wrong?: 1 }（只传发生的那项）
   */
  function recordWord(
    lessonId: string,
    wordId: string,
    delta: { seen?: number; correct?: number; wrong?: number }
  ) {
    const l = (progress[lessonId] || { words: {} }) as LessonProgress;
    l.words = l.words || {};
    const w = (l.words[wordId] = l.words[wordId] || {});
    const now = Date.now();
    // 本次更新之前的计数：老单词对象没有 SRS 字段时用它折算初始 stage
    const before = {
      correct: (w.correct || 0) - (delta.correct || 0),
      wrong: (w.wrong || 0) - (delta.wrong || 0),
      lastAt: w.lastAt,
    };
    if (delta.seen) w.seen = (w.seen || 0) + delta.seen;
    if (delta.correct) w.correct = (w.correct || 0) + delta.correct;
    if (delta.wrong) w.wrong = (w.wrong || 0) + delta.wrong;
    // 间隔重复：答错打回 stage 0，答对进一级（1/3/7/14 天 → 掌握）
    const prevSrs: SrsState =
      typeof w.stage === "number" && typeof w.dueAt === "number"
        ? { stage: w.stage, dueAt: w.dueAt }
        : seedFromCounts(before, now);
    // 按次数逐次推进（调用方通常一次一个：答对 +1 / 答错 +1；多条一起报也按序折算）
    let srs: SrsState = prevSrs;
    for (let i = 0; i < Math.max(0, delta.correct || 0); i++) srs = onCorrect(srs, now);
    for (let i = 0; i < Math.max(0, delta.wrong || 0); i++) srs = onWrong(srs, now);
    w.stage = srs.stage;
    w.dueAt = srs.dueAt;
    w.lastAt = now;
    progress[lessonId] = l;
    save();
  }

  /**
   * 到期需要复习的词（间隔重复队列）：未掌握 且 已到期，按到期时间升序。
   * 返回不含词面信息（en/zh 由调用方经 lessons 数据查询），保持 store 不依赖数据层。
   */
  function getReviewQueue(now = Date.now()): ReviewItem[] {
    const out: ReviewItem[] = [];
    for (const id of Object.keys(progress)) {
      if (!isLessonKey(id)) continue;
      const words = progress[id]?.words;
      if (!words) continue;
      for (const wordId of Object.keys(words)) {
        const s = srsOf(words[wordId], now);
        if (isMastered(s) || s.dueAt > now) continue;
        out.push({ lessonId: id, wordId, stage: s.stage, dueAt: s.dueAt, ...countsOf(words[wordId]) });
      }
    }
    out.sort((a, b) => a.dueAt - b.dueAt);
    return out;
  }

  /** 尚未掌握的词（家长报告"待巩固"清单），按到期时间升序（最该练的在前面） */
  function getUnmasteredWords(now = Date.now()): ReviewItem[] {
    const out: ReviewItem[] = [];
    for (const id of Object.keys(progress)) {
      if (!isLessonKey(id)) continue;
      const words = progress[id]?.words;
      if (!words) continue;
      for (const wordId of Object.keys(words)) {
        const s = srsOf(words[wordId], now);
        if (isMastered(s)) continue;
        out.push({ lessonId: id, wordId, stage: s.stage, dueAt: s.dueAt, ...countsOf(words[wordId]) });
      }
    }
    out.sort((a, b) => a.dueAt - b.dueAt);
    return out;
  }

  /**
   * 掌握度概览（家长报告 + 今日目标用）：
   * tracked = 有学习记录的词数、mastered = 已掌握、due = 今天到期该复习的词数。
   * 课程总词数由调用方（数据层）提供，store 不依赖 lessons。
   */
  function masterySummary(now = Date.now()) {
    let tracked = 0;
    let mastered = 0;
    let due = 0;
    for (const id of Object.keys(progress)) {
      if (!isLessonKey(id)) continue;
      const words = progress[id]?.words;
      if (!words) continue;
      for (const wordId of Object.keys(words)) {
        tracked++;
        const s = srsOf(words[wordId], now);
        if (isMastered(s)) mastered++;
        else if (s.dueAt <= now) due++;
      }
    }
    return { tracked, mastered, learning: tracked - mastered, due };
  }

  /** 单词的 SRS 状态（老数据兜底折算一次，保证读到的永远合法） */
  function srsOf(w: WordStat, now: number): SrsState {
    if (typeof w.stage === "number" && typeof w.dueAt === "number") {
      return { stage: w.stage, dueAt: w.dueAt };
    }
    return seedFromCounts(w, now);
  }

  function countsOf(w: WordStat) {
    return { correct: w.correct || 0, wrong: w.wrong || 0, seen: w.seen || 0 };
  }

  /* ---------- 今日学情（家长报告） ---------- */

  /** 今日统计（非今天则返回空档，展示层按 0 处理） */
  const todayStats = computed<DailyStats>(() => {
    const d = progress._daily;
    if (d && d.date === today()) return d;
    return { date: today(), durationSec: 0, activities: 0 };
  });

  /**
   * 完成一次玩法后调用：累计今日时长与玩法数（跨天自动重置）。
   * @param durationSec 本次玩法会话时长（秒）
   */
  function addDailyActivity(durationSec: number) {
    const t = today();
    const d = progress._daily;
    const cur = d && d.date === t ? d : { date: t, durationSec: 0, activities: 0 };
    cur.durationSec += Math.max(0, Math.round(durationSec));
    cur.activities += 1;
    progress._daily = cur;
    // 每日快照：掌握度趋势的数据点（保留最近 30 天）
    const log = (progress._dailyLog = progress._dailyLog || {});
    log[t] = { durationSec: cur.durationSec, activities: cur.activities, mastered: masterySummary().mastered };
    const days = Object.keys(log).sort();
    for (const old of days.slice(0, Math.max(0, days.length - 30))) delete log[old];
    save();
  }

  /** 最近 n 天的每日快照（含今天），按日期升序 —— 家长报告趋势用 */
  function recentDays(n = 7): { date: string; durationSec: number; activities: number; mastered: number }[] {
    const log = progress._dailyLog || {};
    return Object.keys(log)
      .sort()
      .slice(-n)
      .map((date) => ({ date, ...log[date] }));
  }

  /* ---------- 最近课程（首页"继续学习"） ---------- */

  function setLastLesson(id: string) {
    progress._last = id;
    save();
  }

  const lastLesson = computed<string | null>(() => progress._last || null);

  function reset() {
    Object.keys(progress).forEach((k) => delete progress[k]);
    localStorage.removeItem(KEY);
  }

  return {
    progress,
    totalStars,
    lessonStars,
    setGameStars,
    markChest,
    markSong,
    isCompleted,
    isPlayed,
    isUnlocked,
    recordWord,
    getReviewQueue,
    getUnmasteredWords,
    masterySummary,
    todayStats,
    recentDays,
    dailyLog: computed(() => progress._dailyLog || {}),
    addDailyActivity,
    setLastLesson,
    lastLesson,
    reset
  };
});
