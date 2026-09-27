/**
 * 间隔重复排期：阶段升降、到期判定、老数据折算。
 */
import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  MASTERED_STAGE,
  REVIEW_INTERVALS_DAYS,
  intervalMsFor,
  isDue,
  isMastered,
  onCorrect,
  onWrong,
  seedFromCounts,
} from "../reviewSchedule";

const T0 = new Date("2026-09-27T09:00:00").getTime();

describe("间隔表", () => {
  it("间隔是 1/3/7/14 天，掌握后为 0", () => {
    expect(REVIEW_INTERVALS_DAYS).toEqual([1, 3, 7, 14]);
    expect(intervalMsFor(0)).toBe(1 * DAY_MS);
    expect(intervalMsFor(1)).toBe(3 * DAY_MS);
    expect(intervalMsFor(2)).toBe(7 * DAY_MS);
    expect(intervalMsFor(3)).toBe(14 * DAY_MS);
    expect(intervalMsFor(4)).toBe(0);
  });
});

describe("答对升级", () => {
  it("从 stage 0 连对 4 次 → 掌握，间隔依次 3/7/14 天", () => {
    let s = { stage: 0, dueAt: T0 };
    s = onCorrect(s, T0);
    expect(s.stage).toBe(1);
    expect(s.dueAt).toBe(T0 + 3 * DAY_MS);
    s = onCorrect(s, T0);
    expect(s.dueAt).toBe(T0 + 7 * DAY_MS);
    s = onCorrect(s, T0);
    expect(s.dueAt).toBe(T0 + 14 * DAY_MS);
    s = onCorrect(s, T0);
    expect(s.stage).toBe(MASTERED_STAGE);
    expect(s.dueAt).toBe(0);
    expect(isMastered(s)).toBe(true);
  });

  it("已掌握的再答对仍是掌握（不越界）", () => {
    const s = onCorrect({ stage: MASTERED_STAGE, dueAt: 0 }, T0);
    expect(s.stage).toBe(MASTERED_STAGE);
    expect(s.dueAt).toBe(0);
  });
});

describe("答错降级", () => {
  it("任何阶段答错都打回 stage 0，1 天后到期", () => {
    const s = onWrong({ stage: 3, dueAt: T0 + 99 }, T0);
    expect(s.stage).toBe(0);
    expect(s.dueAt).toBe(T0 + 1 * DAY_MS);
  });
});

describe("到期判定", () => {
  it("dueAt 之前不到期、到点即到期", () => {
    const s = { stage: 1, dueAt: T0 + DAY_MS };
    expect(isDue(s, T0)).toBe(false);
    expect(isDue(s, T0 + DAY_MS - 1)).toBe(false);
    expect(isDue(s, T0 + DAY_MS)).toBe(true);
  });

  it("已掌握的永不到期", () => {
    expect(isDue({ stage: MASTERED_STAGE, dueAt: T0 - DAY_MS }, T0)).toBe(false);
  });
});

describe("老数据折算", () => {
  it("老的弱词（错≥对）→ stage 0 且立即到期", () => {
    const s = seedFromCounts({ correct: 1, wrong: 2, lastAt: T0 - 5 * DAY_MS }, T0);
    expect(s.stage).toBe(0);
    expect(s.dueAt).toBe(T0);
  });

  it("从没错过的词按当前阶段排期", () => {
    const s = seedFromCounts({ correct: 2, wrong: 0, lastAt: T0 }, T0);
    expect(s.stage).toBe(2);
    expect(s.dueAt).toBe(T0 + 7 * DAY_MS);
  });

  it("对得远多于错的 → 直接视为已掌握", () => {
    const s = seedFromCounts({ correct: 6, wrong: 1 }, T0);
    expect(s.stage).toBe(MASTERED_STAGE);
    expect(s.dueAt).toBe(0);
  });
});
