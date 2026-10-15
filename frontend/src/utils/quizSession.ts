/**
 * 听音选图（quiz）的纯逻辑：出题、洗牌、首次答对率到星级的换算。
 * 与 Vue / 音效 / store 解耦，便于单测（组件层只做胶水）。
 */
import { starsForRatio } from "./stars";

export interface QuizWord {
  id: string;
  en: string;
  lessonId: string;
}

export interface QuizQuestion<T extends QuizWord> {
  target: T;
  options: T[];
}

/** 每题选项数：1 个正确 + 3 个干扰 */
export const QUIZ_OPTIONS = 4;

/** Fisher-Yates 洗牌（可注入 rng 便于测试；不改变入参） */
export function shuffleWith<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 出题：每个单词一题，选项 = 正确项 + 干扰项。
 *
 * @param words   本次要考的词（每题一个）
 * @param pool    干扰项来源（默认同 words；复习页会传全词库做跨课干扰）
 * @param keyOf   词的唯一键（默认 word.id；复习页用 lessonId:id，避免跨课同 id 串味）
 */
export function buildQuizQuestions<T extends QuizWord>(
  words: readonly T[],
  rng: () => number = Math.random,
  pool: readonly T[] = words,
  keyOf: (w: T) => string = (w) => w.id
): QuizQuestion<T>[] {
  return shuffleWith(words, rng).map((target) => {
    const distractors = shuffleWith(
      pool.filter((w) => keyOf(w) !== keyOf(target)),
      rng
    ).slice(0, QUIZ_OPTIONS - 1);
    return { target, options: shuffleWith([target, ...distractors], rng) };
  });
}

/**
 * 星级 = 首次答对率。
 *
 * 为什么不是"总答对数"：本玩法规则是"答错不推进、必须选对才能下一题"，
 * 所以总答对数在结束时必然等于题数（恒 3 星）。
 * 改成"第一下就选对的比例"，星级才真正反映掌握程度，
 * 也与连一连（按连错次数）、跟我读（按首次通过率）的口径一致。
 */
export function starsForFirstTry(firstTryRight: number, total: number): number {
  if (total <= 0) return 1;
  return starsForRatio(firstTryRight / total);
}
