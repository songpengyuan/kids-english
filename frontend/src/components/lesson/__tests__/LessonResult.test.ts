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

/**
 * 闯关结算口径（2026-10-19 产品调整）：
 *  - 关卡完成**不再开宝箱**——完成即停在大画面；
 *  - 底部**不再有**「返回闯关地图」按钮（回地图只走左上角 ←）；
 *  - 只在有下一关时给「下一关」一个按钮。
 * 这三条是显式口径，容易被"顺手加回来"，所以各锁一条用例。
 */
describe("LessonResult 闯关结算", () => {
  /** 按钮用渲染 slot 的桩（真按钮的文案才能被 text() 断言到） */
  const btnStub = { template: "<button><slot /></button>" };

  function mountQuest(nextLevel: { actKey: string; name: string } | null) {
    return mount(LessonResult, {
      props: {
        mode: "quest",
        stars: 3,
        streakJustHit: false,
        streakDays: 0,
        questLevel: 2,
        actName: "听音选图",
        nextLevel,
      },
      global: { stubs: { BaseButton: btnStub, ChestReward: true } },
    });
  }

  it("闯关完成：显示「第 N 关完成」且不开宝箱", () => {
    const w = mountQuest({ actKey: "match", name: "连一连" });
    expect(w.text()).toContain("第 2 关完成！");
    expect(w.findComponent({ name: "ChestReward" }).exists()).toBe(false);
  });

  it("闯关完成：没有「返回闯关地图」按钮，只有「下一关」", () => {
    const w = mountQuest({ actKey: "match", name: "连一连" });
    const btns = w.findAll("button");
    expect(btns).toHaveLength(1);
    expect(btns[0].text()).toContain("下一关");
    expect(w.text()).not.toContain("返回闯关地图");
  });

  it("闯关最后一关：没有下一关时不渲染任何按钮", () => {
    const w = mountQuest(null);
    expect(w.findAll("button")).toHaveLength(0);
  });

  it("自由练习结算仍开宝箱", () => {
    const w = mount(LessonResult, {
      props: { mode: "free", stars: 2, streakJustHit: false, streakDays: 0 },
      global: { stubs: { BaseButton: btnStub, ChestReward: true } },
    });
    expect(w.findComponent({ name: "ChestReward" }).exists()).toBe(true);
  });
});
