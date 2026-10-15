// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

// 项目惯例：mock 工厂直接返回 vi.fn()，用例内用 vi.mocked() 访问
vi.mock("../../../services/speech", () => ({
  speak: vi.fn(),
  speakZh: vi.fn(),
}));

import { speak, speakZh } from "../../../services/speech";
import SpeakText from "../SpeakText.vue";

describe("SpeakText 统一点读组件", () => {
  beforeEach(() => {
    vi.mocked(speak).mockReset().mockResolvedValue(undefined);
    vi.mocked(speakZh).mockReset().mockResolvedValue(undefined);
  });

  it("span 形态（默认）：渲染文字，点击触发 speak 并透传单词定位参数", async () => {
    const wrapper = mount(SpeakText, {
      props: { text: "blue", lessonId: "l4", wordId: "blue" },
      slots: { default: "blue" },
    });
    expect(wrapper.find(".spk-inline").exists()).toBe(true);
    expect(wrapper.text()).toContain("blue");

    await wrapper.find(".spk-inline").trigger("click");
    expect(vi.mocked(speak)).toHaveBeenCalledWith("blue", {
      lessonId: "l4",
      wordId: "blue",
      rate: 0.85,
      lang: "en-US",
      ttsOnly: false,
      timeoutMs: 3000,
    });
  });

  it("中文文案模式：传 zh 时优先朗读中文（speakZh）", async () => {
    const wrapper = mount(SpeakText, {
      props: { text: "blue", zh: "蓝色", bypassMute: false },
    });
    await wrapper.find(".spk-inline").trigger("click");
    expect(vi.mocked(speakZh)).toHaveBeenCalledWith("蓝色", 1, { bypassMute: false });
    expect(vi.mocked(speak)).not.toHaveBeenCalled();
  });

  it("纯文案（无单词定位）走 ttsOnly 语义：speak 不带 lessonId/wordId（由服务层默认参数补齐）", async () => {
    const wrapper = mount(SpeakText, {
      props: { text: "The Sea Song", ttsOnly: true, rate: 0.9 },
    });
    await wrapper.find(".spk-inline").trigger("click");
    expect(vi.mocked(speak)).toHaveBeenCalledWith("The Sea Song", {
      rate: 0.9,
      lang: "en-US",
      ttsOnly: true,
      timeoutMs: 3000,
    });
  });

  it("button 形态：渲染原生按钮并带 aria-label / aria-pressed", async () => {
    const wrapper = mount(SpeakText, {
      props: { text: "apple", as: "button", zh: "" },
    });
    const btn = wrapper.find("button.spk");
    expect(btn.exists()).toBe(true);
    expect(btn.attributes("aria-label")).toBe("apple");
    expect(btn.attributes("aria-pressed")).toBe("false");
    await btn.trigger("click");
    expect(vi.mocked(speak)).toHaveBeenCalled();
  });

  it("span 形态点读不冒泡：宿主容器的点击不会被误触发", async () => {
    const wrapper = mount({
      components: { SpeakText },
      data: () => ({ hostClicks: 0 }),
      template: `<div @click="hostClicks++"><SpeakText text="cat" /></div>`,
    });
    await wrapper.find(".spk-inline").trigger("click");
    expect(vi.mocked(speak)).toHaveBeenCalled();
    // stopPropagation 后宿主容器点击不被触发
    expect(wrapper.vm.hostClicks).toBe(0);
  });
});
