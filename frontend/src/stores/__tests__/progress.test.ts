// @vitest-environment jsdom
/**
 * progress store 测试：单词级 SRS（记录→升级/降级→到期队列）、老数据迁移、
 * 掌握度概览、每日快照（家长报告趋势）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useProgressStore } from "../progress";
import { DAY_MS, MASTERED_STAGE } from "../../utils/reviewSchedule";

const KEY = "kids-english-progress-v1";

describe("progress store · 单词 SRS", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T09:00:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("刚答错的词立刻进队列（1 天后到期，当天不再重复打扰）", () => {
    const p = useProgressStore();
    p.recordWord("l4", "boat", { wrong: 1 });
    const w = p.progress.l4.words!.boat;
    expect(w.stage).toBe(0);
    expect(w.dueAt).toBe(Date.now() + DAY_MS);
    // 到期时间是"明天"，所以今天不在队列里
    expect(p.getReviewQueue()).toHaveLength(0);
    // 到了明天就在队列里
    expect(p.getReviewQueue(Date.now() + DAY_MS)).toHaveLength(1);
  });

  it("答对逐级升级：1→3→7→14 天后到掌握并移出队列", () => {
    const p = useProgressStore();
    const id = "l4";
    const wid = "boat";
    p.recordWord(id, wid, { wrong: 1 });
    const intervals = [3, 7, 14]; // 从 stage 0 答对后依次的间隔
    intervals.forEach((days, i) => {
      const now = Date.now();
      p.recordWord(id, wid, { correct: 1 });
      expect(p.progress[id].words![wid].stage).toBe(i + 1);
      expect(p.progress[id].words![wid].dueAt).toBe(now + days * DAY_MS);
    });
    p.recordWord(id, wid, { correct: 1 }); // 第 4 次答对 → 掌握
    expect(p.progress[id].words![wid].stage).toBe(MASTERED_STAGE);
    expect(p.progress[id].words![wid].dueAt).toBe(0);
    expect(p.getReviewQueue(Date.now() + 365 * DAY_MS)).toHaveLength(0);
    expect(p.masterySummary().mastered).toBe(1);
  });

  it("刚学会就答错 → 打回 stage 0", () => {
    const p = useProgressStore();
    p.recordWord("l4", "boat", { correct: 1 });
    expect(p.progress.l4.words!.boat.stage).toBe(1);
    p.recordWord("l4", "boat", { wrong: 1 });
    expect(p.progress.l4.words!.boat.stage).toBe(0);
  });

  it("只在看图学词点读过（seen）不改 SRS 阶段", () => {
    const p = useProgressStore();
    p.recordWord("l4", "boat", { seen: 1 });
    const w = p.progress.l4.words!.boat;
    expect(w.seen).toBe(1);
    expect(w.stage).toBe(0);
    expect(p.getReviewQueue()).toHaveLength(0);
  });

  it("到期队列按到期时间升序（最该练的排前面）", () => {
    const p = useProgressStore();
    p.recordWord("l4", "a", { wrong: 1 }); // 明天到期
    vi.setSystemTime(Date.now() + 2 * DAY_MS);
    p.recordWord("l4", "b", { wrong: 1 }); // 后天到期
    const q = p.getReviewQueue(Date.now() + 3 * DAY_MS);
    expect(q.map((x) => x.wordId)).toEqual(["a", "b"]);
  });
});

describe("progress store · 老数据迁移", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T09:00:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("老的弱词（错≥对）升级后立即到期", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ l4: { words: { boat: { correct: 1, wrong: 2, lastAt: Date.now() - 5 * DAY_MS } } } })
    );
    setActivePinia(createPinia());
    const p = useProgressStore();
    expect(p.progress.l4.words!.boat.stage).toBe(0);
    expect(p.getReviewQueue()).toHaveLength(1);
  });

  it("对得远多于错的 → 迁移为已掌握，不再进队列", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ l4: { words: { boat: { correct: 6, wrong: 1, lastAt: Date.now() } } } })
    );
    setActivePinia(createPinia());
    const p = useProgressStore();
    expect(p.progress.l4.words!.boat.stage).toBe(MASTERED_STAGE);
    expect(p.getReviewQueue(Date.now() + 30 * DAY_MS)).toHaveLength(0);
  });

  it("历史星星与玩法记录不受迁移影响", () => {
    localStorage.setItem(KEY, JSON.stringify({ l4: { learn: 3, quiz: 2, completed: ["learn", "quiz"] } }));
    setActivePinia(createPinia());
    const p = useProgressStore();
    expect(p.progress.l4.learn).toBe(3);
    expect(p.progress.l4.completed).toEqual(["learn", "quiz"]);
    expect(p.progress.l4.words).toEqual({});
  });
});

describe("progress store · 掌握度与每日快照", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T09:00:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("masterySummary 统计 tracked / mastered / due", () => {
    const p = useProgressStore();
    p.recordWord("l4", "a", { wrong: 1 }); // 到期队列（明天）
    p.recordWord("l4", "b", { correct: 4 }); // 掌握
    const s = p.masterySummary(Date.now() + DAY_MS);
    expect(s.tracked).toBe(2);
    expect(s.mastered).toBe(1);
    expect(s.learning).toBe(1);
    expect(s.due).toBe(1);
  });

  it("完成玩法后写入当日快照，recentDays 按日期升序返回", () => {
    const p = useProgressStore();
    p.addDailyActivity(60);
    expect(p.recentDays()[0].date).toBe("2026-09-27");
    expect(p.recentDays()[0].durationSec).toBe(60);
    expect(p.recentDays()[0].activities).toBe(1);
    vi.setSystemTime(new Date("2026-09-28T09:00:00"));
    p.addDailyActivity(30);
    const days = p.recentDays();
    expect(days.map((d) => d.date)).toEqual(["2026-09-27", "2026-09-28"]);
    expect(days[1].mastered).toBe(0);
  });

  it("快照最多保留 30 天", () => {
    const p = useProgressStore();
    for (let i = 0; i < 33; i++) {
      vi.setSystemTime(new Date(2026, 8, 1 + i, 9, 0, 0));
      p.addDailyActivity(10);
    }
    expect(p.recentDays(60)).toHaveLength(30);
  });
});
