// @vitest-environment jsdom
/**
 * 「添加到桌面」指引弹窗：
 * 这里唯一重要的是**步骤文案对不对**——家长照着做不出来，等于没做引导。
 * 所以按平台逐条断言关键动作词，而不是只测"能渲染"。
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import AddToHomeDialog from "../AddToHomeDialog.vue";
import type { InstallPlatform } from "../../../composables/useAddToHome";

function mountFor(platform: InstallPlatform) {
  return mount(AddToHomeDialog, { props: { platform } });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("AddToHomeDialog", () => {
  it("iOS：三步对应 Safari 的真实操作，并提示必须用 Safari/Chrome", () => {
    const text = mountFor("ios").text();
    expect(text).toContain("分享");
    expect(text).toContain("添加到主屏幕");
    expect(text).toContain("添加");
    expect(text).toContain("Safari 或 Chrome");
  });

  it("微信：先引导「在浏览器打开」，否则后续步骤根本点不到", () => {
    const text = mountFor("wechat").text();
    expect(text).toContain("在浏览器打开");
    expect(text).toContain("Safari 或 Chrome");
    // 微信里没有分享按钮可用，不能把 iOS 的步骤塞给微信用户
    expect(text).not.toContain("点底部「分享」");
  });

  it("Android：走浏览器菜单路径", () => {
    const text = mountFor("android").text();
    expect(text).toContain("添加到主屏幕");
    expect(text).toContain("安装应用");
  });

  it("桌面：地址栏安装图标", () => {
    const text = mountFor("desktop").text();
    expect(text).toContain("地址栏");
    expect(text).toContain("安装");
  });

  it("点「知道了」先播收起动画再通知父组件关闭", async () => {
    vi.useFakeTimers();
    const w = mountFor("ios");
    await w.find(".addhome__ok").trigger("click");
    expect(w.emitted("close")).toBeUndefined();
    vi.advanceTimersByTime(200);
    expect(w.emitted("close")).toHaveLength(1);
  });
});
