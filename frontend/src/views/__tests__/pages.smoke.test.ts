// @vitest-environment jsdom
/**
 * 页面冒烟测试（每个页面挂载一遍，断言渲染出关键内容且没有 Vue 报错）。
 *
 * 为什么需要它：2026-09-27 奖励经济从"贴纸"改成"英雄形态"后，
 * MyView / ReportView 还在读 `rewards.stickers`（已删除的字段），
 * 两个页面**线上直接白屏** —— 而当时它们还是 JS 模式的 SFC，`type-check` 覆盖不到，
 * 组件测试又只测了单个组件。这层"每页都挂一次"的护栏就是为了堵住这一类事故。
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter, type Router } from "vue-router";

/** jsdom 缺的浏览器 API：必须在被测模块 import 之前补上（vi.hoisted 会提升到 import 之前） */
vi.hoisted(() => {
  const w = globalThis as unknown as {
    window?: Record<string, unknown>;
    matchMedia?: unknown;
  };
  if (typeof w.window === "undefined") return;
  w.window.matchMedia =
    w.window.matchMedia ||
    ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }));
  w.window.scrollTo = w.window.scrollTo || (() => {});
});

vi.mock("../../services/speech", () => ({
  speak: vi.fn(),
  speakZh: vi.fn(),
  stopSpeaking: vi.fn(),
}));
vi.mock("../../services/effects", () => ({
  sfxTap: vi.fn(),
  sfxCorrect: vi.fn(),
  sfxWrong: vi.fn(),
  sfxMatch: vi.fn(),
  sfxCoin: vi.fn(),
  sfxSticker: vi.fn(),
  sfxChestOpen: vi.fn(),
  sfxCollect: vi.fn(),
  celebrate: vi.fn(),
  bigCelebrate: vi.fn(),
}));

import LearnView from "../../views/learn/LearnView.vue";
import GameView from "../game/GameView.vue";
import GameLessonView from "../game/GameLessonView.vue";
import MyView from "../me/MyView.vue";
import ReportView from "../me/ReportView.vue";
import TreasureView from "../me/TreasureView.vue";
import ReviewView from "../learn/ReviewView.vue";
import LessonView from "../learn/LessonView.vue";
import HeroDetailView from "../me/HeroDetailView.vue";
import CalendarView from "../me/CalendarView.vue";

/** jsdom 没有 ResizeObserver（LearnView/GamePath 会用到） */
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;

const routes = [
  {
    path: "/learn",
    name: "learn",
    component: LearnView,
    children: [
      {
        path: ":id",
        name: "lesson",
        component: LessonView,
        children: [
          { path: "learn", name: "lesson-learn", component: LessonView },
          { path: "quiz", name: "lesson-quiz", component: LessonView },
          { path: "match", name: "lesson-match", component: LessonView },
          { path: "speak", name: "lesson-speak", component: LessonView },
          { path: "song", name: "lesson-song", component: LessonView },
          { path: "talk", name: "lesson-talk", component: LessonView },
        ],
      },
      { path: ":id/game", name: "course-game", component: GameLessonView },
      { path: "review", name: "review", component: ReviewView },
    ],
  },
  {
    path: "/game",
    name: "game",
    component: GameView,
    children: [{ path: "quest/:id/:stage?", name: "quest", component: LessonView }],
  },
  {
    path: "/me",
    name: "me",
    component: MyView,
    children: [
      // 原「连击日历」已并入学习日历，这里只保留合并后的页面
      { path: "calendar", name: "calendar", component: CalendarView },
      {
        path: "treasure",
        children: [
          { path: "", name: "treasure", component: TreasureView },
          { path: "hero/:id", name: "hero-detail", component: HeroDetailView },
        ],
      },
      { path: "report", name: "report", component: ReportView },
    ],
  },
];

async function mountPage(component: unknown, path: string, query: Record<string, string> = {}) {
  const router: Router = createRouter({ history: createMemoryHistory(), routes });
  await router.push({ path, query });
  await router.isReady();
  return mount(component as never, { global: { plugins: [createPinia(), router] } });
}

