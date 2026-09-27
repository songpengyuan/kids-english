/**
 * 看图学词（learn）的纯逻辑：点读覆盖率 → 星级。
 *
 * 这个玩法没有对错，只有"有没有认真听"。所以星级口径是**点读覆盖率**：
 * 课上每个词至少点过一次发音才算"学过"。全都点过 = 3 星，
 * 只翻页不点 → 1 星（于是"全部通关"（要求 ≥2 星）也不会被乱点蒙过去）。
 */
import { starsForRatio } from "./stars";

export function learnStars(tappedCount: number, total: number): number {
  if (total <= 0) return 1;
  return starsForRatio(tappedCount / total);
}
