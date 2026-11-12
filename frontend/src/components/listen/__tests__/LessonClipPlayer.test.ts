// @vitest-environment jsdom
/**
 * LessonClipPlayer（磨耳朵「词句」）行为测试——课程级循环口径（2026-11-13）：
 * - 词句流 = 全部课程逐课衔接（l1 词→l1 句→l2 词→…），上一句/下一句/三档循环都在跨课流上转；
 * - 起点可指定课程（startLessonId），落到该课第一句；
 * - 每次换句 emit change(lessonId)：磨耳朵页靠它把页头落到当前句所属课程；
 * - jsdom 的 <audio> 不真播：play/pause 打桩，换句用 prev/next 驱动（go 唯一出口）。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import LessonClipPlayer from "../LessonClipPlayer.vue";
import { lessons } from "../../../data/lessons";

vi.mock("../../../services/speech", () => ({ speakText: vi.fn().mockResolvedValue(undefined), speak: vi.fn(), stopSpeaking: vi.fn() }));
vi.mock("../../../services/haptics", () => ({ hapticTap: vi.fn() }));

const LESSONS = lessons.slice(0, 2); // 两课就够验证跨课衔接
const byLesson = (id: string) => LESSONS.find((l) => l.id === id)!;

function mountPlayer(startLessonId?: string) {
  return mount(LessonClipPlayer, {
    props: { lessons: LESSONS, startLessonId, embedded: true },
    global: { plugins: [createPinia()] },
    attachTo: document.body,
  });
}

beforeEach(() => {
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn(),
  });
});

describe("LessonClipPlayer（课程级词句流）", () => {
  it("起点落到指定课程的第一句，并 emit 该课程", async () => {
    const w = mountPlayer(LESSONS[1].id);
    await Promise.resolve();
    await w.vm.$nextTick();
    // 第二课的第一条词（该课 clips 的开头）
    const firstOfSecond = byLesson(LESSONS[1].id).words[0];
    expect(w.find(".cp-en").text()).toBe(firstOfSecond.en);
    expect(w.emitted("change")?.at(-1)).toEqual([LESSONS[1].id]);
  });

  it("下一句跨课推进：第一课最后一句 → 第二课第一句，页头事件跟着走", async () => {
    const w = mountPlayer(LESSONS[0].id);
    await Promise.resolve();
    const lastIdxOfFirst = byLesson(LESSONS[0].id).words.length + byLesson(LESSONS[0].id).phrases.length - 1;
    // 跳到第一课最后一句（逐句 go，中间的 change 无所谓）
    for (let i = 0; i < lastIdxOfFirst; i++) {
      await w.find('button[aria-label="下一句"]').trigger("click");
      await Promise.resolve();
    }
    await w.vm.$nextTick();
    expect(w.emitted("change")?.at(-1)).toEqual([LESSONS[0].id]);
    // 再下一句 = 第二课第一句（跨课衔接，不再锁在本课）
    await w.find('button[aria-label="下一句"]').trigger("click");
    await Promise.resolve();
    await w.vm.$nextTick();
    const firstOfSecond = byLesson(LESSONS[1].id).words[0];
    expect(w.find(".cp-en").text()).toBe(firstOfSecond.en);
    expect(w.emitted("change")?.at(-1)).toEqual([LESSONS[1].id]);
  });

  it("词句卡片底色/头部跟随当前句所属课程", async () => {
    const w = mountPlayer(LESSONS[1].id);
    await Promise.resolve();
    await w.vm.$nextTick();
    expect(w.find(".cp-card").classes().some((c) => c.startsWith("tone-"))).toBe(true);
    // 非嵌入头部展示当前课程名
    const w2 = mount(LessonClipPlayer, {
      props: { lessons: LESSONS, startLessonId: LESSONS[1].id },
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    await Promise.resolve();
    await w2.vm.$nextTick();
    expect(w2.find(".cp-title").text()).toBe(LESSONS[1].title);
  });
});
