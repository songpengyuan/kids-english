import { computed, onMounted, onUnmounted, ref } from "vue";

/**
 * ===== 「添加到桌面」安装引导 =====
 *
 * 为什么要做：家长多半从微信链接进来，路径是「群消息 → 点开 → 找不到了」。
 * 加到桌面后是独立图标、全屏、能离线，是让 PWA 体验接近原生 App 的
 * 唯一低成本手段（见 README 已知边界：不上架商店）。
 *
 * 但三个平台的路径差异极大，不能一套文案走天下：
 *   · iOS Safari —— **没有 beforeinstallprompt**，无法程序化触发，
 *     只能手把手教：分享按钮 → 添加到主屏幕 → 添加；
 *   · Android Chrome —— 有 beforeinstallprompt，可一键弹系统安装框；
 *   · 微信内置浏览器 —— 两个都没有，必须先「在浏览器打开」再走上面任一路径。
 *
 * 已作为独立应用运行（standalone）时视为已安装，入口应当隐藏，不再骚扰。
 */

export type InstallPlatform = "installed" | "wechat" | "ios" | "android" | "desktop";

/** beforeinstallprompt 不是标准事件，TS 里没有内置类型，这里按 Chrome 实际行为声明 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * UA 平台判定（纯函数，便于测试）。
 * 微信必须排在最前：微信 UA 里也带 iPhone / Android 字样，
 * 先判手机会把「微信里打不开」这个最要命的情况吞掉。
 */
export function detectInstallPlatform(userAgent: string): InstallPlatform {
  if (/MicroMessenger/i.test(userAgent)) return "wechat";
  if (/iPad|iPhone|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

/**
 * isStandaloneEnv 的入参：只要能取到 navigator / matchMedia 即可。
 * 不写成 Window，是为了测试里能传最简对象（jsdom 的 Navigator 与
 * 带 standalone 的 Safari 专属字段在类型上并不兼容）。
 */
type StandaloneEnvLike = {
  matchMedia?: (query: string) => { matches: boolean };
  navigator: object;
};

/**
 * 是否已作为独立应用运行（纯函数）。
 * iOS Safari 走 navigator.standalone，其余浏览器走 display-mode 媒体查询。
 */
export function isStandaloneEnv(win: StandaloneEnvLike): boolean {
  if ((win.navigator as { standalone?: boolean }).standalone === true) return true;
  return win.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

/**
 * 安装引导状态机。
 * - `platform`：当前展示形态（含 installed）
 * - `canPrompt`：是否能走系统原生安装框（仅 Android Chrome 等）
 * - `visible`：入口是否该出现（已安装则 false）
 * - `promptInstall()`：触发原生安装；不可用时返回 false，让调用方改走手动指引
 */
export function useAddToHome() {
  const platform = ref<InstallPlatform>("desktop");
  const canPrompt = ref(false);
  let deferred: BeforeInstallPromptEvent | null = null;

  function handleBeforeInstall(e: Event) {
    // 必须 preventDefault，否则 Chrome 可能自己弹一个小提示，
    // 和我们页面里的入口打架
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    canPrompt.value = true;
  }

  function handleInstalled() {
    platform.value = "installed";
    canPrompt.value = false;
    deferred = null;
  }

  onMounted(() => {
    if (typeof window === "undefined") return;
    if (isStandaloneEnv(window)) {
      platform.value = "installed";
      return;
    }
    platform.value = detectInstallPlatform(window.navigator.userAgent);
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
  });

  onUnmounted(() => {
    if (typeof window === "undefined") return;
    window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    window.removeEventListener("appinstalled", handleInstalled);
  });

  async function promptInstall(): Promise<boolean> {
    if (!deferred) return false;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    deferred = null;
    canPrompt.value = false;
    if (choice.outcome === "accepted") {
      platform.value = "installed";
      return true;
    }
    return false;
  }

  const visible = computed(() => platform.value !== "installed");

  return { platform, canPrompt, visible, promptInstall };
}
