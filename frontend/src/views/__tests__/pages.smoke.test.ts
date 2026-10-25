// @vitest-environment jsdom
/**
 * 页面冒烟测试（每个页面挂载一遍，断言渲染出关键内容且没有 Vue 报错）。
 *
 * 为什么需要它：2026-09-27 奖励经济从"贴纸"改成"英雄形态"后，
 * MyView / ReportView 还在读 `rewards.stickers`（已删除的字段），
 * 两个页面**线上直接白屏** —— 而当时它们还是 JS 模式的 SFC，`type-check` 覆盖不到，
 * 组件测试又只测了单个组件。这层"每页都挂一次"的护栏就是为了堵住这一类事故。
 *
 * 2026-10-25 重整：
 *  - 路由表**直接用生产 `appRoutes`**——旧版手抄一份，/learn → /course 重构后还在测
 *    旧路径、memory/order 两条漏登记（漂移不可见）。守卫不挂：守卫行为有专属测试
 *    （gateGuard/parentGuard/redirect），这层只回答"页面渲染得出来吗"。
 *  - 新增**全课 × 全玩法参数化挂载**：加一节新课后，CI 自动验证它的每个玩法都渲染
 *    得出来——这是「标准新课 = 组件零改动」验收线的机器化（见 docs/ACTIVITY-VARIANTS.md）。
 *  - 补齐从未覆盖的页面：磨耳朵 / 应用口令 / 家长中心 / 闯关玩法页。
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
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
import QuestView from "../game/QuestView.vue";
import CourseDetailView from "../course/CourseDetailView.vue";
import MyView from "../me/MyView.vue";
import ReportView from "../me/ReportView.vue";
import ParentView from "../me/ParentView.vue";
import TreasureView from "../me/TreasureView.vue";
import ReviewView from "../learn/ReviewView.vue";
import LessonView from "../learn/LessonView.vue";
import HeroDetailView from "../me/HeroDetailView.vue";
import CalendarView from "../me/CalendarView.vue";
import ListenView from "../listen/ListenView.vue";
import GateView from "../../views/GateView.vue";
import { appRoutes } from "../../router";
import { lessons, activityKeys } from "../../data/lessons";

/** jsdom 没有 ResizeObserver（LearnView/GamePath 会用到） */
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;

/** 玩法 key → 路由段（历史原因：quiz 的路径段叫 hear） */
const STAGE_PATH: Record<string, string> = { quiz: "hear" };

