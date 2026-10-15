/**
 * flyCurve 纯函数测试：开箱收取时宝石/贝壳抛物线飞行动画的核心轨迹。
 * TDD 基线：任何轨迹插值的改动必须过这里（与 ChestReward 收取动画一一对应）。
 */
import { describe, expect, it } from "vitest";
import { parabola } from "../flyCurve";

describe("parabola", () => {
  const p0 = { x: 100, y: 500 }; // 宝箱位置
  const p1 = { x: 800, y: 60 }; // 顶部贝壳徽标

  it("t=0 在起点、t=1 在终点", () => {
    expect(parabola(p0, p1, 160, 0)).toEqual(p0);
    expect(parabola(p0, p1, 160, 1)).toEqual(p1);
  });

  it("t=0.5 拱顶明显高于起终点线性中点（抛物线弧度）", () => {
    const mid = parabola(p0, p1, 160, 0.5);
    expect(mid.x).toBeCloseTo((p0.x + p1.x) / 2);
    // 线性中点 y=280，拱顶 90：明显上抛后再下落
    expect(mid.y).toBeLessThan((p0.y + p1.y) / 2 - 100);
  });

  it("顶点高度随 apex 增大而更高（更弯）", () => {
    const flat = parabola(p0, p1, 60, 0.5).y;
    const tall = parabola(p0, p1, 260, 0.5).y;
    expect(tall).toBeLessThan(flat);
  });

  it("轨迹单调平滑：t 递增时 x 单调（无回弹）", () => {
    const xs = [0, 0.25, 0.5, 0.75, 1].map((t) => parabola(p0, p1, 160, t).x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  });
});
