/**
 * 轻量错误上报（纯前端静态站，无后端）。
 *
 * 策略：window error / unhandledrejection 摘要写入 localStorage 环形缓冲（最近 20 条），
 * 控制台同时输出。未来接入后端时，只需把 push 里的 localStorage 落盘换成
 * fetch("<endpoint>", { method: "POST", body: JSON.stringify(entry) }) 即可，
 * 调用方（main.js）不用改。
 */
const KEY = "kids-english-errors-v1";
const LIMIT = 20;

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function push(kind, msg, stack) {
  try {
    const entry = {
      t: Date.now(),
      kind,
      msg: String(msg).slice(0, 300),
      stack: String(stack || "").slice(0, 800)
    };
    const list = read();
    list.push(entry);
    localStorage.setItem(KEY, JSON.stringify(list.slice(-LIMIT)));
  } catch {
    /* 无痕模式/存储满：仅控制台可见 */
  }
  // eslint-disable-next-line no-console
  console.error(`[kids-error] ${kind}:`, msg, stack);
}

export function initErrorCapture() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (e) => push("error", e.message, e.error?.stack || ""));
  window.addEventListener("unhandledrejection", (e) => push("promise", String(e.reason), ""));
  // 控制台自检：输入 __kidsErrors() 查看最近错误
  window.__kidsErrors = () => read();
}
