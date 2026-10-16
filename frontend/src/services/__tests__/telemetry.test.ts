// @vitest-environment jsdom
/**
 * 埋点队列与口径测试（ADR-004）。
 *
 * 为什么值得写测试：埋点这类逻辑**错了不会报错**，只会让事后数据静默偏掉。
 * 尤其是 `active`（主动/被动）—— 它决定北极星「每周主动学习分钟数」的分子，
 * 一旦某个调用点漏了这个字段，对应的学习时长就被算成"被动"，
 * 看板上只是数字小一点，没有任何异常信号。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Telemetry = typeof import("../telemetry");

/** 每个用例拿一份全新模块实例（模块级 queue 会从 localStorage 读，需隔离） */
async function fresh(): Promise<Telemetry> {
  vi.resetModules();
  localStorage.clear();
  return (await import("../telemetry")) as Telemetry;
}

describe("telemetry.track 口径", () => {
  beforeEach(() => localStorage.clear());

  it("每条事件都带幂等键、时间戳与构建版本（缺一不可）", async () => {
    const t = await fresh();
    t.track("activity_done", { seconds: 30 });
    const [e] = t.pendingEvents();
    expect(e.client_event_id).toBeTruthy();
    expect(new Date(e.client_ts!).toString()).not.toBe("Invalid Date");
    // 构建版本来自 vite define 的 __BUILD_ID__。注意 vitest 复用同一份 vite.config，
    // 所以**测试环境里它也是有值的**（形如 `mvbkmkib`），不是 "dev" ——
    // "dev" 只在 define 缺失时兜底。因此只断言"非空字符串"，
    // 写死成 "dev" 会随构建方式变化而误报。
    expect(typeof e.app_version).toBe("string");
    expect(e.app_version).toBeTruthy();
  });

  it("未显式指定时，active 由会话上下文注入（默认主动）", async () => {
    const t = await fresh();
    t.track("activity_done", { seconds: 10 });
    expect(t.pendingEvents()[0].payload).toMatchObject({ active: true, seconds: 10 });
  });

  it("家长门禁进入的会话 → 事件标记为被动", async () => {
    const t = await fresh();
    t.setSessionContext({ active: false });
    t.track("activity_done", { seconds: 10 });
    expect(t.pendingEvents()[0].payload).toMatchObject({ active: false });
  });

  it("调用方显式传 active 时以调用方为准（不被上下文覆盖）", async () => {
    const t = await fresh();
    t.setSessionContext({ active: false });
    t.track("listen_play", { seconds: 60, active: true });
    expect(t.pendingEvents()[0].payload).toMatchObject({ active: true });
  });

  it("child_id 显式参数优先于会话上下文（换孩子后事件不能记错人）", async () => {
    const t = await fresh();
    t.setSessionContext({ childId: 1 });
    t.track("activity_done", { seconds: 5 });
    t.track("activity_done", { seconds: 5 }, 2);
    const [a, b] = t.pendingEvents();
    expect(a.child_id).toBe(1);
    expect(b.child_id).toBe(2);
  });

  it("队列超上限时丢最旧、保留最新（不能让存储无限增长）", async () => {
    const t = await fresh();
    for (let i = 0; i < 260; i++) t.track("activity_done", { seconds: 1, i });
    const q = t.pendingEvents();
    expect(q.length).toBe(200);
    expect(q[q.length - 1].payload).toMatchObject({ i: 259 });
  });

  it("未登录时不发请求（事件必须能归属家庭），且事件留在队列里不丢", async () => {
    const t = await fresh();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (let i = 0; i < 50; i++) t.track("activity_done", { seconds: 1 });
    await t.flush();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(t.pendingEvents().length).toBe(50);
    fetchSpy.mockRestore();
  });
});
