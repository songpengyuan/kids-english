// @vitest-environment jsdom
/**
 * 亲子对话（TalkView · 微信聊天式）逐轮对话行为：
 * - 页内顶部进度与「跟我读」同构（StageHead：`1 / 3` + 玩法标签），并上报 progress/total
 * - 进页家长自动发出问句消息并朗读
 * - 录音 → 判定通过 → 孩子"发消息"（大图+答句+语音文本）**并立刻进入下一轮**
 *   （2026-10-17：读对后不能停在"读对了"的展示态，底部要换成新的一句）
 * - 判定「没读准」→ 可再试，轮次不变
 * - 全部单词对话完 → 完成按钮可用，emit done(星级)
 */
import { describe, expect, it, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("../../../services/speech", () => ({ speak: vi.fn(), speakText: vi.fn(), stopSpeaking: vi.fn() }));
vi.mock("../../../services/effects", () => ({
  sfxCorrect: vi.fn(),
  sfxWrong: vi.fn(),
  bigCelebrate: vi.fn(),
}));
vi.mock("../../../services/haptics", () => ({ hapticTap: vi.fn() }));
// 录音会话走 useSpeechSession：jsdom 无 SpeechRecognition/MediaRecorder，
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
import { speak, speakText } from "../../../services/speech";
import { createRecorder } from "../../../utils/speechScore";

/** jsdom 没有媒体播放，桩掉 play */
beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
});

const lessonWords = ["frog", "monkey", "tiger"].map((id) => ({
  id, en: id, zh: id, emoji: "🐾", image: null, lessonId: "l10",
}));

