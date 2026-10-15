// @vitest-environment jsdom
/**
 * 看图学词整关行为：
 * - 完成门槛：最后一页 **且** 本课每个词都点过发音（没点完不让你"我都会啦"）
 * - 点过的词显示"已听过"角标，但**仍可再点**（孩子想重复听随时能点）
 * - 星级 = 点读覆盖率（都点过发音才 3 星，只翻页 = 1 星，重复点只算一次）
 */
import { describe, expect, it, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../../../services/speech", () => ({ speak: vi.fn() }));
vi.mock("../../../services/effects", () => ({
  sfxTap: vi.fn(),
  sfxCorrect: vi.fn(),
  sfxWrong: vi.fn(),
  celebrate: vi.fn(),
  bigCelebrate: vi.fn(),
}));

// dialog 亲子对话走 useSpeechSession 录音会话：jsdom 无 SpeechRecognition/MediaRecorder，
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

import LearnStage from "../LearnStage.vue";
import { speak } from "../../../services/speech";
import { createRecorder } from "../../../utils/speechScore";

/** jsdom 没有 ResizeObserver / 真实布局尺寸，桩掉后组件走保守兜底（每页 4 张） */
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;

const words = ["a", "b", "c", "d", "e"].map((id) => ({
  id,
  en: id,
  zh: id,
  emoji: "🔤",
  image: null,
  lessonId: "l4",
})) as never;

describe("LearnStage（点读覆盖率星级 + 全点过才能完成）", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.mocked(speak).mockClear();
  });

  it("未到末页时完成按钮禁用；翻到末页但没点完 → 仍禁用并提示还差几个", async () => {
    const wrapper = mount(LearnStage, { props: { words }, global: { plugins: [createPinia()] } });
    expect(wrapper.find(".next").attributes("disabled")).toBeDefined();
    await wrapper.find('[aria-label="下一页"]').trigger("click");
    // 末页（第 2 页，1 个词）还没点 → 不能完成
    expect(wrapper.find(".next").attributes("disabled")).toBeDefined();
    expect(wrapper.find(".next").text()).toContain("还有 5 个词没点过");
  });

  it("每个词都点过发音 → 按钮可点（'我都会啦'）并记 3 星", async () => {
    const wrapper = mount(LearnStage, { props: { words }, global: { plugins: [createPinia()] } });
    for (const el of wrapper.findAll(".word")) await el.trigger("click"); // 第 1 页 4 个
    await wrapper.find('[aria-label="下一页"]').trigger("click");
    for (const el of wrapper.findAll(".word")) await el.trigger("click"); // 第 2 页 1 个
    expect(wrapper.find(".next").attributes("disabled")).toBeUndefined();
    expect(wrapper.find(".next").text()).toContain("我都会啦");
    await wrapper.find(".next").trigger("click");
    expect(wrapper.emitted("done")?.[0]).toEqual([3]);
  });

  it("只翻页不点读 → 完成按钮一直禁用，点完成无效果", async () => {
    const wrapper = mount(LearnStage, { props: { words }, global: { plugins: [createPinia()] } });
    await wrapper.find('[aria-label="下一页"]').trigger("click");
    expect(wrapper.find(".next").attributes("disabled")).toBeDefined();
    await wrapper.find(".next").trigger("click"); // disabled 按钮不触发
    expect(wrapper.emitted("done")).toBeUndefined();
  });

  it("重复点同一个词只算一次点读：只点 1 个词无法完成", async () => {
    const wrapper = mount(LearnStage, { props: { words }, global: { plugins: [createPinia()] } });
    const first = wrapper.findAll(".word")[0];
    await first.trigger("click");
    await first.trigger("click");
    await wrapper.find('[aria-label="下一页"]').trigger("click");
    expect(wrapper.find(".next").attributes("disabled")).toBeDefined();
    expect(wrapper.find(".next").text()).toContain("还有 4 个词没点过");
    expect(wrapper.emitted("done")).toBeUndefined();
  });

  it("点过的词显示'已听过'角标，且仍可再点听发音", async () => {
    const wrapper = mount(LearnStage, { props: { words }, global: { plugins: [createPinia()] } });
    const first = wrapper.findAll(".word")[0];
    await first.trigger("click");
    expect(wrapper.find(".word-card .marked").exists()).toBe(true);
    // 角标不挡点击：再点同一词，发音照常播放（speak 被再次调用）
    await first.trigger("click");
    expect(vi.mocked(speak)).toHaveBeenCalledTimes(2);
  });
});

