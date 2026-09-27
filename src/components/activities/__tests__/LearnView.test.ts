// @vitest-environment jsdom
/**
 * 看图学词整关行为：
 * - 完成门槛：最后一页 **且** 本课每个词都点过发音（没点完不让你"我都会啦"）
 * - 点过的词显示"已听过"角标，但**仍可再点**（孩子想重复听随时能点）
 * - 星级 = 点读覆盖率（都点过发音才 3 星，只翻页 = 1 星，重复点只算一次）
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../../../services/speech", () => ({ speak: vi.fn() }));
vi.mock("../../../services/effects", () => ({
  sfxTap: vi.fn(),
  sfxCorrect: vi.fn(),
  celebrate: vi.fn(),
  bigCelebrate: vi.fn(),
}));

import LearnView from "../LearnView.vue";
import { speak } from "../../../services/speech";

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

describe("LearnView（点读覆盖率星级 + 全点过才能完成）", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.mocked(speak).mockClear();
  });

  it("未到末页时完成按钮禁用；翻到末页但没点完 → 仍禁用并提示还差几个", async () => {
    const wrapper = mount(LearnView, { props: { words }, global: { plugins: [createPinia()] } });
    expect(wrapper.find(".next").attributes("disabled")).toBeDefined();
    await wrapper.find('[aria-label="下一页"]').trigger("click");
    // 末页（第 2 页，1 个词）还没点 → 不能完成
    expect(wrapper.find(".next").attributes("disabled")).toBeDefined();
    expect(wrapper.find(".next").text()).toContain("还有 5 个词没点过");
  });

  it("每个词都点过发音 → 按钮可点（'我都会啦'）并记 3 星", async () => {
    const wrapper = mount(LearnView, { props: { words }, global: { plugins: [createPinia()] } });
    for (const el of wrapper.findAll(".word")) await el.trigger("click"); // 第 1 页 4 个
    await wrapper.find('[aria-label="下一页"]').trigger("click");
    for (const el of wrapper.findAll(".word")) await el.trigger("click"); // 第 2 页 1 个
    expect(wrapper.find(".next").attributes("disabled")).toBeUndefined();
    expect(wrapper.find(".next").text()).toContain("我都会啦");
    await wrapper.find(".next").trigger("click");
    expect(wrapper.emitted("done")?.[0]).toEqual([3]);
  });

  it("只翻页不点读 → 完成按钮一直禁用，点完成无效果", async () => {
    const wrapper = mount(LearnView, { props: { words }, global: { plugins: [createPinia()] } });
    await wrapper.find('[aria-label="下一页"]').trigger("click");
    expect(wrapper.find(".next").attributes("disabled")).toBeDefined();
    await wrapper.find(".next").trigger("click"); // disabled 按钮不触发
    expect(wrapper.emitted("done")).toBeUndefined();
  });

  it("重复点同一个词只算一次点读：只点 1 个词无法完成", async () => {
    const wrapper = mount(LearnView, { props: { words }, global: { plugins: [createPinia()] } });
    const first = wrapper.findAll(".word")[0];
    await first.trigger("click");
    await first.trigger("click");
    await wrapper.find('[aria-label="下一页"]').trigger("click");
    expect(wrapper.find(".next").attributes("disabled")).toBeDefined();
    expect(wrapper.find(".next").text()).toContain("还有 4 个词没点过");
    expect(wrapper.emitted("done")).toBeUndefined();
  });

  it("点过的词显示'已听过'角标，且仍可再点听发音", async () => {
    const wrapper = mount(LearnView, { props: { words }, global: { plugins: [createPinia()] } });
    const first = wrapper.findAll(".word")[0];
    await first.trigger("click");
    expect(wrapper.find(".word-card .marked").exists()).toBe(true);
    // 角标不挡点击：再点同一词，发音照常播放（speak 被再次调用）
    await first.trigger("click");
    expect(vi.mocked(speak)).toHaveBeenCalledTimes(2);
  });
});
