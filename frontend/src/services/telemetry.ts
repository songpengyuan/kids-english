/**
 * 埋点与错误上报（ADR-004）。
 *
 * 通道：客户端事件 → 本地队列（离线缓冲）→ 批量 `POST /api/v1/events`。
 *
 * 设计要点：
 *  - **离线优先**：先入本地队列，能上网再 flush；失败留队下次重试
 *    （与 progress 的「失败静默重试」同款策略）—— 绝不阻塞孩子。
 *  - **幂等**：每条事件带 `client_event_id`，服务端按它去重，重试不会产生重复行。
 *  - **版本可绑**：`app_version` 取构建期注入的 `__BUILD_ID__`，于是线上错误能精确
 *    对应到某一次构建 —— 补上「白屏了但不知道是哪个版本」这个缺口。
 *  - **不采集**：录音内容、孩子姓名、对话文本、精确地理位置（ADR-004 §4）。
 */
import { API_BASE, getToken } from "./api";

declare const __BUILD_ID__: string;

const QUEUE_KEY = "kids-telemetry-queue-v1";
const MAX_QUEUE = 200; // 离线队列上限（超出丢最旧，避免存储无限增长）
const BATCH = 50; // 与服务端单次上限一致

export interface TelemetryEvent {
  client_event_id: string;
  type: string;
  child_id?: number | null;
  payload?: Record<string, unknown>;
  client_ts?: string;
  app_version?: string;
}

/** 构建版本（vite define 注入）；dev 或未注入时退化为 "dev" */
export const APP_VERSION: string = (() => {
  try {
    return String(__BUILD_ID__);
  } catch {
    return "dev";
  }
})();

function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readQueue(): TelemetryEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as TelemetryEvent[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(list: TelemetryEvent[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-MAX_QUEUE)));
  } catch {
    /* 无痕模式 / 存储满：仅内存队列有效 */
  }
}

let queue: TelemetryEvent[] = readQueue();

/** 会话上下文：`active` = 本会话是否「主动学习」（由孩子自己发起）。App 启动时设置。 */
let sessionContext: { active: boolean; childId: number | null } = { active: true, childId: null };

export function setSessionContext(ctx: Partial<{ active: boolean; childId: number | null }>): void {
  sessionContext = { ...sessionContext, ...ctx };
}

/** 记录一条事件（同步入队，必要时异步 flush）。
 *
 * `active`（是否「主动学习」）在这里统一注入 —— 口径见 `docs/PROGRESS-DATA.md §7.2`：
 * 它由**会话来源**决定（孩子自己发起 vs 家长开门进来），与具体玩法无关。
 * 放在这个单点，是为了避免每个调用点各自判断、最后口径分裂
 * （汇总侧只认 `payload.active`，错一处就静默少算时长）。
 * 调用方显式传了则以调用方为准。
 */
export function track(
  type: string,
  payload: Record<string, unknown> = {},
  childId?: number | null,
): void {
  queue.push({
    client_event_id: uuid(),
    type,
    child_id: childId ?? sessionContext.childId,
    payload: "active" in payload ? payload : { ...payload, active: sessionContext.active },
    client_ts: new Date().toISOString(),
    app_version: APP_VERSION,
  });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  writeQueue(queue);
  if (queue.length >= BATCH) void flush();
}

let flushing = false;

/** 上报队列。未登录 / 网络不可用 / 非 2xx 都静默留队（下次再试）。 */
export async function flush(): Promise<void> {
  if (flushing || !queue.length) return;
  const token = getToken();
  if (!token) return; // 事件必须归属家庭；未登录不发
  flushing = true;
  const batch = queue.slice(0, BATCH);
  try {
    const res = await fetch(`${API_BASE}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ events: batch }),
    });
    if (res.ok) {
      // 只移除这批（期间可能有新事件入队）
      const sent = new Set(batch.map((e) => e.client_event_id));
      queue = queue.filter((e) => !sent.has(e.client_event_id));
      writeQueue(queue);
    }
  } catch {
    /* 网络不可用：留队 */
  } finally {
    flushing = false;
  }
}

/** 控制台自检：`__kidsTelemetry()` 查看待发队列 */
export function pendingEvents(): TelemetryEvent[] {
  return queue;
}
