// @vitest-environment jsdom
/**
 * VideoPlayer（磨耳朵视频播放器）行为测试：
 * 控制栏渲染、三档循环切换、ended 按模式推进/重播、关闭事件。
 * jsdom 的 <video> 不真播放，事件用 dispatchEvent 模拟、play 用 spy 观察。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import VideoPlayer from "../VideoPlayer.vue";

const VIDEOS = [
  { id: "a", title: "Song A", titleZh: "歌A", src: "/lessons/l4/a.mp4" },
  { id: "b", title: "Song B", titleZh: "歌B", src: "/lessons/l5/b.mp4" },
];

function mountPlayer(startIndex = 0) {
  return mount(VideoPlayer, {
    props: { videos: VIDEOS, startIndex },
    global: { plugins: [createPinia()] },
  });
}

describe("VideoPlayer 控制栏", () => {
  let playSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("渲染自绘控制栏：transport 全套按钮 + 默认列表循环", () => {
    const w = mountPlayer();
    expect(w.find(".vp-main").exists()).toBe(true);
    expect(w.find(".vp-range").exists()).toBe(true);
    expect(w.findAll(".vp-btn").length).toBeGreaterThanOrEqual(4); // 上一个/下一个/模式/静音/全屏
    expect(w.find(".vp-mode").text()).toContain("列表循环");
    // 不再用原生 controls（电视上又小又不统一）
    expect(w.find("video").attributes("controls")).toBeUndefined();
  });

  it("三档循环单按钮：列表循环 → 单曲循环 → 随机 → 列表循环，且持久化", async () => {
    const w = mountPlayer();
    const btn = w.find(".vp-mode");
    await btn.trigger("click");
    expect(w.find(".vp-mode").text()).toContain("单曲循环");
    await btn.trigger("click");
    expect(w.find(".vp-mode").text()).toContain("随机");
    await btn.trigger("click");
    expect(w.find(".vp-mode").text()).toContain("列表循环");
    // 上次选择被记住（重新挂载读 localStorage）
    await btn.trigger("click"); // 回到单曲循环
    expect(localStorage.getItem("kc-video-mode")).toBe("one");
  });

  it("单曲循环：ended 后重播当前片（回零 + play）", async () => {
    const w = mountPlayer();
    await w.find(".vp-mode").trigger("click"); // → 单曲循环
    const video = w.find("video").element as HTMLVideoElement;
    video.currentTime = 42;
    video.dispatchEvent(new Event("ended"));
    await Promise.resolve();
    expect(video.currentTime).toBe(0);
    expect(playSpy).toHaveBeenCalled();
    // 还是同一个视频（没切到 b）
    expect(w.find("video").attributes("src")).toBe(VIDEOS[0].src);
  });

  it("列表循环：ended 后自动下一个（到尾 wrap 回第一个）", async () => {
    const w = mountPlayer(1); // 从最后一个开始
    const video = w.find("video").element as HTMLVideoElement;
    video.dispatchEvent(new Event("ended"));
    await Promise.resolve();
    await Promise.resolve();
    // wrap 回第一个
    expect(w.find("video").attributes("src")).toBe(VIDEOS[0].src);
  });

  it("关闭按钮 emit close", async () => {
    const w = mountPlayer();
    await w.find(".vp-close").trigger("click");
    expect(w.emitted("close")).toHaveLength(1);
  });
});
