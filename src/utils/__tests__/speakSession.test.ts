import { describe, expect, it } from "vitest";
import { speakStars } from "../speakSession";

describe("speakStars（首次通过率）", () => {
  it("≥80% 三星", () => {
    expect(speakStars(9, 9)).toBe(3);
    expect(speakStars(8, 10)).toBe(3);
  });
  it("≥50% 两星", () => {
    expect(speakStars(5, 10)).toBe(2);
    expect(speakStars(7, 10)).toBe(2);
  });
  it("其余一星（读得少也至少有 1 星，不打击）", () => {
    expect(speakStars(4, 10)).toBe(1);
    expect(speakStars(0, 9)).toBe(1);
    expect(speakStars(0, 0)).toBe(1);
  });
});
