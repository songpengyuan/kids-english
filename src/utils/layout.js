/**
 * 网格容量计算
 *
 * 「一屏装下」形态下，每页能放几个格子不能写死——必须按**当前可用区域**和
 * **每格最小可读尺寸**反推，再用 maxCols / maxRows 兜住上限（避免 iPad 上一行
 * 挤 8 个导致卡片过宽过矮）。
 *
 * 纯函数，不依赖 Vue 与 DOM，方便单测与在任意容器上复用。
 *
 * @param {object} o
 * @param {number} o.width    可用区域宽（px）
 * @param {number} o.height   可用区域高（px）
 * @param {number} o.minCardW 单个格子最小可读宽
 * @param {number} o.minCardH 单个格子最小可读高
 * @param {number} [o.gap]    格子间距
 * @param {number} [o.maxCols]
 * @param {number} [o.maxRows]
 * @returns {{cols:number, rows:number, perPage:number}}
 */
export function fitGrid({
  width,
  height,
  minCardW,
  minCardH,
  gap = 12,
  maxCols = 4,
  maxRows = 4
}) {
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

/**
 * 在给定区域里为 count 个卡片挑一个**均衡**的列数。
 *
 * 不能简单取「最少列数」：屏幕很高时会算出 1 列，5 张卡片被拉成 5 条超宽横幅；
 * 也不能取「最多列数」：会得到又窄又扁的卡片。
 * 正确做法是逐个候选列数算出卡片实际宽高，选**长宽比最接近目标值**的那个。
 *
 * @param {object} o
 * @param {number} o.width        可用区域宽
 * @param {number} o.height       可用区域高
 * @param {number} o.count        卡片数量
 * @param {number} o.minCardW     卡片最小可读宽
 * @param {number} o.minCardH     卡片最小可读高
 * @param {number} [o.gap]
 * @param {number} [o.maxCols]
 * @param {number} [o.targetAspect] 目标长宽比 = 宽/高，横卡片约 1.2~1.4，方卡片约 1
 * @returns {{cols:number, rows:number}}
 */
export function pickColumns({
  width,
  height,
  count,
  minCardW,
  minCardH,
  gap = 12,
  maxCols = 5,
  targetAspect = 1.25
}) {
  const maxColsByW = Math.max(
    1,
    Math.min(maxCols, Math.floor((width + gap) / (minCardW + gap)))
  );

  const shape = (c) => {
    const rows = Math.ceil(count / c);
    const cardW = (width - (c - 1) * gap) / c;
    const cardH = (height - (rows - 1) * gap) / rows;
    return { rows, cardW, cardH };
  };

  // 1) 先找完全可读（宽高都不低于下限）的候选里，长宽比最接近目标的
  let best = null;
  for (let c = 1; c <= maxColsByW; c++) {
    const { rows, cardW, cardH } = shape(c);
    if (cardW < minCardW || cardH < minCardH) continue;
    const score = Math.abs(cardW / cardH - targetAspect);
    if (!best || score < best.score) best = { cols: c, rows, score };
  }
  if (best) return { cols: best.cols, rows: best.rows };

  // 2) 没有完全可读的候选（屏幕过小）：选"不可读程度 + 形状失衡"最小的那个兜底
  let fallback = null;
  for (let c = 1; c <= maxColsByW; c++) {
    const { rows, cardW, cardH } = shape(c);
    const shortfall =
      Math.max(0, minCardW - cardW) + Math.max(0, minCardH - cardH);
    const score = shortfall * 3 + Math.abs(cardW / Math.max(1, cardH) - targetAspect) * 20;
    if (!fallback || score < fallback.score) fallback = { cols: c, rows, score };
  }
  return { cols: fallback.cols, rows: fallback.rows };
}

/**
 * 把列表尽量均分成 k 组（每组 3~6 个），用于连线题的组划分。
 * 组数取满足「每组不超过 maxGroup」的最少组数，再均分；
 * 均分后若少于 minGroup 则减少一组重新均分。
 */
export function splitBalanced(list, minGroup = 3, maxGroup = 6) {
  const n = list.length;
  if (n <= maxGroup) return [list.slice()];
  let k = Math.ceil(n / maxGroup);
  while (k > 1 && Math.floor(n / k) < minGroup) k--;
  const out = [];
  let i = 0;
  for (let g = 0; g < k; g++) {
    const size = Math.ceil((n - i) / (k - g)); // 前几组多 1 个，保持落在 3~6
    out.push(list.slice(i, i + size));
    i += size;
  }
  return out;
}
