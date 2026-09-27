// @vitest-environment jsdom
/**
 * 看图学词整关行为：
 * - 一屏按容量分页；"我都会啦"只在最后一页可点
 * - 星级 = 点读覆盖率（都点过发音才 3 星，只翻页 = 1 星，重复点只算一次）
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../../../utils/speech", () => ({ speak: vi.fn() }));
vi.mock("../../../utils/effects", () => ({
  sfxTap: vi.fn(),
  sfxCorrect: vi.fn(),
  celebrate: vi.fn(),
  bigCelebrate: vi.fn(),
}));

import LearnView from "../LearnView.vue";

/** jsdom 没有 ResizeObserver / 真实布局尺寸，桩掉后组件走保守兜底（每页 4 张） */
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;

const words = ["a", "b", "c", "d", "e"].map((id) => ({
  id,
  en: id,
  zh: id,
  emoji: "🔤",
  image: null,
  lessonId: "l4",
})) as never;

describe("LearnView（点读覆盖率星级）", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("未到末页时完成按钮禁用，翻到末页后可点", async () => {
    const wrapper = mount(LearnView, { props: { words }, global: { plugins: [createPinia()] } });
    expect(wrapper.find(".next").attributes("disabled")).toBeDefined();
    await wrapper.find('[aria-label="下一页"]').trigger("click");
    expect(wrapper.find(".next").attributes("disabled")).toBeUndefined();
  });

  it("只翻页不点读 → 1 星", async () => {
    const wrapper = mount(LearnView, { props: { words }, global: { plugins: [createPinia()] } });
    await wrapper.find('[aria-label="下一页"]').trigger("click");
    await wrapper.find(".next").trigger("click");
    expect(wrapper.emitted("done")?.[0]).toEqual([1]);
  });

  it("把每个词的发音都点过 → 3 星", async () => {
    const wrapper = mount(LearnView, { props: { words }, global: { plugins: [createPinia()] } });
    for (const el of wrapper.findAll(".word")) await el.trigger("click"); // 第 1 页
    await wrapper.find('[aria-label="下一页"]').trigger("click");
    for (const el of wrapper.findAll(".word")) await el.trigger("click"); // 第 2 页
    await wrapper.find(".next").trigger("click");
    expect(wrapper.emitted("done")?.[0]).toEqual([3]);
  });

  it("重复点同一个词只算一次点读", async () => {
    const wrapper = mount(LearnView, { props: { words }, global: { plugins: [createPinia()] } });
    const first = wrapper.findAll(".word")[0];
    await first.trigger("click");
    await first.trigger("click");
    await wrapper.find('[aria-label="下一页"]').trigger("click");
    await wrapper.find(".next").trigger("click");
    expect(wrapper.emitted("done")?.[0]).toEqual([1]); // 5 个词只点过 1 个
  });
});
