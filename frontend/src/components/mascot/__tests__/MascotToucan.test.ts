// @vitest-environment jsdom
/**
 * 吉祥物「乐乐鸟」组件：显隐规则与交互。
 *  - dock：/course、/me、课程详情（/course/:id 无子路径）常驻；玩法页不常驻；
 *  - 硬排除：/listen 播放页、/gate 门禁页（popup 事件也不出现）；
 *  - popup：玩法页 useMascot 事件触发飞入，TTL 后自动离场；
 *  - 点击：hapticTap + 闲聊（speakZh），气泡渲染；
 *  - 会话首访问候：dock 首次可见后 ~1.2s 问候，sessionStorage 幂等。
 *
 * 显隐纪律只认路径（nav-visibility.ts 的历史事故教训）。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { mount, flushPromises } from "@vue/test-utils";
import MascotToucan from "../MascotToucan.vue";
import { useMascot, __resetMascotState } from "../../../composables/useMascot";

vi.mock("../../../services/haptics", () => ({ hapticTap: vi.fn() }));
vi.mock("../../../services/speech", () => ({ speakZh: vi.fn() }));
import { hapticTap } from "../../../services/haptics";
import { speakZh } from "../../../services/speech";

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/course", component: { template: "<div />" } },
      { path: "/course/:id", name: "course-detail", component: { template: "<div />" } },
      { path: "/course/:id/:stage", component: { template: "<div />" } },
      { path: "/listen", component: { template: "<div />" } },
      { path: "/me", component: { template: "<div />" } },
      { path: "/gate", component: { template: "<div />" } },
    ],
  });
}

async function mountAt(path: string) {
  const router = makeRouter();
  await router.push(path);
  await router.isReady();
  const w = mount(MascotToucan, { global: { plugins: [createPinia(), router] } });
  await flushPromises();
  return w;
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  localStorage.clear();
  setActivePinia(createPinia());
  __resetMascotState();
  vi.clearAllMocks();
});

describe("MascotToucan · dock 常驻显隐", () => {
  it("课程列表：常驻可见，图与按钮语义齐全", async () => {
    const w = await mountAt("/course");
    expect(w.find(".mascot").exists()).toBe(true);
    expect(w.find(".mascot-img").attributes("src")).toBe("/mascot/toucan.webp");
    expect(w.find(".mascot-btn").attributes("aria-label")).toBe("乐乐鸟");
  });

  it("课程详情（无子路径）：也常驻", async () => {
    const w = await mountAt("/course/l4");
    expect(w.find(".mascot").exists()).toBe(true);
  });

  it("课程详情的子页面（玩法/介绍）：不常驻", async () => {
    const w = await mountAt("/course/l4/quiz");
    expect(w.find(".mascot").exists()).toBe(false);
  });

  it("硬排除：磨耳朵播放页与门禁页不出现", async () => {
    expect((await mountAt("/listen")).find(".mascot").exists()).toBe(false);
    expect((await mountAt("/gate")).find(".mascot").exists()).toBe(false);
  });

  it("磨耳朵页连 popup 事件也不出现（硬排除优先于事件）", async () => {
    const w = await mountAt("/listen");
    useMascot().say("太棒啦");
    await flushPromises();
    expect(w.find(".mascot").exists()).toBe(false);
  });
});

describe("MascotToucan · 点击与会话问候", () => {
  it("点乐鸟：触感 + 闲聊（speakZh）+ 气泡渲染", async () => {
    const w = await mountAt("/course");
    await w.find(".mascot-btn").trigger("click");
    await flushPromises();
    expect(hapticTap).toHaveBeenCalled();
    expect(speakZh).toHaveBeenCalled();
    expect(w.find(".mascot-bubble").exists()).toBe(true);
    expect(w.find(".mascot-bubble").text()).not.toBe("");
  });

  it("会话首访：dock 可见后 ~1.2s 问候一次，sessionStorage 幂等", async () => {
    const w1 = await mountAt("/course");
    expect(w1.find(".mascot-bubble").exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(1300);
    expect(w1.find(".mascot-bubble").exists()).toBe(true);
    expect(sessionStorage.getItem("mascot-greeted-v1")).toBe("1");
    // 同一会话再挂一个实例（换页回来）：不再问候。
    // bubble 是模块单例：卸载并清态，避免把上一实例的气泡误算进断言
    w1.unmount();
    __resetMascotState();
    const w2 = await mountAt("/course/l4");
    await vi.advanceTimersByTimeAsync(1400);
    expect(w2.find(".mascot-bubble").exists()).toBe(false);
  });
});

describe("MascotToucan · 玩法页事件出场（popup）", () => {
  it("答错事件：乐鸟飞入打气，TTL 后自动离场", async () => {
    const w = await mountAt("/course/l4/quiz");
    expect(w.find(".mascot").exists()).toBe(false);
    const m = useMascot();
    m.oops();
    await flushPromises();
    expect(w.find(".mascot").exists()).toBe(true);
    expect(w.find(".mascot").classes()).toContain("mascot--oops");
    expect(w.find(".mascot-bubble").text()).not.toBe("");
    // 2.6s TTL + 0.2s 退场动画后离场
    await vi.advanceTimersByTimeAsync(3000);
    expect(w.find(".mascot").exists()).toBe(false);
  });
});
