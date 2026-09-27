/**
 * 看图学词星级 = 点读覆盖率。
 */
import { describe, expect, it } from "vitest";
import { learnStars } from "../learnSession";

describe("learnStars（点读覆盖率）", () => {
  it("都点过 → 3 星", () => {
    expect(learnStars(9, 9)).toBe(3);
    expect(learnStars(9, 10)).toBe(3); // 90%
  });

  it("点过大半 → 2 星", () => {
    expect(learnStars(6, 10)).toBe(2);
    expect(learnStars(8, 10)).toBe(2);
  });

  it("只翻页没点读 → 1 星（乱点蒙不过通关判定）", () => {
    expect(learnStars(0, 9)).toBe(1);
    expect(learnStars(5, 10)).toBe(1);
  });

  it("没有词时兜底 1 星", () => {
    expect(learnStars(0, 0)).toBe(1);
  });
});
