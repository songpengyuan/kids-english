/**
 * speechScore.js 纯函数测试：打分与档位判定。
 * 跟读判定直接影响"perfect/good/retry"与单词掌握度落库，边界必须锁死。
 */
import { describe, expect, it } from "vitest";
import { gradeScore, scorePronunciation } from "../speechScore";

describe("scorePronunciation", () => {
  it("完全匹配 → 1 分", () => {
    expect(scorePronunciation("blue", ["blue"]).score).toBe(1);
  });

  it("大小写与标点归一化后匹配 → 1 分", () => {
    expect(scorePronunciation("Blue", [" blue! "]).score).toBe(1);
  });

  it("识别句完整包含目标词（i see a blue）→ 1 分", () => {
    expect(scorePronunciation("blue", ["i see a blue"]).score).toBe(1);
  });

  it("编辑距离打分：blu → blue 得 0.75", () => {
    expect(scorePronunciation("blue", ["blu"]).score).toBe(0.75);
  });

  it("空候选 → 0 分且 heard 为空", () => {
    const r = scorePronunciation("blue", []);
    expect(r.score).toBe(0);
    expect(r.heard).toBe("");
  });

  it("取多条候选中最高分", () => {
    const r = scorePronunciation("blue", ["xyz", "blue"]);
    expect(r.score).toBe(1);
  });
});

describe("gradeScore", () => {
  it("0.85 及以上 → perfect", () => {
    expect(gradeScore(0.85)).toBe("perfect");
    expect(gradeScore(1)).toBe("perfect");
  });
  it("0.55 ~ 0.85 → good", () => {
    expect(gradeScore(0.55)).toBe("good");
    expect(gradeScore(0.7)).toBe("good");
    expect(gradeScore(0.8499)).toBe("good");
  });
  it("低于 0.55 → retry", () => {
    expect(gradeScore(0.54)).toBe("retry");
    expect(gradeScore(0)).toBe("retry");
  });
});
