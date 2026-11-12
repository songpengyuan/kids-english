// @vitest-environment jsdom
/**
 * 底栏中间位（磨耳朵）的回归测试 —— 锁两条铁律：
 *  1. **任何播放状态下，中间的 tab 都必须能导航回 /listen**；
 *  2. **中间位不做播放控制**，播放中只在图标右下角叠声波徽章（状态显示，不是键）。
 *
 * 真实事故（2026-10-17 用户反馈「开始播放后切到其他 tab 就切不回磨耳朵了」）：
 * 中间位曾被写成"有歌就换成一颗播放键"，而那颗键用 @click.stop 盖住了整格
 * 唯一的命中区（52px 图标位约占整格竖直空间的 60%）。于是从学习/我的点中间位，
 * 只会暂停音乐、不导航；磨耳朵全站又只有这一个入口，孩子等于被锁在别的 tab 外。
 *
 * 现行语义（2026-10-17 二次调整，用户要求「只换图标、不用做实质功能」）：
 * 整格永远是入口；图标是自托管的拟物耳机，正在播时右下角叠一颗跳动的声波徽章。
 * 暂停不靠这颗键 —— 磨耳朵列表里当前那首自带 .sr-play，播放页有完整 transport。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import { defineComponent } from "vue";
import BottomNav from "../BottomNav.vue";
import { usePlayerStore } from "../../../stores/player";

const Blank = defineComponent({ template: "<div />" });

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/course", name: "learn", component: Blank },
      { path: "/listen", name: "listen", component: Blank },
      { path: "/me", name: "me", component: Blank },
    ],
  });
}

/** 中间位（第 2 个 tab）——三个 tab 结构完全一致，都是 <button class="bn-tab"> */
function middleTab(w: ReturnType<typeof mount>) {
  return w.findAll(".bn-tab")[1];
}

describe("BottomNav · 中间位永远是入口，图标只表达状态", () => {
  let router: Router;

  beforeEach(async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    router = makeRouter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("没在播：中间位是拟物耳机入口，点和图标都能导航到 /listen", async () => {
    await router.push("/course");
    await router.isReady();

    const w = mount(BottomNav, { global: { plugins: [router] } });
    expect(middleTab(w).find(".bn-img").attributes("src")).toContain("/nav/listen.webp");
    expect(w.find(".bn-eq").exists()).toBe(false);

    // 点的是格子里**看得见的那块图标**：手指不会精确区分图标与空白
    await middleTab(w).find(".bn-zone > *").trigger("click");
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/listen"));
  });

  it("正在播 + 在别的 tab：图标换成声波条，点它只导航、绝不暂停", async () => {
    const player = usePlayerStore();
    player.playSong(0);
    await router.push("/course");
    await router.isReady();

    const w = mount(BottomNav, { global: { plugins: [router] } });
    expect(player.playing).toBe(true);

    // 状态显示：耳机图标保留，右下角叠三根声波徽章（不再是"长着暂停脸的键"）
    expect(w.find(".bn-eq").exists()).toBe(true);
    expect(middleTab(w).find(".bn-img").exists()).toBe(true);
    expect(w.find(".bn-play").exists()).toBe(false);
    expect(middleTab(w).attributes("aria-label")).toBe("磨耳朵（正在播放）");

    await middleTab(w).find(".bn-zone > *").trigger("click");
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/listen"));

    // 关键回归点：旧版这一步会被那颗 @click.stop 的键吃掉 → 只暂停、不导航
    expect(player.playing).toBe(true); // 导航不动播放状态（跨 tab 续播）
  });

  it("悬浮播放小圆钮不复活（2026-11-08 移除：浮在内容上被误触成暂停，", async () => {
    const player = usePlayerStore();
    player.playSong(0);
    await router.push("/course");
    await router.isReady();
    const w = mount(BottomNav, { global: { plugins: [router] } });
    // 暂停职责已由「磨耳朵 tab 直落详情的 transport」+「锁屏 MediaSession」接管
    expect(w.find(".play-chip").exists()).toBe(false);
    expect(player.playing).toBe(true);
  });

  it("站在磨耳朵页 + 正在播：中间位也不做播放控制（点它不会暂停）", async () => {
    const player = usePlayerStore();
    player.playSong(0);
    await router.push("/listen");
    await router.isReady();

    const w = mount(BottomNav, { global: { plugins: [router] } });
    expect(w.find(".bn-eq").exists()).toBe(true);

    await middleTab(w).trigger("click");
    expect(player.playing).toBe(true); // 不是播放键，点了不该有副作用
    expect(router.currentRoute.value.path).toBe("/listen"); // 也不跳走
  });

  it("磨耳朵页没有选曲时：中间位是拟物耳机入口，点击不报错也不跳走", async () => {
    await router.push("/listen");
    await router.isReady();

    const w = mount(BottomNav, { global: { plugins: [router] } });
    expect(middleTab(w).find(".bn-img").exists()).toBe(true);

    await middleTab(w).trigger("click");
    expect(router.currentRoute.value.path).toBe("/listen");
  });

  it("三个 tab 结构一致（都是 <button>，避免 <div role=tab> 与 <button> 混排导致底色/基线不一致）", async () => {
    const player = usePlayerStore();
    player.playSong(0);
    await router.push("/listen");
    await router.isReady();

    const w = mount(BottomNav, { global: { plugins: [router] } });
    for (const tab of w.findAll(".bn-tab")) {
      expect(tab.element.tagName.toLowerCase()).toBe("button");
    }
  });
});
