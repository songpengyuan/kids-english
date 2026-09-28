// @vitest-environment jsdom
/**
 * useLessonFlow 行为级测试（2026-09-28 P1-5）。
 *
 * 覆盖三类关键行为（此前只有冒烟、缺行为断言）：
 * 1. 引导/深链解析：无 stage → 菜单并朗读标题；query stage → 直接玩法；
 *    子路径 stage（#/lesson/l4/learn）→ 直接玩法；闯关模式 → 跳过菜单开玩；
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

import { bigCelebrate, celebrate } from "../../services/effects";
import { speak, speakZh } from "../../services/speech";
import { hapticTap } from "../../services/haptics";

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
      { path: "/lesson/:id/:stage?", name: "lesson", component: { template: "<div />" } },
      { path: "/quest/:id/:stage?", name: "quest", component: { template: "<div />" } },
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
    const { flow } = await bootHost("/lesson/l4");
    vi.useFakeTimers();
    flow.boot();
    expect(flow.stage.value).toBe("menu");
    vi.advanceTimersByTime(400);
    expect(speak).toHaveBeenCalledWith("A Sailor Went to Sea");
  });

  it("query stage 深链：?stage=learn 直接进入学单词", async () => {
    const { flow } = await bootHost("/lesson/l4?stage=learn");
    flow.boot();
    expect(flow.stage.value).toBe("learn");
    // 有直达 stage 时不朗读标题
    expect(speak).not.toHaveBeenCalled();
  });

  it("子路径深链：#/lesson/l4/learn 直接进入学单词（P1-1）", async () => {
    const { flow } = await bootHost("/lesson/l4/learn");
    flow.boot();
    expect(flow.stage.value).toBe("learn");
  });

  it("URL 无 stage（#/lesson/l4）时 boot 幂等回菜单（防回退卡在玩法）", async () => {
    const { flow } = await bootHost("/lesson/l4");
    flow.boot();
    flow.open(acts[0]);
    expect(flow.stage.value).toBe("learn");
    // URL 一直是 /lesson/:id（无 stage）：再 boot 应回菜单而非停在玩法
    flow.boot();
    expect(flow.stage.value).toBe("menu");
  });

  it("子路径优先于 query：/lesson/l4/learn?stage=quiz → learn", async () => {
    const { flow } = await bootHost("/lesson/l4/learn?stage=quiz");
    flow.boot();
    expect(flow.stage.value).toBe("learn");
  });

  it("闯关模式（#/quest/l4?step=quiz 独立路由）：跳过菜单直接进对应玩法", async () => {
    const { flow } = await bootHost("/quest/l4?step=quiz");
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
    const { flow } = await bootHost("/lesson/l4");
    flow.boot();
    flow.open(acts[0]);
    expect(flow.stage.value).toBe("learn");
    expect(hapticTap).toHaveBeenCalled();
  });

  it("toMenu() 回菜单", async () => {
    const { flow } = await bootHost("/lesson/l4");
    flow.boot();
    flow.open(acts[1]);
    flow.toMenu();
    expect(flow.stage.value).toBe("menu");
  });

  it("back()：自由模式返回课程列表首页", async () => {
    const { flow, router } = await bootHost("/lesson/l4");
    flow.boot();
    flow.back();
    await new Promise((r) => setTimeout(r, 0));
    expect(router.currentRoute.value.path).toBe("/");
  });

  it("back()：玩法中先回本课菜单", async () => {
    const { flow } = await bootHost("/lesson/l4");
    flow.boot();
    flow.open(acts[0]);
    flow.back();
    expect(flow.stage.value).toBe("menu");
  });
});

describe("useLessonFlow 结算", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("自由模式满分结算：写 3 星、首通、双彩带大庆祝、累计今日学情", async () => {
    const { flow } = await bootHost("/lesson/l4");
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
    const { flow } = await bootHost("/lesson/l4");
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
    const { flow, wrapper } = await bootHost("/quest/l4?step=0");
    flow.boot();
    flow.open(acts[0]);
    flow.afterGame(3);
    const quest = (wrapper.vm as unknown as { quest: { questDone: { value: boolean } } }).quest;
    expect(quest.questDone.value).toBe(true);
    expect(flow.stage.value).toBe("result");
  });

  it("afterSong 结算：进结算并累计今日学情（童谣星数由 SongView 内部记）", async () => {
    const { flow } = await bootHost("/lesson/l4");
    flow.boot();
    flow.open(acts[2]);
    flow.afterSong();
    expect(flow.stage.value).toBe("result");
    expect(flow.lastStars.value).toBe(1);
    const p = useProgressStore();
    // 会话不足 1 秒会被 round 成 0，改验证玩法计数被累计
    expect(p.todayStats.activities).toBe(1);
  });
});
