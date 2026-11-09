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
    // 图卡已随机打乱、干扰随机抽：任意一张不是正确答案(wipers)的卡都算点错
    const wrongCard = v.findAll(".pic-card").find(
      (c) => c.find("img").attributes("alt") !== "wipers"
    )!;
    await wrongCard.trigger("click");
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

  it("l12 图卡池大于 3 张时正确答案也必须始终在选项里（回归：slice(0,3) 会裁掉 target）", async () => {
    // 安静书实景：8 个部件全部带图 → 图卡池 8 张，若直接洗牌取前 3，
    // 每题有 5/8 概率正确答案根本不在场，孩子无图可点（2026-11-06 走查实测踩中）
    const parts = ["wheels", "door", "wipers", "horn", "people", "babies", "mommies", "daddies"];
    const l12 = {
      id: "l12",
      words: [w("bus", "bus"), ...parts.map((p) => w(p, p))],
    } as unknown as Lesson;
    const v = mount(OrderView, {
      props: { lesson: l12 },
      global: { stubs: { "router-link": true } },
    });
    await flushPromises();
    for (const part of parts) {
      const alts = v.findAll(".pic-card").map((c) => c.find("img").attributes("alt"));
      expect(alts, `题「${part}」的选项里必须有它自己的图`).toContain(part);
      // 用「看答案」过关进下一题
      await v.find(".answer-btn").trigger("click");
      await flushPromises();
      const next = v.find(".next-btn");
      if (await next.exists()) {
        await next.trigger("click");
        await flushPromises();
      }
    }
  });

  it("图卡是「图 + 单词」混合卡，填对后空槽里也带单词", async () => {
    const v = mountView();
    await flushPromises();
    // 三张卡各自有图也有单词标签
    const words = v.findAll(".pic-card .pic-word").map((n) => n.text());
    expect(words).toHaveLength(3);
    expect(words).toContain("wipers");
    // 空槽里还没词
    expect(v.find(".pic-slot .slot-word").exists()).toBe(false);
    await cardByAlt(v, "wipers")!.trigger("click");
    await flushPromises();
    expect(v.find(".pic-slot .slot-word").text()).toBe("wipers");
  });

  it("拖到空槽之外松手不算作答；点击仍是主路径可正常判定", async () => {
    const v = mountView();
    await flushPromises();
    const card = cardByAlt(v, "wipers")!;
    // jsdom 的 clientX 是只读 getter，不能走 trigger 的 props，改用 MouseEvent 派发
    const el = card.element as HTMLElement;
    const fire = (type: string, x: number, y: number) =>
      el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
    // 从卡片上拖走 200px 再松手（jsdom 无 elementFromPoint，落点一律判为没命中）
    fire("pointerdown", 100, 400);
    fire("pointermove", 100, 200);
    fire("pointerup", 100, 180);
    await flushPromises();
    expect(v.find(".pic-slot img").exists()).toBe(false);
    expect(v.findAll(".pic-card")).toHaveLength(3);
    expect(v.find(".next-btn").exists()).toBe(false);
    // 之后点一下仍能作答（拖动不会把组件锁死；等过 400ms 的重复点击抑制窗口）
    await new Promise((r) => setTimeout(r, 450));
    await cardByAlt(v, "wipers")!.trigger("click");
    await flushPromises();
    expect(v.find(".pic-slot img").attributes("src")).toBe("/wipers.png");
  });
});
