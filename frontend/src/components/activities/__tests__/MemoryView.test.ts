// @vitest-environment jsdom
/**
 * 翻牌记忆（MemoryView）完成判定回归（2026-10-24 走查 P0）：
 *  - 完成判定必须按**当前组实际对数**，不能按固定的 groupSize：
 *    曾经词数不整除时最后一组不足（10 词 → 4/4/2），用 `n < groupSize(4)` 判断
 *    → 最后一组配完永不结算，关卡卡死（l11 Colors 实测复现）。
 *  - 分组改为**均衡摊派**（9 词 → 3/3/3、10 词 → 4/3/3）：曾经整除切片丢弃余数，
 *    9 词的组永远少练最后一个词；不能出现"只有 1 对"的单薄小组。
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
  it("10 词（4/3/3 均衡分组）：最后一组配完必须结算（曾永不完成）", async () => {
    const w = mount(MemoryView, { props: { words: makeWords(10) } });
    await playAll(w);
    expect(w.emitted("done")).toHaveLength(1);
    expect(w.emitted("done")![0][0]).toBe(3); // 全程无翻错 = 3 星
  });

  it("9 词（3/3/3 均衡分组）：每个词都在盘上（曾静默丢弃最后一个），且能结算", async () => {
    const w = mount(MemoryView, { props: { words: makeWords(9) } });
    const seen = await playAll(w);
    expect(seen.size).toBe(9);
    expect(w.emitted("done")).toHaveLength(1);
  });

  it("分组均衡：任意两组对数最多差 1，且没有 1 对的单薄小组", async () => {
    for (const n of [7, 9, 10, 11]) {
      const w = mount(MemoryView, { props: { words: makeWords(n) } });
      const sizes: number[] = [];
      // 逐组推进并记录每组的实际对数
      for (let guard = 0; guard < 10; guard++) {
        sizes.push(w.findAll(".m-card").length / 2);
        const ens = [...new Set([...w.element.querySelectorAll(".m-card")]
          .map((c) => c.querySelector("img")?.getAttribute("alt") || c.querySelector(".word-text")?.textContent || ""))];
        for (const en of ens) await matchWord(w, en);
        await vi.advanceTimersByTimeAsync(900);
        await w.vm.$nextTick();
        if (w.emitted("done")) break;
      }
      // 组容量与组件同口径：>=8 词 4 对，否则 3 对
      const cap = n >= 8 ? 4 : Math.min(3, Math.floor(n / 2));
      const g = Math.ceil(n / cap);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n); // 不丢词
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1); // 组间最多差 1
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(Math.floor(n / g)); // 没有单薄组
      expect(w.emitted("done")).toHaveLength(1);
      w.unmount();
    }
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
