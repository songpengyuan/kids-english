// @vitest-environment jsdom
/**
 * 底栏中间位（磨耳朵）的回归测试 —— 锁一条铁律：
 * **任何播放状态下，中间的 tab 都必须能导航回 /listen。**
 *
 * 真实事故（2026-10-17 用户反馈「开始播放后切到其他 tab 就切不回磨耳朵了」）：
 * 中间位曾被写成"有歌就换成一颗播放键"，而那颗键用 @click.stop 盖住了整格
 * 唯一的命中区（52px 图标位约占整格竖直空间的 60%）。于是从学习/我的点中间位，
 * 只会暂停音乐、不导航；磨耳朵全站又只有这一个入口，孩子等于被锁在别的 tab 外。
 *
 * 现在的语义（位置决定）：站在别的 tab = 入口；站在磨耳朵页 = 播放/暂停键。
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

/** 中间位（第 2 个 tab）——三个 tab 的结构现在完全一致，都是 <button class="bn-tab"> */
function middleTab(w: ReturnType<typeof mount>) {
  return w.findAll(".bn-tab")[1];
}

describe("BottomNav · 中间位必须永远可导航", () => {
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

  it("有歌在播 + 在别的 tab：中间位是入口，点它（含点图标）回到 /listen", async () => {
    const player = usePlayerStore();
    player.playSong(0); // 有歌在播
    await router.push("/course");
    await router.isReady();

    const w = mount(BottomNav, { global: { plugins: [router] } });
    expect(player.playing).toBe(true);

    // 有歌在播，但这里不是磨耳朵页 → 渲染 🎧 入口，而不是播放键
    // （旧版在这一步就输了：它把整格换成了 .bn-play，命中区被那颗键吃掉）
    expect(w.find(".bn-play").exists()).toBe(false);
    expect(middleTab(w).find(".bn-ico").text()).toBe("🎧");

    // 关键：点的是格子里**看得见的那块图标**，手指不会精确区分图标与空白。
    // 旧版这里是一颗 @click.stop 的 <button>，点了只暂停、不导航。
    await middleTab(w).find(".bn-zone > *").trigger("click");
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/listen"));

    // 导航不动播放状态（跨 tab 续播）
    expect(player.playing).toBe(true);
  });

  it("站在磨耳朵页 + 有歌在播：中间位是播放/暂停键，且不导航", async () => {
    const player = usePlayerStore();
    player.playSong(0);
    await router.push("/listen");
    await router.isReady();

    const w = mount(BottomNav, { global: { plugins: [router] } });
    expect(w.find(".bn-play").exists()).toBe(true);
    expect(middleTab(w).attributes("aria-label")).toBe("暂停");

    await middleTab(w).trigger("click");
    expect(player.playing).toBe(false); // 真的暂停了
    expect(middleTab(w).attributes("aria-label")).toBe("播放");
    expect(router.currentRoute.value.path).toBe("/listen"); // 没有跳走

    await middleTab(w).trigger("click");
    expect(player.playing).toBe(true); // 再点恢复
  });

  it("磨耳朵页没有选曲时：中间位仍是入口，点击不报错也不跳走", async () => {
    await router.push("/listen");
    await router.isReady();

    const w = mount(BottomNav, { global: { plugins: [router] } });
    expect(w.find(".bn-play").exists()).toBe(false);

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
