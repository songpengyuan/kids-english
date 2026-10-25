// @vitest-environment jsdom
/**
 * WeeklyActiveCard（北极星周视图）渲染测试：大数字、环比文案、空态引导。
 * 口径计算本体在 utils/weeklyStats 的单测里，这里只测展示层。
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import WeeklyActiveCard from "../WeeklyActiveCard.vue";

/** 以"今天"为锚的自然周夹具：本周二与上周五各一天 */
function fixture(): { date: string; durationSec: number; listenSec?: number; activities: number }[] {
  const now = new Date();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - ((now.getDay() + 6) % 7));
  const tue = new Date(monday);
  tue.setDate(monday.getDate() + 1);
  const lastFri = new Date(monday);
  lastFri.setDate(monday.getDate() - 3);
  return [
    { date: fmt(tue), durationSec: 1500, listenSec: 300, activities: 8 }, // 本周主动 20 分钟
    { date: fmt(lastFri), durationSec: 600, activities: 4 }, // 上周主动 10 分钟
  ];
}

describe("WeeklyActiveCard", () => {
  it("显示本周玩法分钟数与环比", () => {
    const w = mount(WeeklyActiveCard, { props: { days: fixture() } });
    expect(w.find(".ns-num").text()).toBe("20");
    expect(w.find(".ns-diff").text()).toContain("较上周多 10");
    expect(w.find(".ns-sub").text()).toContain("磨耳朵 5 分钟");
    expect(w.find(".ns-sub").text()).toContain("8 个玩法");
    const labels = w.findAll(".ns-label").map((l) => l.text());
    expect(labels).toContain("本周");
    expect(labels).toContain("上周");
    expect(w.findAll(".ns-bar")).toHaveLength(4);
  });

  it("没有记录时显示引导文案而非 0 分钟", () => {
    const w = mount(WeeklyActiveCard, { props: { days: [] } });
    expect(w.find(".ns-empty").exists()).toBe(true);
    expect(w.find(".ns-num").exists()).toBe(false);
  });
});
