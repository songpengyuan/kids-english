// @vitest-environment jsdom
/**
 * VideoPlayer（通用视频播放器）行为测试。
 * 核心契约（2026-11-12 交互重做；11-13 补缓冲/失败兜底与收编位）：
 * - 待播态只有封面 + 播放键，**不渲染进度条/控制栏**；
 * - 开播后控制条**常驻**（含进度条）——不自动淡出，孩子永远找得到"停一下"；
 * - 点画面 = 暂停/继续（孩子最直观的停一下）；
 * - 缓冲给转圈（waiting 驱动）、加载失败给大重试键（不黑屏装死）；
 * - 三档循环键多片时**常显**（不再只在全屏出现——隐藏的随机不该悄悄改顺序）；
 * - ended 在循环继续之前 emit；listen=false 不计磨耳朵时长；cover 覆盖位挂了回退 emoji。
 * jsdom 的 <video> 不真播放：事件用 dispatchEvent 模拟，play/pause 用 spy 观察。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import VideoPlayer from "../VideoPlayer.vue";
import { useProgressStore } from "../../../stores/progress";

const VIDEOS = [
  { id: "a", title: "Song A", titleZh: "歌A", src: "/lessons/l4/a.mp4", emoji: "🐻", tone: "orange" },
  { id: "b", title: "Song B", titleZh: "歌B", src: "/lessons/l5/b.mp4", emoji: "🎺", tone: "gold" },
];

function mountPlayer(startIndex = 0) {
  return mount(VideoPlayer, {
    props: { videos: VIDEOS, startIndex },
    global: { plugins: [createPinia()] },
    attachTo: document.body,
  });
}

function videoOf(w: ReturnType<typeof mountPlayer>) {
  return w.find("video").element as HTMLVideoElement;
}

/** 模拟真实播放：paused 置 false 再派发 play 事件 */
function fakePlaying(v: HTMLVideoElement) {
  Object.defineProperty(v, "paused", { value: false, configurable: true });
  v.dispatchEvent(new Event("play"));
}

function modeBtnOf(w: ReturnType<typeof mountPlayer>) {
  return w.findAll(".vp-tool").find((b) => (b.attributes("aria-label") ?? "").includes("播放模式"));
}

