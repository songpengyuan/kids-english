// @vitest-environment node
/**
 * 亲子对话按词选问答（utils/talkQa）：
 * - 精确匹配：现成答句 + 它前面最近的问句（l11 bear → "What animal is it?"）
 * - 同组替换：答句里的同组示例词换成本词（duck → "It's a bear." → "It's a duck."，
 *   冠词天然正确；red → "It's brown." → "It's red."）——修掉过去 "It's duck." 缺冠词、
 *   动物图配"什么颜色"问句的错配
 * - 祈使句不作答句（l9 nose 不再命中 "Put it on your nose."，落模板 "This is my nose."）
 * - 问句示例词按轮替换（l9 "Where is your finger?" → "Where is your nose?"）
 * - 填空模板（l4 "I see a ..." → "I see a seahorse."）
 */
import { describe, expect, it } from "vitest";
import { talkQa } from "../talkQa";
import type { Word } from "../../data/lessons";

function w(id: string, en: string, group?: string): Word {
  return { id, en, zh: id, emoji: "🐾", image: null, lessonId: "l11", ...(group ? { group } : {}) };
}

const l11 = {
  id: "l11",
  phrases: [
    { en: "What color is it?", zh: "", audio: "" },
    { en: "It's brown.", zh: "", audio: "" },
    { en: "What animal is it?", zh: "", audio: "" },
    { en: "It's a bear.", zh: "", audio: "" },
  ],
  words: [
    w("brown", "brown", "colors"),
    w("red", "red", "colors"),
    w("bear", "bear", "animals"),
    w("duck", "duck", "animals"),
  ],
  wordGroups: [
    { key: "colors", name: "Colors" },
    { key: "animals", name: "Animals" },
  ],
} as never;

const l9 = {
  id: "l9",
  phrases: [
    { en: "Where is your finger?", zh: "", audio: "" },
    { en: "This is my head.", zh: "", audio: "" },
    { en: "Put it on your nose.", zh: "", audio: "" },
    { en: "Point your finger up.", zh: "", audio: "" },
    { en: "Wave goodbye!", zh: "", audio: "" },
  ],
  words: [w("nose", "nose"), w("head", "head"), w("finger", "finger"), w("arm", "arm")],
} as never;

const l4 = {
  id: "l4",
  phrases: [
    { en: "What do you see?", zh: "", audio: "" },
    { en: "I see a ...", zh: "", audio: "" },
  ],
  words: [w("seahorse", "seahorse"), w("blue", "blue")],
} as never;

describe("talkQa 按词选问答", () => {
  it("l11 动物词：问句换 What animal，答句同组替换、冠词不缺", () => {
    expect(talkQa(w("duck", "duck", "animals"), l11)).toEqual({
      q: "What animal is it?",
      a: "It's a duck.",
    });
  });

  it("l11 颜色词：同组替换自 It's brown. → It's red.", () => {
    expect(talkQa(w("red", "red", "colors"), l11)).toEqual({
      q: "What color is it?",
      a: "It's red.",
    });
  });

  it("有现成答句的词：精确匹配 + 取答句前最近的问句", () => {
    expect(talkQa(w("bear", "bear", "animals"), l11)).toEqual({
      q: "What animal is it?",
      a: "It's a bear.",
    });
    expect(talkQa(w("brown", "brown", "colors"), l11)).toEqual({
      q: "What color is it?",
      a: "It's brown.",
    });
  });

  it("l9：答句不命中祈使句；问句示例词按轮替换", () => {
    expect(talkQa(w("head", "head"), l9)).toEqual({ q: "Where is your head?", a: "This is my head." });
    // 过去会命中祈使句 "Put it on your nose."
    expect(talkQa(w("nose", "nose"), l9)).toEqual({ q: "Where is your nose?", a: "This is my nose." });
    expect(talkQa(w("arm", "arm"), l9)).toEqual({ q: "Where is your arm?", a: "This is my arm." });
    // 本身就是问句示例词的那轮：问句保持原样
    expect(talkQa(w("finger", "finger"), l9)).toEqual({
      q: "Where is your finger?",
      a: "This is my finger.",
    });
  });

  it("l4：填空模板 I see a ... 填入本词", () => {
    expect(talkQa(w("seahorse", "seahorse"), l4)).toEqual({
      q: "What do you see?",
      a: "I see a seahorse.",
    });
    expect(talkQa(w("blue", "blue"), l4)).toEqual({ q: "What do you see?", a: "I see a blue." });
  });

  it("课里没有问句：q 为空串，答句兜底为词本身", () => {
    const lesson = { id: "x", phrases: [{ en: "Hello!", zh: "", audio: "" }], words: [w("cat", "cat")] } as never;
    expect(talkQa(w("cat", "cat"), lesson)).toEqual({ q: "", a: "cat" });
  });
});
