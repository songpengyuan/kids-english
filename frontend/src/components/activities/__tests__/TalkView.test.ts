// @vitest-environment jsdom
/**
 * 亲子对话（TalkView）逐轮对话行为：
 * - 渲染轮次/家长问句/当前大图/录音按钮；进页自动播问句
 * - 录音 → 家长判定通过 → 自动进入下一轮（大图切换 + 再播问句）
 * - 判定「没读准」→ 可再试，轮次不变
 * - 全部单词对话完 → 完成按钮可用，emit done(星级)
 */
import { describe, expect, it, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("../../../services/speech", () => ({ speak: vi.fn() }));
vi.mock("../../../services/effects", () => ({
  sfxCorrect: vi.fn(),
  sfxWrong: vi.fn(),
  bigCelebrate: vi.fn(),
}));
vi.mock("../../../services/haptics", () => ({ hapticTap: vi.fn() }));
// dialog 录音会话走 useSpeechSession：jsdom 无 SpeechRecognition/MediaRecorder，
// 强制 record 模式并用桩 MediaRecorder（家长判定链路）
vi.mock("../../../utils/speechScore", () => ({
  asrSupported: () => false,
  recorderSupported: () => true,
  createRecorder: vi.fn(),
  createWordRecognizer: vi.fn(),
  gradeScore: vi.fn(),
  scorePronunciation: vi.fn(),
}));
vi.mock("../../../utils/speakSession", () => ({ speakStars: () => 3 }));

import TalkView from "../TalkView.vue";
import { speak } from "../../../services/speech";
import { createRecorder } from "../../../utils/speechScore";

/** jsdom 没有媒体播放，桩掉 play */
beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
});

const lesson = {
  id: "l10",
  en: "Walking In The Jungle",
  zh: "丛林漫步",
  emoji: "🌴",
  words: ["frog", "monkey", "tiger"].map((id) => ({
    id, en: id, zh: id, emoji: "🐾", image: null, lessonId: "l10",
  })),
  phrases: [
    { en: "What's that?", zh: "那是什么？", audio: "/lessons/l10/audio/ph-1.mp3" },
    { en: "It's a frog.", zh: "那是一只青蛙。", audio: "/lessons/l10/audio/ph-2.mp3" },
    { en: "It's a monkey.", zh: "那是一只猴子。", audio: "/lessons/l10/audio/ph-3.mp3" },
  ],
} as never;

function flush() {
  return new Promise((r) => {
    vi.advanceTimersByTimeAsync(0).then(() => r(undefined));
  });
}
/** 让一轮录音通过：点 mic 开始 → 点 mic 停止 → 家长点「读对了」 */
async function passOneRound(wrapper: ReturnType<typeof mount>) {
  const mic = wrapper.find(".mic-btn");
  await mic.trigger("click");
  await flush();
  await mic.trigger("click");
  await flush();
  await wrapper.find(".dlg-judge .k-btn-green").trigger("click");
  await flush();
}

describe("TalkView 亲子对话（逐轮对话 + 录音）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("渲染轮次/问句/当前大图/录音按钮；进页自动播家长问句（不算通过）", async () => {
    const wrapper = mount(TalkView, { props: { lesson } });
    expect(wrapper.find(".dlg-round").text()).toContain("第 1 / 3 轮");
    expect(wrapper.find(".dlg-bubble.q").text()).toContain("What's that?");
    expect(wrapper.find(".dlg-en").text()).toBe("frog");
    expect(wrapper.find(".mic-btn").exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(400);
    expect(speak).toHaveBeenCalledWith("What's that?");
    // 未完成 → 完成按钮禁用 + 提示还剩几个词
    const btn = wrapper.find(".lf-btn");
    expect(btn.attributes("disabled")).toBeDefined();
    expect(wrapper.find(".lf").text()).toContain("还有 3 个词没对话");
  });

  it("一轮录音通过后自动进入下一轮（下轮大图切换 + 自动播问句）", async () => {
    const stop = vi.fn().mockResolvedValue("blob:rec-url");
    vi.mocked(createRecorder).mockReturnValue({ start: vi.fn().mockResolvedValue(undefined), stop, release: vi.fn() } as never);
    const wrapper = mount(TalkView, { props: { lesson } });
    await passOneRound(wrapper);
    expect(wrapper.findAll(".dlg-dot")[0].classes()).toContain("done");
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.find(".dlg-round").text()).toContain("第 2 / 3 轮");
    expect(wrapper.find(".dlg-en").text()).toBe("monkey");
    await vi.advanceTimersByTimeAsync(400);
    expect(speak).toHaveBeenCalledWith("What's that?");
  });

  it("判定「没读准」→ 再试一次 → 回录音按钮，轮次不变", async () => {
    const stop = vi.fn().mockResolvedValue("blob:rec-url");
    vi.mocked(createRecorder).mockReturnValue({ start: vi.fn().mockResolvedValue(undefined), stop, release: vi.fn() } as never);
    const wrapper = mount(TalkView, { props: { lesson } });
    const mic = wrapper.find(".mic-btn");
    await mic.trigger("click");
    await flush();
    await mic.trigger("click");
    await flush();
    await wrapper.find(".dlg-judge .k-btn-orange").trigger("click"); // 没读准 → retry
    await flush();
    expect(wrapper.find(".dlg-judge .k-btn-green").text()).toContain("再试一次");
    await wrapper.find(".dlg-judge .k-btn-green").trigger("click"); // 再试 → 回录音
    await flush();
    expect(wrapper.find(".mic-btn").exists()).toBe(true);
    expect(wrapper.find(".dlg-round").text()).toContain("第 1 / 3 轮");
  });

  it("三轮全部通过 → 完成按钮可用，emit done(3 星)", async () => {
    const stop = vi.fn().mockResolvedValue("blob:rec-url");
    vi.mocked(createRecorder).mockReturnValue({ start: vi.fn().mockResolvedValue(undefined), stop, release: vi.fn() } as never);
    const wrapper = mount(TalkView, { props: { lesson } });
    await passOneRound(wrapper);
    await vi.advanceTimersByTimeAsync(1000);
    await passOneRound(wrapper);
    await vi.advanceTimersByTimeAsync(1000);
    await passOneRound(wrapper);
    const btn = wrapper.find(".lf-btn");
    expect(btn.attributes("disabled")).toBeUndefined();
    expect(btn.text()).toContain("我都会啦");
    await btn.trigger("click");
    expect(wrapper.emitted("done")?.[0]?.[0]).toBe(3);
  });
});
