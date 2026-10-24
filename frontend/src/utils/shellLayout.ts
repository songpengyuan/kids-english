/**
 * 贝壳山形排布（纯函数）：顶层 1 枚，逐层 +1（金字塔），直到放完。
 * 6 枚 → 3-2-1；5 枚 → 2-2-1；4 枚 → 2-1-1；3 枚 → 2-1。
 * ChestReward 的展示区用它排贝壳山；收取过程中布局不变（按固定总数算）。
 */

/** 总数 → 每层枚数（自顶向下） */
export function shellRowsOf(n: number): number[] {
  const rows: number[] = [];
  let rem = n;
  let level = 1;
  while (rem > 0) {
    const cur = Math.min(level, rem);
    rows.push(cur);
    rem -= cur;
    level++;
  }
  return rows;
}

/** 第 ri 行首个贝壳的全局序号（0-based 偏移） */
export function rowOffsetOf(rows: number[], ri: number): number {
  let acc = 0;
  for (let i = 0; i < ri; i++) acc += rows[i];
  return acc;
}
