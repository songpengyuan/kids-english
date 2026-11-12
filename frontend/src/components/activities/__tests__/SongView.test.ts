// @vitest-environment jsdom
/**
 * 唱童谣（SongView）——多轨切换与领星门禁：
 *  - 未完整听完一遍：领星按钮禁用（「听完一遍就能领星星」）
 *  - ended 事件（听完/看完）→ 解锁「领到小星星」→ 点击 markSong + emit song-done
 *  - 多轨（l11：Brown Bear Song + Colors Song）：切轨重置 watched、标题/轨道指示联动
 *  - 循环模式下 ended 只记 watched，不自动收尾（循环是"本页唯一出口是领星"的口径）
 *
 * 音频交互全部走 jsdom 事件派发（play/pause 在原型上打桩）。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import SongView from "../SongView.vue";
import { useProgressStore } from "../../../stores/progress";
import { lessons } from "../../../data/lessons";
import { speak, speakText } from "../../../services/speech";

vi.mock("../../../services/effects", () => ({
  bigCelebrate: vi.fn(),
  sfxCorrect: vi.fn(),
  sfxTap: vi.fn(),
}));
vi.mock("../../../services/haptics", () => ({ hapticTap: vi.fn() }));
vi.mock("../../../services/speech", () => ({ speak: vi.fn(), speakText: vi.fn(), stopSpeaking: vi.fn() }));

const l11 = lessons.find((l) => l.id === "l11")!;

/** jsdom 的媒体元素：play/pause 打桩（SongView 内部 transport 会调用） */
beforeEach(() => {
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn(),
  });
});

function mountSong() {
  setActivePinia(createPinia());
  return mount(SongView, { props: { lesson: l11 } });
}

function switchToAudio(w: ReturnType<typeof mountSong>) {
  const audioTab = w.findAll('[role="tablist"] button').find((b) => b.text().includes("音乐"));
  return audioTab ? audioTab.trigger("click") : Promise.resolve();
}

function audioEl(w: ReturnType<typeof mountSong>) {
  return w.find("audio").element as HTMLAudioElement;
}

describe("SongView · 领星门禁", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("挂载：第一轨 Brown Bear Song，未听完领星按钮禁用", async () => {
    const w = mountSong();
    await switchToAudio(w);
    await w.vm.$nextTick();
    expect(w.find(".track-pos").text()).toBe("1 / 2");
    expect(w.find(".audio-title").text()).toContain("Brown Bear Song");
    const finish = w.find(".finish");
    expect(finish.text()).toContain("听完一遍就能领星星");
    expect(finish.attributes("disabled")).toBeDefined();
  });

  it("ended 事件（完整听完）→ 领星解锁；点击 markSong + emit song-done", async () => {
    const w = mountSong();
    await switchToAudio(w);
    await w.vm.$nextTick();
    audioEl(w).dispatchEvent(new Event("ended"));
    await w.vm.$nextTick();
    const finish = w.find(".finish");
    expect(finish.text()).toContain("领到小星星");
    expect(finish.attributes("disabled")).toBeUndefined();
    await finish.trigger("click");
    const progress = useProgressStore();
    expect(progress.progress.l11?.song).toBe(1);
    expect(w.emitted("song-done")).toHaveLength(1);
  });

  it("多轨切换：下一首到 Colors Song，watched 重置（领星重新禁用）；再回第一轨", async () => {
    const w = mountSong();
    await switchToAudio(w);
    await w.vm.$nextTick();
    audioEl(w).dispatchEvent(new Event("ended")); // 第一轨听完
    await w.vm.$nextTick();
    expect(w.find(".finish").text()).toContain("领到小星星");
    // 切下一轨
    await w.find('button[aria-label="下一首"]').trigger("click");
    await w.vm.$nextTick();
    expect(w.find(".track-pos").text()).toBe("2 / 2");
    expect(w.find(".audio-title").text()).toContain("Colors Song");
    expect(w.find(".finish").text()).toContain("听完一遍就能领星星"); // 新轨重新计
    // 回第一轨
    await w.find('button[aria-label="上一首"]').trigger("click");
    await w.vm.$nextTick();
    expect(w.find(".track-pos").text()).toBe("1 / 2");
  });

  it("默认循环模式下 ended 不自动收尾（出口只有领星按钮），但 watched 解锁领星", async () => {
    const w = mountSong();
    await switchToAudio(w);
    await w.vm.$nextTick();
    // 默认 loop 开启：ended → onLoopRestart（回到开头继续唱），不 finishSong
    audioEl(w).dispatchEvent(new Event("ended"));
    await w.vm.$nextTick();
    expect(w.emitted("song-done")).toBeUndefined();
    expect(w.find(".finish").text()).toContain("领到小星星");
    // 关循环后再 ended → 才会自动收尾
    await w.find(".loop-btn").trigger("click");
    audioEl(w).dispatchEvent(new Event("ended"));
    await w.vm.$nextTick();
    expect(w.emitted("song-done")).toHaveLength(1);
  });
});

describe("SongView · 点读（P3 一切可点即发声）", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.mocked(speak).mockClear();
    vi.mocked(speakText).mockClear();
  });

  it("点歌词行 = 把这一句读出来（整句走 TTS，不误配单词音频）", async () => {
    const w = mountSong();
    await switchToAudio(w);
    await w.vm.$nextTick();
    const idx = l11.song.lyrics.findIndex((l) => !!l);
    const target = l11.song.lyrics[idx];
    await w.findAll(".line")[idx].trigger("click");
    expect(speakText).toHaveBeenCalledWith(target, { rate: 0.8, lang: "en-US" });
  });

  it("点词条胶囊 = 读这个单词（带课时上下文命中预生成音频）", async () => {
    const w = mountSong(); // 默认舞台模式才渲染词条条
    const word = l11.words[0];
    const chip = w.findAll(".chip").find((c) => c.text().includes(word.en));
    expect(chip).toBeTruthy();
    await chip!.trigger("click");
    expect(speak).toHaveBeenCalledWith(word.en, {
      lessonId: word.lessonId,
      wordId: word.id,
      rate: 0.85,
    });
  });
});
