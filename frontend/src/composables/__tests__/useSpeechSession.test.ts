/**
 * useSpeechSession 录音会话测试。
 * 关键行为：record 模式停止录音后，自动回放一次自己的发音（家长判定前先听一遍）。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useSpeechSession } from "../useSpeechSession";
import type { Word } from "../../data/lessons";

vi.mock("../../utils/speechScore", () => ({
  asrSupported: vi.fn(() => false), // 强制 record 模式（新 describe 内可切 true 测 ASR 分支）
  recorderSupported: () => true,
  createRecorder: vi.fn(),
  createWordRecognizer: vi.fn(),
  gradeScore: vi.fn(),
  scorePronunciation: vi.fn(),
}));
vi.mock("../../services/speech", () => ({ speak: vi.fn() }));
vi.mock("../../utils/speakSession", () => ({ speakStars: () => 3 }));

import { createRecorder, createWordRecognizer, asrSupported, scorePronunciation, gradeScore } from "../../utils/speechScore";

const word: Word = {
  id: "w1",
  en: "foot",
  zh: "脚",
  emoji: "🦶",
  lessonId: "l1",
};

/** 等所有 microtask（Promise.then / nextTick）落定 */
function flush() {
  return new Promise((r) => setTimeout(r, 0));
}

describe("useSpeechSession · 录音自动回放", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("record 模式：停止录音后自动回放一次，并进入反馈态", async () => {
    const stop = vi.fn().mockResolvedValue("blob:rec-url");
    const recorderMock = {
      start: vi.fn().mockResolvedValue(undefined),
      stop,
      release: vi.fn(),
    };
    vi.mocked(createRecorder).mockReturnValue(recorderMock as never);

    const play = vi.fn().mockResolvedValue(undefined);
    const fakeAudio = { currentTime: 0, play } as unknown as HTMLAudioElement;

    const session = useSpeechSession(ref([word]));
    session.recAudio.value = fakeAudio;

    session.startMic(); // record 模式 → startRecord
    await flush(); // recorder.start() 落定
    expect(session.status.value).toBe("listening");

    session.stopMic(); // 停止录音 → stopRecord
    await flush(); // recorder.stop().then 落定 + nextTick 自动播放

    expect(stop).toHaveBeenCalledTimes(1);
    expect(session.recUrl.value).toBe("blob:rec-url");
    expect(session.status.value).toBe("feedback");
    expect(play).toHaveBeenCalledTimes(1); // 自动回放一次
    expect(fakeAudio.currentTime).toBe(0);
  });

  it("录音无结果（url 为空）时不进入反馈、不自动播放", async () => {
    const stop = vi.fn().mockResolvedValue(null);
    const recorderMock = {
      start: vi.fn().mockResolvedValue(undefined),
      stop,
      release: vi.fn(),
    };
    vi.mocked(createRecorder).mockReturnValue(recorderMock as never);

    const play = vi.fn().mockResolvedValue(undefined);
    const fakeAudio = { currentTime: 0, play } as unknown as HTMLAudioElement;

    const session = useSpeechSession(ref([word]));
    session.recAudio.value = fakeAudio;

    session.startMic();
    await flush();
    session.stopMic();
    await flush();

    expect(session.status.value).toBe("listening");
    expect(session.recUrl.value).toBe("");
    expect(play).not.toHaveBeenCalled();
  });

  it("手动回放 replayRec 从头播放录音", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const fakeAudio = { currentTime: 5, play } as unknown as HTMLAudioElement;

    const session = useSpeechSession(ref([word]));
    session.recAudio.value = fakeAudio;
    session.replayRec();

    expect(fakeAudio.currentTime).toBe(0);
    expect(play).toHaveBeenCalledTimes(1);
  });
});

describe("useSpeechSession · onSpeakAttempt 开口旁路计数（鼓励向，不影响星级）", () => {
  let finishCb: ((err: string | null, alt: string[]) => void) | null = null;
  const recognizerStub = {
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
    onFinish: vi.fn((cb: (err: string | null, alt: string[]) => void) => {
      finishCb = cb;
    }),
  };
  function flush() {
    return new Promise((r) => setTimeout(r, 0));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    finishCb = null;
    vi.mocked(asrSupported).mockReturnValue(true);
    vi.mocked(createWordRecognizer).mockReturnValue(recognizerStub as never);
    vi.mocked(scorePronunciation).mockReturnValue({ score: 0.9, heard: "foot" });
    vi.mocked(gradeScore).mockReturnValue("perfect");
  });

  it("ASR 正常识别 perfect 计 1 次开口", async () => {
    const onSpeakAttempt = vi.fn();
    const s = useSpeechSession(ref([word]), { onSpeakAttempt });
    s.startMic();
    await flush();
    finishCb!(null, ["foot"]);
    await flush();
    expect(onSpeakAttempt).toHaveBeenCalledTimes(1);
  });

  it("ASR retry（发音没说准）仍计 1 次开口尝试：鼓励多说，不计入惩罚、不重复判定", async () => {
    vi.mocked(gradeScore).mockReturnValue("retry");
    const onSpeakAttempt = vi.fn();
    const s = useSpeechSession(ref([word]), { onSpeakAttempt });
    s.startMic();
    await flush();
    finishCb!(null, ["fot"]);
    await flush();
    expect(onSpeakAttempt).toHaveBeenCalledTimes(1);
  });

  it("no-speech（没出声）、network、权限拒绝都不计开口", async () => {
    const onSpeakAttempt = vi.fn();
    const s = useSpeechSession(ref([word]), { onSpeakAttempt });
    s.startMic();
    await flush();
    finishCb!("no-speech", []);
    await flush();
    finishCb!("network", []);
    await flush();
    finishCb!("not-allowed", []);
    await flush();
    expect(onSpeakAttempt).not.toHaveBeenCalled();
  });

  it("record 拿到非空录音计 1 次；家长判定不重复计", async () => {
    const onSpeakAttempt = vi.fn();
    vi.mocked(createRecorder).mockReturnValue({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue("blob:rec-url"),
      release: vi.fn(),
    } as never);
    const s = useSpeechSession(ref([word]), { onSpeakAttempt });
    s.mode.value = "record";
    const play = vi.fn().mockResolvedValue(undefined);
    s.recAudio.value = { currentTime: 0, play } as unknown as HTMLAudioElement;

    s.startMic();
    await flush();
    s.stopMic();
    await flush();
    expect(onSpeakAttempt).toHaveBeenCalledTimes(1);
    s.parentJudge(true); // 二次确认，不重复计数
    expect(onSpeakAttempt).toHaveBeenCalledTimes(1);
  });

  it("record 空录音（无 url）不计开口", async () => {
    const onSpeakAttempt = vi.fn();
    vi.mocked(createRecorder).mockReturnValue({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(null),
      release: vi.fn(),
    } as never);
    const s = useSpeechSession(ref([word]), { onSpeakAttempt });
    s.mode.value = "record";
    s.startMic();
    await flush();
    s.stopMic();
    await flush();
    expect(onSpeakAttempt).not.toHaveBeenCalled();
  });
});