async function mountPage(component: unknown, path: string, query: Record<string, string> = {}) {
  const router: Router = createRouter({ history: createMemoryHistory(), routes: appRoutes });
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

  /* ---------- 四域主页面 ---------- */

  it("学习主页（自由练习，课程按 date 上课顺序排列）", async () => {
    const w = await mountPage(LearnView, "/course");
    expect(w.text()).toContain("我是一个音乐人"); // date 最早的课排第一
    expect(w.text()).toContain("Walking In The Jungle"); // l10 也在列表里
    expect(errors).toEqual([]);
  });

  it("磨耳朵", async () => {
    const w = await mountPage(ListenView, "/listen");
    expect(w.find(".listen").exists()).toBe(true);
    expect(errors).toEqual([]);
  });

  it("应用口令页", async () => {
    const w = await mountPage(GateView, "/gate");
    expect(w.text()).toContain("丞丞学英语"); // 品牌区
    expect(w.find("input").attributes("placeholder")).toContain("家长口令");
    expect(errors).toEqual([]);
  });

  it("家长中心", async () => {
    const w = await mountPage(ParentView, "/me/parent");
    // 本地模式：孩子速览卡在前（孩子管理仅云模式显示）
    expect(w.text()).toContain("完整报告");
    expect(w.text()).toContain("家长报告");
    expect(errors).toEqual([]);
  });

  it("游戏总地图（独立路由 /game）", async () => {
    const w = await mountPage(GameView, "/game");
    expect(w.text()).toContain("游戏闯关");
    expect(errors).toEqual([]);
  });

  /* ---------- 课程域 ---------- */

  it("课程详情 game 视图（本课地图，只服务本课关卡）", async () => {
    const w = await mountPage(CourseDetailView, "/course/l10", { view: "game" });
    // 标题显示本课课程名 + 关卡列表（唱童谣/学单词…）
    expect(w.text()).toContain("丛林里散步");
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

  it("课程详情 menu 视图（玩法瓷片，顺序 = activityKeys：song 打头）", async () => {
    const w = await mountPage(CourseDetailView, "/course/l4", { view: "menu" });
    const tiles = w.findAll(".tile").map((t) => t.text());
    expect(tiles[0]).toContain("学童谣");
    expect(tiles[1]).toContain("学单词");
    expect(tiles[2]).toContain("听音选图");
    expect(w.text()).not.toContain("闯关挑战");
  });

  it("闯关玩法页（quest 薄壳 → LessonView，闯关身份由路由名识别）", async () => {
    const w = await mountPage(QuestView, "/course/l4/game/quest", { step: "learn" });
    await flushPromises();
    expect(w.find(".lesson").exists()).toBe(true);
    expect(errors).toEqual([]);
  });

  it("玩法直达子路径 /course/:id/:stage 能渲染（#/course/l4/learn）", async () => {
    const w = await mountPage(LessonView, "/course/l4/learn");
    // 子路径直达应直接进入看图学词（而不是菜单）
    expect(w.text()).toContain("点图片听发音");
    expect(errors).toEqual([]);
  });

  /* ---------- 我的域 ---------- */

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

  it("角色详情页（宝藏库奥特曼）", async () => {
    const w = await mountPage(HeroDetailView, "/me/treasure/hero/tiga");
    expect(w.text()).toContain("迪迦");
    expect(w.text()).toContain("介绍");
    expect(w.text()).toContain("招牌技能");
    expect(errors).toEqual([]);
  });

  it("到期复习", async () => {
    const w = await mountPage(ReviewView, "/course/review");
    expect(w.text()).toContain("到期复习");
    expect(errors).toEqual([]);
  });

  /* ---------- 变体行为（数据驱动的玩法变体，回归锁） ---------- */

  it("l11 学单词按词群分 Colors / Animals 两部分（切 tab 换词表）", async () => {
    const w = await mountPage(LessonView, "/course/l11/learn");
    await flushPromises();
    // 两个分组 tab
    const tabTexts = w.findAll(".group-switch__btn").map((b) => b.text());
    expect(tabTexts.some((t) => t.includes("Colors"))).toBe(true);
    expect(tabTexts.some((t) => t.includes("Animals"))).toBe(true);
    // 默认颜色组：只有颜色词（brown 是颜色组的第一个），不出现动物
    const words = () => w.findAll(".word-card .word").map((e) => e.text());
    expect(words()).toContain("brown");
    expect(words()).not.toContain("bear");
    // 切到动物：出现动物词、不再有颜色词
    await w.findAll(".group-switch__btn").find((b) => b.text().includes("Animals"))!.trigger("click");
    await flushPromises();
    expect(words()).toContain("bear");
    expect(words()).not.toContain("brown");
  });

  it("l11 学童谣也按词群切歌：默认第一轨 Brown Bear（Animals），可切 Colors", async () => {
    const w = await mountPage(LessonView, "/course/l11/song");
    await flushPromises();
    const chipText = () => w.findAll(".words-strip .chip").map((c) => c.text()).join(" ");
    // 默认跟第一轨的词群（Brown Bear 动物歌）——课程主打歌不该藏在切换后面
    expect(chipText()).toContain("bear");
    expect(chipText()).not.toContain("brown");
    // 切到 Colors：换成颜色歌的颜色词
    await w.findAll(".group-switch__btn").find((b) => b.text().includes("Colors"))!.trigger("click");
    await flushPromises();
    expect(chipText()).toContain("brown");
    expect(chipText()).not.toContain("bear");
  });

  it("学童谣的领星入口是真按钮（曾因 SongView 丢 BaseButton 导入渲染成 <basebutton>，点了没反应）", async () => {
    const w = await mountPage(LessonView, "/course/l11/song");
    await flushPromises();
    const finish = w.find(".finish");
    expect(finish.exists()).toBe(true);
    expect(finish.element.tagName).toBe("BUTTON"); // 解析失败的组件会渲染成 <basebutton>
    expect(finish.text()).toContain("星星");
  });

  /* ---------- 全课 × 全玩法：加课的机器验收 ----------
   * 加新课（含其全部变体数据）后，这里自动长出该课 × 其全部玩法的挂载用例；
   * 哪课哪个玩法白屏，用例名直接点名。这是「标准新课 = 组件零改动」的验收线。 */
  for (const lesson of lessons) {
    for (const key of activityKeys(lesson)) {
      it(`${lesson.id}（${lesson.titleZh}）· ${key} 渲染冒烟`, async () => {
        const seg = STAGE_PATH[key] ?? key;
        const w = await mountPage(LessonView, `/course/${lesson.id}/${seg}`);
        await flushPromises();
        expect(w.find(".lesson").exists()).toBe(true);
        expect(errors).toEqual([]);
      });
    }
  }
});
