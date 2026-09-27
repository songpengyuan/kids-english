/**
 * 游戏闯关地图的纯几何模块：布局计算 + 命中判定。
 * 与 GamePath.vue 绘制共享同一套常量与口径，任何改动必须同步更新
 * __tests__/pathGeometry.test.ts 与 docs（TDD：先测试后实现）。
 */

/** 节点圆半径 */
export const R = 28;
/** 节点纵向步进 */
export const ROW_H = 84;
/** 课程横幅高度 */
export const BAR_H = 56;
/** 横幅底 → 首节点圆心 */
export const BAR_GAP = 66;
/** 课末节点 → 下节横幅中心 */
export const UNIT_BREAK = 46;
/** 顶部留白 */
export const TOP = 16;
/** 底部留白 */
export const BOTTOM = 36;

export interface PathGeoItem {
  type: "unit" | "level";
  x: number;
  y: number;
  lessonId: string;
  activityKey?: string;
}

/**
 * 按课程/关卡序列计算地图纵向布局（不含宽度方向的 x，由调用方按宽度铺列）。
 */
export function buildPathGeometry(
  lessons: { id: string }[],
  levels: { lessonId: string; actKey: string }[]
): PathGeoItem[] {
  const out: PathGeoItem[] = [];
  let y = TOP;
  for (const l of lessons) {
    out.push({ type: "unit", x: 0, y, lessonId: l.id });
    y += BAR_H / 2 + BAR_GAP; // 横幅中心 → 首节点圆心
    const lvArr = levels.filter((lv) => lv.lessonId === l.id);
    for (let i = 0; i < lvArr.length; i++) {
      out.push({ type: "level", x: 0, y, lessonId: l.id, activityKey: lvArr[i].actKey });
      if (i + 1 < lvArr.length) y += ROW_H; // 末节点后不再累加，直接进 UNIT_BREAK
    }
    y += UNIT_BREAK; // 末节点圆心 → 下节横幅中心
  }
  return out;
}

/**
 * 命中判定：关卡节点（圆心 ≤ R+10）优先于课程横幅（居中整宽带）。
 * 返回命中的条目；未命中返回 null。
 */
export function hitTestPath<T extends PathGeoItem>(
  items: T[],
  px: number,
  py: number,
  width: number
): T | null {
  for (const it of items) {
    if (it.type === "level" && Math.hypot(px - it.x, py - it.y) <= R + 10) return it;
  }
  for (const it of items) {
    if (it.type === "unit" && px >= 0 && px <= width && py >= it.y - BAR_H / 2 - 6 && py <= it.y + BAR_H / 2 + 6) {
      return it;
    }
  }
  return null;
}

/**
 * 多邻国式 S 形等距节点（等弧长采样）。
 * 曲线：`x(t)=w/2+A·sin(2πt)`，`y(t)=startY+(endY-startY)·t`（t∈[0,1]），
 * 起点终点都在水平中线，中间沿 S 曲线左右摆动；
 * 按曲线弧长等距取 n 个点 → **首末关水平居中、相邻节点直线距离相等**。
 * @param n 该课关卡总数（≥1）
 */

/**
 * S 形横向振幅上限（px）。
 *
 * 曾是 `A = 0.12 × 容器宽`：手机上摆 ±41 还好，但 iPad/Mac 上摆到 ±80~±145，
 * 而纵向圆心距是固定的（CSS 里的 margin），于是**相邻节点的直线距离忽大忽小**
 * （实测 iPad：竖列 109 vs 斜列 136 → 看起来"不是等距"）。
 * 现在把振幅与纵向节奏绑定成固定值：各设备上的路径形状一致，斜距最多比竖距长 ~8%。
 */
export const SNAKE_SWING = 46;

