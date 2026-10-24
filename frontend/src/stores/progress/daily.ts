/**
 * 今日学情域：_daily（当日累计）+ _dailyLog（30 天快照，家长报告趋势）+ 磨耳朵埋点聚合。
 * 掌握度快照需要 words 域的 masterySummary —— 由门面注入（见 index.ts）。
 */
import { computed, type ComputedRef } from "vue";
import { track } from "../../services/telemetry";
import { today, type DailySnapshot, type DailyStats, type ProgressMap } from "./shared";

export interface DailyStatsDomain {
  todayStats: ComputedRef<DailyStats>;
  dailyLog: ComputedRef<Record<string, DailySnapshot>>;
  addDailyActivity: (durationSec: number) => void;
  addListenActivity: (durationSec: number) => void;
  recentDays: (n?: number) => { date: string; durationSec: number; activities: number; mastered: number; listenSec?: number }[];
}

export function createDailyStats(opts: {
  progress: ProgressMap;
  /** 持久化 + 触发云上报（门面 save()，见 index.ts） */
  save: () => void;
  /** words 域的掌握度概览（每日快照记录当日 mastered） */
  masterySummary: (now?: number) => { mastered: number };
}): DailyStatsDomain {
  const { progress, save, masterySummary } = opts;

  /** 今日统计（非今天则返回空档，展示层按 0 处理） */
  const todayStats = computed<DailyStats>(() => {
    const d = progress._daily;
    if (d && d.date === today()) return d;
    return { date: today(), durationSec: 0, activities: 0, listenSec: 0 };
  });

  /**
   * 完成一次玩法后调用：累计今日学习时长与玩法数（跨天自动重置）。
   * @param durationSec 本次玩法会话时长（秒）
   */
  function addDailyActivity(durationSec: number) {
    const t = today();
    const d = progress._daily;
    const cur = d && d.date === t ? d : { date: t, durationSec: 0, activities: 0, listenSec: 0 };
    cur.durationSec += Math.max(0, Math.round(durationSec));
    cur.activities += 1;
    progress._daily = cur;
    // 每日快照：掌握度趋势的数据点（保留最近 30 天）
    const log = (progress._dailyLog = progress._dailyLog || {});
    log[t] = { durationSec: cur.durationSec, activities: cur.activities, mastered: masterySummary().mastered, listenSec: cur.listenSec ?? 0 };
    const days = Object.keys(log).sort();
    for (const old of days.slice(0, Math.max(0, days.length - 30))) delete log[old];
    save();
  }

  /**
   * 磨耳朵埋点累加器（ADR-004）。
   * player store 与视频计时都是**每 5 秒**调一次 addListenActivity —— 若每次都发事件，
   * 半小时磨耳朵就是 360 条，会瞬间撑爆离线队列（上限 200）并淹没事件表，
   * 而汇总侧要的只是「分钟级」的主动学习时长，粒度不需要这么细。
   * 所以按 LISTEN_REPORT_EVERY_SEC 聚合成一条 listen_play；
   * 不足的余量留在累加器里等下轮补齐（最多损失一个 tick 的精度）。
   */
  let listenAccumSec = 0;
  const LISTEN_REPORT_EVERY_SEC = 60;

  /**
   * 磨耳朵时长累加：播放（音频/视频）期间按真实经过秒数调用。
   * 同时累计 listenSec（磨耳朵）与 durationSec（学习总时长，磨耳朵 ⊆ 学习）；
   * 不增加 activities（玩法数只由玩法结算计入）。
   */
  function addListenActivity(durationSec: number) {
    const t = today();
    const d = progress._daily;
    const cur = d && d.date === t ? d : { date: t, durationSec: 0, activities: 0, listenSec: 0 };
    const sec = Math.max(0, Math.round(durationSec));
    cur.durationSec += sec;
    cur.listenSec = (cur.listenSec ?? 0) + sec;
    progress._daily = cur;
    const log = (progress._dailyLog = progress._dailyLog || {});
    log[t] = { durationSec: cur.durationSec, activities: cur.activities, mastered: masterySummary().mastered, listenSec: cur.listenSec };
    const days = Object.keys(log).sort();
    for (const old of days.slice(0, Math.max(0, days.length - 30))) delete log[old];
    save();
    // 埋点：按 60 秒粒度聚合上报（见 listenAccumSec 的说明）。
    if (sec > 0) {
      listenAccumSec += sec;
      if (listenAccumSec >= LISTEN_REPORT_EVERY_SEC) {
        track("listen_play", { seconds: listenAccumSec });
        listenAccumSec = 0;
      }
    }
  }

  /** 最近 n 天的每日快照（含今天），按日期升序 —— 家长报告趋势用 */
  function recentDays(n = 7): { date: string; durationSec: number; activities: number; mastered: number; listenSec?: number }[] {
    const log = progress._dailyLog || {};
    return Object.keys(log)
      .sort()
      .slice(-n)
      .map((date) => ({ date, ...log[date] }));
  }

  const dailyLog = computed(() => progress._dailyLog || {});

  return { todayStats, dailyLog, addDailyActivity, addListenActivity, recentDays };
}
