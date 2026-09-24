/**
 * ===== PWA 注册与「及时更新」策略 =====
 *
 * 更新体验设计成三段：
 *  1. 下次打开：SW 对页面导航走 network-first，直接拿到最新版（见 src/sw.js）。
 *  2. 本次会话内上线了新版本：SW 安装后 skipWaiting + clients.claim 立即接管，
 *     页面收到 controllerchange —— 但**不打断孩子正在玩的玩法**：
 *     在首页 → 立刻静默刷新；在课时里 → 挂起，等回到首页（back()）再刷新。
 *  3. 长时间停留的页面：切回标签页/应用时主动 reg.update() 查一次新版本。
 *
 * dev 模式默认不注册（避免 HMR 被 SW 干扰），需要手动测时加 ?sw=1；
 * dev 的 SW 不缓存 /src/*，只有壳和 lessons 媒体，安全。
 */

let isIdle = () => true; // App.vue 注入：是否处于可安全刷新的状态（首页、无进行中玩法）
let pendingUpdate = false;
let hadController =
  typeof navigator !== "undefined" && "serviceWorker" in navigator
    ? !!navigator.serviceWorker.controller
    : false;

export function initPWA(idleCheck = () => true) {
  isIdle = idleCheck;
  if (!("serviceWorker" in navigator)) return;
  const isDevTest = new URLSearchParams(location.search).has("sw");
  if (!import.meta.env.PROD && !isDevTest) return;

  const swUrl = import.meta.env.BASE_URL + "sw.js";
  const register = () => {
    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => {
        // 切回应用时主动查新（长时间不关的标签页也能及时升级）
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            reg.update().catch(() => {});
            applyUpdateIfIdle();
          }
        });
        // 新版本接管成功 → 视为一次更新（首次安装不算）
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (!hadController) {
            hadController = true;
            return;
          }
          pendingUpdate = true;
          applyUpdateIfIdle();
        });
      })
      .catch(() => {
        /* SW 不可用（隐私模式等）就当普通网页用，不影响功能 */
      });
  };
  // load 事件前就初始化的情况（Vue 挂载早于 window.load）直接注册
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register);
}

/** 新版本已就绪；只有回到"安全时机"才真正刷新 */
export function applyUpdateIfIdle() {
  if (!pendingUpdate || !isIdle()) return;
  pendingUpdate = false;
  location.reload();
}
