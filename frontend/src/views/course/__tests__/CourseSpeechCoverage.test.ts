// @vitest-environment jsdom
/**
 * 课程详情/介绍页的点读全覆盖（"孩子看到的都能发音"，commit 8750b8a 口径）：
 *  - CourseAboutView：课程头点读英文课名（ttsOnly）、重点词汇卡点读词音
 *    （mp3 优先，走 lessonId:wordId 精确键）
 *  - LessonLevelList：点关卡卡先念玩法名（speakZh）再进玩法——
 *    孩子听到自己去哪（TTS 全局存活跨路由）
 * 走查探针：window.__spoken / __played 双监听（见 ui-walkthrough skill 第 10 条）。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { mount, flushPromises } from "@vue/test-utils";
import CourseAboutView from "../../course/CourseAboutView.vue";
import LessonLevelList from "../../../components/game/LessonLevelList.vue";
import { lessons } from "../../../data/lessons";

vi.mock("../../../services/haptics", () => ({ hapticTap: vi.fn() }));
vi.mock("../../../services/speech", () => ({
  speak: vi.fn(),
  speakZh: vi.fn(),
}));
vi.mock("../../../composables/useLearnSession", () => ({
  useLearnSession: () => ({
    stageEl: { value: null },
    gridStyle: { value: {} },
    page: { value: 0 },
    total: { value: 1 },
    items: { value: [] },
    isLast: { value: true },
    gotoNext: vi.fn(),
    gotoPrev: vi.fn(),
    gotoPage: vi.fn(),
    markTapped: vi.fn(),
    tapped: { value: new Set() },
    tappedCount: { value: 0 },
    stars: { value: 1 },
  }),
}));

const l5 = lessons.find((l) => l.id === "l5")!;
const spokenTexts = () =>
  vi.mocked((vi.importActual("@vue/test-utils"), { speak: vi.fn() }).speak ?? []).length;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/course/:id", name: "course-detail", component: { template: "<div />" } },
      { path: "/course/:id/:stage", name: "lesson-stage", component: { template: "<div />" } },
      { path: "/course/:id/game/quest", name: "quest", component: { template: "<div />" } },
      { path: "/", component: { template: "<div />" } },
    ],
  });
}

async function mountAbout() {
  setActivePinia(createPinia());
  const router = makeRouter();
  await router.push("/course/l5/about");
  await router.isReady();
  const w = mount(CourseAboutView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

async function mountLevels() {
  setActivePinia(createPinia());
  const router = makeRouter();
  await router.push("/course/l5");
  await router.isReady();
  const w = mount(LessonLevelList, { props: { lesson: l5 }, global: { plugins: [router] } });
  await flushPromises();
  return w;
}

import { speak, speakZh } from "../../../services/speech";

describe("CourseAboutView · 点读全覆盖", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("课程头可点读英文课名（ttsOnly）", async () => {
    const w = await mountAbout();
    await w.find(".about-hero").trigger("click");
    expect(speak).toHaveBeenCalledWith("I Am the Music Man", { ttsOnly: true });
  });

  it("重点词汇卡逐张可点读词音（带 lessonId:wordId 精确键）", async () => {
    const w = await mountAbout();
    const cards = w.findAll(".about-card button").filter((b) => b.find(".about-word").exists() || b.text().includes("violin"));
    // 至少有一张词卡按钮
    expect(cards.length).toBeGreaterThan(0);
    await cards[0].trigger("click");
    expect(speak).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ lessonId: "l5", wordId: expect.any(String) }),
    );
  });

  it("课程头带「轻点标题/词卡可听发音」的可视提示", async () => {
    const w = await mountAbout();
    expect(w.text()).toContain("轻点标题");
  });
});

describe("LessonLevelList · 关卡卡报名", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("点关卡卡先念玩法名（speakZh）再跳玩法页", async () => {
    const w = await mountLevels();
    await w.find(".lll-btn").trigger("click");
    expect(speakZh).toHaveBeenCalledWith("学童谣");
    await flushPromises();
    expect(w.vm.$route.path).toBe("/course/l5/game/quest");
  });
});
