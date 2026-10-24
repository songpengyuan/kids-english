// @vitest-environment jsdom
/**
 * 连一连会话（composable）行为测试：
 * 分组键与重算、普通/颜色两模式的列布局、配对判定与记分、星级与计数文案。
 */
import { describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { useMatchSession } from "../useMatchSession";

const words = ["a", "b", "c", "d"].map((id) => ({ id, en: id, lessonId: "l4" }));
/** isNarrow=true + tiny → 分组尺寸走小档，让 4 个词也产生多组（具体数值由 utils/matchBoard 定） */
const isNarrow = ref(true);
const sizeTier = ref("tiny");

function setup(colorPairs: { color: string; wordId: string }[] | null = null, list = words) {
  const onMatched = vi.fn();
  const onWrong = vi.fn();
  const s = useMatchSession(ref(list), ref(colorPairs), isNarrow, sizeTier, { onMatched, onWrong });
  return { s, onMatched, onWrong };
}

describe("useMatchSession", () => {
  it("普通模式：两列布局（左图右词），无中间列", () => {
    const { s } = setup();
    s.setupGroup(s.curGroup.value);
    // 至少 1 组；普通模式 midWords 有词、rightImgs 为空
    expect(s.groups.value.length).toBeGreaterThanOrEqual(1);
    expect(s.midWords.value.length).toBe(s.curGroup.value.length);
    expect(s.rightImgs.value).toHaveLength(0);
    expect(s.leftImgs.value.length).toBe(s.curGroup.value.length);
  });

  it("配对成功：双方入 matched、方向与配对对落表、回调带词", () => {
    const { s, onMatched } = setup();
    s.setupGroup(s.curGroup.value);
    const [img, word] = [s.leftImgs.value[0], s.midWords.value.find((w) => w.id === s.leftImgs.value[0].id)!];
    s.tryMatch(img, "img", word, "word");
    expect(s.matched.has(img.id)).toBe(true);
    expect(s.matched.has(word.id)).toBe(true);
    expect(s.matchFrom[img.id]).toBe("img");
    expect(s.pairMap[img.id]).toBe(word.id);
    expect(onMatched).toHaveBeenCalledWith(word);
    expect(s.groupDone.value).toBe(s.totalPairs.value === 1);
  });

  it("配对失败：wrongCount 计数、不进 matched、onWrong 带两侧与方向", () => {
    const { s, onWrong } = setup();
    s.setupGroup(s.curGroup.value);
    const [a, b] = [s.leftImgs.value[0], s.midWords.value.find((w) => w.id !== s.leftImgs.value[0].id)!];
    s.tryMatch(a, "img", b, "word");
    expect(s.wrongCount.value).toBe(1);
    expect(s.matched.size).toBe(0);
    expect(onWrong).toHaveBeenCalledWith({ id: a.id, side: "img" }, { id: b.id, side: "word" });
  });

  it("颜色模式：左列是颜色伪卡（matchId 指回动物 id）、无中间列、组内只含配对词", () => {
    const cps = [
      { color: "#e53935", wordId: "a" },
      { color: "#fdd835", wordId: "b" },
    ];
    const { s } = setup(cps);
    expect(s.colorMode.value).toBe(true);
    s.setupGroup(s.curGroup.value);
    expect(s.curGroup.value.every((w) => cps.some((p) => p.wordId === w.id))).toBe(true);
    expect(s.midWords.value).toHaveLength(0);
    expect(s.leftImgs.value.every((w) => w.matchId && w.id.startsWith("c-"))).toBe(true);
    expect(s.rightImgs.value.length + s.leftImgs.value.length).toBe(s.curGroup.value.length * 2);
  });

  it("颜色模式配对：颜色伪卡 ↔ 动物图经 matchId 命中", () => {
    const cps = [
      { color: "#e53935", wordId: "a" },
      { color: "#fdd835", wordId: "b" },
    ];
    const { s, onMatched } = setup(cps);
    s.setupGroup(s.curGroup.value);
    const animal = s.rightImgs.value[0];
    const colorCard = s.leftImgs.value.find((w) => w.matchId === animal.id)!;
    s.tryMatch(colorCard, "img", animal, "img");
    expect(s.matched.has(colorCard.id)).toBe(true);
    expect(s.matched.has(animal.id)).toBe(true);
    expect(onMatched).toHaveBeenCalledWith(animal);
  });

  it("counterText：多组带组号，单组只显示进度", () => {
    const { s } = setup(null, words.slice(0, 2));
    s.setupGroup(s.curGroup.value);
    // 单组时文案是 "0 / 2" 形态
    expect(s.counterText.value).toMatch(/^0 \/ \d+$/);
  });

  it("分组输入不变时不重算（groups 引用稳定，随机洗牌不会途中重洗）", () => {
    const { s } = setup();
    const before = s.groups.value;
    s.tryMatch(s.leftImgs.value[0] || words[0], "img", words[1], "word");
    expect(s.groups.value).toBe(before);
  });
});
