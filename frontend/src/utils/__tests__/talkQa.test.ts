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
import realLessons from "../../data/lessons.json";

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

describe("talkQa × 真实课时数据（lessons.json）", () => {
  const lessons = realLessons as never as { id: string; phrases: { en: string }[]; words: Word[] }[];

  it("每课每个词都有问句与答句，答句不会是裸模板词以外的坏英文", () => {
    for (const lesson of lessons) {
      if (!lesson.phrases?.length) continue;
      for (const word of lesson.words) {
        const qa = talkQa(word, lesson as never);
        expect(qa.a, `${lesson.id}/${word.en} 答句为空`).toBeTruthy();
        expect(qa.a, `${lesson.id}/${word.en} 答句应含本词`).toContain(word.en.split(" ").pop()!);
      }
    }
  });

  it("l5 动物词走 I see a ... 问答，不再产出 I can play the squirrel.", () => {
    const l5 = lessons.find((l) => l.id === "l5")!;
    expect(talkQa(l5.words.find((x) => x.en === "squirrel")!, l5 as never)).toEqual({
      q: "What do you see?",
      a: "I see a squirrel.",
    });
    // 乐器词不受影响：仍是 What can you play? 家族
    expect(talkQa(l5.words.find((x) => x.en === "violin")!, l5 as never).q).toBe("What can you play?");
  });

  it("l5 Music Man 走角色问答，不再产出 I can play the Music Man.（弹奏一个人）", () => {
    const l5 = lessons.find((l) => l.id === "l5")!;
    expect(talkQa(l5.words.find((x) => x.en === "Music Man")!, l5 as never)).toEqual({
      q: "Who are you?",
      a: "I am the Music Man!",
    });
  });

  it("l10 afraid/listen 有自己的问答（afraid 用儿歌原句 I'm not afraid.）", () => {
    const l10 = lessons.find((l) => l.id === "l10")!;
    expect(talkQa(l10.words.find((x) => x.en === "afraid")!, l10 as never)).toEqual({
      q: "Are you afraid?",
      a: "I'm not afraid.",
    });
    expect(talkQa(l10.words.find((x) => x.en === "listen")!, l10 as never)).toEqual({
      q: "What can you do?",
      a: "I can listen.",
    });
    // 动物词与 jungle 不受影响
    expect(talkQa(l10.words.find((x) => x.en === "frog")!, l10 as never).a).toBe("It's a frog.");
    expect(talkQa(l10.words.find((x) => x.en === "jungle")!, l10 as never).a).toBe("It's a jungle.");
  });
});
