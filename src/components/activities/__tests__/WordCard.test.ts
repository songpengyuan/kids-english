// @vitest-environment jsdom
/**
 * 词卡：点图/点词都朗读并记一次"点读"，并向外 emit tap（LearnView 用它算点读覆盖率星级）。
 * 音效与朗读用 mock（jsdom 没有 WebAudio / Audio 播放）。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../../../utils/speech", () => ({ speak: vi.fn() }));
vi.mock("../../../utils/effects", () => ({ sfxTap: vi.fn() }));

import WordCard from "../WordCard.vue";
import { speak } from "../../../utils/speech";
import { useProgressStore } from "../../../stores/progress";

const word = {
  id: "boat",
  en: "boat",
  zh: "小船",
  emoji: "🚣",
  image: "/lessons/l4/words/boat.png",
  lessonId: "l4",
} as never;

describe("WordCard", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("点图片：朗读 + 记点读 + emit tap", async () => {
    const wrapper = mount(WordCard, { props: { word }, global: { plugins: [createPinia()] } });
    await wrapper.find(".pic").trigger("click");
    expect(speak).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("tap")?.[0]).toEqual([word]);
    const p = useProgressStore();
    expect(p.progress.l4.words?.boat.seen).toBe(1);
  });

  it("点单词：慢速朗读 + 中文提示（speakZhHint）+ 记点读", async () => {
    const wrapper = mount(WordCard, {
      props: { word, speakZhHint: true },
      global: { plugins: [createPinia()] },
    });
    await wrapper.find(".word").trigger("click");
    expect(speak).toHaveBeenCalledTimes(2); // 英文 + 中文
    expect(wrapper.emitted("tap")).toHaveLength(1);
  });

  it("图片加载失败时显示 emoji 占位", async () => {
    const wrapper = mount(WordCard, { props: { word }, global: { plugins: [createPinia()] } });
    await wrapper.find("img").trigger("error");
    expect(wrapper.find(".placeholder").text()).toBe("🚣");
  });
});
