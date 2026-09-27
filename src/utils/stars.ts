/**
 * 星级换算的公共口径（1~3 星）。
 *
 * 各玩法的"分子"不同，但档位统一为 90% / 60%：
 * - 听音选图：首次答对率
 * - 看图学词：点读覆盖率（点过发音的词占比）
 * - 跟我读：首次通过率
 * - 连一连：按连错次数（0 次 3 星 / ≤2 次 2 星 / 其余 1 星，见 MatchView）
 */
export const STAR_THRESHOLDS = { three: 0.9, two: 0.6 };

/** 按比例给星（比例非法或为 0 时兜底 1 星：玩完就该有星，不做 0 星打击） */
export function starsForRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  if (ratio >= STAR_THRESHOLDS.three) return 3;
  if (ratio >= STAR_THRESHOLDS.two) return 2;
  return 1;
}
