// @vitest-environment node
/**
 * orderSentences 看图填空的补充边界用例——与 orderSentences.test.ts 互补。
 * 独立成文件的原因：该测试文件正被并行会话迭代（拼句子→看图填空重构），
 * 这边只锁定稳定的公共契约：空词表兜底、图卡池必含正确答案、
 * 不可数名词分支、phrases 不参与出题。
 */
import { describe, expect, it } from "vitest";
import { orderSentences } from "../orderSentences";
import type { Lesson, Word } from "../../data/lessons";

function w(id: string, en: string, extra: Partial<Word> = {}): Word {
  return { id, en, zh: id, emoji: "🐾", image: `/words/${id}.png`, lessonId: "lt", ...extra };
}

describe("orderSentences 边界补充", () => {
  it("words 为空数组 → 返回空数组（不抛错、不白屏）", () => {
    expect(orderSentences({ id: "lt", words: [], phrases: [] })).toEqual([]);
  });

  it("words 字段缺省 → 空数组（宽松 Pick 契约兜底）", () => {
    const lesson = { id: "lt", phrases: [] } as unknown as Pick<Lesson, "id" | "words" | "phrases">;
    expect(orderSentences(lesson)).toEqual([]);
  });

  it("每题 candidates 图卡池必须包含本题正确答案（组件洗牌后取前几张才不会无解）", () => {
    const out = orderSentences({
      id: "lt",
      phrases: [],
      words: [w("frog", "frog"), w("cat", "cat"), w("dog", "dog")],
    });
    expect(out.length).toBeGreaterThan(0);
    for (const item of out) {
      expect(item.candidates).toContainEqual(item.target);
    }
  });

  it("不可数名词 → I see the X.", () => {
    const out = orderSentences({ id: "lt", phrases: [], words: [w("sea", "sea")] });
    expect(out.map((o) => o.en)).toContain("I see the sea.");
    expect(out[0].before).toBe("I see the ");
  });

  it("phrases 不参与出题，为空也不影响产出", () => {
    const out = orderSentences({ id: "lt", phrases: [], words: [w("frog", "frog")] });
    expect(out).toHaveLength(1);
    expect(out[0].en).toBe("It's a frog.");
  });
});
