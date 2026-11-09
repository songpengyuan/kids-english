// @vitest-environment jsdom
/**
 * 跟我读（SpeakView）停留反馈态时，点图即听示范，不再单独给「再听示范」按钮：
 * - 反馈态（读得棒 / 没读准）不再出现独立的「再听示范」按钮
 * - 主卡图片本身就是听示范的入口：点一下会重新朗读当前词
 * - 没读准时提示语指向"点图听一遍"，而不是指向一个不存在的按钮
 */
import { describe, expect, it, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../../../services/speech", () => ({ speak: vi.fn(), speakText: vi.fn(), stopSpeaking: vi.fn() }));
vi.mock("../../../services/effects", () => ({
  sfxCorrect: vi.fn(),
  sfxWrong: vi.fn(),
  bigCelebrate: vi.fn(),
}));
vi.mock("../../../services/haptics", () => ({ hapticTap: vi.fn() }));
// jsdom 既没有 ASR 也没有 MediaRecorder：固定成 record 模式（家长判定链路）
vi.mock("../../../utils/speechScore", () => ({
  asrSupported: () => false,
  recorderSupported: () => true,
  createRecorder: vi.fn(),
  createWordRecognizer: vi.fn(),
  gradeScore: vi.fn(),
  scorePronunciation: vi.fn(),
}));
vi.mock("../../../utils/speakSession", () => ({ speakStars: () => 3 }));

import SpeakView from "../SpeakView.vue";
import { speak } from "../../../services/speech";
import { createRecorder } from "../../../utils/speechScore";

beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
});

const words = [
  { id: "bus", en: "bus", zh: "公交车", emoji: "🚌", image: "/lessons/l12/words/bus.webp", lessonId: "l12" },
  { id: "wheel", en: "wheel", zh: "车轮", emoji: "🛞", image: "/lessons/l12/words/wheel.webp", lessonId: "l12" },
];

function flush() {
  return new Promise((r) => {
    vi.advanceTimersByTimeAsync(0).then(() => r(undefined));
  });
}

/** 录一轮并走到家长判定态：点麦克风开始 → 再点结束 */
async function recordOnce(wrapper: ReturnType<typeof mount>) {
  await wrapper.find(".mic").trigger("click");
  await flush();
  await wrapper.find(".mic").trigger("click");
  await flush();
}

function judgeButton(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll(".judge-q ~ .btn-row button").find((b) => b.text().includes(text));
}

describe("SpeakView 跟我读：反馈态用点图听示范，不另给按钮", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setActivePinia(createPinia());
    vi.mocked(createRecorder).mockReturnValue({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue("blob:rec-url"),
      release: vi.fn(),
    } as never);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("家长判定「读得棒」后的反馈态不再出现「再听示范」按钮", async () => {
    const wrapper = mount(SpeakView, { props: { words } });
    await recordOnce(wrapper);
    // 判定前家长可听回放，但这里断言的是示范入口
    await judgeButton(wrapper, "读得棒")!.trigger("click");
    await flush();
    expect(wrapper.find(".verdict").text()).toContain("太棒了");
    expect(wrapper.text()).not.toContain("再听示范");
    // 通过后仍能继续推进
    expect(wrapper.findAll("button").some((b) => b.text().includes("继续"))).toBe(true);
  });

  it("判定「再试一次」后的提示指向点图，且同样没有「再听示范」按钮", async () => {
    const wrapper = mount(SpeakView, { props: { words } });
    await recordOnce(wrapper);
    await judgeButton(wrapper, "再试一次")!.trigger("click");
    await flush();
    expect(wrapper.find(".verdict").text()).toContain("先点图听一遍");
    expect(wrapper.text()).not.toContain("再听示范");
    expect(wrapper.findAll("button").some((b) => b.text().includes("我再试试"))).toBe(true);
  });

  it("反馈态点主卡图片即重播示范（图片就是听示范的入口）", async () => {
    const wrapper = mount(SpeakView, { props: { words } });
    await recordOnce(wrapper);
    await judgeButton(wrapper, "读得棒")!.trigger("click");
    await flush();
    vi.mocked(speak).mockClear();
    await wrapper.find(".pic").trigger("click");
    expect(speak).toHaveBeenCalledWith("bus", { lessonId: "l12", wordId: "bus" });
  });
});
