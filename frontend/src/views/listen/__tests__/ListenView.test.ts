// @vitest-environment jsdom
/**
 * 磨耳朵课程播放页（ListenView）：
 *  - 首页只按课程列，不再有「歌曲 / 视频 / 词句」三个顶层 tab
 *  - 点课 → 默认歌曲模式；顶部课程标题三模式共用
 *  - 页内切换歌曲 / 视频 / 词句，切换不换课
 *  - 歌曲模式 transport 三键 + 循环胶囊 + 歌词行；课程内队列不串课
 *  - 词句 / 视频播放器以 embedded 形态接入，不再各自铺浮层头
 *
 * 播放状态由 player store 驱动（openLyrics 真实调用，audio 的 play/pause 打桩）。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { mount, flushPromises } from "@vue/test-utils";
import ListenView from "../ListenView.vue";
import { usePlayerStore } from "../../../stores/player";

vi.hoisted(() => {
  const w = globalThis as unknown as Record<string, unknown>;
  w.matchMedia =
    w.matchMedia ||
    ((query: string) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }));
  // 模块级 new Audio() 的播放/暂停
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn(),
  });
});

vi.mock("../../../services/haptics", () => ({ hapticTap: vi.fn() }));
vi.mock("../../../services/speech", () => ({ speak: vi.fn(), speakText: vi.fn(), speakZh: vi.fn() }));

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }],
  });
}

async function mountListen() {
  const router = makeRouter();
  await router.push("/listen");
  await router.isReady();
  const w = mount(ListenView, { global: { plugins: [createPinia(), router] } });
  await flushPromises();
  return w;
}

/** 点第一张课程卡进播放页（默认歌曲） */
async function openPlayer(w: Awaited<ReturnType<typeof mountListen>>) {
  await w.findAll(".course-row")[0].trigger("click");
  await flushPromises();
}

