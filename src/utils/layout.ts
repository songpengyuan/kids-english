/**
 * 网格容量计算（layout.js → TS 迁移，阶段 2-4）。
 *
 * 「一屏装下」形态下，每页能放几个格子不能写死——必须按**当前可用区域**和
 * **每格最小可读尺寸**反推，再用 maxCols / maxRows 兜住上限（避免 iPad 上一行
 * 挤 8 个导致卡片过宽过矮）。
 *
 * 纯函数，不依赖 Vue 与 DOM，方便单测与在任意容器上复用。
 */

export interface FitGridOptions {
  width: number;
  height: number;
  minCardW: number;
  minCardH: number;
  gap?: number;
  maxCols?: number;
  maxRows?: number;
}
export interface GridResult {
  cols: number;
  rows: number;
  perPage: number;
}

export function fitGrid({
  width,
  height,
  minCardW,
  minCardH,
  gap = 12,
  maxCols = 4,
  maxRows = 4
}: FitGridOptions): GridResult {
  // n 个格子 + (n-1) 个间距 <= 总长  =>  n <= (总长 + gap) / (格 + gap)
  const cols = Math.max(
    1,
    Math.min(maxCols, Math.floor((width + gap) / (minCardW + gap)))
  );
  const rows = Math.max(
    1,
    Math.min(maxRows, Math.floor((height + gap) / (minCardH + gap)))
  );
  return { cols, rows, perPage: cols * rows };
}

export interface PickColumnsOptions {
  width: number;
  height: number;
  count: number;
  minCardW: number;
  minCardH: number;
  gap?: number;
  maxCols?: number;
  maxRows?: number;
  targetAspect?: number;
}
export interface PickResult {
  cols: number;
  rows: number;
}

/**
 * 在给定区域里为 count 个卡片挑一个**均衡**的列数。
 *
 * 不能简单取「最少列数」：屏幕很高时会算出 1 列，卡片被拉成超宽横幅；
 * 也不能取「最多列数」：会得到又窄又扁的卡片。
 * 正确做法是逐个候选列数算出卡片实际宽高，选**长宽比最接近目标值**的那个。
 */
export function pickColumns({
  width,
  height,
  count,
  minCardW,
  minCardH,
  gap = 12,
  maxCols = 5,
  maxRows = 4,
  targetAspect = 1.25
}: PickColumnsOptions): PickResult {
  const maxColsByW = Math.max(
    1,
    Math.min(maxCols, Math.floor((width + gap) / (minCardW + gap)))
  );
  const maxRowsByH = Math.max(
    1,
    Math.min(maxRows, Math.floor((height + gap) / (minCardH + gap)))
  );

  const shape = (c: number) => {
    const rows = Math.ceil(count / c);
    const cardW = (width - (c - 1) * gap) / c;
    const cardH = (height - (rows - 1) * gap) / rows;
    return { rows, cardW, cardH };
  };

  // 1) 完全可读候选里挑长宽比最接近目标的
  let best: { cols: number; rows: number; score: number } | null = null;
  for (let c = 1; c <= maxColsByW; c++) {
    const { rows, cardW, cardH } = shape(c);
    if (rows > maxRowsByH) continue;
    if (cardW < minCardW || cardH < minCardH) continue;
    const score = Math.abs(cardW / cardH - targetAspect);
    if (!best || score < best.score) best = { cols: c, rows, score };
  }
  if (best) return { cols: best.cols, rows: best.rows };

  // 2) 无完全可读候选（屏幕过小）：选"不可读程度 + 形状失衡"最小的兜底
  let fallback: { cols: number; rows: number; score: number } | null = null;
  for (let c = 1; c <= maxColsByW; c++) {
    const { rows, cardW, cardH } = shape(c);
    if (rows > maxRowsByH) continue;
    const shortfall = Math.max(0, minCardW - cardW) + Math.max(0, minCardH - cardH);
    const score = shortfall * 3 + Math.abs(cardW / Math.max(1, cardH) - targetAspect) * 20;
    if (!fallback || score < fallback.score) fallback = { cols: c, rows, score };
  }
  if (fallback) return { cols: fallback.cols, rows: fallback.rows };

  // 3) 行数上限太紧、一页装不下全部：固定行数 = maxRowsByH，挑长宽比最接近的列数
  const rows = maxRowsByH;
  const cardH = (height - (rows - 1) * gap) / rows;
  let pick: { cols: number; score: number } | null = null;
  for (let c = 1; c <= maxColsByW; c++) {
    const cardW = (width - (c - 1) * gap) / c;
    const score = Math.abs(cardW / cardH - targetAspect);
    if (!pick || score < pick.score) pick = { cols: c, score };
  }
  return { cols: pick!.cols, rows };
}

/** 把列表尽量均分成 k 组（每组 3~6 个），用于连线题的组划分。 */
export function splitBalanced<T>(list: T[], minGroup = 3, maxGroup = 6): T[][] {
  const n = list.length;
  if (n <= maxGroup) return [list.slice()];
  let k = Math.ceil(n / maxGroup);
  while (k > 1 && Math.floor(n / k) < minGroup) k--;
  const out: T[][] = [];
  let i = 0;
  for (let g = 0; g < k; g++) {
    const size = Math.ceil((n - i) / (k - g));
    out.push(list.slice(i, i + size));
    i += size;
  }
  return out;
}
