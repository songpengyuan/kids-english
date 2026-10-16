// @vitest-environment jsdom
/**
 * 云同步测试：进度拉取合并、防抖上报、未登录不上报（P0 进度上云）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useProgressStore } from "../progress";
import { useAuthStore } from "../auth";
import { setToken } from "../../services/api";

const KEY = "kids-english-progress-v1";

/** 简单 fetch mock：记录调用，按路由返回 */
function mockFetch(routes: Record<string, unknown>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const body = routes[url];
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}

describe("progress store · 云同步", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T09:00:00"));
    // 模拟已登录 + 已选孩子（孩子 id=1）
    setToken("test-token");
    const auth = useAuthStore();
    auth.family = { familyId: 1, familyName: "测试家", email: null, nickname: "测试家", createdAt: null };
    auth.children = [{ id: 1, name: "程程", avatar: null }];
    auth.currentChildId = 1;
    auth.ready = true;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("拉取合并：服务端有本地无 → 补入；本地有 → 保留本地", async () => {
    const { calls } = mockFetch({
      "/api/v1/children/1/progress": {
        ok: true,
        data: {
          l4: { learn: 3, completed: ["learn"], words: { sea: { seen: 2 } } },
          l5: { quiz: 2, completed: ["quiz"], words: {} },
        },
        meta: { _daily: null, _last: "l4", _dailyLog: {} },
      },
    });
    const p = useProgressStore();
    // 本地已有 l4（更新的版本，应保留）
    p.setGameStars("l4", "learn", 2);

    await p.syncFromServer();

    expect(calls.length).toBe(1);
    expect(p.progress.l4.learn).toBe(2); // 本地保留（2 星，服务端是 3 星）
    expect(p.progress.l5.quiz).toBe(2); // 服务端补入
    expect(p.progress._last).toBe("l4"); // 本地无 _last → 补入
    expect(p.cloudState).toBe("done");
  });

  it("进度变更后防抖上报（3s 内合并，携带 data + meta）", async () => {
    const { calls, fn } = mockFetch({
      "/api/v1/children/1/progress": { ok: true },
    });
    const p = useProgressStore();
    p.setGameStars("l4", "learn", 3); // 触发 save → scheduleReport
    p.markSong("l4"); // 第二次变更，应合并到同一批
    expect(fn).not.toHaveBeenCalled(); // 防抖期内不请求

    vi.advanceTimersByTime(3100);
    await vi.runAllTimersAsync();

    const put = calls.find((c) => c.url === "/api/v1/children/1/progress");
    expect(put).toBeTruthy();
    expect(put!.init!.method).toBe("PUT");
    const body = JSON.parse(put!.init!.body as string) as {
      data: Record<string, { learn?: number; song?: number }>;
      meta: Record<string, unknown>;
    };
    expect(body.data.l4.learn).toBe(3);
    expect(body.data.l4.song).toBe(1);
    expect(body.meta).toHaveProperty("_last");
  });

  it("未登录（无 token）→ save 不上报", async () => {
    setToken(null);
    const { fn } = mockFetch({});
    const p = useProgressStore();
    p.setGameStars("l4", "learn", 1);

    vi.advanceTimersByTime(5000);
    await vi.runAllTimersAsync();

    expect(fn).not.toHaveBeenCalled();
    expect(p.cloudState).toBe("idle");
  });

  it("flushReport：立即上报并置 done", async () => {
    const { calls } = mockFetch({
      "/api/v1/children/1/progress": { ok: true },
    });
    const p = useProgressStore();
    p.setGameStars("l4", "learn", 3);

    await p.flushReport();

    const put = calls.find((c) => c.url === "/api/v1/children/1/progress");
    expect(put).toBeTruthy();
    expect(p.cloudState).toBe("done");
    // 清掉了待上报定时器：再推时间也不会有第二次
    vi.advanceTimersByTime(5000);
    await vi.runAllTimersAsync();
    expect(calls.filter((c) => c.url === "/api/v1/children/1/progress").length).toBe(1);
  });
});
