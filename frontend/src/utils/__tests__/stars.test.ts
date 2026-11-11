// @vitest-environment jsdom
/**
 * 星级换算公共口径（utils/stars.ts）：全玩法结算的分数出口。
 *
 * 档位：≥90% 3 星 / ≥60% 2 星 / 其余 1 星。
 * 兜底规则：比例非法或为 0 → 兜底 1 星（玩完就该有星，不做 0 星打击）——
 * 这条是产品口径，回归（比如把兜底改成 0 星打击孩子）会在这里红。
 */
import { describe, expect, it } from "vitest";
import { STAR_THRESHOLDS, starsForRatio } from "../stars";

describe("starsForRatio", () => {
  it("档位边界：0.9 与 0.6 两条线（含等号）", () => {
    expect(STAR_THRESHOLDS).toEqual({ three: 0.9, two: 0.6 });
    expect(starsForRatio(1)).toBe(3);       // 全对
    expect(starsForRatio(0.9)).toBe(3);     // 恰好 90%（等号进 3 星）
    expect(starsForRatio(0.899)).toBe(2);   // 差一点就是 2 星
    expect(starsForRatio(0.6)).toBe(2);     // 恰好 60%（等号进 2 星）
    expect(starsForRatio(0.599)).toBe(1);
  });

  it("兜底：0 / 负数 / NaN / Infinity 一律 1 星（玩完就该有星）", () => {
    for (const bad of [0, -0.5, NaN, Infinity, -Infinity]) {
      expect(starsForRatio(bad)).toBe(1);
    }
    // 0 星不存在：最差也是 1 星
    expect(starsForRatio(0)).toBeGreaterThan(0);
  });
});
