/**
 * useSpeechSession 录音会话测试。
 * 关键行为：record 模式停止录音后，自动回放一次自己的发音（家长判定前先听一遍）。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useSpeechSession } from "../useSpeechSession";
import type { Word } from "../../data/lessons";

vi.mock("../../utils/speechScore", () => ({
  asrSupported: () => false, // 强制 record 模式
  recorderSupported: () => true,
  createRecorder: vi.fn(),
  createWordRecognizer: vi.fn(),
  gradeScore: vi.fn(),
  scorePronunciation: vi.fn(),
}));
vi.mock("../../services/speech", () => ({ speak: vi.fn() }));
vi.mock("../../utils/speakSession", () => ({ speakStars: () => 3 }));

import { createRecorder } from "../../utils/speechScore";

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
