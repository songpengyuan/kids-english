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
  speakText: vi.fn(),
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

import { speak, speakText, speakZh } from "../../../services/speech";

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

  it("口语/句子条目逐条点读：先英文（TTS）后中文释义（2026-11-14 结构化条目）", async () => {
    const w = await mountAbout();
    // l5 intro 有「口语句型」节 → 解析为「亲子口语」卡（归一化标题）
    expect(w.text()).toContain("亲子口语");
    const line = w.findAll(".line-list .line")[0];
    expect(line.exists()).toBe(true);
    await line.trigger("click");
    expect(speakText).toHaveBeenCalledWith(expect.any(String), expect.anything());
  });

  it("需要加强的单词改为点读（点词=听词，重练走底部 CTA）", async () => {
    const w = await mountAbout();
    // 造一条错词记录：progress store 标 l5 的一个词 wrong
    const { useProgressStore } = await import("../../../stores/progress");
    const progress = useProgressStore();
    const l5 = (await import("../../../data/lessons")).lessons.find((x) => x.id === "l5")!;
    const wid = l5.words[0].id;
    progress.recordWord("l5", wid, { seen: 1, wrong: 2 });
    await flushPromises();
    const weak = w.find(".weak");
    expect(weak.exists()).toBe(true);
    await weak.trigger("click");
    expect(speak).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ lessonId: "l5", wordId: wid }),
    );
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
