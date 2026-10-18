/**
 * 连一连（match）的纯逻辑：分组与星级。
 * 拖拽/命中等 DOM 交互留在组件里（依赖实际测量），这里只放可测的规则。
 */
import { splitBalanced } from "./layout";
import { shuffleWith } from "./quizSession";

export interface MatchGroupRange {
  min: number;
  max: number;
}

/**
 * 每组几对：3~5 对（孩子注意力窗口，太多会疲劳），按屏幕高矮收紧：
 * - tiny（手机横屏，<480px 高）：固定 3 对 —— 行数是图片大小的瓶颈，矮屏宁可多分一组；
 * - regular（平板横屏，640~900px 高）：最多 4 对 —— iPad 横屏 5 对时每行只有 ~110px，
 *   图片被压到 65px（2026-10-17 反馈"连一连图片太小"），减到 4 对行高 +30%；
 * - compact / roomy（手机竖屏 / 平板竖屏）：3~5 对不变。
 */
export function matchGroupRange(_isNarrow: boolean, sizeTier: string): MatchGroupRange {
  if (sizeTier === "tiny") return { min: 3, max: 3 };
  if (sizeTier === "regular") return { min: 3, max: 4 };
  return { min: 3, max: 5 };
}

/** 打乱后按容量均衡分组（组数尽量少、每组尽量满） */
export function buildMatchGroups<T>(
  words: readonly T[],
  range: MatchGroupRange,
  rng: () => number = Math.random
): T[][] {
  return splitBalanced(shuffleWith(words, rng), range.min, range.max);
}

/**
 * 星级按**连错次数**：一次没错 3 星、错 1~2 次 2 星、更多 1 星。
 * （连线是"试错式"玩法，连错不推进但会标红，用它衡量准确度最直接。）
 */
export function matchStars(wrongCount: number): number {
  if (wrongCount <= 0) return 3;
  if (wrongCount <= 2) return 2;
  return 1;
}
