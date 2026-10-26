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
 * 闯关结算口径（2026-10-19 产品调整；2026-10-24 走查补衔接）：
 *  - 关卡完成**不自动开宝箱**——完成即停在大画面；
 *  - 底部**不再有**「返回闯关地图」按钮（回地图只走左上角 ←）；
 *  - 底部始终最多一个"下一步"动作，按序接力：
 *    有下一关 →「下一关」；最后一关且宝箱刚解锁 →「开宝箱」（点开才弹）；
 *    宝箱已领/无宝箱但有下一课 →「下一课」。曾经最后一关什么都不给，
 *    宝箱解锁了孩子看不到出口（走查 P1）。
 */
describe("LessonResult 闯关结算", () => {
  /** 按钮用渲染 slot 的桩（真按钮的文案才能被 text() 断言到） */
  const btnStub = { template: "<button><slot /></button>" };

  function mountQuest(
    nextLevel: { actKey: string; name: string } | null,
    extra: Record<string, unknown> = {}
  ) {
    return mount(LessonResult, {
      props: {
        mode: "quest",
        stars: 3,
        streakJustHit: false,
        streakDays: 0,
        questLevel: 2,
        actName: "听音选图",
        nextLevel,
        ...extra,
      },
      global: { stubs: { BaseButton: btnStub, ChestReward: true } },
    });
  }

  it("闯关完成：显示「第 N 关完成」且不自动开宝箱", () => {
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

  it("闯关最后一关且宝箱未解锁/未传入：不渲染按钮", () => {
    const w = mountQuest(null);
    expect(w.findAll("button")).toHaveLength(0);
  });

  it("闯关最后一关 + 宝箱刚解锁：给「开宝箱」出口，点击才弹宝箱层", async () => {
    const w = mountQuest(null, { chestReady: true, lessonComplete: true, nextLesson: { id: "l12", title: "Head Shoulders" } });
    const btns = w.findAll("button");
    expect(btns).toHaveLength(1);
    expect(btns[0].text()).toContain("开宝箱");
    // 不自动弹层：点按钮才挂载 ChestReward
    expect(w.findComponent({ name: "ChestReward" }).exists()).toBe(false);
    await btns[0].trigger("click");
    expect(w.findComponent({ name: "ChestReward" }).exists()).toBe(true);
    // 领取（层 done）：上抛 openChest（父组件 markChest），接力出「下一课」
    w.findComponent({ name: "ChestReward" }).vm.$emit("done");
    await w.vm.$nextTick();
    expect(w.emitted("openChest")).toHaveLength(1);
    expect(w.text()).toContain("本课全部完成");
  });

  it("闯关最后一关 + 宝箱已领（chestReady=false）+ 全课通关：接力「下一课」", () => {
    const w = mountQuest(null, { chestReady: false, lessonComplete: true, nextLesson: { id: "l12", title: "Head Shoulders" } });
    const btns = w.findAll("button");
    expect(btns).toHaveLength(1);
    expect(btns[0].text()).toContain("下一课");
  });

  it("闯关最后一关但全课未通关：不误报「本课全部完成」，也不给下一课按钮", () => {
    const w = mountQuest(null, { chestReady: false, lessonComplete: false, nextLesson: { id: "l12", title: "Head Shoulders" } });
    expect(w.text()).not.toContain("本课全部完成");
    expect(w.findAll("button")).toHaveLength(0);
  });

  it("唱童谣（maxStars=1）不再提示「重玩可拿满 3 星」", () => {
    const w = mountQuest({ actKey: "learn", name: "学单词" }, { maxStars: 1 });
    expect(w.text()).not.toContain("重玩可拿满 3 星");
  });

  it("自由练习结算轻量化（2026-10-26）：不挂贝壳奖励，只有「回菜单继续学」单按钮", () => {
    const w = mount(LessonResult, {
      props: { mode: "free", stars: 2, streakJustHit: false, streakDays: 0 },
      global: { stubs: { BaseButton: btnStub, ChestReward: true } },
    });
    expect(w.findComponent({ name: "ChestReward" }).exists()).toBe(false);
    const btns = w.findAll("button");
    expect(btns).toHaveLength(1);
    expect(btns[0].text()).toContain("回菜单继续学");
    expect(w.text()).not.toContain("再选一个玩法");
  });

  it("自由练习轻量结算：点「回菜单继续学」上抛 toMenu", async () => {
    const w = mount(LessonResult, {
      props: { mode: "free", stars: 3, streakJustHit: false, streakDays: 0 },
      global: { stubs: { BaseButton: btnStub, ChestReward: true } },
    });
    await w.findAll("button")[0].trigger("click");
    expect(w.emitted("toMenu")).toHaveLength(1);
  });
});

/** 自由结算轻量化（2026-10-26）：完成即停，底部只留「回菜单继续学」一个动作，
 *  不再并列"换组再练"等出口（下一步回课程菜单自己选，菜单排序即学习路径）。 */
describe("LessonResult 自由结算单按钮", () => {
  const btnStub = { template: "<button><slot /></button>" };

  it("自由结算：即使分组课也不显示换组按钮（旧 nextGroup 出口已下线）", () => {
    const w = mount(LessonResult, {
      props: { mode: "free", stars: 2, streakJustHit: false, streakDays: 0 },
      global: { stubs: { BaseButton: btnStub, ChestReward: true } },
    });
    expect(w.text()).not.toContain("组再练");
    expect(w.findAll("button")).toHaveLength(1);
    expect(w.findAll("button")[0].text()).toContain("回菜单继续学");
  });
});
