// @vitest-environment jsdom
/**
 * 拼句子（OrderView）行为：
 * - 进页显示第一句的中文提示 + 打乱单词块
 * - 按正确顺序点单词拼完一句 → 自动读英文 → 立刻切换到下一句
 * - 拼错 → 整组弹回，句子不变
 * - 全部拼完 → emit done
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
import type { Lesson } from "../../../data/lessons";

const lesson = {
  id: "l-test",
  phrases: [
    { en: "I see a cat", zh: "我看见一只猫" },
    { en: "It is red", zh: "它是红色的" },
  ],
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

describe("OrderView", () => {
  it("进页显示听句子按钮和打乱单词", () => {
    const w = mountView();
    expect(w.text()).toContain("Listen");
    // 4 个单词块
    const chips = w.findAll(".word-chip");
    expect(chips.length).toBe(4);
  });

  it("句子槽按目标词数显示横线占位（不再只有一个问号），拼一个少一条", async () => {
    const w = mountView();
    // 第一句 "I see a cat" = 4 个词 → 4 条横线
    expect(w.findAll(".slot-empty")).toHaveLength(4);
    expect(w.text()).not.toContain("？");
    // 放一个词进槽：横线 −1，实词 +1
    await w.findAll(".word-chip")[0].trigger("click");
    expect(w.findAll(".slot-empty")).toHaveLength(3);
    expect(w.findAll(".slot-word")).toHaveLength(1);
  });

  it("拼完第一句后显示 Next 按钮，点 Next 才切到第二句", async () => {
    const w = mountView();
    await flushPromises();

    const words = ["I", "see", "a", "cat"];
    for (const target of words) {
      const chip = w.findAll(".word-chip").find((c) => c.text() === target);
      expect(chip, `应找到单词块 ${target}`).toBeTruthy();
      await chip!.trigger("click");
    }
    await flushPromises();
    await new Promise((r) => setTimeout(r, 800));
    // 拼对后显示 Next 按钮，bank 隐藏
    expect(w.text()).toContain("Next");
    expect(w.findAll(".word-chip")).toHaveLength(0);
    // 点 Next
    await w.find(".next-btn").trigger("click");
    await flushPromises();
    // 新句子的词出现在 bank 里
    const bankTexts = w.findAll(".word-chip").map((c) => c.text());
    expect(bankTexts).toContain("red");
    expect(bankTexts).toContain("It");
  });

  it("拼错时整组弹回，仍停留在当前句", async () => {
    const w = mountView();
    await flushPromises();
    await w.findAll(".word-chip").find((c) => c.text() === "cat")!.trigger("click");
    await w.findAll(".word-chip").find((c) => c.text() === "I")!.trigger("click");
    await flushPromises();
    // 还在第一句（bank 仍在）
    expect(w.findAll(".word-chip").length).toBeGreaterThan(0);
  });
});
