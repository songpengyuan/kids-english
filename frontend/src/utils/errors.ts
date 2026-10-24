/**
 * 轻量错误捕获（ADR-004 起已接上后端目的地）。
 *
 * 双层职责：
 *  1. **本地环形缓冲**（最近 20 条，localStorage）：离线自检，控制台 `__kidsErrors()` 可查；
 *  2. **上报后端**：同一条错误推入 telemetry 队列 → 批量 `POST /api/v1/events`
 *     （离线自动留队、下次重试；带 `app_version`，可精确绑到某一次构建）。
 */
import { track } from "../services/telemetry";

const KEY = "kids-english-errors-v1";
const LIMIT = 20;

interface ErrorEntry {
  t: number;
  kind: string;
  msg: string;
  stack: string;
}

function read(): ErrorEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function push(kind: string, msg: unknown, stack: unknown) {
  try {
    const entry: ErrorEntry = {
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
  // 上报后端：让开发者能看见线上故障（此前只存在孩子手机的环形缓冲里）。
  // 上报失败绝不影响业务 —— track 内部只入队，flush 失败静默留队。
  try {
    track("client_error", {
      kind,
      msg: String(msg).slice(0, 300),
      stack: String(stack || "").slice(0, 800),
      url: typeof location !== "undefined" ? location.hash || location.pathname : ""
    });
  } catch {
    /* 静默 */
  }
}

export function initErrorCapture() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (e) => push("error", e.message, e.error?.stack || ""));
  window.addEventListener("unhandledrejection", (e) => push("promise", String(e.reason), ""));
  // 控制台自检：输入 __kidsErrors() 查看最近错误
  window.__kidsErrors = () => read();
}
