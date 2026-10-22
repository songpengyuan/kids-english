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
  it("进页显示第一句中文和打乱单词", () => {
    const w = mountView();
    expect(w.text()).toContain("我看见一只猫");
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

  it("按顺序拼完第一句后自动切换到第二句", async () => {
    const w = mountView();
    await flushPromises();

    // bank 里是打乱的单词，按正确顺序点 I / see / a / cat
    // 正确顺序数组
    const words = ["I", "see", "a", "cat"];
    for (const target of words) {
      const chip = w.findAll(".word-chip").find((c) => c.text() === target);
      expect(chip, `应找到单词块 ${target}`).toBeTruthy();
      await chip!.trigger("click");
    }
    await flushPromises();
    // 等待拼对后的发音+展示延迟（600ms）
    await new Promise((r) => setTimeout(r, 800));
    // 拼完第一句后，应切换到第二句
    expect(w.text()).toContain("它是红色的");
    expect(w.text()).not.toContain("我看见一只猫");
  });

  it("拼错时整组弹回，仍停留在当前句", async () => {
    const w = mountView();
    await flushPromises();
    // 故意乱点：先点 cat 再点 I
    await w.findAll(".word-chip").find((c) => c.text() === "cat")!.trigger("click");
    await w.findAll(".word-chip").find((c) => c.text() === "I")!.trigger("click");
    await flushPromises();
    // 还在第一句
    expect(w.text()).toContain("我看见一只猫");
  });
});
