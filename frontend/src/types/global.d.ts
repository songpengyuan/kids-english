/**
 * 控制台自检句柄的类型（main.ts / errors.ts 挂到 window 上，浏览器控制台直接调用）。
 */
declare global {
  interface Window {
    /** __kidsHaptics()：触觉反馈通路自检 */
    __kidsHaptics?: () => Record<string, unknown>;
    /** __kidsErrors()：最近 20 条本地错误环形缓冲 */
    __kidsErrors?: () => unknown[];
    /** __kidsTelemetry()：埋点待上报队列（ADR-004） */
    __kidsTelemetry?: () => unknown[];
  }
}

export {};