/* ---------- 关卡纵向节奏（统一"视觉留白"） ----------
 *
 * 节点有两个可变量：**有没有进度环**。环是"光晕"，比按钮高 34px（上下各 17px），
 * 于是"固定 margin"永远会让留白忽大忽小：实测 环→环 28px、环→无环 43px、无环→无环 50px。
 *
 * 解法：间距**按相邻两关的形态动态算**，让"可见轮廓之间"的留白恒等于 VISUAL_GAP。
 * 代价是圆心距不再恒定（约 104~131px），但眼睛量的是留白，不是圆心。
 * 常量必须与 GamePath.vue 的 CSS 保持一致（改样式要同步改这里 + 跑单测）。
 */

/** 目标视觉留白：相邻两关"可见轮廓之间"的空白（px） */
export const VISUAL_GAP = 40;
/** 椭圆按钮高度 */
export const NODE_H = 57;
/** 按钮下方 3D 底座投影高度 */
export const NODE_BASE = 7;
/** 进度环相对按钮的上下外扩 */
export const RING_OVERHANG = 17;
/** 按钮 → 关卡名 的间距（lv-wrap 的 gap） */
export const LABEL_GAP = 18;
/** 关卡名行高 */
export const LABEL_H = 14.4;

/** 节点可见轮廓相对按钮上下缘的外扩量 */
export interface Overhang {
  top: number;
  bottom: number;
}

/** 有环：上下各外扩 RING_OVERHANG；无环：上缘就是按钮边缘，下缘多出 3D 底座 */
export function overhangOf(hasRing: boolean): Overhang {
  return hasRing ? { top: RING_OVERHANG, bottom: RING_OVERHANG } : { top: 0, bottom: NODE_BASE };
}

/**
 * 上一关（或课名横幅）到本关的 margin-top，使两者可见轮廓之间恒为 VISUAL_GAP。
 * @param prev 上一关的轮廓外扩；传 null 表示上一项是课名横幅（中间没有关卡名）
 */
export function marginBefore(prev: Overhang | null, cur: Overhang): number {
  if (!prev) return VISUAL_GAP + cur.top;
  return VISUAL_GAP - (LABEL_GAP + LABEL_H) + prev.bottom + cur.top;
}

/** 按上面的 margin 排布后，两关可见轮廓之间的实际留白（单测用它验证"处处相等"） */
export function visualGapOf(prev: Overhang, cur: Overhang, margin: number): number {
  return margin + LABEL_GAP + LABEL_H - prev.bottom - cur.top;
}

export interface SnakeNode {
  x: number;
  y: number;
}
export function snakeNodes(width: number, n: number, startY: number, endY: number): SnakeNode[] {
  // 等弧长 S 形：首末关都在水平中线；沿曲线弧长等距取 n 个点 → 间距视觉均匀
  const A = Math.min(0.12 * width, SNAKE_SWING);
  const H = endY - startY;
  const xAt = (t: number) => width / 2 + A * Math.sin(2 * Math.PI * t);
  const yAt = (t: number) => startY + H * t;
  if (n <= 1) return [{ x: xAt(0), y: yAt(0) }];
  if (H <= 0 || width <= 0) {
    return Array.from({ length: n }, () => ({ x: width / 2, y: startY }));
  }
  const M = 1200; // 曲线采样段数
  const cum = new Float64Array(M + 1);
  let px = xAt(0);
  let py = yAt(0);
  for (let i = 1; i <= M; i++) {
    const t = i / M;
    const nx = xAt(t);
    const ny = yAt(t);
    cum[i] = cum[i - 1] + Math.hypot(nx - px, ny - py);
    px = nx;
    py = ny;
  }
  const total = cum[M];

  const nodes: SnakeNode[] = [];
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * total;
    let lo = 0;
    let hi = M;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, Math.min(lo, M));
    const seg = cum[i] - cum[i - 1] || 1;
    const f = Math.min(1, Math.max(0, (target - cum[i - 1]) / seg));
    const t = (i - 1 + f) / M;
    nodes.push({ x: xAt(t), y: yAt(t) });
  }
  return nodes;
}
