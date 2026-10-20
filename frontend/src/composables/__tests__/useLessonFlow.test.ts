// @vitest-environment jsdom
/**
 * useLessonFlow 行为级测试（2026-09-28 P1-5）。
 *
 * 覆盖三类关键行为（此前只有冒烟、缺行为断言）：
 * 1. 引导/深链解析：无 stage → 菜单并朗读标题；query stage → 直接玩法；
 *    子路径 stage（#/course/l4/learn）→ 直接玩法；闯关模式 → 跳过菜单开玩；
 * 2. 玩法迁移：open() 切 stage 并记时；toMenu/back 的 stage 语义；
 * 3. 结算：星数写入、首通判定（markNewLevel firstTime）、今日学情累计、
 *    庆祝档位（3 星双彩带 / 低星小彩带）、闯关模式触发 quest.finish。
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, ref, type ComputedRef } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter, useRoute, type Router } from "vue-router";
import { getLesson } from "../../data/lessons";
import { useProgressStore } from "../../stores/progress";
import { useStreakStore } from "../../stores/streak";
import { useQuest, type QuestAct } from "../useQuest";
import { useLessonFlow, type UseLessonFlow } from "../useLessonFlow";

vi.mock("../../services/effects", () => ({ bigCelebrate: vi.fn(), celebrate: vi.fn() }));
vi.mock("../../services/speech", () => ({ speak: vi.fn(), speakZh: vi.fn() }));
vi.mock("../../services/haptics", () => ({ hapticTap: vi.fn() }));
// 埋点：这里只关心"上报了什么"，不关心队列实现（那部分在 telemetry 自己的测试里）
vi.mock("../../services/telemetry", () => ({ track: vi.fn() }));

import { bigCelebrate, celebrate } from "../../services/effects";
import { speak, speakZh } from "../../services/speech";
import { hapticTap } from "../../services/haptics";
import { track } from "../../services/telemetry";

const acts: QuestAct[] = [
  { key: "learn", name: "学单词", icon: undefined as never, tone: "orange", game: "learn", desc: "看图听发音" },
  { key: "quiz", name: "听音选图", icon: undefined as never, tone: "blue", game: "quiz", desc: "听声音找图片" },
  { key: "song", name: "唱童谣", icon: undefined as never, tone: "green", game: "song", desc: "听歌看视频" }
];

interface Host {
  wrapper: VueWrapper;
  flow: UseLessonFlow;
  router: Router;
}

/** 挂载真实组件上下文（useRoute/useQuest/真实 stores），返回 flow 句柄 */
async function bootHost(url: string): Promise<Host> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/course/:id/game", name: "course-game", component: { template: "<div />" } },
      { path: "/course/:id/menu", name: "lesson-menu", component: { template: "<div />" } },
      { path: "/course/:id/:stage?", name: "lesson", component: { template: "<div />" } },
      { path: "/game/quest/:id/:stage?", name: "quest", component: { template: "<div />" } },
      { path: "/", name: "home", component: { template: "<div />" } }
    ]
  });
  const pinia = createPinia();
  const Host = defineComponent({
    setup() {
      const lesson = computed(() => getLesson("l4") || null);
      const activities = computed<QuestAct[]>(() => acts);
      const route = useRoute();
      const quest = useQuest({ lesson, activities, route });
      const flow = useLessonFlow({
        lesson,
        activities,
        route,
        router,
        progress: useProgressStore(),
        streak: useStreakStore(),
        isNarrow: ref(false) as unknown as ComputedRef<boolean>,
        quest
      });
      return { flow, quest };
    },
    template: "<div />"
  });
  const wrapper = mount(Host, { global: { plugins: [pinia, router] } });
  await router.push(url);
  await router.isReady();
  return { wrapper, flow: (wrapper.vm as unknown as { flow: UseLessonFlow }).flow, router };
}

