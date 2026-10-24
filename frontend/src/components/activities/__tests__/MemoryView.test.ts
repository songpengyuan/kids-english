// @vitest-environment jsdom
/**
 * 翻牌记忆（MemoryView）完成判定回归（2026-10-24 走查 P0）：
 *  - 完成判定必须按**当前组实际对数**，不能按固定的 groupSize：
 *    10 词按 4/4/2 分组，最后一组只有 2 对，曾用 `n < groupSize(4)` 判断
 *    → 最后一组配完永不结算，关卡卡死（l11 Colors 实测复现）。
 *  - 剩 1 个词的余数组也要练（9 词 → 4/4/1）：曾经 `< 2` 直接丢弃，
 *    9 词的组永远少练最后一个词。
 *  - 进度跨组累计（顶栏 playPct 是 0-100 口径），换组不回退。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("../../../services/speech", () => ({ speak: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../services/effects", () => ({
  sfxCorrect: vi.fn(),
  sfxWrong: vi.fn(),
  sfxTap: vi.fn(),
}));
vi.mock("../../../stores/progress", () => ({
  useProgressStore: () => ({ progress: {}, recordWord: vi.fn() }),
}));

import MemoryView from "../MemoryView.vue";
import type { Word } from "../../../data/lessons";

function makeWords(n: number): Word[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `w${i}`,
    en: `word${i}`,
    zh: `词${i}`,
    emoji: "🙂",
    lessonId: "l-test",
    image: `/w${i}.png`,
  })) as unknown as Word[];
}

/** 配对一个词：图卡（img[alt=en]）+ 词卡（.word-text=en）各翻一张 */
async function matchWord(w: ReturnType<typeof mount>, en: string) {
  const cards = w.findAll(".m-card");
  const img = cards.find((c) => c.find(`img[alt="${en}"]`).exists());
  const word = cards.find((c) => {
    const t = c.find(".word-text");
    return t.exists() && t.text() === en;
  });
  expect(img, `图卡 ${en}`).toBeTruthy();
  expect(word, `词卡 ${en}`).toBeTruthy();
  await img!.trigger("pointerdown");
  await word!.trigger("pointerdown");
  await w.vm.$nextTick();
}

/** 玩完整局：逐组读完当前组的词并配对，组间推进 900ms 定时器。
 *  返回沿途见过的全部单词（验证不丢词）。 */
async function playAll(w: ReturnType<typeof mount>) {
  const seen = new Set<string>();
  for (let guard = 0; guard < 10; guard++) {
    const ens = [...w.element.querySelectorAll(".m-card")]
      .map((c) => c.querySelector("img")?.getAttribute("alt") || c.querySelector(".word-text")?.textContent || "")
      .filter(Boolean);
    if (!ens.length) break;
    for (const en of [...new Set(ens)]) {
      seen.add(en);
      await matchWord(w, en);
      if (w.emitted("done")) return seen;
    }
    // 本组配完 → 900ms 后进下一组（或结算）
    await vi.advanceTimersByTimeAsync(900);
    await w.vm.$nextTick();
    if (w.emitted("done")) return seen;
  }
  return seen;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("MemoryView 完成判定", () => {
  it("10 词（4/4/2 组）：最后一组 2 对配完也必须结算（曾永不完成）", async () => {
    const w = mount(MemoryView, { props: { words: makeWords(10) } });
    await playAll(w);
    expect(w.emitted("done")).toHaveLength(1);
    expect(w.emitted("done")![0][0]).toBe(3); // 全程无翻错 = 3 星
  });

  it("9 词（4/4/1 组）：最后一个词也在盘上（曾静默丢弃），且能结算", async () => {
    const w = mount(MemoryView, { props: { words: makeWords(9) } });
    const seen = await playAll(w);
    expect(seen.size).toBe(9);
    expect(w.emitted("done")).toHaveLength(1);
  });

  it("进度跨组累计（0-100）不回退，最终到 100", async () => {
    const w = mount(MemoryView, { props: { words: makeWords(10) } });
    await playAll(w);
    const ps = (w.emitted("progress") ?? []).map((e) => e[0] as number);
    expect(ps.length).toBeGreaterThan(0);
    for (let i = 1; i < ps.length; i++) expect(ps[i]).toBeGreaterThanOrEqual(ps[i - 1]);
    expect(ps[ps.length - 1]).toBe(100);
    // 总量上报 = 全部对数（曾按 组数×组大小 算出 12 ≠ 10）
    expect((w.emitted("total")?.at(-1)?.[0] as number)).toBe(10);
  });
});
