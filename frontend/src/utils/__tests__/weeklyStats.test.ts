import { describe, expect, it } from "vitest";
import { toMinutes, weekStartOf, weeklyStats, type DailyLike } from "../weeklyStats";

describe("weekStartOf（周一为一周之始）", () => {
  it("周三归到本周一", () => {
    expect(weekStartOf("2026-10-28")).toBe("2026-10-26"); // 2026-10-28 是周三
  });
  it("周日归到上周一（不是下周一）", () => {
    expect(weekStartOf("2026-11-01")).toBe("2026-10-26"); // 2026-11-01 是周日
  });
  it("周一归到自己", () => {
    expect(weekStartOf("2026-10-26")).toBe("2026-10-26");
  });
  it("跨月跨年正确", () => {
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28"); // 2027-01-01 是周五
  });
});

describe("weeklyStats（每周学习时长周桶）", () => {
  /** 2026-10-25（周日）为基准：本周 = 10-19（周一）~10-25 */
  const NOW = "2026-10-25";
  const days: DailyLike[] = [
    // 本周：玩法 600s + 磨耳朵 300s（duration 900）
    { date: "2026-10-21", durationSec: 900, listenSec: 300, activities: 6 },
    // 本周：纯玩法 600s
    { date: "2026-10-24", durationSec: 600, activities: 4 },
    // 上周：磨耳朵 1200s、玩法 300s
    { date: "2026-10-15", durationSec: 1500, listenSec: 1200, activities: 2 },
    // 远超 4 周窗口：应被忽略（4 周窗口最早只到 09-28 那周）
    { date: "2026-08-30", durationSec: 9999, activities: 99 },
  ];

  it("按周聚合，玩法 = duration - listen，磨耳朵 = listen", () => {
    const weeks = weeklyStats(days, 4, NOW);
    expect(weeks).toHaveLength(4);
    const thisWeek = weeks[3];
    const lastWeek = weeks[2];
    expect(thisWeek.weekStart).toBe("2026-10-19");
    expect(thisWeek.practiceSec).toBe(1200); // 600 + 600
    expect(thisWeek.listenSec).toBe(300);
    expect(thisWeek.activities).toBe(10);
    expect(lastWeek.weekStart).toBe("2026-10-12");
    expect(lastWeek.practiceSec).toBe(300);
    expect(lastWeek.listenSec).toBe(1200);
    // 窗口外（8-30）没混进来：最早一整周为零
    expect(weeks[0].practiceSec).toBe(0);
    expect(weeks[0].activities).toBe(0);
  });

  it("空周保留零桶（家长要看到断档而不是缺行）", () => {
    const weeks = weeklyStats([], 4, NOW);
    expect(weeks).toHaveLength(4);
    expect(weeks.every((w) => w.practiceSec === 0 && w.activities === 0)).toBe(true);
    expect(weeks[3].weekStart).toBe("2026-10-19");
  });

  it("脏数据防御：listenSec > durationSec 时玩法归 0 而非负数", () => {
    const weeks = weeklyStats([{ date: "2026-10-22", durationSec: 100, listenSec: 500, activities: 1 }], 2, NOW);
    expect(weeks[1].practiceSec).toBe(0);
    expect(weeks[1].listenSec).toBe(500);
  });

  it("乱序输入无妨", () => {
    const a = weeklyStats(days, 4, NOW);
    const b = weeklyStats([...days].reverse(), 4, NOW);
    expect(a).toEqual(b);
  });
});

describe("toMinutes", () => {
  it("四舍五入", () => {
    expect(toMinutes(89)).toBe(1);
    expect(toMinutes(90)).toBe(2);
    expect(toMinutes(29)).toBe(0);
  });
});
