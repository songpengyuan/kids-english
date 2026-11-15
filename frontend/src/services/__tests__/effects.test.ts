// @vitest-environment jsdom
/**
 * 庆祝特效：celebrate 三形态轮换（2026-11-15 杠杆④ 惊喜变量）。
 * 每次都一样的庆祝第二遍就腻——计数器轮转让孩子连续几次完成看到不同样子。
 * canvas-confetti 打桩捕获调用形状；haptics/sound 打桩隔离 WebAudio。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));
vi.mock("../haptics", () => ({ hapticCelebrate: vi.fn(), hapticSuccess: vi.fn() }));
vi.mock("../sound", () => ({ soundEnabled: () => true }));

import confetti from "canvas-confetti";
import { celebrate } from "../effects";

const callsOf = () => vi.mocked(confetti).mock.calls;

beforeEach(() => {
  vi.mocked(confetti).mockClear();
});

describe("effects · celebrate 三形态轮换", () => {
  it("连续三次 celebrate：中央爆发 → 彩带雨 → 双色对喷，形状互不相同", () => {
    celebrate();
    celebrate();
    celebrate();
    expect(callsOf().length).toBeGreaterThanOrEqual(4); // 1 + 3 + 2 = 6 次 confetti 调用
    // 形态 0：单发大爆发
    expect(callsOf()[0][0]).toMatchObject({ particleCount: 80, origin: { y: 0.6 } });
    // 形态 1：彩带雨 = 顶部三处、低速低重力
    const rain = callsOf().slice(1, 4);
    expect(rain.length).toBe(3);
    for (const c of rain) expect(c[0]).toMatchObject({ startVelocity: 22, gravity: 0.7 });
    // 形态 2：左右对喷两股
    const dual = callsOf().slice(4, 6);
    expect(dual.length).toBe(2);
    const left = dual[0]?.[0] as { origin: { x: number } } | undefined;
    const right = dual[1]?.[0] as { origin: { x: number } } | undefined;
    expect(left?.origin.x).toBeLessThan(0.5);
    expect(right?.origin.x).toBeGreaterThan(0.5);
  });

  it("第 4 次回到第一种形态（计数器轮转，不是随机）", () => {
    celebrate();
    celebrate();
    celebrate();
    callsOf().length = 0;
    celebrate();
    expect(callsOf()[0][0]).toMatchObject({ particleCount: 80 }); // 又是经典款
  });
});
