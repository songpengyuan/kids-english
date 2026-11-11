/**
 * 课时数据：l11 词群（颜色 / 动物）与配对数据一致性。
 *
 * 词群是 LearnStage/Quiz/Memory/Speak 分组切换的数据来源：
 *  - 每个词都必须登记到某个 group，否则该词会在分组玩法里静默消失；
 *  - wordGroups 的并集必须覆盖全部词（漏一个 = 孩子学不到）；
 *  - colorPairs（连一连）引用的 wordId 必须存在且属于动物组。
 */
import { describe, expect, it } from "vitest";
import { getLesson, wordGroupsOf } from "../lessons";

const L11 = getLesson("l11")!;

describe("l11 词群", () => {
  it("配置两个部分：颜色 / 动物", () => {
    const groups = wordGroupsOf(L11);
    expect(groups.map((g) => g.key)).toEqual(["colors", "animals"]);
    expect(groups.map((g) => g.name)).toEqual(["Colors", "Animals"]);
    expect(groups[0].words).toHaveLength(10); // 颜色歌/PDF 第一页的 10 个颜色（brown/red/yellow/blue/green/orange/pink/purple/white/black）
    expect(groups[1].words).toHaveLength(9); // 9 动物
  });

  it("分组并集 = 全部词，且没有词漏登记 group", () => {
    const grouped = wordGroupsOf(L11).flatMap((g) => g.words.map((w) => w.id));
    expect(new Set(grouped).size).toBe(grouped.length); // 一个词只属于一组
    expect(grouped.sort()).toEqual(L11.words.map((w) => w.id).sort());
    expect(L11.words.filter((w) => !w.group)).toEqual([]);
  });

  it("颜色组的词都带图片（分组卡片不能退化成 emoji 占位）", () => {
    const colors = wordGroupsOf(L11)[0].words;
    expect(colors.every((w) => !!w.image)).toBe(true);
  });

  it("colorPairs 引用的都是存在的动物词", () => {
    const animals = new Set(wordGroupsOf(L11)[1].words.map((w) => w.id));
    for (const pair of L11.colorPairs ?? []) {
      expect(animals.has(pair.wordId), `colorPairs 引用了非动物词 ${pair.wordId}`).toBe(true);
    }
    expect((L11.colorPairs ?? []).length).toBeGreaterThan(0);
  });
});

describe("课程简介（intro）", () => {
  it("l13 的简介原样映射进 Lesson（字段不丢）", () => {
    const l13 = getLesson("l13")!;
    expect(l13.intro).toBeTruthy();
    expect(l13.intro).toContain("Good Night, Gorilla");
    // 老师给的整段内容都要在：故事 + 重点词汇 + 拓展词汇 + 绘语句子
    expect(l13.intro).toContain("重点词汇");
    expect(l13.intro).toContain("拓展词汇");
    expect(l13.intro).toContain("Good night, zoo.");
  });

  it("l13 简介长度在折叠卡可读区间（>40 且 <800 字）", () => {
    const l13 = getLesson("l13")!;
    expect(l13.intro!.length).toBeGreaterThan(40);
    expect(l13.intro!.length).toBeLessThan(800);
  });

  it("7 节课都有老师给的简介，且首段是课程故事、含重点词汇段", () => {
    for (const id of ["l5", "l4", "l9", "l10", "l11", "l12", "l13"]) {
      const lesson = getLesson(id)!;
      expect(lesson.intro, id).toBeTruthy();
      const paragraphs = lesson.intro!.split(/\n{2,}/).map((s) => s.trim());
      expect(paragraphs.length, id).toBeGreaterThan(2);
      expect(paragraphs[0].length, id).toBeGreaterThan(40);
      // “重点词汇：…”由词卡承接，about 页会过滤，所以必须能识别到这个前缀
      expect(paragraphs.some((p) => p.startsWith("重点词汇")), id).toBe(true);
    }
  });

  it("课时日期按老师课程表校正", () => {
    const dates = Object.fromEntries(
      ["l5", "l4", "l9", "l10", "l11", "l12", "l13"].map((id) => [id, getLesson(id)!.date])
    );
    expect(dates).toEqual({
      l5: "2026-09-16",
      l4: "2026-09-18",
      l9: "2026-10-09",
      l10: "2026-10-16",
      l11: "2026-10-23",
      l12: "2026-11-04",
      l13: "2026-11-11",
    });
  });

  it("l12 简介保留歌词与重点词汇，不丢老师原文关键句", () => {
    const l12 = getLesson("l12")!;
    expect(l12.intro).toContain("The wheels on the bus go round and round.");
    expect(l12.intro).toContain("daddies");
    expect(l12.intro).toContain("重点词汇");
  });

  it("l11 简介保留颜色/动物词与绘本问答句", () => {
    const l11 = getLesson("l11")!;
    expect(l11.intro).toContain("gold 金色");
    expect(l11.intro).toContain("Goldfish, goldfish, what do you see?");
    expect(l11.intro).toContain("What color is it?");
  });
});
