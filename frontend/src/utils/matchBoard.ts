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
 * 每组几对：统一 3~5 对（孩子注意力窗口，太多会疲劳）。
 */
export function matchGroupRange(_isNarrow: boolean, _sizeTier: string): MatchGroupRange {
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
