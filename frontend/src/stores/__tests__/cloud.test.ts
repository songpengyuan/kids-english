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

  it("今日时长合并取 max：本地有今日 _daily 小值时，云端更大值必须覆盖（跨设备不丢时长）", async () => {
    const today = "2026-09-27";
    mockFetch({
      "/api/v1/children/1/progress": {
        ok: true,
        data: {},
        meta: {
          _daily: { date: today, durationSec: 180, activities: 3, listenSec: 300 },
          _last: null,
          _dailyLog: {},
        },
      },
    });
    const p = useProgressStore();
    // 本地今天已磨耳朵 60s（设备B 刚打开应用，云端设备A 已累计 300s）
    p.addListenActivity(60);
    p.addDailyActivity(120); // 本地学习 120s

    await p.syncFromServer();

    const d = p.todayStats;
    expect(d.date).toBe(today);
    expect(d.listenSec).toBe(300); // 云端更大值覆盖本地 60
    expect(d.durationSec).toBe(180); // 云端更大值覆盖本地 120
    expect(d.activities).toBe(3);
  });

  it("每日快照逐日取 max：本地旧的当天快照不得盖住云端更大值（日历跨设备一致）", async () => {
    const today = "2026-09-27";
    mockFetch({
      "/api/v1/children/1/progress": {
        ok: true,
        data: {},
        meta: {
          _daily: null,
          _last: null,
          _dailyLog: {
            [today]: { durationSec: 1800, activities: 4, mastered: 12, listenSec: 1500 },
          },
        },
      },
    });
    const p = useProgressStore();
    // 设备 B 本地只磨了 60s；若按"本地覆盖云端"，A 设备的 25 分钟会被永远盖住
    p.addListenActivity(60);

    await p.syncFromServer();

    const snap = p.progress._dailyLog[today];
    expect(snap.listenSec).toBe(1500);
    expect(snap.durationSec).toBe(1800);
    expect(snap.activities).toBe(4);
    expect(snap.mastered).toBe(12);
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

  it("心跳同步 flushIfDirty：有未上报变更才推，推完不再重复请求（无变更零请求）", async () => {
    const { calls } = mockFetch({
      "/api/v1/children/1/progress": { ok: true },
    });
    const p = useProgressStore();

    // 无变更 → 心跳不请求
    await p.flushIfDirty();
    expect(calls.filter((c) => c.url === "/api/v1/children/1/progress").length).toBe(0);

    // 有变更 → 心跳推一次
    p.setGameStars("l4", "learn", 2);
    await p.flushIfDirty();
    expect(calls.filter((c) => c.url === "/api/v1/children/1/progress").length).toBe(1);

    // 已推完（dirty 清除）→ 再次心跳零请求
    await p.flushIfDirty();
    expect(calls.filter((c) => c.url === "/api/v1/children/1/progress").length).toBe(1);
  });
});