describe("useLessonFlow 引导（深链解析）", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it("无 stage 直达：进菜单，稍后朗读课程标题", async () => {
    const { flow } = await bootHost("/course/l4/menu");
    vi.useFakeTimers();
    flow.boot();
    expect(flow.stage.value).toBe("menu");
    vi.advanceTimersByTime(400);
    expect(speak).toHaveBeenCalledWith("A Sailor Went to Sea");
  });

  it("query stage 深链：?stage=learn 直接进入学单词", async () => {
    const { flow } = await bootHost("/course/l4?stage=learn");
    flow.boot();
    expect(flow.stage.value).toBe("learn");
    // 有直达 stage 时不朗读标题
    expect(speak).not.toHaveBeenCalled();
  });

  it("子路径深链：#/lesson/l4/learn 直接进入学单词（P1-1）", async () => {
    const { flow } = await bootHost("/course/l4/learn");
    flow.boot();
    expect(flow.stage.value).toBe("learn");
  });

  it("URL 无 stage（#/lesson/l4）时 boot 幂等回菜单（防回退卡在玩法）", async () => {
    const { flow } = await bootHost("/course/l4/menu");
    flow.boot();
    flow.open(acts[0]);
    expect(flow.stage.value).toBe("learn");
    // URL 一直是 /course/:id（无 stage）：再 boot 应回菜单而非停在玩法
    flow.boot();
    expect(flow.stage.value).toBe("menu");
  });

  it("子路径优先于 query：/lesson/l4/learn?stage=quiz → learn", async () => {
    const { flow } = await bootHost("/course/l4/learn?stage=quiz");
    flow.boot();
    expect(flow.stage.value).toBe("learn");
  });

  it("闯关模式（#/quest/l4?step=quiz 独立路由）：跳过菜单直接进对应玩法", async () => {
    const { flow } = await bootHost("/game/quest/l4?step=quiz");
    flow.boot();
    expect(flow.stage.value).toBe("quiz");
  });
});

describe("useLessonFlow 玩法迁移", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("open() 切换到玩法 stage 并触发触感反馈", async () => {
    const { flow } = await bootHost("/course/l4/menu");
    flow.boot();
    flow.open(acts[0]);
    expect(flow.stage.value).toBe("learn");
    expect(hapticTap).toHaveBeenCalled();
  });

  it("toMenu() 回菜单", async () => {
    const { flow } = await bootHost("/course/l4/menu");
    flow.boot();
    flow.open(acts[1]);
    flow.toMenu();
    expect(flow.stage.value).toBe("menu");
  });

  it("back()：卡片目录页返回本课闯关地图", async () => {
    const { flow, router } = await bootHost("/course/l4/menu");
    flow.boot();
    flow.back();
    await new Promise((r) => setTimeout(r, 0));
    expect(router.currentRoute.value.path).toBe("/course/l4/game");
  });

  it("back()：玩法中先回本课卡片目录，URL 同步到 /menu", async () => {
    const { flow, router } = await bootHost("/course/l4/menu");
    flow.boot();
    flow.open(acts[0]);
    await new Promise((r) => setTimeout(r, 0));
    expect(router.currentRoute.value.path).toBe("/course/l4/" + acts[0].key);
    flow.back();
    await new Promise((r) => setTimeout(r, 0));
    expect(flow.stage.value).toBe("menu");
    expect(router.currentRoute.value.path).toBe("/course/l4/menu");
  });
});

describe("useLessonFlow 结算", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("自由模式满分结算：写 3 星、首通、双彩带大庆祝、累计今日学情", async () => {
    const { flow } = await bootHost("/course/l4/menu");
    flow.boot();
    flow.open(acts[0]);
    flow.afterGame(3);
    expect(flow.stage.value).toBe("result");
    expect(flow.lastStars.value).toBe(3);
    const p = useProgressStore();
    expect(p.progress.l4?.learn).toBe(3);
    expect(bigCelebrate).toHaveBeenCalled();
    expect(celebrate).not.toHaveBeenCalled();
    expect(speakZh).toHaveBeenCalledWith("太厉害了，满分三颗星");
    // 今日学情：玩法会话时长被累计（actStart 在 open 时记录）
    // 会话不足 1 秒会被 round 成 0，改验证玩法计数被累计
    expect(p.todayStats.activities).toBe(1);
  });

  it("重玩低星：markNewLevel(false)、小彩带庆祝", async () => {
    const { flow } = await bootHost("/course/l4/menu");
    flow.boot();
    // 首次通关先拿 3 星
    flow.open(acts[0]);
    flow.afterGame(3);
    vi.clearAllMocks();
    // 重玩只拿 1 星
    flow.open(acts[0]);
    flow.afterGame(1);
    expect(flow.lastStars.value).toBe(1);
    expect(bigCelebrate).not.toHaveBeenCalled();
    expect(celebrate).toHaveBeenCalled();
    expect(speakZh).toHaveBeenCalledWith("做得好，继续加油");
  });

  it("闯关模式结算：触发 quest.finish 并进大画面", async () => {
    const { flow, wrapper } = await bootHost("/game/quest/l4?step=0");
    flow.boot();
    flow.open(acts[0]);
    flow.afterGame(3);
    const quest = (wrapper.vm as unknown as { quest: { questDone: { value: boolean } } }).quest;
    expect(quest.questDone.value).toBe(true);
    expect(flow.stage.value).toBe("result");
  });

  it("afterSong 结算：进结算并累计今日学情（童谣星数由 SongView 内部记）", async () => {
    const { flow } = await bootHost("/course/l4/menu");
    flow.boot();
    flow.open(acts[2]);
    flow.afterSong();
    expect(flow.stage.value).toBe("result");
    expect(flow.lastStars.value).toBe(1);
    const p = useProgressStore();
    // 会话不足 1 秒会被 round 成 0，改验证玩法计数被累计
    expect(p.todayStats.activities).toBe(1);
  });

  it("闯关收尾跳转：左上角返回（结算页唯一的回地图出口）→ 当前课地图", async () => {
    // 2026-10-19：结算页底部「返回闯关地图」按钮已下线（闯关完成不再开宝箱），
    // 回地图只剩左上角 ← 这一条路 —— 这条用例锁的就是这个出口不失效。
    const { flow, router } = await bootHost("/game/quest/l4?step=quiz");
    flow.boot();
    const push = vi.spyOn(router, "push");
    flow.back();
    expect(push).toHaveBeenCalledWith("/course/l4/game");
  });
});

