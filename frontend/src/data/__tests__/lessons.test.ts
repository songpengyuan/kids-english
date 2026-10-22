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
    expect(groups.map((g) => g.name)).toEqual(["颜色", "动物"]);
    expect(groups[0].words).toHaveLength(8); // brown + 7 颜色
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
