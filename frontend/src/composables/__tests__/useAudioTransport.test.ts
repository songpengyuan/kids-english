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
    expect(fmtDuration(Infinity)).toBe("0:00");
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

  it("play：成功 → playing=true；被拒（自动播放策略）→ 回落 false", async () => {
    const ok = fakeAudio();
    const t1 = setup(ok);
    t1.play();
    await ok.play.mock.results[0].value; // 等播放承诺落定
    expect(t1.playing.value).toBe(true);

    const bad = fakeAudio();
    bad.play = vi.fn(() => Promise.reject(new Error("autoplay policy")));
    const t2 = setup(bad);
    t2.play();
    await new Promise((r) => setTimeout(r, 0)); // 等 .catch 走完
    expect(t2.playing.value).toBe(false);
  });

  it("pause：暂停音频并立即置 playing=false", () => {
    const audio = fakeAudio();
    const t = setup(audio);
    t.pause();
    expect(audio.pause).toHaveBeenCalled();
    expect(t.playing.value).toBe(false);
  });

  it("handleLoadedMeta：流式音频 duration=Infinity 兜底为 0（进度条不出 NaN%）", () => {
    const audio = fakeAudio();
    audio.duration = Infinity;
    const t = setup(audio);
    t.handleLoadedMeta();
    expect(t.duration.value).toBe(0);
    expect(t.playedPct.value).toBe("0%");
  });

  it("handleTimeUpdate：拖动中不回写 currentTime（不被播放进度打断拖动）", () => {
    const audio = fakeAudio();
    const t = setup(audio);
    t.handleTimeUpdate(); // currentTime=0
    t.seeking.value = true;
    audio.currentTime = 80;
    t.handleTimeUpdate();
    expect(t.currentTime.value).toBe(0); // 拖动中保持拖动值
    t.seeking.value = false;
    t.handleTimeUpdate();
    expect(t.currentTime.value).toBe(80); // 松手后恢复同步
  });

  it("handleEnded：循环模式下 audio 缺失也不崩（onLoopRestart 照常上报）", () => {
    const onLoopRestart = vi.fn();
    const t = setup(null, { onLoopRestart });
    expect(() => t.handleEnded()).not.toThrow();
    expect(onLoopRestart).toHaveBeenCalledTimes(1);
  });
});
