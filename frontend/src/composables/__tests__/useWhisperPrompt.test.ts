// @vitest-environment jsdom
/**
 * cards 点读卡「轻跟读」逻辑层（useWhisperPrompt）行为：
 * - 可选增强、鼓励向：播示范 → 孩子跟说 → 正向/温和反馈后自动回空闲；不阻塞点读与完成键
 * - ASR 不可用（iOS Safari / 桌面 Safari / 无 SR）时整体隐藏，cards 流程零变化
 * - 计数口径与 useSpeechSession 的 onSpeakAttempt 一致：正常结果（含 retry）计一次；
 *   no-speech / network / 权限拒绝不计；计数副作用通过 onAttempt 注入，逻辑层不碰 store
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";

vi.mock("../../services/speech", () => ({
  speak: vi.fn(),
  stopSpeaking: vi.fn(),
}));
vi.mock("../../utils/speechScore", () => ({
  asrSupported: vi.fn(() => true),
  createWordRecognizer: vi.fn(),
  scorePronunciation: vi.fn(),
  gradeScore: vi.fn(),
}));

import { useWhisperPrompt } from "../useWhisperPrompt";
import { speak, stopSpeaking } from "../../services/speech";
import {
  asrSupported,
  createWordRecognizer,
  scorePronunciation,
  gradeScore,
} from "../../utils/speechScore";

const words = [
  { id: "cat", en: "cat", zh: "猫", emoji: "🐱", image: null, lessonId: "l1" },
  { id: "dog", en: "dog", zh: "狗", emoji: "🐶", image: null, lessonId: "l1" },
] as never;

function makeRecognizer() {
  let cb: ((err: string | null, alts: string[]) => void) | null = null;
  const stub = {
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
    onFinish: vi.fn((f: typeof cb) => { cb = f; }),
  };
  return { stub, getCb: () => cb! };
}

/** 等完「播示范 → 延迟开麦」的定时窗口（DEMO_GAP_MS） */
async function advanceDemo() {
  await vi.advanceTimersByTimeAsync(650);
}
/** 等完鼓励语停留（PRAISE_MS），回到 idle */
async function advancePraise() {
  await vi.advanceTimersByTimeAsync(1500);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.mocked(asrSupported).mockReturnValue(true);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useWhisperPrompt · cards 轻跟读", () => {
  it("ASR 不可用时整体隐藏，且不创建识别器、不发声", () => {
    vi.mocked(asrSupported).mockReturnValue(false);
    const onAttempt = vi.fn();
    const s = useWhisperPrompt(ref(words), { onAttempt });
    expect(s.visible.value).toBe(false);
    s.toggle();
    expect(createWordRecognizer).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
    expect(onAttempt).not.toHaveBeenCalled();
  });

  it("正常跟说 perfect/good → 计 1 次开口，鼓励 good 反馈，停留后自动回 idle", async () => {
    const { stub, getCb } = makeRecognizer();
    vi.mocked(createWordRecognizer).mockReturnValue(stub as never);
    vi.mocked(scorePronunciation).mockReturnValue({ score: 0.95, heard: "cat" });
    vi.mocked(gradeScore).mockReturnValue("perfect");
    const onAttempt = vi.fn();
    const s = useWhisperPrompt(ref(words), { onAttempt });

    expect(s.visible.value).toBe(true);
    s.toggle(); // 启动：先停 TTS、播示范
    expect(stopSpeaking).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith("cat", { lessonId: "l1", wordId: "cat" });
    expect(stub.start).not.toHaveBeenCalled(); // 示范阶段先不开麦，避免录进 TTS

    await advanceDemo();
    expect(stub.start).toHaveBeenCalledTimes(1);

    getCb()(null, ["cat"]);
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(s.phase.value).toBe("praise");
    expect(s.praiseKind.value).toBe("good");

    await advancePraise();
    expect(s.phase.value).toBe("idle");
    expect(s.praiseKind.value).toBeNull();
  });

  it("retry（没读准）仍计 1 次开口尝试，给温和 soft 反馈但不判错、不卡关", async () => {
    const { stub, getCb } = makeRecognizer();
    vi.mocked(createWordRecognizer).mockReturnValue(stub as never);
    vi.mocked(scorePronunciation).mockReturnValue({ score: 0.4, heard: "cot" });
    vi.mocked(gradeScore).mockReturnValue("retry");
    const onAttempt = vi.fn();
    const s = useWhisperPrompt(ref(words), { onAttempt });

    s.toggle();
    await advanceDemo();
    getCb()(null, ["cot"]);
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(s.praiseKind.value).toBe("soft");
  });

  it("no-speech（没出声）不计开口，仅温和提示", async () => {
    const { stub, getCb } = makeRecognizer();
    vi.mocked(createWordRecognizer).mockReturnValue(stub as never);
    const onAttempt = vi.fn();
    const s = useWhisperPrompt(ref(words), { onAttempt });

    s.toggle();
    await advanceDemo();
    getCb()("no-speech", []);
    expect(onAttempt).not.toHaveBeenCalled();
    expect(s.praiseKind.value).toBe("soft");
  });

  it("network / 权限拒绝 → 隐藏入口，且不计开口", async () => {
    for (const err of ["network", "not-allowed"] as const) {
      const { stub, getCb } = makeRecognizer();
      vi.mocked(createWordRecognizer).mockReturnValue(stub as never);
      const onAttempt = vi.fn();
      const s = useWhisperPrompt(ref(words), { onAttempt });
      s.toggle();
      await advanceDemo();
      getCb()(err, []);
      expect(onAttempt).not.toHaveBeenCalled();
      expect(s.visible.value).toBe(false);
    }
  });

  it("连续跟读优先挑未跟过的词；全部跟过后回绕第一个", async () => {
    const { stub, getCb } = makeRecognizer();
    vi.mocked(createWordRecognizer).mockReturnValue(stub as never);
    vi.mocked(scorePronunciation).mockReturnValue({ score: 0.95, heard: "cat" });
    vi.mocked(gradeScore).mockReturnValue("perfect");
    const s = useWhisperPrompt(ref(words), {});

    // 第一轮 cat
    s.toggle();
    await advanceDemo();
    getCb()(null, ["cat"]);
    await advancePraise();

    // 第二轮应轮到未跟过的 dog
    s.toggle();
    expect(speak).toHaveBeenCalledWith("dog", { lessonId: "l1", wordId: "dog" });
  });

  it("listening 中 cleanup → abort 识别器；迟到回调被资格校验丢弃", async () => {
    const { stub, getCb } = makeRecognizer();
    vi.mocked(createWordRecognizer).mockReturnValue(stub as never);
    vi.mocked(scorePronunciation).mockReturnValue({ score: 0.95, heard: "cat" });
    vi.mocked(gradeScore).mockReturnValue("perfect");
    const onAttempt = vi.fn();
    const s = useWhisperPrompt(ref(words), { onAttempt });
    s.toggle();
    await advanceDemo();
    s.cleanup();
    expect(stub.abort).toHaveBeenCalledTimes(1);
    // 迟到的旧结果：不计数
    getCb()(null, ["cat"]);
    expect(onAttempt).not.toHaveBeenCalled();
  });
});
