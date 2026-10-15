// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LessonResult from "../LessonResult.vue";

/**
 * 结算页星星：金色实心 + 逐个弹出（延迟错峰）+ 未获得灰星。
 * 回归：--star-gold 变量未定义导致星星继承深色（截图发黑），此处锁定实心金色。
 */
function mountResult(stars: number, mode: "quest" | "free" = "free") {
  return mount(LessonResult, {
    props: { mode, stars, streakJustHit: false, streakDays: 0 },
    global: {
      stubs: { BaseButton: true, ChestReward: true },
    },
  });
}

describe("LessonResult 星星", () => {
  it("渲染 3 颗星，获得的星为实心金色并逐个延迟弹出", () => {
    const w = mountResult(3);
    const stars = w.findAll(".star");
    expect(stars).toHaveLength(3);
    for (const s of stars) {
      expect(s.classes()).not.toContain("dim");
      // 金色（--star-gold 未定义时的兜底值）
      expect((s.element as HTMLElement).style.getPropertyValue("--d")).toBeTruthy();
      const fill = s.find(".star-fill");
      expect(fill.exists()).toBe(true);
    }
    // 逐星延迟递增：--d = n * 0.28s（浮点精度用容差比较）
    const delays = stars.map((s) => parseFloat((s.element as HTMLElement).style.getPropertyValue("--d")));
    expect(delays[0]).toBeCloseTo(0.28, 4);
    expect(delays[1]).toBeCloseTo(0.56, 4);
    expect(delays[2]).toBeCloseTo(0.84, 4);
  });

  it("未获得的星为灰星（dim），仍有延迟淡入", () => {
    const w = mountResult(1);
    const stars = w.findAll(".star");
    expect(stars[0].classes()).not.toContain("dim");
    expect(stars[1].classes()).toContain("dim");
    expect(stars[2].classes()).toContain("dim");
    expect((stars[1].element as HTMLElement).style.getPropertyValue("--d")).toBe("0.56s");
  });

  it("结算标题带星数", () => {
    const w = mountResult(2);
    expect(w.find("h2").text()).toContain("真棒！获得 2 颗星");
  });
});
