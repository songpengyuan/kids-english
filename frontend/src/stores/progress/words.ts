/**
 * 单词掌握度域：学习事件记录 + 间隔重复（SRS）队列 + 掌握度概览。
 * 不依赖数据层（lessons）——队列条目不含词面信息，en/zh 由调用方查。
 */
import {
  isMastered,
  onCorrect,
  onWrong,
  seedFromCounts,
  type SrsState,
} from "../../utils/reviewSchedule";
import { countsOf, isLessonKey, srsOf, type ProgressMap, type ReviewItem, type WordStat } from "./shared";

export interface WordMasteryDomain {
  recordWord: (
    lessonId: string,
    wordId: string,
    delta: { seen?: number; correct?: number; wrong?: number }
  ) => void;
  getReviewQueue: (now?: number) => ReviewItem[];
  getUnmasteredWords: (now?: number) => ReviewItem[];
  masterySummary: (now?: number) => { tracked: number; mastered: number; learning: number; due: number };
}

export function createWordMastery(opts: {
  progress: ProgressMap;
  /** 持久化 + 触发云上报（门面 save()，见 index.ts） */
  save: () => void;
}): WordMasteryDomain {
  const { progress, save } = opts;

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
    const l = (progress[lessonId] || { words: {} }) as ProgressMap[string];
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
        const s = srsOf(words[wordId] as WordStat, now);
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

  return { recordWord, getReviewQueue, getUnmasteredWords, masterySummary };
}