describe("页面冒烟：每个页面都能渲染（无 Vue 报错）", () => {
  const errors: string[] = [];
  beforeEach(() => {
    localStorage.clear();
    errors.length = 0;
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(String(args[0]));
    });
    vi.spyOn(console, "warn").mockImplementation((...args) => {
      // Vue 的"渲染期未捕获错误"走 warn，也当作失败
      if (String(args[0]).includes("Unhandled error")) errors.push(String(args[0]));
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("学习主页（自由练习）", async () => {
    const w = await mountPage(LearnView, "/learn");
    expect(w.text()).toContain("Walking In The Jungle");
    expect(w.text()).toContain("加餐");
    expect(errors).toEqual([]);
  });

  it("游戏闯关（独立路由 /game）", async () => {
    const w = await mountPage(GameView, "/game");
    expect(w.text()).toContain("游戏闯关");
    expect(errors).toEqual([]);
  });

  it("当前课游戏地图（只服务本课关卡）", async () => {
    const w = await mountPage(GameLessonView, "/learn/l10/game");
    // 标题显示本课课程名 + 关卡列表（唱童谣/学单词…）
    expect(w.text()).toContain("Walking In The Jungle");
    expect(w.text()).toContain("学单词");
    // 只画本课 9 关（8 玩法 + 宝箱），序号本课内 1..9
    const nodes = w.findAll(".gp-level");
    expect(nodes).toHaveLength(9);
    expect(nodes[0].attributes("aria-label")).toContain("第1关");
    expect(nodes[8].attributes("aria-label")).toContain("第9关");
    expect(w.html()).not.toContain("第22关");
    // 地图自持滚动容器（本课地图曾漏写 overflow，底部关卡被裁掉且滚不动）
    expect(w.find(".game-path-scroll").exists()).toBe(true);
    expect(errors).toEqual([]);
  });

  it("我的", async () => {
    const w = await mountPage(MyView, "/me");
    // 「今日目标」已并入今日卡的进度条（原来是与今日数据重复的第二张卡），
    // 因此断言的是合并后的口径：今天 / 目标 / 学习 / 磨耳朵。
    expect(w.text()).toContain("今天");
    expect(w.text()).toContain("目标");
    expect(w.text()).toContain("学习");
    expect(w.text()).toContain("磨耳朵");
    expect(w.text()).toContain("家长中心");
    expect(errors).toEqual([]);
  });

  it("我的：一屏只允许一个主行动（.entry-row--primary）", async () => {
    const w = await mountPage(MyView, "/me");
    // 设计系统的硬约束：主行动唯一，否则页面又回到「所有卡片同权重」的老问题。
    // 断言的是结构而不是文案，改动文案不会误伤、加第二个主行动会立刻红。
    // mountPage 为了兼容各页组件类型把 component 断言成 never，这里补回 Element 类型
    const root = w.element as unknown as Element;
    const primary = root.querySelectorAll(".entry-row--primary");
    expect(primary.length).toBe(1);
  });

  it("学习日历（已合并原连击日历）", async () => {
    const w = await mountPage(CalendarView, "/me/calendar");
    // 合并后一页同时承载：连击口径 + 本月学习汇总 + 月网格
    expect(w.text()).toContain("天连击");
    expect(w.text()).toContain("本月打卡");
    expect(w.text()).toContain("本月学习");
    expect(errors).toEqual([]);
  });

  it("家长报告", async () => {
    const w = await mountPage(ReportView, "/me/report");
    expect(w.text()).toContain("掌握度趋势");
    expect(w.text()).toContain("英雄图鉴");
    expect(errors).toEqual([]);
  });

  it("宝藏罐（英雄图鉴）", async () => {
    const w = await mountPage(TreasureView, "/me/treasure");
    expect(w.text()).toContain("英雄图鉴");
    expect(w.text()).toContain("迪迦");
    expect(errors).toEqual([]);
  });

  it("到期复习", async () => {
    const w = await mountPage(ReviewView, "/learn/review");
    expect(w.text()).toContain("到期复习");
    expect(errors).toEqual([]);
  });

  it("课程页（菜单）", async () => {
    const w = await mountPage(LessonView, "/learn/l4");
    expect(w.find(".lesson").exists()).toBe(true);
    // 菜单顺序 = activityKeys（song 打头）：童谣→学单词→听音→连线→跟读→亲子对话
    // 2026-10：闯关地图是默认落地页，卡片目录不再放"闯关挑战"入口
    const tiles = w.findAll(".tile").map((t) => t.text());
    expect(tiles[0]).toContain("学童谣");
    expect(tiles[1]).toContain("学单词");
    expect(tiles[2]).toContain("听音选图");
    expect(w.text()).not.toContain("闯关挑战");
  });

  it("玩法直达子路径 /learn/:id/:stage 能渲染（#/learn/l4/learn）", async () => {
    const w = await mountPage(LessonView, "/learn/l4/learn");
    // 子路径直达应直接进入看图学词（而不是菜单）
    expect(w.text()).toContain("点图片听发音");
    expect(errors).toEqual([]);
  });

  it("角色详情页（宝藏库奥特曼）", async () => {
    const w = await mountPage(HeroDetailView, "/me/treasure/hero/tiga");
    expect(w.text()).toContain("迪迦");
    expect(w.text()).toContain("介绍");
    expect(w.text()).toContain("招牌技能");
    expect(errors).toEqual([]);
  });
});