const lesson = {
  id: "l10",
  en: "Walking In The Jungle",
  zh: "丛林漫步",
  emoji: "🌴",
  words: lessonWords,
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
/** 让一轮录音通过：点输入框开始 → 停止 → 家长点「读对了」 */
async function passOneRound(wrapper: ReturnType<typeof mount>) {
  const bar = wrapper.find(".input-bar");
  await bar.trigger("click");
  await flush();
  await bar.trigger("click");
  await flush();
  await wrapper.find(".ci-judge .k-btn-green").trigger("click");
  await flush();
}

describe("TalkView 亲子对话（微信聊天式 · 逐轮对话 + 录音）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("页内进度与「跟我读」同构，并上报 progress/total（供顶栏圆点）", async () => {
    const wrapper = mount(TalkView, { props: { lesson } });
    // 位置/写法与 SpeakView 的 StageHead 一致：左侧 `1 / 3`，右侧玩法标签
    expect(wrapper.find(".stage-head .prog").text()).toBe("1 / 3");
    expect(wrapper.find(".stage-head .mode-tag").text()).toContain("亲子对话");
    expect(wrapper.emitted("total")?.[0]?.[0]).toBe(3);
    expect(wrapper.emitted("progress")?.[0]?.[0]).toBe(33); // 1/3 → 33%
  });

  it("渲染输入框与「宝宝要说的话」；进页家长自动发出问句消息并朗读（不算通过）", async () => {
    const wrapper = mount(TalkView, { props: { lesson } });
    // 输入区就位
    expect(wrapper.find(".input-bar").exists()).toBe(true);
    // 输入框上方显示孩子要说的话（点喇叭听整句发音）
    expect(wrapper.find(".ci-say-text").text()).toBe("It's a frog.");
    expect(wrapper.find(".ci-say").attributes("aria-label")).toContain("宝宝要说的句子");
    // 进页自动：家长消息出现在左侧 + 朗读问句
    await vi.advanceTimersByTimeAsync(400);
    const parentMsg = wrapper.findAll(".msg-row.parent");
    expect(parentMsg.length).toBe(1);
    expect(parentMsg[0].text()).toContain("What's that?");
    expect(speak).toHaveBeenCalledWith("What's that?");
    // 家长消息带发题图片（孩子看图回答；不显示英文答案）
    const parentPic = parentMsg[0].find(".msg-pic");
    expect(parentPic.exists()).toBe(true);
    expect(parentPic.find(".msg-pic-en").exists()).toBe(false);
    // 未完成：底部不显示按钮
    expect(wrapper.find(".lf-btn").exists()).toBe(false);
    // 家长消息文字在上、图片在下
    const html = parentMsg[0].html();
    expect(html.indexOf("What's that?")).toBeLessThan(html.indexOf("msg-pic"));
  });

  it("一轮通过 → 孩子「发消息」并立刻进入下一轮，底部换成新的一句", async () => {
    const stop = vi.fn().mockResolvedValue("blob:rec-url");
    vi.mocked(createRecorder).mockReturnValue({ start: vi.fn().mockResolvedValue(undefined), stop, release: vi.fn() } as never);
    const wrapper = mount(TalkView, { props: { lesson } });
    await passOneRound(wrapper);
    // 孩子消息出现在右侧：大图 frog + 答句 + 语音文本
    const kidMsg = wrapper.findAll(".msg-row.kid");
    expect(kidMsg.length).toBe(1);
    expect(kidMsg[0].find(".msg-pic-en").text()).toBe("frog");
    expect(kidMsg[0].find(".msg-text").text()).toContain("It's a frog.");
    // 关键：不留"读对了"的展示态 —— 读对就推进（ADVANCE_MS=420 → 新问句 180）。
    // 推进中判定按钮被锁住，避免同一轮连点推出两条孩子消息。
    expect(wrapper.find(".ci-judge .k-btn-green").attributes("disabled")).toBeDefined();
    await vi.advanceTimersByTimeAsync(700);
    expect(wrapper.find(".input-bar").exists()).toBe(true); // 回到"等你说话"
    // 底部立刻换成第 2 轮孩子要说的话（不是还停在 frog）
    expect(wrapper.find(".ci-say-text").text()).toBe("It's a monkey.");
    expect(wrapper.find(".stage-head .prog").text()).toBe("2 / 3");
    expect(wrapper.emitted("progress")?.at(-1)?.[0]).toBe(67);
    // 家长第 2 轮问句也发了
    expect(wrapper.findAll(".msg-row.parent").length).toBe(2);
    expect(speak).toHaveBeenCalledWith("What's that?");
  });

  it("判定「没读准」→ 再试一次 → 回输入框，轮次不变", async () => {
    const stop = vi.fn().mockResolvedValue("blob:rec-url");
    vi.mocked(createRecorder).mockReturnValue({ start: vi.fn().mockResolvedValue(undefined), stop, release: vi.fn() } as never);
    const wrapper = mount(TalkView, { props: { lesson } });
    const bar = wrapper.find(".input-bar");
    await bar.trigger("click");
    await flush();
    await bar.trigger("click");
    await flush();
    await wrapper.find(".ci-judge .k-btn-orange").trigger("click"); // 没读准 → retry
    await flush();
    expect(wrapper.find(".ci-judge .k-btn-green").text()).toContain("再试一次");
    await wrapper.find(".ci-judge .k-btn-green").trigger("click"); // 再试 → 回输入框
    await flush();
    expect(wrapper.find(".input-bar").exists()).toBe(true);
    // 未通过不发孩子消息
    expect(wrapper.findAll(".msg-row.kid").length).toBe(0);
    expect(wrapper.find(".stage-head .prog").text()).toBe("1 / 3");
  });

  it("三轮全部通过 → 完成按钮可用，emit done(3 星)", async () => {
    const stop = vi.fn().mockResolvedValue("blob:rec-url");
    vi.mocked(createRecorder).mockReturnValue({ start: vi.fn().mockResolvedValue(undefined), stop, release: vi.fn() } as never);
    const wrapper = mount(TalkView, { props: { lesson } });
    await passOneRound(wrapper);
    await vi.advanceTimersByTimeAsync(700);
    await passOneRound(wrapper);
    await vi.advanceTimersByTimeAsync(700);
    await passOneRound(wrapper);
    expect(wrapper.findAll(".msg-row.kid").length).toBe(3);
    const btn = wrapper.find(".lf-btn");
    expect(btn.attributes("disabled")).toBeUndefined();
    expect(btn.text()).toContain("我都会啦");
    await btn.trigger("click");
    expect(wrapper.emitted("done")?.[0]?.[0]).toBe(3);
  });

  it("点「宝宝要说的话」读整句而非单词（曾经只读单词）", async () => {
    const wrapper = mount(TalkView, { props: { lesson } });
    vi.mocked(speakText).mockClear();
    vi.mocked(speak).mockClear();
    await wrapper.find(".ci-say").trigger("click");
    // 读的是完整答句，不是 "frog"
    expect(speakText).toHaveBeenCalledWith("It's a frog.");
    expect(speak).not.toHaveBeenCalledWith("frog", expect.anything());
  });

  it("点孩子消息气泡重听那句答句（整句）", async () => {
    const stop = vi.fn().mockResolvedValue("blob:rec-url");
    vi.mocked(createRecorder).mockReturnValue({ start: vi.fn().mockResolvedValue(undefined), stop, release: vi.fn() } as never);
    const wrapper = mount(TalkView, { props: { lesson } });
    await passOneRound(wrapper);
    vi.mocked(speakText).mockClear();
    const kid = wrapper.findAll(".msg-row.kid")[0];
    await kid.find(".msg-bubble").trigger("click");
    expect(speakText).toHaveBeenCalledWith("It's a frog.");
  });

  it("分组课传入 words：按传入词表推进（l11 亲子对话按词群分段）", async () => {
    const wrapper = mount(TalkView, { props: { lesson, words: lessonWords.slice(0, 2) } });
    expect(wrapper.find(".stage-head .prog").text()).toBe("1 / 2");
    expect(wrapper.emitted("total")?.[0]?.[0]).toBe(2);
    await vi.advanceTimersByTimeAsync(400);
    expect(wrapper.find(".ci-say-text").text()).toBe("It's a frog.");
  });
});
