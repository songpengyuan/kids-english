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

export interface FitLearnOptions {
  width: number;
  height: number;
  /** 本课单词总数——容量函数会尽量让一页装下，避免频繁翻页 */
  count: number;
  minCardW: number;
  minCardH: number;
  gap?: number;
  maxCols?: number;
  maxRows?: number;
  /** 卡内"图片以外"的估算高度（单词条 + 内边距 + 间隙） */
  cardChrome?: number;
  /** 图片绘制区距卡片边缘的估算留白（单侧，含 94% 填充系数） */
  picInset?: number;
}
export interface FitLearnResult {
  cols: number;
  rows: number;
  perPage: number;
}

/**
 * 看图学词专用的容量函数（区别于通用 fitGrid）。
 *
 * 通用 fitGrid 只按最小可读尺寸铺满行列，在 iPad 横屏会把行高摊得很薄，
 * 方形插图被压成 101px 高的小图（实测 220×172 的卡只画出 179×101 的图）。
 * 这里反过来：以"图片实际绘制尺寸"为目标，逐行数候选里挑**图片最大的**方案，
 * 且列数由 ceil(count / rows) 决定——优先一页装下本课全部词，减少翻页。
 */
export function fitLearnGrid({
  width,
  height,
  count,
  minCardW,
  minCardH,
  gap = 12,
  maxCols = 5,
  maxRows = 3,
  cardChrome = 55,
  picInset = 12
}: FitLearnOptions): FitLearnResult {
  let best: { cols: number; rows: number; img: number } | null = null;
  for (let r = 1; r <= maxRows; r++) {
    const cardH = (height - (r - 1) * gap) / r;
    if (cardH < minCardH) continue;
    // 一页装下所需的列数；列再多只会把卡片摊薄，不加分
    for (let c = Math.max(1, Math.ceil(count / r)); c <= maxCols; c++) {
      const cardW = (width - (c - 1) * gap) / c;
      if (cardW < minCardW) break;
      const img = Math.min(cardW - picInset * 2, cardH - cardChrome);
      if (img <= 0) continue;
      // 图片大者优先；并列（宽度受限区）时行数多者空隙更少
      if (!best || img > best.img || (img === best.img && r > best.rows)) {
        best = { cols: c, rows: r, img };
      }
    }
  }
  if (best) return { cols: best.cols, rows: best.rows, perPage: best.cols * best.rows };

  // 兜底（屏幕过小，没有任何候选）：退回通用铺满逻辑
  const cols = Math.max(1, Math.min(maxCols, Math.floor((width + gap) / (minCardW + gap))));
  const rows = Math.max(1, Math.min(maxRows, Math.floor((height + gap) / (minCardH + gap))));
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
