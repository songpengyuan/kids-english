// @vitest-environment jsdom
/**
 * 到期复习页（ReviewView）朗读回归：
 *
 * 2026-11-08 用户反馈"刚切到下一题的发音不对"。
 * 根因：出题函数 buildQuizQuestions 会**洗牌**词序，所以「第 i 题」的正确词
 * 并不是入场队列 seq[i]；页面切题后却按 seq[idx] 朗读，读到的是队列顺序里的
 * 另一个词。开第一题时也一样（用 seq[0]）。
 *
 * 本测试用固定 rng(Math.random=0) 让洗牌结果确定（[a,b,c] → [b,c,a]），
 * 从而能区分"读对了"和"读了 seq 里那个位置的词"：
 *  - 听到的词，点它的图卡必须判对并推进到下一题；
 *  - 若读错了词，点它只会判错，不会推进、也不会再出声。
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { appRoutes } from "../../../router";
import { useProgressStore } from "../../../stores/progress";

vi.hoisted(() => {
  const w = globalThis as unknown as { window?: Record<string, unknown> };
  if (typeof w.window === "undefined") return;
  w.window.matchMedia =
    w.window.matchMedia ||
    ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }));
});

vi.mock("../../../services/speech", () => ({
  speak: vi.fn(),
  speakZh: vi.fn(),
  stopSpeaking: vi.fn(),
}));
vi.mock("../../../services/effects", () => ({
  sfxTap: vi.fn(),
  sfxCorrect: vi.fn(),
  sfxWrong: vi.fn(),
  bigCelebrate: vi.fn(),
  celebrate: vi.fn(),
  sfxMatch: vi.fn(),
  sfxCoin: vi.fn(),
  sfxSticker: vi.fn(),
  sfxChestOpen: vi.fn(),
  sfxCollect: vi.fn(),
}));

import { speak } from "../../../services/speech";
import { sfxCorrect, sfxWrong } from "../../../services/effects";
import ReviewView from "../ReviewView.vue";

const speakMock = speak as unknown as ReturnType<typeof vi.fn>;
const correctMock = sfxCorrect as unknown as ReturnType<typeof vi.fn>;
const wrongMock = sfxWrong as unknown as ReturnType<typeof vi.fn>;

/** 本轮到期词（en 在全词库唯一，便于用 aria-label 定位图卡） */
const SEED = [
  { lessonId: "l12", wordId: "wheels" },
  { lessonId: "l12", wordId: "door" },
  { lessonId: "l12", wordId: "wipers" },
];

/** 固定 rng：洗牌退化为"轮转"，队列 [a,b,c] → 题目顺序 [b,c,a] */
function zeroRng() {
  vi.spyOn(Math, "random").mockReturnValue(0);
}

describe("ReviewView 到期复习：切题后的朗读必须是当前题的词", () => {
  beforeEach(() => {
    localStorage.clear();
    speakMock.mockClear();
    correctMock.mockClear();
    wrongMock.mockClear();
    vi.useFakeTimers({ now: new Date("2026-11-08T10:00:00+08:00") });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function mountReview() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useProgressStore();
    // 2 天前答错 → stage0、1 天后到期 → 今天立即进队列
    vi.setSystemTime(new Date("2026-11-06T10:00:00+08:00"));
    for (const s of SEED) store.recordWord(s.lessonId, s.wordId, { wrong: 1 });
    vi.setSystemTime(new Date("2026-11-08T10:00:00+08:00"));

    zeroRng();
    const router = createRouter({ history: createMemoryHistory(), routes: appRoutes });
    await router.push("/course/review");
    await router.isReady();
    const w = mount(ReviewView, { global: { plugins: [pinia, router] } });
    await flushPromises();
    return w;
  }

  function optionByLabel(wrapper: ReturnType<typeof mount>, label: string) {
    return wrapper.findAll(".opt").find((o) => o.attributes("aria-label") === label);
  }

  it("开第一题与切到第二题，朗读的都是屏幕上这题的正确词", async () => {
    const w = await mountReview();

    // 题目顺序 [door, wipers, wheels]（rng=0 的确定结果），队列是 [wheels,door,wipers]
    expect(speakMock).toHaveBeenCalledTimes(1);
    expect(speakMock.mock.calls[0][0]).toBe("door"); // 队列 seq[0] 是 wheels → 读到它即 bug

    await optionByLabel(w, "door")!.trigger("click");
    await flushPromises();
    expect(correctMock).toHaveBeenCalledTimes(1);
    // 答对会把该词再念一遍（即时正向反馈），所以这里是第 2 次出声、仍是同一词
    expect(speakMock).toHaveBeenCalledTimes(2);
    expect(speakMock.mock.calls[1][0]).toBe("door");

    // 答对 1100ms 后自动切下一题
    await vi.advanceTimersByTimeAsync(1200);
    await flushPromises();

    // 切题朗读：题目顺序的下一题是 wipers（若按 seq[idx] 会读到 door → bug）
    expect(speakMock).toHaveBeenCalledTimes(3);
    expect(speakMock.mock.calls[2][0]).toBe("wipers");

    // 关键区分证据：把"刚刚听到的词"点下去，必须判对并继续推进
    await optionByLabel(w, "wipers")!.trigger("click");
    await flushPromises();
    expect(correctMock).toHaveBeenCalledTimes(2);
    expect(wrongMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1200);
    await flushPromises();
    expect(speakMock.mock.calls.length).toBe(5); // 第 4 次=答对重念 wipers，第 5 次=切到 wheels
    expect(speakMock.mock.calls[4][0]).toBe("wheels");
  });
});
