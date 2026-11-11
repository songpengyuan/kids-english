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

describe("progress store · 写入口径（星级/玩法标记）", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T09:00:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("setGameStars：低星不得覆盖高星（多设备/重玩的合并口径）", () => {
    const p = useProgressStore();
    p.setGameStars("l11", "learn", 3);
    p.setGameStars("l11", "learn", 1); // 重玩得低星
    expect(p.progress.l11.learn).toBe(3);
  });

  it("setGameStars：completed 并集去重，同一玩法不重复入列", () => {
    const p = useProgressStore();
    p.setGameStars("l11", "learn", 2);
    p.setGameStars("l11", "learn", 3);
    expect((p.progress.l11.completed ?? []).filter((x) => x === "learn")).toHaveLength(1);
    // 新玩法正常追加
    p.setGameStars("l11", "match", 1);
    expect(p.progress.l11.completed ?? []).toEqual(["learn", "match"]);
  });

  it("markSong / markChest：幂等标记（completed 只记一次）", () => {
    const p = useProgressStore();
    p.markSong("l11");
    p.markSong("l11");
    expect(p.progress.l11.song).toBe(1);
    expect((p.progress.l11.completed ?? []).filter((x) => x === "song")).toHaveLength(1);
    p.markChest("l11");
    p.markChest("l11");
    expect((p.progress.l11.completed ?? []).filter((x) => x === "chest")).toHaveLength(1);
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

  it("磨耳朵计入学习总时长：播放累加 listenSec 与 durationSec，但不计玩法数", () => {
    const p = useProgressStore();
    p.addDailyActivity(60); // 玩法操作 60s + 1 次玩法
    p.addListenActivity(300); // 磨耳朵（音频/视频）300s
    p.addListenActivity(120); // 再磨 120s
    expect(p.todayStats.durationSec).toBe(480); // 学习总时长 = 操作 60 + 播放 420
    expect(p.todayStats.listenSec).toBe(420); // 磨耳朵 = 播放部分（⊆ 学习）
    expect(p.todayStats.activities).toBe(1); // 播放不计玩法数
    // 每日快照同步含 listenSec
    expect(p.recentDays()[0].listenSec).toBe(420);
  });

  it("磨耳朵时长跨天自动重置", () => {
    const p = useProgressStore();
    p.addListenActivity(300);
    vi.setSystemTime(new Date("2026-09-28T09:00:00"));
    expect(p.todayStats.listenSec).toBe(0); // 新一天从 0 开始
    p.addListenActivity(90);
    expect(p.todayStats.listenSec).toBe(90);
    // 昨天记录仍保留在快照里
    const days = p.recentDays();
    expect(days[0].date).toBe("2026-09-27");
    expect(days[0].listenSec).toBe(300);
  });

  it("开口尝试次数单独累加：不并入时长/玩法数，跨天重置，且不写趋势快照", () => {
    const p = useProgressStore();
    expect(p.todayStats.speakAttempts ?? 0).toBe(0);
    p.addDailyActivity(60);
    p.addSpeakAttempt();
    p.addSpeakAttempt();
    p.addSpeakAttempt();
    expect(p.todayStats.speakAttempts).toBe(3);
    // 不污染既有口径
    expect(p.todayStats.durationSec).toBe(60);
    expect(p.todayStats.activities).toBe(1);
    // 开口次数不进入家长趋势曲线快照
    expect("speakAttempts" in p.recentDays()[0]).toBe(false);
    // 跨天自动重置：新一天第一次开口从 0 重新累计，不继承昨天的 3
    vi.setSystemTime(new Date("2026-09-28T09:00:00"));
    p.addSpeakAttempt();
    expect(p.todayStats.speakAttempts).toBe(1);
  });

  it("旧本地数据缺少 speakAttempts 字段时按 0 读取，补写不报错", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ _daily: { date: "2026-09-27", durationSec: 10, activities: 1, listenSec: 0 } })
    );
    setActivePinia(createPinia());
    const p = useProgressStore();
    expect(p.todayStats.speakAttempts ?? 0).toBe(0);
    p.addSpeakAttempt();
    expect(p.todayStats.speakAttempts).toBe(1);
  });
});

describe("progress store · 星数统计（新增玩法）", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T09:00:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("memory / order 的星数也计入 lessonStars 与 totalStars（不再手写玩法 key 列表）", () => {
    const p = useProgressStore();
    p.setGameStars("l10", "memory", 2);
    p.setGameStars("l10", "order", 3);
    expect(p.lessonStars("l10")).toBe(5);
    expect(p.totalStars).toBe(5);
  });
});
