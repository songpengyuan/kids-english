// @vitest-environment node
/**
 * 拼句子（order）题目（utils/orderSentences）：看图填空。
 * 每道题 = 框架文字（before/after）+ 一个带词图的目标词 target。
 *
 * 覆盖的区分性行为：
 *  - 颜色 → It's X.；动词 → I can X.；形容词 → I'm X.；
 *    复数 → I see X.（不出现 It's a wheels 这类冠词错配）；单数 → It's a/an X.；
 *  - 每题 before/target/after 拼回完整 en；多词头衔（含空格）不造句；同句去重；
 *  - 只有带图的词才出题（图卡填空必须有图）；词表无图时回退空数组（不白屏硬上）。
 */
import { describe, expect, it } from "vitest";
import { orderSentences } from "../orderSentences";
import type { Lesson, Word } from "../../data/lessons";
import realLessons from "../../data/lessons.json";

function w(id: string, en: string, extra: Partial<Word> = {}): Word {
  return { id, en, zh: id, emoji: "🐾", image: `/words/${id}.png`, lessonId: "lt", ...extra };
}

function lesson(words: Word[], phrases: Pick<Lesson, "phrases">["phrases"] = [], id = "lt"): Pick<Lesson, "id" | "words" | "phrases"> {
  return { id, words, phrases };
}

describe("orderSentences 看图填空题目", () => {
  it("每题 before + target + after 拼回完整 en，且 target 带图", () => {
    const out = orderSentences(lesson([w("bus", "bus"), w("wheels", "wheels")]));
    expect(out.length).toBeGreaterThan(0);
    for (const item of out) {
      expect(item.before + item.target.en + item.after).toBe(item.en);
      expect(item.target.image).toBeTruthy();
    }
  });

  it("颜色词 → It's X.（before=It's ）：带 color 字段、colors 组、颜色形容词词表都能识别", () => {
    const out = orderSentences(
      lesson([
        w("red", "red", { color: "#E53935", group: "colors" }),
        w("blue", "blue"),
      ])
    );
    const red = out.find((o) => o.en === "It's red.")!;
    expect(red).toBeTruthy();
    expect(red.before).toBe("It's ");
    expect(red.target.en).toBe("red");
    expect(out.map((o) => o.en)).toContain("It's blue.");
  });

  it("复数名词 → I see X.，before=I see ，不出现 It's a/an + 复数", () => {
    const out = orderSentences(
      lesson([w("wheels", "wheels"), w("people", "people"), w("babies", "babies")])
    );
    const wheels = out.find((o) => o.en === "I see wheels.")!;
    expect(wheels.before).toBe("I see ");
    expect(out.every((o) => !/^It's an? /.test(o.en))).toBe(true);
  });

  it("单数可数按 a/an；动词 I can X.；形容词 I'm X.，before 正确", () => {
    const out = orderSentences(
      lesson([
        w("octopus", "octopus"),
        w("frog", "frog"),
        w("listen", "listen"),
        w("afraid", "afraid"),
      ])
    );
    expect(out.find((o) => o.en === "It's an octopus.")!.before).toBe("It's an ");
    expect(out.find((o) => o.en === "It's a frog.")!.target.en).toBe("frog");
    expect(out.find((o) => o.en === "I can listen.")!.before).toBe("I can ");
    expect(out.find((o) => o.en === "I'm afraid.")!.before).toBe("I'm ");
  });

  it("多词头衔（含空格）不造句；同句英文去重", () => {
    const out = orderSentences(
      lesson([w("mm", "Music Man"), w("frog", "frog"), w("frog2", "frog")])
    );
    expect(out.every((o) => !o.en.includes("Music Man"))).toBe(true);
    expect(out.filter((o) => o.en === "It's a frog.")).toHaveLength(1);
  });

  it("没图的词不出题（图卡填空必须有图）", () => {
    const out = orderSentences(
      lesson([{ ...w("cat", "cat"), image: null } as Word])
    );
    expect(out).toHaveLength(0);
  });

  it("真实六课每课都能产出至少一道看图填空题", () => {
    const lessons = realLessons as unknown as Pick<Lesson, "id" | "words" | "phrases">[];
    expect(lessons.length).toBeGreaterThan(0);
    for (const l of lessons) {
      const out = orderSentences(l);
      expect(out.length, `课 ${l.id} 没出图填空题`).toBeGreaterThan(0);
    }
  });

  it("l12 Wheels on the Bus 走安静书专属句型：The [部件] on the bus go [拟声]", () => {
    const l = realLessons.find((x: { id: string }) => x.id === "l12") as unknown as Pick<Lesson, "id" | "words" | "phrases">;
    const out = orderSentences(l);
    const wheels = out.find((o) => o.target.en === "wheels")!;
    expect(wheels.en).toBe("The wheels on the bus go round and round.");
    expect(wheels.before).toBe("The ");
    expect(wheels.after).toBe(" on the bus go round and round.");
    // bus 是固定语境：既不是任何题的 target，也不出现在图卡池
    expect(out.every((o) => o.target.en !== "bus")).toBe(true);
    expect(out.every((o) => o.candidates.every((c) => c.en !== "bus"))).toBe(true);
    // 动词按主语单复数变位（与儿歌唱法一致）：复数 go，单数 goes
    const door = out.find((o) => o.target.en === "door")!;
    expect(door.en).toBe("The door on the bus goes open and shut.");
    const horn = out.find((o) => o.target.en === "horn")!;
    expect(horn.en).toBe("The horn on the bus goes beep, beep, beep.");
    expect(out.filter((o) => o.en.includes(" go ")).map((o) => o.target.en).sort())
      .toEqual(["babies", "daddies", "mommies", "people", "wheels", "wipers"]);
  });
});
