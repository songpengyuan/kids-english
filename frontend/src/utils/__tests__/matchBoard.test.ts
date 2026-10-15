import { describe, expect, it } from "vitest";
import { buildMatchGroups, matchGroupRange, matchStars } from "../matchBoard";

function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe("matchGroupRange", () => {
  it("统一 3~5 对", () => {
    expect(matchGroupRange(true, "wide")).toEqual({ min: 3, max: 5 });
    expect(matchGroupRange(false, "tiny")).toEqual({ min: 3, max: 5 });
    expect(matchGroupRange(false, "wide")).toEqual({ min: 3, max: 5 });
  });
});

describe("buildMatchGroups", () => {
  const words = Array.from({ length: 9 }, (_, i) => ({ id: `w${i}` }));

  it("分组不丢词、每组不超过上限、组数最少", () => {
    const groups = buildMatchGroups(words, { min: 3, max: 5 }, seeded());
    expect(groups.flat().map((w) => w.id).sort()).toEqual(words.map((w) => w.id).sort());
    expect(groups).toHaveLength(2); // 9 个词 → 2 组（5 + 4）
    for (const g of groups) {
      expect(g.length).toBeLessThanOrEqual(5);
      expect(g.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("词数不超上限时只有一组", () => {
    expect(buildMatchGroups(words.slice(0, 5), { min: 3, max: 5 }, seeded())).toHaveLength(1);
  });
});

describe("matchStars（按连错次数）", () => {
  it("0 次错 3 星、1~2 次 2 星、更多 1 星", () => {
    expect(matchStars(0)).toBe(3);
    expect(matchStars(1)).toBe(2);
    expect(matchStars(2)).toBe(2);
    expect(matchStars(3)).toBe(1);
  });
});
