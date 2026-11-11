// @vitest-environment jsdom
/**
 * 课程详情页点读：标题读课名、词卡读单词（用课时预生成童声，缺失回退 TTS）。
 * 锁的是"点了真的出声"这条交互，不是样式。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import CourseAboutView from "../CourseAboutView.vue";
import { appRoutes } from "../../../router";
import { speak } from "../../../services/speech";

vi.mock("../../../services/speech", () => ({
  speak: vi.fn().mockResolvedValue(undefined),
  speakZh: vi.fn().mockResolvedValue(undefined),
  stopSpeaking: vi.fn(),
}));

const speakMock = vi.mocked(speak);

async function mountAbout(path = "/course/l13/about") {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({ history: createMemoryHistory(), routes: appRoutes });
  await router.push(path);
  await router.isReady();
  const w = mount(CourseAboutView as never, { global: { plugins: [pinia, router] } });
  await flushPromises();
  return w;
}

describe("课程详情页点读", () => {
  beforeEach(() => {
    localStorage.clear();
    speakMock.mockClear();
  });

  it("点词卡 Auto 播放该词发音（带 lessonId/wordId，走预生成 mp3）", async () => {
    const w = await mountAbout();
    const words = w.findAll(".word");
    expect(words).toHaveLength(8);
    expect(words[0].text()).toContain("gorilla");
    await words[0].trigger("click");
    expect(speakMock).toHaveBeenCalledWith("gorilla", { lessonId: "l13", wordId: "gorilla" });
  });

  it("点课程头朗读课名（ttsOnly，不查词音文件）", async () => {
    const w = await mountAbout();
    await w.find(".about-hero").trigger("click");
    expect(speakMock).toHaveBeenCalledWith("Good Night, Gorilla", { ttsOnly: true });
  });
});
