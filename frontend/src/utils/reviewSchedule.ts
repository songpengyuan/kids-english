/**
 * 间隔重复（SRS）排期 —— 纯函数，不依赖 Vue / 存储，便于单测。
 *
 * 记忆阶段 stage 与"下次该复习的时间"：
 *   stage 0  刚答错 / 首次进队列     → 1 天后
 *   stage 1  复习通过 1 次           → 3 天后
 *   stage 2  复习通过 2 次           → 7 天后
 *   stage 3  复习通过 3 次           → 14 天后
 *   stage 4  复习通过 4 次 = 已掌握   → 移出复习队列（不再排期）
 *
 * 语义：答错一律打回 stage 0（"明天再来"），答对进一级。
 * "1/3/7 天"的到期队列就落在 stage 0..2 上，stage 3 是巩固期。
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** 各阶段完成后到下次复习的间隔（天）；索引 = stage */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14];

/** 达到该阶段视为"已掌握"，移出复习队列 */
export const MASTERED_STAGE = REVIEW_INTERVALS_DAYS.length;

/** SRS 状态：stage 记忆阶段 + dueAt 下次到期时间戳（已掌握时为 0） */
export interface SrsState {
  stage: number;
  dueAt: number;
}

function clampStage(stage: number): number {
  if (!Number.isFinite(stage) || stage < 0) return 0;
  return Math.min(Math.round(stage), MASTERED_STAGE);
}

/** 某阶段完成后到下次复习的间隔（毫秒） */
export function intervalMsFor(stage: number): number {
  const s = clampStage(stage);
  if (s >= MASTERED_STAGE) return 0;
  return REVIEW_INTERVALS_DAYS[s] * DAY_MS;
}

/** 答对一次：进一级（到顶即掌握，dueAt 归 0 = 不再排期） */
export function onCorrect(state: SrsState, now: number): SrsState {
  const stage = clampStage(state.stage + 1);
  return { stage, dueAt: stage >= MASTERED_STAGE ? 0 : now + intervalMsFor(stage) };
}

/** 答错一次：打回 stage 0，1 天后再来 */
export function onWrong(_state: SrsState, now: number): SrsState {
  return { stage: 0, dueAt: now + intervalMsFor(0) };
}

/** 是否已掌握（不再进复习队列） */
export function isMastered(state: SrsState): boolean {
  return clampStage(state.stage) >= MASTERED_STAGE;
}

/** 是否到期该复习了（已掌握的不再到期） */
export function isDue(state: SrsState, now: number): boolean {
  if (isMastered(state)) return false;
  return state.dueAt <= now;
}

/**
 * 老数据迁移：把"只记了 correct/wrong 次数"的历史单词折算成 SRS 状态。
 * - stage = clamp(correct - wrong, 0, MASTERED)：对得越多越熟
 * - 老的"弱词"（答错过且正确 ≤ 错误）= stage 0，**立即到期**，升级后马上出现在复习队列
 * - 其余按 lastAt + 当前阶段间隔排期（没有 lastAt 就按 now）
 */
export function seedFromCounts(
  counts: { correct?: number; wrong?: number; lastAt?: number },
  now: number
): SrsState {
  const correct = counts.correct || 0;
  const wrong = counts.wrong || 0;
  const stage = clampStage(correct - wrong);
  if (stage >= MASTERED_STAGE) return { stage, dueAt: 0 };
  if (wrong > 0 && stage === 0) return { stage: 0, dueAt: now };
  const base = counts.lastAt || now;
  return { stage, dueAt: base + intervalMsFor(stage) };
}
