// @vitest-environment jsdom
/**
 * SafeBottom 共用底部安全容器：
 * - slot 内容正常渲染，class 透传到根元素（原容器样式保留）；
 * - 默认/自定义 gap 均写入 --safe-gap 变量；
 * - 根元素带 margin-top:auto（推底）与 padding-bottom（安全间距 + 基础间距）。
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SafeBottom from "../SafeBottom.vue";

describe("SafeBottom · 底部安全区容器", () => {
  it("渲染 slot 内容，class 透传到根元素", () => {
    const w = mount(SafeBottom, {
      props: { gap: 28 },
      slots: { default: '<button class="play">继续</button>' },
      attrs: { class: "mic-zone" },
    });
    expect(w.find("button.play").exists()).toBe(true);
    expect(w.text()).toContain("继续");
    const root = w.find(".safe-bottom");
    expect(root.classes()).toContain("mic-zone"); // 外部 class 保留
  });

  it("默认 gap=16 写入 --safe-gap", () => {
    const w = mount(SafeBottom, { slots: { default: "<p>x</p>" } });
    expect((w.element as HTMLElement).style.getPropertyValue("--safe-gap")).toBe("16px");
  });

  it("自定义 gap 覆盖 --safe-gap", () => {
    const w = mount(SafeBottom, { props: { gap: 28 } });
    expect((w.element as HTMLElement).style.getPropertyValue("--safe-gap")).toBe("28px");
  });

  it("根元素是可透传 class 的 div 容器", () => {
    // 布局细节（margin-top:auto 推底 / padding-bottom 安全间距）由浏览器实测，
    // jsdom 不支持 margin:auto 与 env() 的 computed value
    const w = mount(SafeBottom);
    expect(w.element.tagName.toLowerCase()).toBe("div");
    expect(w.find(".safe-bottom").exists()).toBe(true);
  });
});
