// @vitest-environment jsdom
/**
 * streak store 测试：跨天连击、幂等、断档重置、持久化读回。
 * 用 fake timers 控制系统时钟（localDate 按本地日历日，跨时区安全）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useStreakStore } from "../streak";

const KEY = "kids-english-streak-v1";

describe("streak store", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T10:00:00")); // 本地周六
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("首次活跃 → 连击 1、今日已达标", () => {
    const s = useStreakStore();
    expect(s.markActivity()).toBe(true);
    expect(s.streak).toBe(1);
    expect(s.todayDone).toBe(true);
  });

  it("同一天重复达标 → 幂等，连击不重复累计", () => {
    const s = useStreakStore();
    s.markActivity();
    expect(s.markActivity()).toBe(false);
    expect(s.streak).toBe(1);
  });

  it("昨天活跃 + 今天活跃 → 连击 +1", () => {
    const s = useStreakStore();
    s.markActivity(); // 9-26
    vi.setSystemTime(new Date("2026-09-27T09:00:00"));
    expect(s.todayDone).toBe(false); // 今天还没达标
    expect(s.markActivity()).toBe(true);
    expect(s.streak).toBe(2);
  });

  it("隔两天（断档）→ 连击重置为 1", () => {
    const s = useStreakStore();
    s.markActivity(); // 9-26
    vi.setSystemTime(new Date("2026-09-28T09:00:00"));
    expect(s.markActivity()).toBe(true);
    expect(s.streak).toBe(1);
  });

  it("从 localStorage 读回状态（模拟应用重启）", () => {
    localStorage.setItem(KEY, JSON.stringify({ last: "2026-09-26", streak: 3 }));
    setActivePinia(createPinia());
    const s = useStreakStore();
    expect(s.streak).toBe(3);
    expect(s.todayDone).toBe(true); // 系统时钟仍是 9-26
  });

  it("损坏数据按新号处理，不崩溃", () => {
    localStorage.setItem(KEY, "not-json{{{");
    setActivePinia(createPinia());
    const s = useStreakStore();
    expect(s.streak).toBe(0);
    expect(s.todayDone).toBe(false);
    expect(s.markActivity()).toBe(true);
    expect(s.streak).toBe(1);
  });

  it("reset 清空存储与状态", () => {
    const s = useStreakStore();
    s.markActivity();
    s.reset();
    expect(s.streak).toBe(0);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
