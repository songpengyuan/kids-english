/**
 * API client：/api/v1 统一 fetch 封装。
 *
 * - 同源请求（服务器部署时 Nginx 反代 /api → 后端）；
 * - JWT 存取 localStorage（服务端不可用时保持纯本地模式，不阻塞）；
 * - 401 统一清 token；网络错误抛出 ApiError，调用方决定降级。
 */
export const API_BASE = "/api/v1";

const TOKEN_KEY = "kids-auth-token";
const FAMILY_KEY = "kids-auth-family";

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getFamilyName(): string | null {
  return localStorage.getItem(FAMILY_KEY);
}
export function setFamilyName(name: string | null): void {
  if (name) localStorage.setItem(FAMILY_KEY, name);
  else localStorage.removeItem(FAMILY_KEY);
}

export function hasToken(): boolean {
  return !!getToken();
}

/** 后端可用性（最近一次请求失败后置 false；不影响功能，只决定是否尝试云同步） */
let backendOk = true;
export function setBackendOk(v: boolean): void {
  backendOk = v;
}
export function isBackendOk(): boolean {
  return backendOk;
}

export interface RequestOpts {
  method?: string;
  body?: unknown;
  auth?: boolean; // 默认 true：带 Bearer token
  signal?: AbortSignal;
}

/**
 * 统一请求。返回 {ok:true,...} 响应体；网络失败/非 2xx 抛 ApiError。
 * 401 时自动登出（清 token），并抛错让调用方处理。
 */
export async function request<T = Record<string, unknown>>(
  path: string,
  opts: RequestOpts = {},
): Promise<T> {
  const { method = "GET", body, auth = true, signal } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new ApiError("后端响应超时，已切换本地模式");
    }
    setBackendOk(false);
    throw new ApiError("网络不可用，已切换本地模式");
  }
  setBackendOk(true);

  if (res.status === 401) {
    setToken(null);
    throw new ApiError("登录已过期", 401);
  }
  if (!res.ok) {
    let detail = `请求失败（${res.status}）`;
    try {
      const data = (await res.json()) as { detail?: string };
      if (data.detail) detail = data.detail;
    } catch {
      /* 非 JSON 响应忽略 */
    }
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

/** 带超时的请求（默认 8s）：后端慢/挂时快速降级，不让孩子等。 */
export async function requestWithTimeout<T = Record<string, unknown>>(
  path: string,
  opts: RequestOpts = {},
  timeoutMs = 8000,
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await request<T>(path, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
