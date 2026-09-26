/**
 * 开箱收取动画的抛物线轨迹（纯函数，可测）。
 * 用二次贝塞尔曲线：控制点取两端中点上方的 apex 高度 → 轨迹从源点
 * 上抛后落入目标点，视觉丝滑（无 JS 动画库依赖）。
 */

export interface Pt {
  x: number;
  y: number;
}

/**
 * 抛物线插值：t∈[0,1] → 轨迹点。
 * @param apex 拱顶相对两端中线的上抛高度（px，越大越弯）
 */
export function parabola(p0: Pt, p1: Pt, apex: number, t: number): Pt {
  const u = 1 - t;
  const cx = (p0.x + p1.x) / 2;
  const cy = Math.min(p0.y, p1.y) - apex;
  return {
    x: u * u * p0.x + 2 * u * t * cx + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * cy + t * t * p1.y,
  };
}
