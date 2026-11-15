// @vitest-environment jsdom
/**
 * 收藏册派生（useCollection，2026-11-15 收集生长 v1）：
 *  - 课贴纸解锁 = 本课全部玩法关 completed（与 LessonLevelList 宝箱门同口径，
 *    不含 chest），**零新存储**纯派生；
 *  - 部分完成 → 锁定态带 done/total 进度；
 *  - 英雄收集度透传 rewards store。
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { lessons } from "../../data/lessons";
import { lessonLevels } from "../../data/pathLevels";
import { FORM_TOTAL, ALL_FORMS } from "../../data/heroes";
import { useProgressStore } from "../../stores/progress";
import { useRewardsStore } from "../../stores/rewards";
import { useCollection } from "../useCollection";

vi.mock("../../services/speech", () => ({ speak: vi.fn(), speakZh: vi.fn() }));

/** l4 的全部玩法关 key（不含 chest） */
const l4Keys = lessonLevels(lessons.find((l) => l.id === "l4")!)
  .filter((l) => l.actKey !== "chest")
  .map((l) => l.actKey);

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe("useCollection · 课贴纸派生", () => {
  it("没有任何进度：全部锁定，进度 0", () => {
    const c = useCollection();
    expect(c.stickersTotal.value).toBe(lessons.length);
    expect(c.stickersUnlocked.value).toBe(0);
    for (const s of c.stickers.value) {
      expect(s.unlocked).toBe(false);
      expect(s.done).toBe(0);
      expect(s.total).toBeGreaterThan(0);
    }
  });

  it("l4 全部玩法关 completed → 贴纸解锁（chest 不参与计数）", () => {
    const progress = useProgressStore();
    // 故意把 chest 也塞进 completed：贴纸口径只数玩法关，多一个 chest 不影响
    progress.progress["l4"] = { completed: [...l4Keys, "chest"] };
    const c = useCollection();
    const l4 = c.stickers.value.find((s) => s.lesson.id === "l4")!;
    expect(l4.unlocked).toBe(true);
    expect(l4.done).toBe(l4Keys.length);
    expect(c.stickersUnlocked.value).toBe(1);
  });

  it("差一枚没完成 → 锁定态带 done/total 进度", () => {
    const progress = useProgressStore();
    progress.progress["l4"] = { completed: l4Keys.slice(0, -1) };
    const c = useCollection();
    const l4 = c.stickers.value.find((s) => s.lesson.id === "l4")!;
    expect(l4.unlocked).toBe(false);
    expect(l4.done).toBe(l4Keys.length - 1);
    expect(l4.done).toBe(l4.total - 1);
  });
});

describe("useCollection · 英雄收集度透传", () => {
  it("rewards store 掉一个形态 → ownedCount 跟着涨", () => {
    const rewards = useRewardsStore();
    const c = useCollection();
    expect(c.heroesOwned.value).toBe(0);
    expect(c.heroesTotal).toBe(FORM_TOTAL);
    expect(c.heroesPct.value).toBe(0);
    rewards.grant({ shells: 0, formId: ALL_FORMS[0].id, isNew: true });
    expect(c.heroesOwned.value).toBe(1);
    expect(c.heroesPct.value).toBe(Math.round((1 / FORM_TOTAL) * 100));
  });
});