describe("useLessonFlow 埋点（ADR-004）", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  /** 取某类事件的调用参数（track(type, payload)） */
  function payloadsOf(type: string): Array<Record<string, unknown>> {
    return (track as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .filter((c) => c[0] === type)
      .map((c) => (c[1] ?? {}) as Record<string, unknown>);
  }

  it("玩法完成 → 上报 activity_done，带课时/玩法名/秒数", async () => {
    const { flow } = await bootHost("/course/l4/menu");
    flow.boot();
    vi.useFakeTimers();
    flow.open(acts[1]); // quiz（听音选图）
    vi.advanceTimersByTime(4200);
    flow.afterGame(3);
    const [p] = payloadsOf("activity_done");
    expect(p).toBeDefined();
    expect(p.lesson_id).toBe("l4");
    expect(p.activity).toBe("quiz");
    expect(p.seconds).toBe(4);
  });

  it("afterSong 里 stage 已改成 result，activity 仍须是真实的玩法名", async () => {
    // 这条专防一类静默失真：结算函数在改完 stage 之后再埋点，
    // 会把所有童谣时长记成 activity="result"，看板上还看不出异常
    const { flow } = await bootHost("/course/l4/menu");
    flow.boot();
    vi.useFakeTimers();
    flow.open(acts[2]); // song（唱童谣）
    vi.advanceTimersByTime(9000);
    flow.afterSong();
    expect(flow.stage.value).toBe("result");
    const [p] = payloadsOf("activity_done");
    expect(p.activity).toBe("song");
    expect(p.seconds).toBe(9);
  });

  it("不足 1 秒的点击视为误触，不上报（防菜单来回点刷出大量 0 秒事件）", async () => {
    const { flow } = await bootHost("/course/l4/menu");
    flow.boot();
    vi.useFakeTimers();
    flow.open(acts[0]);
    vi.advanceTimersByTime(300);
    flow.afterGame(1);
    expect(payloadsOf("activity_done")).toHaveLength(0);
  });

  it("闯关模式过关 → 上报 level_pass（本课内关卡序号，不是全站累计）", async () => {
    const { flow } = await bootHost("/game/quest/l4?step=quiz");
    flow.boot();
    flow.open(acts[1]);
    flow.afterGame(3);
    const [p] = payloadsOf("level_pass");
    expect(p).toBeDefined();
    expect(p.lesson_id).toBe("l4");
    // l4 本课顺序 song→learn→quiz…，quiz = 第 3 关；旧实现报的是全站累计值（l4-quiz 曾是第 9 关）
    expect(p.level).toBe(3);
  });

  it("自由模式结算（非闯关）不应误报 level_pass", async () => {
    const { flow } = await bootHost("/course/l4/menu");
    flow.boot();
    vi.useFakeTimers();
    flow.open(acts[0]);
    vi.advanceTimersByTime(2000);
    flow.afterGame(3);
    expect(payloadsOf("level_pass")).toHaveLength(0);
  });
});
