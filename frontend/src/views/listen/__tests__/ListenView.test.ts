// @vitest-environment jsdom
/**
 * 磨耳朵播放器（ListenView）——播放态交互：
 *  - 列表态：歌曲行渲染（含多轨展开的两首 l11 歌曲——歌曲还原的回归锁）
 *  - 点行 → 播放态：transport 三键 + 模式胶囊 + 歌词行（英文 + 中文翻译）
 *  - 模式单键三档循环：列表循环 → 单曲循环 → 随机 → 列表循环
 *  - 主键播放/暂停切换；收起（closeLyrics）回列表
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

/** 点第一首歌行进入播放态（openLyrics） */
async function openPlayer(w: Awaited<ReturnType<typeof mountListen>>) {
  const row = w.findAll(".song-row")[0];
  await row.trigger("click");
  await flushPromises();
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe("ListenView · 列表态", () => {
  it("渲染全部歌曲行（含多轨展开的 Brown Bear Song 与 Colors Song）", async () => {
    const w = await mountListen();
    const titles = w.findAll(".sr-title").map((t) => t.text());
    expect(titles).toContain("Brown Bear Song");
    expect(titles).toContain("Colors Song");
    const colorRow = w.findAll(".song-row").find((r) => r.text().includes("Colors Song"));
    expect(colorRow).toBeTruthy();
    expect(colorRow!.find(".emoji-tile__img").attributes("src")).toContain("1f3a8.webp");
    expect(w.text()).toContain("今天听了");
    expect(w.text()).toContain("I Am the Music Man");
  });
});

describe("ListenView · 词句 tab", () => {
  async function openClips(w: Awaited<ReturnType<typeof mountListen>>) {
    const tab = w.findAll(".seg-btn").find((b) => b.text() === "词句");
    expect(tab).toBeTruthy();
    await tab!.trigger("click");
    await flushPromises();
  }

  it("第三个 tab 按课程列出单词与亲子口语数量", async () => {
    const w = await mountListen();
    await openClips(w);
    expect(w.findAll(".clip-row").length).toBeGreaterThanOrEqual(7);
    expect(w.find(".clip-row").text()).toContain("个单词");
    expect(w.find(".clip-row").text()).toContain("句对话");
    expect(w.find(".song-row").exists()).toBe(false);
  });

  it("词句播放器可切换循环方式：整课循环 → 单句循环 → 随机 → 整课循环", async () => {
    const w = await mountListen();
    await openClips(w);
    await w.findAll(".clip-row")[0].trigger("click");
    await flushPromises();
    const label = () => w.find(".cp-mode span").text();
    expect(label()).toBe("整课循环");
    await w.find(".cp-mode").trigger("click");
    expect(label()).toBe("单句循环");
    await w.find(".cp-mode").trigger("click");
    expect(label()).toBe("随机播放");
    await w.find(".cp-mode").trigger("click");
    expect(label()).toBe("整课循环");
  });

  it("点课程进入词句播放器：单词在前，能暂停与收起", async () => {
    const w = await mountListen();
    await openClips(w);
    await w.findAll(".clip-row")[0].trigger("click");
    await flushPromises();
    expect(w.find(".clip-player").exists()).toBe(true);
    expect(w.find(".cp-kind").text()).toBe("单词");
    expect(w.find(".cp-en").text().length).toBeGreaterThan(0);
    expect(w.find(".cp-count").text()).toMatch(/^1 \/ \d+$/);

    const main = w.find(".cp-main");
    expect(main.attributes("aria-label")).toBe("暂停"); // 进入即自动播放
    await main.trigger("click");
    expect(w.find(".cp-main").attributes("aria-label")).toBe("播放");
    await w.find('button[aria-label="收起词句播放"]').trigger("click");
    await flushPromises();
    expect(w.find(".clip-player").exists()).toBe(false);
    expect(w.findAll(".clip-row").length).toBeGreaterThan(0);
  });
});

describe("ListenView · 播放态", () => {
  it("点歌曲行进入播放态：transport 三键 + 模式胶囊（默认列表循环）+ 歌词行", async () => {
    const w = await mountListen();
    await openPlayer(w);
    expect(w.find(".player").exists()).toBe(true);
    expect(w.findAll(".pl-transport button").length).toBeGreaterThanOrEqual(3);
    expect(w.find(".pl-mode-label").text()).toBe("列表循环");
    // 歌词行渲染（Brown Bear Song 的 20 行绘本歌词）
    expect(w.findAll(".pl-line").length).toBeGreaterThan(5);
    expect(w.find(".pl-progress").exists()).toBe(true);
  });
  it("模式单键三档循环：列表循环 → 单曲循环 → 随机 → 列表循环", async () => {
    const w = await mountListen();
    await openPlayer(w);
    const mode = () => w.find(".pl-mode-label").text();
    await w.find(".pl-mode").trigger("click");
    expect(mode()).toBe("单曲循环");
    await w.find(".pl-mode").trigger("click");
    expect(mode()).toBe("随机");
    await w.find(".pl-mode").trigger("click");
    expect(mode()).toBe("列表循环");
  });

  it("主键播放/暂停切换（aria-label 跟随）", async () => {
    const w = await mountListen();
    await openPlayer(w);
    const main = w.find(".pl-main");
    expect(main.attributes("aria-label")).toBe("暂停"); // openLyrics → playing=true
    await main.trigger("click");
    expect(w.find(".pl-main").attributes("aria-label")).toBe("播放");
    await main.trigger("click");
    expect(w.find(".pl-main").attributes("aria-label")).toBe("暂停");
  });

  it("收起（左上圆键）回歌曲列表", async () => {
    const w = await mountListen();
    await openPlayer(w);
    await w.find('button[aria-label="收起歌词"]').trigger("click");
    await flushPromises();
    expect(w.find(".player").exists()).toBe(false);
    expect(w.findAll(".song-row").length).toBeGreaterThan(0);
  });
});
