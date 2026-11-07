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
import { createPinia, setActivePinia, type Pinia } from "pinia";
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
import { usePlayerStore } from "../../stores/player";
import { lessons, activityKeys, splitActKey } from "../../data/lessons";

/** jsdom 没有 ResizeObserver（LearnView/GamePath 会用到） */
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;

/** 玩法 key → 路由段（历史原因：quiz 的路径段叫 hear） */
const STAGE_PATH: Record<string, string> = { quiz: "hear" };

async function mountPage(component: unknown, path: string, query: Record<string, string> = {}, pinia?: Pinia) {
  const router: Router = createRouter({ history: createMemoryHistory(), routes: appRoutes });
  await router.push({ path, query });
  await router.isReady();
  // pinia 可注入：测试需要"先播种 store 再挂载"时（如磨耳朵正在播详情），
  // 用同一个 pinia 实例——否则播种落在无主 pinia 上，组件读到的是另一份空 store
  return mount(component as never, { global: { plugins: [pinia ?? createPinia(), router] } });
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

  it("磨耳朵：有加载过的歌时从别的 tab 切进来，直接落到正在播详情（2026-11-08）", async () => {
    // jsdom 没有媒体实现，静音掉 play/pause 的 not-implemented 噪声
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    // 先播种 player store 再挂载（同一个 pinia），模拟"在别的 tab 点过歌"的状态
    const pinia = createPinia();
    setActivePinia(pinia);
    usePlayerStore().playSong(0);
    const w = await mountPage(ListenView, "/listen", {}, pinia);
    // 详情页（歌词浮层）渲染、歌曲列表行不渲染（.listen 是页面根，恒在）；
    // 收起键一下回列表
    expect(w.find(".player").exists()).toBe(true);
    expect(w.find(".song-row").exists()).toBe(false);
    // 「去这一课」圆钮：直达当前歌所属的课程详情（多轨 id 已剥轨号）
    const lessonBtn = w.find('.pl-bar button[aria-label="去这一课"]');
    expect(lessonBtn.exists()).toBe(true);
    await lessonBtn.trigger("click");
    await flushPromises();
    type RouteProbe = { currentRoute: { value: { path: string } } };
    // mountPage 把 component 断言成 never（兼容各页组件类型），这里补回实例类型
    const vm = w.vm as unknown as { $: { appContext: { config: { globalProperties: { $router: RouteProbe } } } } };
    expect(vm.$.appContext.config.globalProperties.$router.currentRoute.value.path).toBe("/course/l5");
  });

  it("应用口令页", async () => {
    const w = await mountPage(GateView, "/gate");
    expect(w.text()).not.toContain("闲思杂记"); // 口令屏不显示博客站名
    expect(w.text()).not.toContain("丞丞"); // 合规：门禁页不暴露孩子真名
    expect(w.find("input").attributes("placeholder")).toContain("家长口令");
    // ICP 备案号：管局抽查可能直达 /app/ 任意路由，口令页必须悬挂（与根落地页同号同链接）
    const beian = w.find(".gate__beian");
    expect(beian.exists()).toBe(true);
    expect(beian.text()).toContain("豫ICP备2026054893号");
    expect(beian.attributes("href")).toBe("https://beian.miit.gov.cn/");
    expect(beian.attributes("target")).toBe("_blank");
    expect(errors).toEqual([]);
  });

  it("家长中心（2026-11-07 瘦身：速览/周视图并入学习报告，只留管理项）", async () => {
    const w = await mountPage(ParentView, "/me/parent");
    // 本地模式：孩子管理卡不显示（仅云模式），报告入口在首位
    expect(w.text()).toContain("家长报告");
    expect(w.text()).toContain("设置");
    expect(w.text()).not.toContain("每周学习时长"); // 已并入报告页
    expect(errors).toEqual([]);
  });

  it("游戏总地图（独立路由 /game）", async () => {
    const w = await mountPage(GameView, "/game");
    expect(w.text()).toContain("游戏闯关");
    expect(errors).toEqual([]);
  });

  /* ---------- 课程域 ---------- */

  it("课程详情 game 视图（本课卡片列表：9 玩法卡 + 1 宝箱卡，序号本课内）", async () => {
    const w = await mountPage(CourseDetailView, "/course/l10", { view: "game" });
    // 顶栏标题显示本课英文名（课程详情顶栏不再显示中文 titleZh）
    expect(w.text()).toContain("Walking In The Jungle");
    expect(w.text()).toContain("学单词");
    // 只画本课 10 行（9 玩法卡 + 宝箱奖励卡），玩法卡序号本课内 1..9
    const rows = w.findAll(".lll-row");
    expect(rows).toHaveLength(10);
    expect(rows[0].find("button").attributes("aria-label")).toContain("第1关");
    // 末行为宝箱奖励卡（不是玩法关，无“第N关”序号）
    expect(rows[rows.length - 1].find("button").attributes("aria-label")).toContain("宝箱");
    expect(w.html()).not.toContain("第22关");
    // 玩法全开放：非宝箱行不得出现锁标记（锁仅保留给未达标宝箱）
    const playRows = rows.filter((r) => !r.classes("lll-row--chest"));
    expect(playRows.some((r) => r.find(".st-locked").exists())).toBe(false);
    // 卡片列表自持纵向滚动容器
    expect(w.find(".lll-scroll").exists()).toBe(true);
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

  it("我的（2026-11-07 重设计：孩子荣誉 + 家长速览条，今日卡撤下）", async () => {
    const w = await mountPage(MyView, "/me");
    // 荣誉头图三个数字 + 收藏入口 + 家长中心
    expect(w.text()).toContain("星星");
    expect(w.text()).toContain("贝壳");
    expect(w.text()).toContain("连击天");
    expect(w.text()).toContain("宝藏罐");
    expect(w.text()).toContain("学习日历");
    expect(w.text()).toContain("家长中心");
    // 家长速览条（只读免门禁，点击进学习报告）：今天/本周分钟
    expect(w.find(".glance").text()).toContain("今天");
    expect(w.find(".glance").text()).toContain("本周");
    // 孩子语言的"目标/分钟明细"已撤到学习报告页，我的页不再出现
    expect(w.text()).not.toContain("目标：复习");
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

  it("l11 词群入口化：学单词·颜色直达锁群，无页内切换器；?group=animals 直达动物组", async () => {
    // 词群入口化后（2026-10-25）：learn 在菜单/地图拆成 学单词·颜色 / 学单词·动物，
    // 玩法内不再有 Colors/Animals 切换器——词群由 URL 锁死（?group= 或闯关 step 复合键）。
    const w = await mountPage(LessonView, "/course/l11/learn");
    await flushPromises();
    expect(w.findAll(".group-switch__btn").length).toBe(0);
    // 无 ?group= 时默认第一组（l11：colors），只有颜色词
    const words = () => w.findAll(".word-card .word").map((e) => e.text());
    expect(words()).toContain("brown");
    expect(words()).not.toContain("bear");
    // 动物组直达：?group=animals 锁群，只出动物词
    const w2 = await mountPage(LessonView, "/course/l11/learn", { group: "animals" });
    await flushPromises();
    const words2 = () => w2.findAll(".word-card .word").map((e) => e.text());
    expect(words2()).toContain("bear");
    expect(words2()).not.toContain("brown");
  });

  it("l11 学童谣仍按词群切歌（song 保留页内切换）：默认第一轨 Brown Bear（Animals），可切 Colors", async () => {
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
        // 词群入口化：key 可能是复合键（learn:colors）——路由段用裸玩法，
        // 词群经 ?group= 锁（与 open() 的 URL 拼装同构）
        const { act, group } = splitActKey(key);
        const seg = STAGE_PATH[act] ?? act;
        const w = await mountPage(
          LessonView,
          `/course/${lesson.id}/${seg}`,
          group ? { group } : undefined
        );
        await flushPromises();
        expect(w.find(".lesson").exists()).toBe(true);
        expect(errors).toEqual([]);
      });
    }
  }
});
