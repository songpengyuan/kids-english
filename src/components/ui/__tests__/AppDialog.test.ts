// @vitest-environment jsdom
/**
 * 通用对话框：点遮罩先播退场动画再 emit close；leaving 期间重复点击不再触发。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import AppDialog from "../AppDialog.vue";

describe("AppDialog", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("点遮罩 → 180ms 后 emit close", async () => {
    const wrapper = mount(AppDialog, {
      props: { ariaLabel: "确认" },
      slots: { default: "<p>内容</p>" },
    });
    expect(wrapper.attributes("role")).toBeUndefined();
    expect(wrapper.find('[role="dialog"]').attributes("aria-label")).toBe("确认");
    await wrapper.find(".app-dialog-mask").trigger("click");
    expect(wrapper.emitted("close")).toBeFalsy(); // 还没到退场结束
    vi.advanceTimersByTime(200);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("退场动画期间重复点击只 emit 一次", async () => {
    const wrapper = mount(AppDialog, { slots: { default: "<p>内容</p>" } });
    const mask = wrapper.find(".app-dialog-mask");
    await mask.trigger("click");
    await mask.trigger("click");
    vi.advanceTimersByTime(300);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("slot 暴露 close()：点卡片里的按钮同样能关", async () => {
    const wrapper = mount(AppDialog, {
      slots: { default: `<template #default="{ close }"><button @click="close">知道了</button></template>` },
    });
    await wrapper.find("button").trigger("click");
    vi.advanceTimersByTime(300);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
