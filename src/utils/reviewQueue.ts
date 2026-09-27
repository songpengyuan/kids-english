/**
 * 到期队列 → 词面对象的映射（复习页 / 首页入口 / 家长报告共用）。
 *
 * 为什么需要：store 的队列只存 `lessonId + wordId`（保持 store 不依赖课程数据），
 * 而 localStorage 里可能残留**课程已删除**的词（老数据/换课时）。
 * 这类"孤儿词"无法出题，必须在展示层统一丢掉 —— 否则会出现
 * "报告说今天 2 个到期、复习页却是 0 个"的矛盾。
 */
import type { ReviewItem } from "../stores/progress";

export interface WordRef {
  id: string;
  lessonId: string;
}

/** 队列里能在词库中找到的词（保持队列顺序：最该练的在前面） */
export function dueWords<T extends WordRef>(items: ReviewItem[], pool: T[]): T[] {
  const out: T[] = [];
  for (const it of items) {
    const w = pool.find((x) => x.id === it.wordId && x.lessonId === it.lessonId);
    if (w) out.push(w);
  }
  return out;
}

/** 同上，但保留 store 的 SRS 信息（报告里显示"下次到期"用） */
export function dueEntries<T extends WordRef>(
  items: ReviewItem[],
  pool: T[]
): { item: ReviewItem; word: T }[] {
  const out: { item: ReviewItem; word: T }[] = [];
  for (const it of items) {
    const w = pool.find((x) => x.id === it.wordId && x.lessonId === it.lessonId);
    if (w) out.push({ item: it, word: w });
  }
  return out;
}
