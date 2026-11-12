// @vitest-environment jsdom
/**
 * 转盘复习（SpinnerView）阶段收口：
 *  · 起转阶段屏上只有「转一转」，没有词卡与麦克风；
 *  · 停到某个词之后「转一转」必须消失，麦克风成为唯一主动作
 *    （否则孩子会再点一次转盘，而 spin 的目标恒为 queue[doneCount]，
 *     只会把同一个词重转一遍，白转一圈还打断开口）；
 *  · 麦克风不可用时同样不显示「转一转」，只给「看着词读 + 下一转」。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../../../services/speech", () => ({ speak: vi.fn(), speakText: vi.fn(), stopSpeaking: vi.fn() }));
vi.mock("../../../services/effects", () => ({
  sfxTap: vi.fn(),
  sfxCorrect: vi.fn(),
  celebrate: vi.fn(),
}));
vi.mock("../../../utils/speechScore", () => ({
  recorderSupported: vi.fn(() => true),
  createRecorder: vi.fn(),
}));

import SpinnerView from "../SpinnerView.vue";
import { recorderSupported } from "../../../utils/speechScore";
import { speak } from "../../../services/speech";

const words = [
  { id: "red", en: "red", zh: "红色", emoji: "🔴", image: null, lessonId: "l11" },
  { id: "blue", en: "blue", zh: "蓝色", emoji: "🔵", image: null, lessonId: "l11" },
  { id: "horse", en: "horse", zh: "小马", emoji: "🐴", image: null, lessonId: "l11" },
];

async function mountSpinner() {
  const wrapper = mount(SpinnerView, { props: { words } });
  await wrapper.vm.$nextTick();
  return wrapper;
}

/** 点「转一转」并推进到停词（停顿动画 1.9s） */
async function spinToStop(wrapper: Awaited<ReturnType<typeof mountSpinner>>) {
  await wrapper.find(".spin-btn").trigger("click");
  await vi.advanceTimersByTimeAsync(1900);
  await wrapper.vm.$nextTick();
}

describe("SpinnerView 转盘：停词后不再显示「转一转」", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setActivePinia(createPinia());
    vi.mocked(recorderSupported).mockReturnValue(true);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("起转阶段只有「转一转」，没有词卡和麦克风", async () => {
    const wrapper = await mountSpinner();
    expect(wrapper.find(".spin-btn").exists()).toBe(true);
    expect(wrapper.find(".spin-btn").text()).toContain("转一转");
    expect(wrapper.find(".current").exists()).toBe(false);
    expect(wrapper.find(".mic").exists()).toBe(false);
  });

  it("停到词之后「转一转」消失，麦克风成为唯一主动作", async () => {
    const wrapper = await mountSpinner();
    await spinToStop(wrapper);

    expect(wrapper.find(".current").exists()).toBe(true);
    expect(wrapper.find(".mic").exists()).toBe(true);
    expect(wrapper.find(".spin-btn").exists()).toBe(false);
    // 顶部提示同步换成「说出来」阶段的话术
    expect(wrapper.find(".stage-head").text()).toContain("大声读出这个词");
    wrapper.unmount();
  });

  it("麦克风不可用时也不给「转一转」，只留「下一转」", async () => {
    vi.mocked(recorderSupported).mockReturnValue(false);
    const wrapper = await mountSpinner();
    await spinToStop(wrapper);

    expect(wrapper.find(".spin-btn").exists()).toBe(false);
    expect(wrapper.find(".mic-blocked").exists()).toBe(true);
    expect(wrapper.find(".next-btn").exists()).toBe(true);
    wrapper.unmount();
  });

  it("点整张词卡 = 再听一遍这个词（整卡可点，不再依赖 34px 小喇叭）", async () => {
    const wrapper = await mountSpinner();
    await spinToStop(wrapper);
    // 词卡本身是可点按钮（P2 可点区 ≥52px / P3 点词卡=读词）
    expect(wrapper.find(".current").element.tagName).toBe("BUTTON");
    vi.mocked(speak).mockClear();
    await wrapper.find(".current").trigger("click");
    expect(speak).toHaveBeenCalled();
    // 卡角喇叭已退化为卡内视觉提示，不再单独接点击
    expect(wrapper.find(".current-speak").element.tagName).toBe("SPAN");
    wrapper.unmount();
  });
});
