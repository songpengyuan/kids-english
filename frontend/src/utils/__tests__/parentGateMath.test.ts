import { describe, expect, it } from "vitest";
import { checkGateAnswer, makeGateQuestion } from "../parentGateMath";

describe("家长门禁算术题", () => {
  it("题目合法：a/b ∈ [1,9]、和 ≤ 10、answer 正确", () => {
    for (let i = 0; i < 200; i++) {
      const q = makeGateQuestion();
      expect(q.a).toBeGreaterThanOrEqual(1);
      expect(q.b).toBeGreaterThanOrEqual(1);
      expect(q.a + q.b).toBeLessThanOrEqual(10);
      expect(q.answer).toBe(q.a + q.b);
    }
  });

  it("校验：正确答案通过，错误答案拒绝", () => {
    const q = { a: 3, b: 4, answer: 7 };
    expect(checkGateAnswer(q, "7")).toBe(true);
    expect(checkGateAnswer(q, " 7 ")).toBe(true); // 容忍空格
    expect(checkGateAnswer(q, "6")).toBe(false);
    expect(checkGateAnswer(q, "1")).toBe(false);
  });
});
