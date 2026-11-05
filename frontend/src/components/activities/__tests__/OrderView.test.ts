// @vitest-environment jsdom
/**
 * 拼句子 OrderView（2026-11-05 起为「看图填空」）：
 * - 进页显示框架句子 + 一组词图卡（不再有点文字单词块）
 * - 点对正确图 → 句子空槽出现该图、朗读整句、显示 Next
 * - 点错图 → 抖动一下、不锁、仍停留在当前句
 * - 看答案 → 直接把正确图填进空槽
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

vi.mock("../../../services/speech", () => ({ speak: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../services/effects", () => ({
  sfxCorrect: vi.fn(),
  sfxWrong: vi.fn(),
  sfxTap: vi.fn(),
}));
vi.mock("../../../stores/progress", () => ({
  useProgressStore: () => ({ progress: {} }),
}));

import OrderView from "../OrderView.vue";
import type { Lesson, Word } from "../../../data/lessons";

function w(id: string, en: string): Word {
  return { id, en, zh: id, emoji: "🐾", image: `/${id}.png`, lessonId: "l-test" } as Word;
}

const lesson = {
  id: "l-test",
  words: [w("wipers", "wipers"), w("bus", "bus"), w("cat", "cat")],
} as unknown as Lesson;

beforeEach(() => {
  vi.clearAllMocks();
});

function mountView() {
  return mount(OrderView, {
    props: { lesson },
    global: { stubs: { "router-link": true } },
  });
}

function cardByAlt(w: ReturnType<typeof mountView>, alt: string) {
  return w.findAll(".pic-card").find((c) => c.find("img").attributes("alt") === alt);
}

describe("OrderView 看图填空", () => {
  it("进页显示 Listen、框架句子和三张词图卡", () => {
    const v = mountView();
    expect(v.text()).toContain("Listen");
    expect(v.text()).toContain("I see "); // wipers 是复数 → "I see ___."
    expect(v.findAll(".pic-card")).toHaveLength(3);
    // 空槽此时还没有图
    expect(v.find(".pic-slot img").exists()).toBe(false);
  });

  it("点错图 → 抖动标记、不进下一句、图卡仍在", async () => {
    const v = mountView();
    await flushPromises();
    await cardByAlt(v, "bus")!.trigger("click");
    expect(v.findAll(".pic-card").length).toBeGreaterThan(0);
    expect(v.find(".next-btn").exists()).toBe(false);
    expect(v.find(".pic-card.wrong").exists()).toBe(true);
  });

  it("点对正确图 → 空槽出现该图、朗读整句、出现 Next", async () => {
    const v = mountView();
    await flushPromises();
    await cardByAlt(v, "wipers")!.trigger("click");
    await flushPromises();
    expect(v.find(".pic-slot img").attributes("src")).toBe("/wipers.png");
    expect(v.text()).toContain("Next");
    expect(v.findAll(".pic-card")).toHaveLength(0);
  });

  it("看答案 → 直接把正确图填进空槽", async () => {
    const v = mountView();
    await flushPromises();
    await v.find(".answer-btn").trigger("click");
    await flushPromises();
    expect(v.find(".pic-slot img").attributes("src")).toBe("/wipers.png");
    expect(v.text()).toContain("Next");
  });

  it("Next 切到下一题，重新出现三张图卡", async () => {
    const v = mountView();
    await flushPromises();
    await cardByAlt(v, "wipers")!.trigger("click");
    await flushPromises();
    await v.find(".next-btn").trigger("click");
    await flushPromises();
    // 第二题 target=bus（It's a ___）：仍有三张图卡
    expect(v.findAll(".pic-card")).toHaveLength(3);
    expect(v.find(".pic-slot img").exists()).toBe(false);
  });
});
