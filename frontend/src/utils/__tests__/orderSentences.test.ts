// @vitest-environment node
/**
 * 拼句子（order）题目句生成器（utils/orderSentences）：
 * 按本课单词产出 2–4 词亲子式陈述句，替代旧实现直接喂教材整句歌词。
 *
 * 覆盖的区分性行为（旧实现不具备）：
 *  - 全部句子 2–4 词、不含特殊疑问句（旧 l12 是 9 词长歌词、含 ?）；
 *  - 颜色 → It's X.；动词 → I can X.；形容词 → I'm X.；
 *    复数 → I see X.（不出现 It's a wheels 这类冠词错配）；单数 → It's a/an X.；
 *  - 多词头衔（含空格）不硬造句；同句英文去重；
 *  - 真实六课每课至少 1 句；词表为空时回退教材 ≤4 词陈述句保底不白屏。
 */
import { describe, expect, it } from "vitest";
import { orderSentences } from "../orderSentences";
import type { Lesson, Word } from "../../data/lessons";
import realLessons from "../../data/lessons.json";

function w(id: string, en: string, extra: Partial<Word> = {}): Word {
  return { id, en, zh: id, emoji: "🐾", image: null, lessonId: "lt", ...extra };
}

function lesson(words: Word[], phrases: Pick<Lesson, "phrases">["phrases"] = []): Pick<Lesson, "words" | "phrases"> {
  return { words, phrases };
}

const wc = (en: string) =>
  en.replace(/[?.!,“”"]/g, "").trim().split(/\s+/).filter(Boolean).length;

describe("orderSentences 拼句子题目：词驱动亲子短句", () => {
  it("全部 2–4 词、不含问号（不产出特殊疑问句）", () => {
    const out = orderSentences(lesson([w("bus", "bus"), w("wheels", "wheels"), w("blue", "blue")]));
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(wc(s.en)).toBeGreaterThanOrEqual(2);
      expect(wc(s.en)).toBeLessThanOrEqual(4);
      expect(s.en).not.toContain("?");
    }
  });

  it("颜色词 → It's X.（两词）：带 color 字段、colors 组、颜色形容词词表都能识别", () => {
    const out = orderSentences(
      lesson([
        w("red", "red", { color: "#E53935", group: "colors" }),
        w("blue", "blue"),
      ])
    );
    expect(out.map((o) => o.en)).toEqual(expect.arrayContaining(["It's red.", "It's blue."]));
    expect(out.find((o) => o.en === "It's red.")!.en).not.toMatch(/a|an/);
  });

  it("复数名词 → I see X.，不出现 It's a/an + 复数 的冠词错配", () => {
    const out = orderSentences(
      lesson([w("wheels", "wheels"), w("people", "people"), w("babies", "babies")])
    );
    expect(out.map((o) => o.en)).toContain("I see wheels.");
    expect(out.every((o) => !/^It's an? /.test(o.en))).toBe(true);
  });

  it("单数可数名词按 a/an；动词 I can X.；形容词 I'm X.", () => {
    const out = orderSentences(
      lesson([
        w("octopus", "octopus"),
        w("frog", "frog"),
        w("listen", "listen"),
        w("afraid", "afraid"),
      ])
    );
    expect(out.some((o) => o.en === "It's an octopus.")).toBe(true);
    expect(out.some((o) => o.en === "It's a frog.")).toBe(true);
    expect(out.some((o) => o.en === "I can listen.")).toBe(true);
    expect(out.some((o) => o.en === "I'm afraid.")).toBe(true);
  });

  it("多词头衔（含空格）不硬造句；结果按英文去重", () => {
    const out = orderSentences(
      lesson([w("mm", "Music Man"), w("frog", "frog"), w("frog2", "frog")])
    );
    expect(out.every((o) => !o.en.includes("Music Man"))).toBe(true);
    expect(out.filter((o) => o.en === "It's a frog.")).toHaveLength(1);
  });

  it("真实六课每课都生成至少 1 句，且没有超过 4 词的长句", () => {
    const lessons = realLessons as unknown as Pick<Lesson, "words" | "phrases">[];
    expect(lessons.length).toBeGreaterThan(0);
    for (const l of lessons) {
      const out = orderSentences(l);
      expect(out.length).toBeGreaterThan(0);
      for (const s of out) expect(wc(s.en)).toBeLessThanOrEqual(4);
    }
  });

  it("词表为空时回退教材 ≤4 词陈述句（跳过问句与长句），保证不白屏无题", () => {
    const fb = orderSentences({
      words: [],
      phrases: [
        { en: "How do you go?", zh: "", audio: "" },
        { en: "It's a frog.", zh: "", audio: "" },
        { en: "The wheels on the bus go round and round.", zh: "", audio: "" },
      ],
    });
    expect(fb.map((o) => o.en)).toEqual(["It's a frog."]);
  });
});
