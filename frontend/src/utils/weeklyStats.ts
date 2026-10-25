/**
 * 每周学习时长周桶聚合（纯函数）：把 _dailyLog 的逐日快照聚成"周一~周日"自然周。
 *
 * 本地口径（与事件侧的「主动/被动」是两个维度，不要混用，见 PROGRESS-DATA §7）：
 *  · 玩法学习 = durationSec − listenSec（玩法会话时长；磨耳朵也计入 durationSec
 *    但单列，见 stores/progress/daily.ts 的口径注释）
 *  · 磨耳朵 = listenSec
 *  · 事件侧的「主动/被动」= **会话来源**（孩子自己发起 vs 家长开门，由
 *    telemetry.track() 统一注入 active），服务端 daily_stats 按它分桶——那是
 *    北极星的严格口径。本地周视图展示的是玩法/磨耳朵拆分（两者同源、可加总），
 *    真正的主动分钟数从服务端取（家长端接入时）。
 */

export interface DailyLike {
  /** 本地日期 YYYY-MM-DD */
  date: string;
  /** 当日学习总时长（含磨耳朵） */
  durationSec: number;
  /** 当日磨耳朵时长 */
  listenSec?: number;
  /** 当日完成玩法次数 */
  activities: number;
}

export interface WeekBucket {
  /** 周一的日期 YYYY-MM-DD */
  weekStart: string;
  /** 玩法学习秒数（≥0，防脏数据 listenSec > durationSec 出负数） */
  practiceSec: number;
  /** 磨耳朵秒数 */
  listenSec: number;
  activities: number;
}

/** 某日期（YYYY-MM-DD）所在周的周一日期。周一起始（中国日历习惯，与家长口中的"本周"一致）。 */
export function weekStartOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const shift = (dt.getDay() + 6) % 7; // 周日=6，周一=0
  dt.setDate(dt.getDate() - shift);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function emptyWeek(weekStart: string): WeekBucket {
  return { weekStart, practiceSec: 0, listenSec: 0, activities: 0 };
}

/**
 * 聚合最近 n 个周桶（含当前未完的周，升序，最后一桶是本周）。
 * 没有记录的日子按 0 计（空周也保留桶——家长要看到"这周没学"而不是断档）。
 * @param days   逐日快照（progress.recentDays(30)，乱序无妨）
 * @param nowRef 计算基准日 YYYY-MM-DD（默认今天；测试注入用）
 */
export function weeklyStats(days: DailyLike[], weekCount = 4, nowRef?: string): WeekBucket[] {
  const today = nowRef ?? todayStr();
  const thisMonday = weekStartOf(today);
  // 生成 n 个周一（本周往前推）
  const mondays: string[] = [];
  const [y, m, d] = thisMonday.split("-").map(Number);
  for (let i = weekCount - 1; i >= 0; i--) {
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - i * 7);
    mondays.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`);
  }
  const buckets = new Map(mondays.map((w) => [w, emptyWeek(w)]));
  for (const day of days) {
    const bucket = buckets.get(weekStartOf(day.date));
    if (!bucket) continue; // 窗口外的日子（更早的周）忽略
    const listen = day.listenSec ?? 0;
    bucket.practiceSec += Math.max(0, (day.durationSec ?? 0) - listen);
    bucket.listenSec += listen;
    bucket.activities += day.activities ?? 0;
  }
  return mondays.map((w) => buckets.get(w)!);
}

function todayStr(): string {
  const dt = new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** 秒 → 展示分钟（四舍五入；<30s 显示 0） */
export function toMinutes(sec: number): number {
  return Math.round(sec / 60);
}