describe("LearnStage dialog 亲子口语对话卡（l10）· 逐轮对话 + 录音", () => {
  const dlgWords = ["frog", "monkey", "tiger"].map((id) => ({
    id, en: id, zh: id, emoji: "🐾", image: null, lessonId: "l10",
  })) as never;
  const dlgPhrases = [
    { en: "What's that?", zh: "那是什么？", audio: "/lessons/l10/audio/ph-1.mp3" },
    { en: "It's a frog.", zh: "那是一只青蛙。", audio: "/lessons/l10/audio/ph-2.mp3" },
    { en: "It's a monkey.", zh: "那是一只猴子。", audio: "/lessons/l10/audio/ph-3.mp3" },
  ] as never;

  // jsdom 没有媒体播放，桩掉 play
  beforeAll(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
  });

  function flush() {
    return new Promise((r) => {
      vi.advanceTimersByTimeAsync(0).then(() => r(undefined));
    });
  }
  /** 让一轮录音通过：点 mic 开始 → 点 mic 停止 → 家长点「读对了」 */
  async function passOneRound(wrapper: ReturnType<typeof mount>) {
    const mic = wrapper.find(".mic-btn");
    await mic.trigger("click"); // 开始录音
    await flush();
    await mic.trigger("click"); // 停止录音 → 自动回放
    await flush();
    await wrapper.find(".dlg-judge .k-btn-green").trigger("click"); // 家长判定：读对了
    await flush();
  }

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("渲染轮次/问句/当前大图/录音按钮；进页自动播家长问句（不算通过）", async () => {
    const wrapper = mount(LearnStage, {
      props: { words: dlgWords, dialog: true, phrases: dlgPhrases },
      global: { plugins: [createPinia()] },
    });
    expect(wrapper.find(".dlg-round").text()).toContain("第 1 / 3 轮");
    expect(wrapper.find(".dlg-bubble.q").text()).toContain("What's that?");
    expect(wrapper.find(".dlg-en").text()).toBe("frog");
    expect(wrapper.find(".mic-btn").exists()).toBe(true);
    // 进页自动播问句（320ms），不记通过 → 完成按钮仍禁用
    await vi.advanceTimersByTimeAsync(400);
    expect(speak).toHaveBeenCalledWith("What's that?");
    expect(wrapper.find(".next").attributes("disabled")).toBeDefined();
    expect(wrapper.find(".next").text()).toContain("还有 3 个词没对话");
  });

  it("一轮录音通过后自动进入下一轮（下轮大图切换 + 自动播问句）", async () => {
    const stop = vi.fn().mockResolvedValue("blob:rec-url");
    vi.mocked(createRecorder).mockReturnValue({ start: vi.fn().mockResolvedValue(undefined), stop, release: vi.fn() } as never);
    const wrapper = mount(LearnStage, {
      props: { words: dlgWords, dialog: true, phrases: dlgPhrases },
      global: { plugins: [createPinia()] },
    });
    await passOneRound(wrapper);
    // frog 这轮通过：进度点打勾
    expect(wrapper.findAll(".dlg-dot")[0].classes()).toContain("done");
    // 900ms 后自动进入第 2 轮（monkey）
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.find(".dlg-round").text()).toContain("第 2 / 3 轮");
    expect(wrapper.find(".dlg-en").text()).toBe("monkey");
    // 进入新轮自动播问句（260ms）
    await vi.advanceTimersByTimeAsync(400);
    expect(speak).toHaveBeenCalledWith("What's that?");
  });

  it("家长判定「再试一次」→ 回录音按钮，轮次不变", async () => {
    const stop = vi.fn().mockResolvedValue("blob:rec-url");
    vi.mocked(createRecorder).mockReturnValue({ start: vi.fn().mockResolvedValue(undefined), stop, release: vi.fn() } as never);
    const wrapper = mount(LearnStage, {
      props: { words: dlgWords, dialog: true, phrases: dlgPhrases },
      global: { plugins: [createPinia()] },
    });
    const mic = wrapper.find(".mic-btn");
    await mic.trigger("click");
    await flush();
    await mic.trigger("click");
    await flush();
    await wrapper.find(".dlg-judge .k-btn-orange").trigger("click"); // 没读准 → retry
    await flush();
    expect(wrapper.find(".dlg-judge .k-btn-green").text()).toContain("再试一次");
    await wrapper.find(".dlg-judge .k-btn-green").trigger("click"); // 再试一次 → 回录音
    await flush();
    expect(wrapper.find(".mic-btn").exists()).toBe(true);
    expect(wrapper.find(".dlg-round").text()).toContain("第 1 / 3 轮");
  });

  it("三轮全部通过 → 「我都会啦」可点，完成记 3 星", async () => {
    const stop = vi.fn().mockResolvedValue("blob:rec-url");
    vi.mocked(createRecorder).mockReturnValue({ start: vi.fn().mockResolvedValue(undefined), stop, release: vi.fn() } as never);
    const wrapper = mount(LearnStage, {
      props: { words: dlgWords, dialog: true, phrases: dlgPhrases },
      global: { plugins: [createPinia()] },
    });
    await passOneRound(wrapper); // frog
    await vi.advanceTimersByTimeAsync(1000);
    await passOneRound(wrapper); // monkey
    await vi.advanceTimersByTimeAsync(1000);
    await passOneRound(wrapper); // tiger（最后一轮不自动跳）
    expect(wrapper.find(".next").attributes("disabled")).toBeUndefined();
    expect(wrapper.find(".next").text()).toContain("我都会啦");
    await wrapper.find(".next").trigger("click");
    expect(wrapper.emitted("done")?.[0]?.[0]).toBe(3);
  });
});
