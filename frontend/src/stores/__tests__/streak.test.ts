// @vitest-environment jsdom
/**
 * streak store 测试（每日目标改版后）：
 * 目标是"复习 N 个到期词 + 新学 1 关"，测试覆盖目标自适应、达标判定、
 * 连击续/断、幂等、重刷不计新学、跨天归零、持久化读回与损坏数据。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { REVIEW_GOAL_DEFAULT, useStreakStore } from "../streak";

const KEY = "kids-english-streak-v1";

/** 默认目标 5 词 + 1 关：复习完 + 新学一关即达标 */
function completeGoal(s: ReturnType<typeof useStreakStore>, dueToday = REVIEW_GOAL_DEFAULT) {
  s.syncReviewGoal(dueToday);
  s.markReview(Math.min(REVIEW_GOAL_DEFAULT, dueToday));
  return s.markNewLevel(true);
}

describe("streak store", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T10:00:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("默认目标：复习 5 词 + 新学 1 关", () => {
    const s = useStreakStore();
    expect(s.reviewGoal).toBe(REVIEW_GOAL_DEFAULT);
    expect(s.reviewed).toBe(0);
    expect(s.newLevels).toBe(0);
    expect(s.todayDone).toBe(false);
  });

  it("只完成一关不算达标（复习部分没做）", () => {
    const s = useStreakStore();
    expect(s.markNewLevel(true)).toBe(false);
    expect(s.todayDone).toBe(false);
    expect(s.streak).toBe(0);
  });

  it("复习满 N 词 + 新学 1 关 → 达标、连击 1", () => {
    const s = useStreakStore();
    s.syncReviewGoal(5);
    s.markReview(4);
    expect(s.todayDone).toBe(false);
    expect(s.markReview(1)).toBe(false); // 复习够了但还没新学
    expect(s.markNewLevel(true)).toBe(true); // 这一下才达标
    expect(s.todayDone).toBe(true);
    expect(s.streak).toBe(1);
  });

  it("到期词不足 5 个 → 目标按实际到期数缩小", () => {
    const s = useStreakStore();
    s.syncReviewGoal(2);
    expect(s.reviewGoal).toBe(2);
    s.markReview(2);
    s.markNewLevel(true);
    expect(s.todayDone).toBe(true);
  });

  it("今天没有到期词 → 复习目标为 0，新学一关即达标", () => {
    const s = useStreakStore();
    s.syncReviewGoal(0);
    expect(s.reviewGoal).toBe(0);
    expect(s.markNewLevel(true)).toBe(true);
    expect(s.todayDone).toBe(true);
  });

  it("目标只增不减：复习中途 due 变少也不会缩水", () => {
    const s = useStreakStore();
    s.syncReviewGoal(5);
    s.markReview(5);
    s.syncReviewGoal(2); // 复习完 3 个后 due 只剩 2
    expect(s.reviewGoal).toBe(5);
  });

  it("重刷旧关卡不计入新学", () => {
    const s = useStreakStore();
    s.syncReviewGoal(0);
    s.markNewLevel(false);
    expect(s.newLevels).toBe(0);
    expect(s.todayDone).toBe(false);
  });

  it("同一天重复达标 → 连击不重复累计", () => {
    const s = useStreakStore();
    expect(completeGoal(s)).toBe(true);
    expect(s.streak).toBe(1);
    expect(s.markNewLevel(true)).toBe(false);
    expect(s.streak).toBe(1);
  });

  it("昨天达标 + 今天达标 → 连击 +1", () => {
    const s = useStreakStore();
    completeGoal(s);
    vi.setSystemTime(new Date("2026-09-28T09:00:00"));
    s.refreshDay(); // 应用回到前台时的跨天检查（computed 不随日期自动失效）
    expect(s.todayDone).toBe(false); // 新的一天，进度归零
    expect(completeGoal(s)).toBe(true);
    expect(s.streak).toBe(2);
  });

  it("隔两天（断档）→ 连击重置为 1", () => {
    const s = useStreakStore();
    completeGoal(s);
    vi.setSystemTime(new Date("2026-09-29T09:00:00"));
    expect(completeGoal(s)).toBe(true);
    expect(s.streak).toBe(1);
  });

  it("从 localStorage 读回当天进度（模拟应用重启）", () => {
    const s = useStreakStore();
    s.syncReviewGoal(3);
    s.markReview(2);
    setActivePinia(createPinia());
    const s2 = useStreakStore();
    expect(s2.reviewed).toBe(2);
    expect(s2.reviewGoal).toBe(3);
    expect(s2.todayDone).toBe(false);
  });

  it("损坏数据按新号处理，不崩溃", () => {
    localStorage.setItem(KEY, "{oops");
    const s = useStreakStore();
    expect(s.streak).toBe(0);
    expect(s.reviewed).toBe(0);
  });

  /* ---------- 逐日打卡历史（日历数据源） ---------- */

  it("达标当天写入历史：done=true + 当天明细", () => {
    const s = useStreakStore();
    s.syncReviewGoal(2);
    s.markReview(2);
    s.markNewLevel(true);
    const h = s.history["2026-09-27"];
    expect(h).toBeDefined();
    expect(h.done).toBe(true);
    expect(h.reviewed).toBe(2);
    expect(h.newLevels).toBe(1);
  });

  it("未达标只记进度、done=false（今天进行中可见）", () => {
    const s = useStreakStore();
    s.syncReviewGoal(5);
    s.markReview(2); // 只复习了一半
    const h = s.history["2026-09-27"];
    expect(h).toBeDefined();
    expect(h.done).toBe(false);
    expect(h.reviewed).toBe(2);
    expect(h.newLevels).toBe(0);
  });

  it("跨天后：历史保留，新的一天重新记录", () => {
    const s = useStreakStore();
    completeGoal(s);
    vi.setSystemTime(new Date("2026-09-28T09:00:00"));
    s.refreshDay();
    expect(s.history["2026-09-27"].done).toBe(true); // 昨天保留
    s.syncReviewGoal(0);
    s.markNewLevel(true); // 今天达标
    expect(s.history["2026-09-28"].done).toBe(true);
    expect(Object.keys(s.history)).toEqual(["2026-09-27", "2026-09-28"]);
  });

  it("历史随 localStorage 持久化：重启后读回", () => {
    const s = useStreakStore();
    completeGoal(s);
    setActivePinia(createPinia());
    const s2 = useStreakStore();
    expect(s2.history["2026-09-27"]).toEqual({
      date: "2026-09-27",
      reviewed: REVIEW_GOAL_DEFAULT,
      newLevels: 1,
      done: true,
    });
  });

  it("旧版本数据没有 history → 兼容为空对象，不崩溃", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ last: "2026-09-26", streak: 3, day: { date: "2026-09-27", reviewed: 0, newLevels: 0, reviewGoal: 5, goalSynced: false } })
    );
    const s = useStreakStore();
    expect(s.history).toEqual({});
    expect(s.streak).toBe(3);
  });
});
