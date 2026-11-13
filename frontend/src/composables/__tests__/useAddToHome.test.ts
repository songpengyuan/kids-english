// @vitest-environment jsdom
/**
 * 「添加到桌面」引导：
 *  - detectInstallPlatform 是纯函数，但**判定顺序会直接决定家长看到的步骤对不对**
 *    （微信 UA 里同时含 iPhone 字样，先判手机就会把最要命的"微信里装不了"吞掉），
 *    所以用真实 UA 字符串逐条锁住。
 *  - isStandaloneEnv 决定入口是否隐藏，误判会让已安装的用户反复看到入口。
 *  - useAddToHome 的 beforeinstallprompt 捕获与 appinstalled 收敛用真事件验证。
 */
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { detectInstallPlatform, isStandaloneEnv, useAddToHome } from "../useAddToHome";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneWechat:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x18003131) NetType/WIFI Language/zh_CN",
  androidWechat:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.49.2560(0x28003133) WeChat/arm64",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  ipadSafari:
    "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
};

describe("detectInstallPlatform", () => {
  it("微信内置浏览器优先于手机判定（否则家长会拿到 iOS 步骤却点不到分享）", () => {
    expect(detectInstallPlatform(UA.iphoneWechat)).toBe("wechat");
    expect(detectInstallPlatform(UA.androidWechat)).toBe("wechat");
  });

  it("iPhone / iPad 走 Safari 手动指引", () => {
    expect(detectInstallPlatform(UA.iphoneSafari)).toBe("ios");
    expect(detectInstallPlatform(UA.ipadSafari)).toBe("ios");
  });

  it("Android 走浏览器菜单路径（有 beforeinstallprompt 时另走原生弹窗）", () => {
    expect(detectInstallPlatform(UA.androidChrome)).toBe("android");
  });

  it("桌面浏览器不是移动端", () => {
    expect(detectInstallPlatform(UA.macChrome)).toBe("desktop");
    expect(detectInstallPlatform(UA.windowsEdge)).toBe("desktop");
  });
});

describe("isStandaloneEnv", () => {
  it("iOS Safari 的 navigator.standalone=true 视为已安装", () => {
    const win = {
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: true },
    };
    expect(isStandaloneEnv(win)).toBe(true);
  });

  it("display-mode: standalone 视为已安装（Android / 桌面 Chrome）", () => {
    const win = {
      matchMedia: (q: string) => ({ matches: q === "(display-mode: standalone)" }),
      navigator: {},
    };
    expect(isStandaloneEnv(win)).toBe(true);
  });

  it("普通浏览器标签页未安装", () => {
    const win = { matchMedia: () => ({ matches: false }), navigator: {} };
    expect(isStandaloneEnv(win)).toBe(false);
  });

  it("环境没有 matchMedia 时不抛错，按未安装处理", () => {
    expect(isStandaloneEnv({ navigator: {} })).toBe(false);
  });
});

/** 把 composable 挂进一个最小组件，才能触发 onMounted 的事件注册 */
function mountAddToHome() {
  let api!: ReturnType<typeof useAddToHome>;
  const Comp = defineComponent({
    setup() {
      api = useAddToHome();
      return () => h("div");
    },
  });
  const wrapper = mount(Comp);
  return { api, wrapper };
}

describe("useAddToHome", () => {
  it("未安装时入口可见；收到 beforeinstallprompt 后可走原生安装并收敛为已安装", async () => {
    const { api, wrapper } = mountAddToHome();
    await nextTick();

    expect(api.visible.value).toBe(true);
    expect(api.canPrompt.value).toBe(false);

    const ev = new Event("beforeinstallprompt") as Event & {
      prompt?: () => Promise<void>;
      userChoice?: Promise<{ outcome: "accepted" | "dismissed" }>;
    };
    ev.prompt = vi.fn().mockResolvedValue(undefined);
    ev.userChoice = Promise.resolve({ outcome: "accepted" as const });
    window.dispatchEvent(ev);
    await nextTick();

    expect(api.canPrompt.value).toBe(true);
    expect(await api.promptInstall()).toBe(true);
    expect(api.visible.value).toBe(false);

    wrapper.unmount();
  });

  it("没有 beforeinstallprompt 时 promptInstall 返回 false，交给手动指引", async () => {
    const { api, wrapper } = mountAddToHome();
    await nextTick();
    expect(await api.promptInstall()).toBe(false);
    wrapper.unmount();
  });

  it("appinstalled 事件后入口隐藏", async () => {
    const { api, wrapper } = mountAddToHome();
    await nextTick();
    expect(api.visible.value).toBe(true);

    window.dispatchEvent(new Event("appinstalled"));
    await nextTick();

    expect(api.visible.value).toBe(false);
    wrapper.unmount();
  });
});
