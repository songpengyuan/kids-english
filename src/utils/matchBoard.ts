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
 * 每组几对：屏幕越小每组越少，避免中间单词列被挤到看不清。
 * 手机（窄屏/极小屏）2~4 对；平板与桌面 3~6 对。
 */
export function matchGroupRange(isNarrow: boolean, sizeTier: string): MatchGroupRange {
  return isNarrow || sizeTier === "tiny" ? { min: 2, max: 4 } : { min: 3, max: 6 };
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
