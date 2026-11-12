// @vitest-environment jsdom
/**
 * 玩法中途退出确认（走查 P1 #1，commit 7640abf）：
 * 孩子手指小，左上角"关闭"是高频误触区——玩法中（stage 非 menu/result）点关闭
 * 要先弹孩子化确认弹窗；结算/菜单页不拦。锁三条路径：
 *  - 玩法中点关闭 → 弹「还没玩完哦」（不直接退）
 *  - 弹窗「离开」→ 真退出（URL 回菜单）
 *  - 弹窗「继续玩」/关闭弹窗 → 留在玩法
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { mount, flushPromises } from "@vue/test-utils";
import LessonView from "../LessonView.vue";
import { lessons } from "../../../data/lessons";

vi.mock("../../../services/speech", () => ({ speak: vi.fn(), speakZh: vi.fn() }));
vi.mock("../../../services/effects", () => ({
  sfxCorrect: vi.fn(), sfxWrong: vi.fn(), sfxTap: vi.fn(), celebrate: vi.fn(), bigCelebrate: vi.fn(),
}));
vi.mock("../../../services/haptics", () => ({ hapticTap: vi.fn() }));

vi.hoisted(() => {
  const w = globalThis as unknown as Record<string, unknown>;
  w.ResizeObserver = w.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  w.matchMedia =
    w.matchMedia ||
    ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }));
});

const l4 = lessons.find((l) => l.id === "l4")!;

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/course/:id", name: "course-detail", component: { template: "<div />" } },
      { path: "/course/:id/learn", name: "lesson-learn", component: { template: "<div />" } },
      { path: "/", component: { template: "<div />" } },
    ],
  });
}

/** 以玩法态（learn）挂载详情宿主；返回 router 句柄供 push 断言 */
async function mountPlaying() {
  setActivePinia(createPinia());
  const router = makeRouter();
  await router.push(`/course/l4/learn`);
  await router.isReady();
  const w = mount(LessonView, { global: { plugins: [router] } });
  await flushPromises();
  return { w, router };
}

const dialogBtn = (w: Awaited<ReturnType<typeof mountPlaying>>["w"], label: string) =>
  w.findAll("button").find((b) => b.text() === label);

describe("LessonView · 玩法中途退出确认", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** 玩法中左上角按钮是"关闭"（HeaderBar：close 态 aria-label 取"关闭"） */
  const backBtn = (w: Awaited<ReturnType<typeof mountPlaying>>["w"]) =>
    w.findAll("button").find((b) => b.attributes("aria-label") === "关闭");

  it("玩法中点左上角关闭 → 弹确认弹窗（不直接退）", async () => {
    const { w } = await mountPlaying();
    await backBtn(w)!.trigger("click");
    await w.vm.$nextTick();
    expect(w.text()).toContain("还没玩完哦");
    expect(w.text()).toContain("答过的题会不见的");
    expect(w.find('[aria-label="确认离开"]').exists()).toBe(true);
  });

  it("弹窗点「离开」→ 真退出（replace 回课程详情 menu 视图）", async () => {
    const { w, router } = await mountPlaying();
    await backBtn(w)!.trigger("click");
    await w.vm.$nextTick();
    const replace = vi.spyOn(router, "replace");
    await dialogBtn(w, "离开")!.trigger("click");
    await flushPromises();
    expect(replace).toHaveBeenCalledWith(
      expect.objectContaining({ name: "course-detail", query: { view: "menu" } }),
    );
  });

  it("弹窗点「继续玩」→ 退场动画后弹窗收起，留在玩法", async () => {
    const { w, router } = await mountPlaying();
    await backBtn(w)!.trigger("click");
    await w.vm.$nextTick();
    await dialogBtn(w, "继续玩")!.trigger("click");
    await vi.advanceTimersByTimeAsync(200); // AppDialog 退场 180ms 后才 emit close
    await w.vm.$nextTick();
    expect(w.find('[aria-label="确认离开"]').exists()).toBe(false);
    expect(router.currentRoute.value.path).toBe("/course/l4/learn"); // 没有离开
  });
});

