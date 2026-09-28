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

import LearnView from "../../views/LearnView.vue";
import GameView from "../game/GameView.vue";
import MyView from "../MyView.vue";
import ReportView from "../ReportView.vue";
import TreasureView from "../TreasureView.vue";
import ReviewView from "../ReviewView.vue";
import LessonView from "../LessonView.vue";
import HeroDetailView from "../HeroDetailView.vue";
import StreakView from "../StreakView.vue";

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
      { path: "lesson/:id/:stage?", name: "lesson", component: LessonView },
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
      { path: "streak", name: "streak", component: StreakView },
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
    expect(w.text()).toContain("个单词");
    expect(errors).toEqual([]);
  });

  it("游戏闯关（独立路由 /game）", async () => {
    const w = await mountPage(GameView, "/game");
    expect(w.text()).toContain("游戏闯关");
    expect(errors).toEqual([]);
  });

  it("我的", async () => {
    const w = await mountPage(MyView, "/me");
    expect(w.text()).toContain("今日目标");
    expect(w.text()).toContain("英雄图鉴");
    expect(errors).toEqual([]);
  });

  it("连击日历（火焰详情页）", async () => {
    const w = await mountPage(StreakView, "/me/streak");
    expect(w.text()).toContain("连击日历");
    expect(w.text()).toContain("天连击");
    expect(w.text()).toContain("本月已打卡");
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
    const w = await mountPage(LessonView, "/learn/lesson/l4");
    expect(w.find(".lesson").exists()).toBe(true);
  });

  it("玩法直达子路径 /learn/lesson/:id/:stage 能渲染（#/learn/lesson/l4/learn）", async () => {
    const w = await mountPage(LessonView, "/learn/lesson/l4/learn");
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