async function switchMode(w: Awaited<ReturnType<typeof mountListen>>, label: string) {
  const btn = w.findAll(".seg-btn").find((b) => b.text() === label);
  expect(btn).toBeTruthy();
  await btn!.trigger("click");
  await flushPromises();
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe("ListenView · 课程首页", () => {
  it("只按课程列，没有歌曲/视频/词句的顶层 tab", async () => {
    const w = await mountListen();
    expect(w.findAll(".course-row").length).toBeGreaterThanOrEqual(7);
    expect(w.find(".type-tabs").exists()).toBe(false);
    expect(w.find(".seg-btn").exists()).toBe(false);
    expect(w.text()).toContain("今天听了");
    expect(w.text()).toContain("I Am the Music Man");
  });

  it("课程行同时提示歌曲 / 视频 / 单词 / 亲子口语，但都不是导航", async () => {
    const w = await mountListen();
    const first = w.findAll(".course-row")[0];
    expect(first.text()).toContain("歌曲");
    expect(first.text()).toContain("视频");
    expect(first.text()).toContain("词");
    expect(first.text()).toContain("句");
    expect(first.find(".course-play").exists()).toBe(true);
  });
});

describe("ListenView · 课程播放页", () => {
  it("点课默认进入歌曲模式：共用课程标题 + 三个页内模式", async () => {
    const w = await mountListen();
    await openPlayer(w);
    expect(w.find(".player").exists()).toBe(true);
    expect(w.find(".lp-title").text()).toBe("I Am the Music Man");
    expect(w.findAll(".seg-btn").map((b) => b.text())).toEqual(["歌曲", "视频", "词句"]);
    expect(w.find(".seg-btn.on").text()).toBe("歌曲");
    expect(w.find(".pl-transport").exists()).toBe(true);
    expect(w.findAll(".pl-line").length).toBeGreaterThan(5);
    expect(w.find(".pl-progress").exists()).toBe(true);
  });

  it("页内切到词句：共用标题不变，词句播放器不再带自己的浮层头", async () => {
    const w = await mountListen();
    await openPlayer(w);
    await switchMode(w, "词句");
    expect(w.find(".lp-title").text()).toBe("I Am the Music Man");
    expect(w.find(".clip-player").exists()).toBe(true);
    expect(w.find(".clip-player--embedded").exists()).toBe(true);
    expect(w.find(".cp-bar").exists()).toBe(false);
    expect(w.find(".cp-kind").text()).toBe("单词");
    expect(w.find(".pl-transport").exists()).toBe(false);
  });

  it("切回歌曲模式：恢复歌曲控制与歌词，仍停在同一课", async () => {
    const w = await mountListen();
    await openPlayer(w);
    await switchMode(w, "词句");
    await switchMode(w, "歌曲");
    expect(w.find(".lp-title").text()).toBe("I Am the Music Man");
    expect(w.find(".pl-transport").exists()).toBe(true);
    expect(w.find(".clip-player").exists()).toBe(false);
    expect(w.find(".seg-btn.on").text()).toBe("歌曲");
  });

  it("页内切到视频：视频以 embedded 形态占内容区，没有独立关闭键", async () => {
    const w = await mountListen();
    await openPlayer(w);
    await switchMode(w, "视频");
    expect(w.find(".lp-title").text()).toBe("I Am the Music Man");
    expect(w.find(".vp--embedded").exists()).toBe(true);
    expect(w.find(".vp-close").exists()).toBe(false);
    expect(w.find(".pl-transport").exists()).toBe(false);
  });

  it("循环胶囊仍是列表循环 → 单曲循环 → 随机 → 列表循环", async () => {
    const w = await mountListen();
    await openPlayer(w);
    const label = () => w.find(".pl-mode-label").text();
    expect(label()).toBe("列表循环");
    await w.find(".pl-mode").trigger("click");
    expect(label()).toBe("单曲循环");
    await w.find(".pl-mode").trigger("click");
    expect(label()).toBe("随机");
    await w.find(".pl-mode").trigger("click");
    expect(label()).toBe("列表循环");
  });

  it("主键播放/暂停切换（aria-label 跟随）", async () => {
    const w = await mountListen();
    await openPlayer(w);
    const main = w.find(".pl-main");
    expect(main.attributes("aria-label")).toBe("暂停");
    await main.trigger("click");
    expect(w.find(".pl-main").attributes("aria-label")).toBe("播放");
    await main.trigger("click");
    expect(w.find(".pl-main").attributes("aria-label")).toBe("暂停");
  });

  it("收起（左上圆键）回课程列表", async () => {
    const w = await mountListen();
    await openPlayer(w);
    await w.find('button[aria-label="收起播放页"]').trigger("click");
    await flushPromises();
    expect(w.find(".player").exists()).toBe(false);
    expect(w.findAll(".course-row").length).toBeGreaterThan(0);
  });

  it("去这一课：直达当前歌所属课程详情", async () => {
    const w = await mountListen();
    await openPlayer(w);
    const lessonBtn = w.find('.lp-head-actions button[aria-label="去这一课"]');
    expect(lessonBtn.exists()).toBe(true);
    await lessonBtn.trigger("click");
    await flushPromises();
    type RouteProbe = { currentRoute: { value: { path: string } } };
    const vm = w.vm as unknown as { $: { appContext: { config: { globalProperties: { $router: RouteProbe } } } } };
    expect(vm.$.appContext.config.globalProperties.$router.currentRoute.value.path).toBe("/course/l5");
  });
});

describe("ListenView · 词句内容", () => {
  it("亲子口语句子也带图：l5 第 8 句 What can you play? 用音符拟物图", async () => {
    const w = await mountListen();
    await openPlayer(w);
    await switchMode(w, "词句");
    for (let i = 0; i < 7; i++) {
      await w.find('button[aria-label="下一句"]').trigger("click");
    }
    expect(w.find(".cp-kind-count").text()).toBe("8 / 17");
    expect(w.find(".cp-kind").text()).toBe("亲子口语");
    expect(w.find(".cp-visual").exists()).toBe(true);
    expect(w.find(".cp-img").attributes("src")).toContain("/phrases/play.webp");
  });

  it("词句循环方式仍可切换：整课循环 → 单句循环 → 随机 → 整课循环", async () => {
    const w = await mountListen();
    await openPlayer(w);
    await switchMode(w, "词句");
    const label = () => w.find(".cp-mode span").text();
    expect(label()).toBe("整课循环");
    await w.find(".cp-mode").trigger("click");
    expect(label()).toBe("单句循环");
    await w.find(".cp-mode").trigger("click");
    expect(label()).toBe("随机播放");
    await w.find(".cp-mode").trigger("click");
    expect(label()).toBe("整课循环");
  });
});

describe("ListenView · 从其他 tab 回来", () => {
  it("有加载过的歌时直接落到课程播放页", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    usePlayerStore().playSong(0);
    const router = makeRouter();
    await router.push("/listen");
    await router.isReady();
    const w = mount(ListenView, { global: { plugins: [pinia, router] } });
    await flushPromises();
    expect(w.find(".player").exists()).toBe(true);
    expect(w.find(".course-row").exists()).toBe(false);
  });
});
