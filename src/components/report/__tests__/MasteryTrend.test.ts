// @vitest-environment jsdom
/**
 * 掌握度趋势：空态提示、柱高按最长一天归一、汇总文案、7 天渲染。
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import MasteryTrend from "../MasteryTrend.vue";

const days = [
  { date: "2026-09-21", durationSec: 300, activities: 2, mastered: 3 },
  { date: "2026-09-22", durationSec: 600, activities: 3, mastered: 5 },
  { date: "2026-09-23", durationSec: 0, activities: 0, mastered: 5 },
];

describe("MasteryTrend", () => {
  it("没有数据时给出空态提示", () => {
    const wrapper = mount(MasteryTrend, { props: { days: [] } });
    expect(wrapper.text()).toContain("完成一次练习后");
    expect(wrapper.findAll(".bar")).toHaveLength(0);
  });

  it("渲染每天一根柱子，柱高按最长一天归一", () => {
    const wrapper = mount(MasteryTrend, { props: { days } });
    const bars = wrapper.findAll(".bar");
    expect(bars).toHaveLength(3);
    expect(bars[1].attributes("style")).toContain("height: 100%"); // 600s 最长
    expect(bars[2].attributes("style")).toContain("height: 0%"); // 当天没学
  });

  it("汇总：最后一天掌握数 + 本周新增", () => {
    const wrapper = mount(MasteryTrend, { props: { days } });
    const text = wrapper.text();
    expect(text).toContain("最近 3 天掌握单词");
    expect(text).toContain("本周新增 2"); // 5 - 3
  });

  it("柱顶显示当天掌握词数，柱下显示星期", () => {
    const wrapper = mount(MasteryTrend, { props: { days } });
    expect(wrapper.findAll(".m").map((n) => n.text())).toEqual(["3", "5", "5"]);
    // 2026-09-21 是周一
    expect(wrapper.findAll(".d").map((n) => n.text())).toEqual(["一", "二", "三"]);
  });
});
