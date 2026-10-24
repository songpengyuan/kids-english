// @vitest-environment jsdom
/**
 * 连一连·颜色配对模式（l11 Brown Bear：左列颜色圆 ↔ 右列动物图）回归：
 *  - 2026-10-25 走查 P0：颜色模式两列的 side 都是 "img"，而配对门控
 *    （点选配对 / 拖拽命中 / 多指配对）都要求**两侧不同**——颜色↔动物
 *    怎么点都连不上（浏览器实测点选与拖拽双双无效）。
 *    修复：颜色模式左列（色圆）扮演 "word" 侧。
 *  - 本文件锁定：点选色圆→动物能配对、错连不配对、全部配完 emit done。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("../../../services/speech", () => ({ speak: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../services/effects", () => ({
  sfxMatch: vi.fn(),
  sfxWrong: vi.fn(),
  sfxTap: vi.fn(),
}));
vi.mock("../../../services/haptics", () => ({ hapticTap: vi.fn() }));
vi.mock("../../../stores/progress", () => ({
  useProgressStore: () => ({ progress: {}, recordWord: vi.fn() }),
}));

import MatchView from "../MatchView.vue";
import type { Word } from "../../../data/lessons";

/** jsdom 没有 ResizeObserver（MatchView 测量连线坐标用） */
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;

/** l11 动物词 + colorPairs 的最小复刻（7 对） */
const animals = ["bird", "duck", "horse", "frog", "cat", "dog", "sheep"].map((id) => ({
  id,
  en: id,
  zh: id,
  emoji: "🐾",
  lessonId: "l11",
  image: `/lessons/l11/words/${id}.png`,
})) as unknown as Word[];
const colorPairs = [
  { color: "red", wordId: "bird" },
  { color: "yellow", wordId: "duck" },
  { color: "blue", wordId: "horse" },
  { color: "green", wordId: "frog" },
  { color: "purple", wordId: "cat" },
  { color: "white", wordId: "dog" },
  { color: "black", wordId: "sheep" },
];

/** 点选配对一张：模拟真实的"按下→抬起→按下→抬起"两段点击
 *  （⚠️ 不能按下两张再一起抬起——那会被按"多指手势"路径处理：
 *   第二指的抬起路径不清 dragPointer，后续手势全部被当成多指忽略） */
async function pairByClick(w: ReturnType<typeof mount>, colorId: string, animalId: string) {
  const cell = (sel: string) =>
    w.findAll(`[data-word="${sel}"]`).filter((c) => !c.classes().includes("gone"))[0];
  const a = cell(colorId);
  const b = cell(animalId);
  expect(a, `色圆 ${colorId}`).toBeTruthy();
  expect(b, `动物 ${animalId}`).toBeTruthy();
  await a.trigger("pointerdown");
  window.dispatchEvent(new Event("pointerup")); // 抬起：保留选中（点选模式）
  await w.vm.$nextTick();
  await b.trigger("pointerdown");
  window.dispatchEvent(new Event("pointerup")); // 抬起：执行配对
  await w.vm.$nextTick();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe("MatchView 颜色配对模式（左色圆 ↔ 右动物）", () => {
  it("左列色圆标 word 侧、右列动物标 img 侧（两侧不同才能配对）", async () => {
    const w = mount(MatchView, { props: { words: animals, colorPairs } });
    await w.vm.$nextTick();
    const cells = [...w.element.querySelectorAll("[data-word]")];
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) {
      const id = c.getAttribute("data-word")!;
      const side = c.getAttribute("data-side");
      if (id.startsWith("c-")) expect(side, `色圆 ${id}`).toBe("word");
      else expect(side, `动物 ${id}`).toBe("img");
    }
    w.unmount();
  });

  it("点选配对生效：正确对连上、错连不配对", async () => {
    const w = mount(MatchView, { props: { words: animals, colorPairs } });
    await w.vm.$nextTick();
    const map = new Map(colorPairs.map((p) => [`c-${p.wordId}`, p.wordId]));
    // 取当前盘面前两个色圆：第一个连正确动物，第二个连第一个的动物（必错）
    const colorIds = [...w.element.querySelectorAll('[data-word^="c-"]')].map(
      (c) => c.getAttribute("data-word")!
    );
    expect(colorIds.length).toBeGreaterThanOrEqual(2);
    const [ok1, ok2] = colorIds;
    await pairByClick(w, ok1, map.get(ok1)!);
    expect(w.find(`[data-word="${ok1}"]`).classes()).toContain("gone");
    expect(w.find(`[data-word="${map.get(ok1)}"]`).classes()).toContain("gone");
    // 错连：ok2 的色圆去连「第三个色圆的动物」（仍在盘上、且不是 ok2 的正确对）
    const thirdAnimal = colorIds
      .slice(2)
      .map((c) => map.get(c)!)
      .find((a) => a && a !== map.get(ok2));
    expect(thirdAnimal, "盘上应有第三对可选作错连目标").toBeTruthy();
    await pairByClick(w, ok2, thirdAnimal!);
    expect(w.find(`[data-word="${ok2}"]`).classes()).not.toContain("gone");
    expect(w.find(`[data-word="${thirdAnimal}"]`).classes()).not.toContain("gone");
    w.unmount();
  });

  it("配到一半不换组（colorMode 一对占两个 id，曾按 Set 尺寸提前误判完成）", async () => {
    const w = mount(MatchView, { props: { words: animals, colorPairs } });
    await w.vm.$nextTick();
    const map = new Map(colorPairs.map((p) => [`c-${p.wordId}`, p.wordId]));
    const colorIds = [...w.element.querySelectorAll('[data-word^="c-"]')].map(
      (c) => c.getAttribute("data-word")!
    );
    expect(colorIds.length).toBeGreaterThanOrEqual(3); // 组内至少 3 对才能演示"配一半"
    // 只配前 2 对（旧 bug：2 对 = 4 席 ≥ 组阈值 → 提前换组）
    await pairByClick(w, colorIds[0], map.get(colorIds[0])!);
    await pairByClick(w, colorIds[1], map.get(colorIds[1])!);
    await vi.advanceTimersByTimeAsync(1500); // 超过组间过场时长，不该有任何推进
    // 还在同一组：第 3 个色圆仍在盘上且未配对，已配的恰好 2 对（4 格）
    expect(w.find(`[data-word="${colorIds[2]}"]`).classes()).not.toContain("gone");
    expect(w.findAll(".cell.gone")).toHaveLength(4);
    w.unmount();
  });

  it("全部配完 → emit done（跨组推进）", async () => {
    const w = mount(MatchView, { props: { words: animals, colorPairs } });
    const map = new Map(colorPairs.map((p) => [`c-${p.wordId}`, p.wordId]));
    let guard = 0;
    while (!w.emitted("done") && guard++ < 10) {
      // 当前组的全部色圆
      const colorIds = [...w.element.querySelectorAll('[data-word^="c-"]')]
        .map((c) => c.getAttribute("data-word")!)
        .filter((id) => !w.find(`[data-word="${id}"]`).classes().includes("gone"));
      for (const cid of colorIds) {
        await pairByClick(w, cid, map.get(cid)!);
      }
      await vi.advanceTimersByTimeAsync(1200); // 组间过场
      await w.vm.$nextTick();
    }
    expect(w.emitted("done")).toHaveLength(1);
    w.unmount();
  });
});
