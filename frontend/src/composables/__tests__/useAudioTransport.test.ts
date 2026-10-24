// @vitest-environment jsdom
/**
 * 音频 transport（composable）行为测试：
 * 循环偏好持久化（含无痕模式兜底）、播完回调、循环重启、进度格式化。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { useAudioTransport, fmtDuration } from "../useAudioTransport";

/** 假 <audio> 元素：只实现 transport 读写的成员 */
function fakeAudio() {
  return {
    currentTime: 0,
    duration: 120,
    buffered: { length: 1, end: () => 60 },
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
  };
}

function setup(audio: any, opts = {}) {
  const audioEl = ref(audio);
  const seekEl = ref(null);
  const t = useAudioTransport(audioEl, seekEl, opts);
  return t;
}

describe("fmtDuration", () => {
  it("秒 → m:ss，非法值回 0:00", () => {
    expect(fmtDuration(0)).toBe("0:00");
    expect(fmtDuration(65)).toBe("1:05");
    expect(fmtDuration(600)).toBe("10:00");
    expect(fmtDuration(NaN)).toBe("0:00");
    expect(fmtDuration(-3)).toBe("0:00");
  });
});

describe("useAudioTransport", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("默认开循环（未手动关过时），偏好持久化到 localStorage", () => {
    const t = setup(fakeAudio());
    expect(t.loop.value).toBe(true);
    t.toggleLoop();
    expect(t.loop.value).toBe(false);
    expect(localStorage.getItem("kids-english-song-loop")).toBe("0");
  });

  it("localStorage 存了 0 → 循环关闭；localStorage 不可用时回退 sessionStorage", () => {
    localStorage.setItem("kids-english-song-loop", "0");
    expect(setup(fakeAudio()).loop.value).toBe(false);
    localStorage.setItem = () => {
      throw new Error("无痕模式");
    };
    const t = setup(fakeAudio());
    t.toggleLoop();
    // localStorage 写入被拒：本次内存里已翻转，sessionStorage 兜底保持本会话选择
    expect(sessionStorage.getItem("kids-english-song-loop-session")).toBe("1");
  });

  it("handleEnded：循环模式重启（回调 onLoopRestart 不回调 onEnded），非循环回调 onEnded", () => {
    const onEnded = vi.fn();
    const onLoopRestart = vi.fn();
    const audio = fakeAudio();
    const t = setup(audio, { onEnded, onLoopRestart });

    audio.currentTime = 100;
    t.handleEnded();
    expect(onLoopRestart).toHaveBeenCalledTimes(1);
    expect(onEnded).not.toHaveBeenCalled();
    expect(audio.currentTime).toBe(0); // 回到开头
    expect(audio.play).toHaveBeenCalled();

    t.toggleLoop(); // 关循环
    t.handleEnded();
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledTimes(1); // 没有再自动播
  });

  it("handleTimeUpdate：同步时长/缓冲/当前进度", () => {
    const audio = fakeAudio();
    const t = setup(audio);
    t.handleTimeUpdate();
    expect(t.duration.value).toBe(120);
    expect(t.buffered.value).toBe(60);
    audio.currentTime = 33;
    t.handleTimeUpdate();
    expect(t.currentTime.value).toBe(33);
    expect(t.playedPct.value).toBe("27.5%"); // 33/120
  });

  it("handleError：停播并上报素材缺失", () => {
    const onMissing = vi.fn();
    const t = setup(fakeAudio(), { onMissing });
    t.handleError();
    expect(onMissing).toHaveBeenCalledTimes(1);
  });

  it("reset：停播 + 进度清零（换素材用），循环偏好保留", () => {
    const audio = fakeAudio();
    const t = setup(audio);
    t.handleTimeUpdate();
    t.reset();
    expect(audio.pause).toHaveBeenCalled();
    expect(t.duration.value).toBe(0);
    expect(t.currentTime.value).toBe(0);
    expect(t.loop.value).toBe(true);
  });
});