describe("VideoPlayer", () => {
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("待播态只有封面 + 播放键：不渲染进度条，也不渲染控制栏", () => {
    const w = mountPlayer();
    expect(w.find(".vp-cover").exists()).toBe(true);
    expect(w.find(".vp-cover__play").exists()).toBe(true);
    // 用户原话：没播的时候不该显示进度条
    expect(w.find(".vp-range").exists()).toBe(false);
    expect(w.find(".vp-ui").exists()).toBe(false);
    expect(w.find(".vp-main").exists()).toBe(false);
    // 仍不用原生 controls（电视上又小又不统一）
    expect(w.find("video").attributes("controls")).toBeUndefined();
    // 不自播：待播态必须真实存在
    expect(w.find("video").attributes("autoplay")).toBeUndefined();
  });

  it("开播前用课程封面盖住旧片头首帧，开播后撤掉并给出控制条", async () => {
    const w = mountPlayer();
    expect(w.find(".vp-cover__img").attributes("src")).toContain("/covers/1f43b.webp");
    // 原生 poster 也不能再是机构片头 /lessons/*.jpg
    expect(w.find("video").attributes("poster")).toContain("/covers/1f43b.webp");

    fakePlaying(videoOf(w));
    await w.vm.$nextTick();

    expect(w.find(".vp-cover").exists()).toBe(false);
    expect(w.find(".vp-ui").exists()).toBe(true);
    expect(w.find(".vp-range").exists()).toBe(true);
    // 控制条上的按钮都在触控标准之上
    const main = w.find(".vp-main").element as HTMLElement;
    expect(main.className).toContain("round");
  });

  it("点封面播放键就开播（不需要再找控制条）", async () => {
    const w = mountPlayer();
    await w.find(".vp-cover").trigger("click");
    expect(playSpy).toHaveBeenCalled();
  });

  it("点画面 = 暂停/继续；控制条开播后常驻（孩子不会找不到停一下的键）", async () => {
    vi.useFakeTimers();
    const w = mountPlayer();
    fakePlaying(videoOf(w));
    await w.vm.$nextTick();
    expect(w.find(".vp-ui").exists()).toBe(true);

    // 时间过去也不会把控制条藏起来（旧版是浮层自动淡出，孩子点不到）
    vi.advanceTimersByTime(5000);
    await w.vm.$nextTick();
    expect(w.find(".vp-ui").exists()).toBe(true);

    // 播放中（paused=false）点画面 = 暂停
    await w.find("video").trigger("click");
    expect(pauseSpy).toHaveBeenCalled();
    const v = videoOf(w);
    Object.defineProperty(v, "paused", { value: true, configurable: true });
    v.dispatchEvent(new Event("pause"));
    await w.vm.$nextTick();
    // 暂停后点画面 = 接着播
    await w.find("video").trigger("click");
    expect(playSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("三档循环单按钮常显（不再只在全屏出现）：列表循环 → 单曲循环 → 随机 → 列表循环，且持久化", async () => {
    const w = mountPlayer();
    fakePlaying(videoOf(w));
    await w.vm.$nextTick();
    let btn = modeBtnOf(w)!;
    expect(btn).toBeTruthy();
    expect(btn.attributes("aria-label")).toContain("列表循环");
    await btn.trigger("click");
    btn = modeBtnOf(w)!;
    expect(btn.attributes("aria-label")).toContain("单曲循环");
    await btn.trigger("click");
    expect(modeBtnOf(w)!.attributes("aria-label")).toContain("随机");
    await btn.trigger("click");
    expect(modeBtnOf(w)!.attributes("aria-label")).toContain("列表循环");
    // 上次选择被记住（localStorage 持久化）
    await btn.trigger("click"); // 回到单曲循环
    expect(localStorage.getItem("kc-video-mode")).toBe("one");
  });

  it("单条视频不渲染循环键（没得切的模式键就是噪音）", async () => {
    const w = mount(VideoPlayer, {
      props: { videos: [VIDEOS[0]], startIndex: 0 },
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    fakePlaying(videoOf(w));
    await w.vm.$nextTick();
    expect(modeBtnOf(w)).toBeUndefined();
    // 上一个/下一个同样收掉
    expect(w.find('button[aria-label="上一个视频"]').exists()).toBe(false);
    expect(w.find('button[aria-label="下一个视频"]').exists()).toBe(false);
  });

  it("缓冲中给转圈（waiting 事件驱动），canplay 后收掉", async () => {
    const w = mountPlayer();
    fakePlaying(videoOf(w));
    await w.vm.$nextTick();
    expect(w.find(".vp-busy").exists()).toBe(false);
    videoOf(w).dispatchEvent(new Event("waiting"));
    await w.vm.$nextTick();
    expect(w.find(".vp-busy").exists()).toBe(true);
    videoOf(w).dispatchEvent(new Event("canplay"));
    await w.vm.$nextTick();
    expect(w.find(".vp-busy").exists()).toBe(false);
  });

  it("加载失败给『再试一次』大覆盖层：点击重试（load+play）并 emit error", async () => {
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    const w = mountPlayer();
    videoOf(w).dispatchEvent(new Event("error"));
    await w.vm.$nextTick();
    expect(w.find(".vp-error").exists()).toBe(true);
    expect(w.emitted("error")).toHaveLength(1);
    // 失败态连待播封面也撤掉：一屏只有一个可点的大目标
    expect(w.find(".vp-cover").exists()).toBe(false);
    await w.find(".vp-error").trigger("click");
    expect(loadSpy).toHaveBeenCalled();
    expect(playSpy).toHaveBeenCalled();
    expect(w.find(".vp-error").exists()).toBe(false);
  });

  it("ended 在循环继续之前 emit（单视频自动重播，消费方也拿得到『播完』）", async () => {
    const w = mount(VideoPlayer, {
      props: { videos: [VIDEOS[0]], startIndex: 0 },
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    fakePlaying(videoOf(w));
    await w.vm.$nextTick();
    const video = videoOf(w);
    video.currentTime = 10;
    video.dispatchEvent(new Event("ended"));
    await Promise.resolve();
    expect(w.emitted("ended")).toHaveLength(1);
    // 同时循环也继续了：回零 + 重播
    expect(video.currentTime).toBe(0);
    expect(playSpy).toHaveBeenCalled();
  });

  it("listen=false 不计磨耳朵时长（唱歌页有自己的领星闭环），默认照常计入", async () => {
    // 播放段结算用墙钟（Date.now），vitest 假计时器不覆盖它——直接钉住时钟最稳
    const pinia = createPinia();
    const progress = useProgressStore(pinia);
    const addSpy = vi.spyOn(progress, "addListenActivity").mockImplementation(() => {});
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);

    const silent = mount(VideoPlayer, {
      props: { videos: [VIDEOS[0]], listen: false },
      global: { plugins: [pinia] },
      attachTo: document.body,
    });
    fakePlaying(videoOf(silent));
    dateSpy.mockReturnValue(3_000);
    videoOf(silent).dispatchEvent(new Event("pause"));
    await Promise.resolve();
    expect(addSpy).not.toHaveBeenCalled();

    const counted = mount(VideoPlayer, {
      props: { videos: [VIDEOS[0]] },
      global: { plugins: [pinia] },
      attachTo: document.body,
    });
    fakePlaying(videoOf(counted));
    dateSpy.mockReturnValue(5_000);
    videoOf(counted).dispatchEvent(new Event("pause"));
    await Promise.resolve();
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy.mock.calls[0][0]).toBeGreaterThan(1);
  });

  it("VideoItem.cover 覆盖位：封面/原生 poster 用指定图，图挂了回退 emoji 大字", async () => {
    const WITH_COVER = [{ ...VIDEOS[0], cover: "/lessons/l4/song.jpg" }];
    const w = mount(VideoPlayer, {
      props: { videos: WITH_COVER },
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    expect(w.find(".vp-cover__img").attributes("src")).toBe("/lessons/l4/song.jpg");
    expect(w.find("video").attributes("poster")).toBe("/lessons/l4/song.jpg");
    await w.find(".vp-cover__img").trigger("error");
    await w.vm.$nextTick();
    expect(w.find(".vp-cover__img").exists()).toBe(false);
    expect(w.find(".vp-cover__art").text()).toContain("🐻");
  });

  it("单曲循环：ended 后重播当前片（回零 + play）", async () => {
    localStorage.setItem("kc-video-mode", "one"); // 家长选过的模式会被记住
    const w = mountPlayer();
    fakePlaying(videoOf(w));
    await w.vm.$nextTick();
    const video = videoOf(w);
    video.currentTime = 42;
    video.dispatchEvent(new Event("ended"));
    await Promise.resolve();
    expect(video.currentTime).toBe(0);
    expect(playSpy).toHaveBeenCalled();
    // 还是同一个视频（没切到 b）
    expect(w.find("video").attributes("src")).toBe(VIDEOS[0].src);
  });

  it("列表循环：ended 后自动下一个（到尾 wrap 回第一个），并且换片回到待播封面后自动续播", async () => {
    const w = mountPlayer(1); // 从最后一个开始
    fakePlaying(videoOf(w));
    await w.vm.$nextTick();
    videoOf(w).dispatchEvent(new Event("ended"));
    await Promise.resolve();
    await Promise.resolve();
    // wrap 回第一个
    expect(w.find("video").attributes("src")).toBe(VIDEOS[0].src);
    // 换片自动续播（旧版行为不变）
    expect(playSpy).toHaveBeenCalled();
  });

  it("只有一条视频时播完自动重播（不然停在最后一帧像卡住）", async () => {
    const w = mount(VideoPlayer, {
      props: { videos: [VIDEOS[0]], startIndex: 0 },
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    fakePlaying(videoOf(w));
    await w.vm.$nextTick();
    const video = videoOf(w);
    video.currentTime = 30;
    video.dispatchEvent(new Event("ended"));
    await Promise.resolve();
    expect(video.currentTime).toBe(0);
    expect(playSpy).toHaveBeenCalled();
  });

  it("关闭按钮 emit close", async () => {
    const w = mountPlayer();
    await w.find(".vp-close").trigger("click");
    expect(w.emitted("close")).toHaveLength(1);
  });
});
