// @vitest-environment jsdom
/**
 * 翻页控件：受控组件（自己不改页码），到头禁用，圆点可直达。
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import Pager from "../Pager.vue";

describe("Pager", () => {
  it("多页时显示总页数并发出 next/prev", async () => {
    const wrapper = mount(Pager, { props: { page: 1, total: 3 } });
    expect(wrapper.text()).toContain("2 / 3");
    await wrapper.find('[aria-label="下一页"]').trigger("click");
    expect(wrapper.emitted("next")).toHaveLength(1);
    await wrapper.find('[aria-label="上一页"]').trigger("click");
    expect(wrapper.emitted("prev")).toHaveLength(1);
  });

  it("首页禁用上一页、末页禁用下一页", () => {
    const first = mount(Pager, { props: { page: 0, total: 3 } });
    expect(first.find('[aria-label="上一页"]').attributes("disabled")).toBeDefined();
    const last = mount(Pager, { props: { page: 2, total: 3 } });
    expect(last.find('[aria-label="下一页"]').attributes("disabled")).toBeDefined();
  });

  it("点圆点发出 go(索引)", async () => {
    const wrapper = mount(Pager, { props: { page: 0, total: 3 } });
    const dots = wrapper.findAll(".dot");
    await dots[2].trigger("click");
    expect(wrapper.emitted("go")?.[0]).toEqual([2]);
  });

  it("只有一页时整个控件不渲染", () => {
    const wrapper = mount(Pager, { props: { page: 0, total: 1 } });
    expect(wrapper.find(".pager").exists()).toBe(false);
  });

  it("页数超过 maxDots 时只显示计数、不画圆点", () => {
    const wrapper = mount(Pager, { props: { page: 0, total: 12, maxDots: 10 } });
    expect(wrapper.find(".dots").exists()).toBe(false);
    expect(wrapper.text()).toContain("1 / 12");
  });
});
