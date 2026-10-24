/**
 * 抛物线飞行动画：把一个已定位（absolute）的元素从 from 沿抛物线飞到 to。
 *
 * 抽出来的原因：宝箱"收取"的逐枚飞行是通用的视效件（flyCurve.ts 提供轨迹
 * 纯函数，这里是它的 rAF 驱动层），脱离 ChestReward 也能复用。
 *
 * 用法：
 *   const flyOne = useFlyToEl(flyEl);
 *   await flyOne({ x: 100, y: 400 }, { x: 300, y: 40 }, 200); // apex = 上抛弧高
 */
import type { Ref } from "vue";
import { parabola } from "../utils/flyCurve";

export interface FlyPoint {
  x: number;
  y: number;
}

const FLY_MS = 380;

export function useFlyToEl(
  flyEl: Ref<HTMLElement | null>,
  /** 每帧回调（当前抛物线位置）：调用方用来拉拖尾粒子等视效 */
  onStep?: (p: FlyPoint, t: number) => void
) {
  return function flyOne(from: FlyPoint, to: FlyPoint, apex: number): Promise<void> {
    return new Promise((resolve) => {
      const el = flyEl.value;
      if (!el) return resolve();
      const target = el;
      target.style.opacity = "1";
      target.style.left = from.x + "px";
      target.style.top = from.y + "px";
      const t0 = performance.now();
      function step(now: number) {
        const t = Math.min((now - t0) / FLY_MS, 1);
        const p = parabola(from, to, apex, t);
        target.style.left = p.x + "px";
        target.style.top = p.y + "px";
        onStep?.(p, t);
        if (t < 1) requestAnimationFrame(step);
        else {
          target.style.opacity = "0";
          resolve();
        }
      }
      requestAnimationFrame(step);
    });
  };
}
