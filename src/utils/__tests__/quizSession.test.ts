/**
 * 听音选图纯逻辑：洗牌、出题（含跨课干扰与复合键）、星级换算。
 */
import { describe, expect, it } from "vitest";
import { QUIZ_OPTIONS, buildQuizQuestions, shuffleWith, starsForFirstTry } from "../quizSession";
import { starsForRatio } from "../stars";

/** 确定性伪随机（LCG），便于断言 */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const words = ["a", "b", "c", "d", "e"].map((id) => ({
  id,
  en: id,
  lessonId: "l4",
}));

describe("shuffleWith", () => {
  it("不改变入参，且元素集合一致", () => {
    const src = [1, 2, 3, 4, 5];
    const out = shuffleWith(src, seeded());
    expect(src).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(out).toHaveLength(5);
  });
});

describe("buildQuizQuestions", () => {
  it("每个词一题，选项含正确项且每题 4 个不重复选项", () => {
    const qs = buildQuizQuestions(words, seeded());
    expect(qs).toHaveLength(5);
    for (const q of qs) {
      expect(q.options).toHaveLength(QUIZ_OPTIONS);
      expect(q.options.map((o) => o.id)).toContain(q.target.id);
      expect(new Set(q.options.map((o) => o.id)).size).toBe(QUIZ_OPTIONS);
    }
  });

  it("词数不足 4 时不塞重复选项", () => {
    const qs = buildQuizQuestions(words.slice(0, 3), seeded());
    expect(qs[0].options).toHaveLength(3);
  });

  it("干扰项可从外部词库取（复习页跨课出题）", () => {
    const lesson4 = [{ id: "blue", en: "blue", lessonId: "l4" }];
    const pool = [
      { id: "blue", en: "blue", lessonId: "l4" },
      { id: "blue", en: "blue", lessonId: "l6" },
      { id: "red", en: "red", lessonId: "l6" },
      { id: "green", en: "green", lessonId: "l6" },
      { id: "pink", en: "pink", lessonId: "l6" },
    ];
    const qs = buildQuizQuestions(lesson4, seeded(), pool, (w) => `${w.lessonId}:${w.id}`);
    const ids = qs[0].options.map((o) => `${o.lessonId}:${o.id}`);
    // 正确项是 l4:blue，干扰项里不能再出现同 key 的项
    expect(ids).toContain("l4:blue");
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((k) => k === "l4:blue")).toHaveLength(1);
  });
});

describe("星级 = 首次答对率", () => {
  it("档位：≥90% 三星、≥60% 两星、其余一星", () => {
    expect(starsForFirstTry(10, 10)).toBe(3);
    expect(starsForFirstTry(9, 10)).toBe(3);
    expect(starsForFirstTry(8, 10)).toBe(2);
    expect(starsForFirstTry(6, 10)).toBe(2);
    expect(starsForFirstTry(5, 10)).toBe(1);
    expect(starsForFirstTry(0, 10)).toBe(1);
  });

  it("题数为 0 时兜底 1 星", () => {
    expect(starsForFirstTry(0, 0)).toBe(1);
    expect(starsForRatio(Number.NaN)).toBe(1);
  });
});
