// @vitest-environment jsdom
/**
 * 喂乐乐鸟舞台角色（QuizFeedBird，杠杆③ 皮肤首例）：
 *  - 纯展示件：三种情绪类（idle 呼吸 / yum 答对嚼 / oops 答错垂头）由父组件驱动；
 *  - 暴露根元素给父组件当飞行落点（useFlyToEl 的 to）；
 *  - pointer-events:none：不吃触控。
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import QuizFeedBird from "../QuizFeedBird.vue";

describe("QuizFeedBird · 情绪与落点", () => {
  it("渲染吉祥物图与情绪类", () => {
    const w = mount(QuizFeedBird, { props: { mood: "idle" } });
    expect(w.find(".feed-bird__img").attributes("src")).toBe("/mascot/toucan.webp");
    expect(w.find(".feed-bird").classes()).toContain("feed-bird--idle");
  });

  it("情绪切换：yum/oops 类跟随 props", async () => {
    const w = mount(QuizFeedBird, { props: { mood: "idle" } });
    await w.setProps({ mood: "yum" });
    expect(w.find(".feed-bird").classes()).toContain("feed-bird--yum");
    await w.setProps({ mood: "oops" });
    expect(w.find(".feed-bird").classes()).toContain("feed-bird--oops");
  });

  it("根元素存在（父组件飞行落点）", () => {
    const w = mount(QuizFeedBird, { props: { mood: "idle" } });
    // defineExpose 的 ref 走模板引用消费（集成在浏览器走查验证）
    expect(w.find(".feed-bird").element).toBeInstanceOf(HTMLElement);
  });
});
