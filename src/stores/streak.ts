/**
 * 连击火焰（streak）store —— **每日目标 + 连续学习天数**。
 *
 * 每日目标（2026-09-27 改版）：**复习 N 个到期词 + 新学 1 关**。
 * - 旧口径"完成 1 个玩法即达标"太松：随手点一分钟就能打卡，坚持信号失真，
 *   也没有引导孩子去做真正有价值的动作（复习到期词 + 推进新内容）。
 * - N 自适应：目标 = min(5, 今天到期词数)，由调用方经 syncReviewGoal() 同步
 *   （传"到期词数 + 今天已复习数"，这样孩子边复习边缩小 due 也不会让目标缩水）；
 *   今天没有到期词时 N = 0，即复习部分自动达标。
 * - "新学 1 关"只认**首次通关**的关卡（重刷不计），避免原地刷关打卡。
 *
 * 存储独立键 kids-english-streak-v1；只按本地日历日判断"今天/昨天"，跨时区安全。
 * 达成庆祝是 UI 副作用：store 只记账，组件 watch todayDone 变化自行庆祝。
 */
import { defineStore } from "pinia";
import { computed, ref } from "vue";

/** 每日复习目标上限（到期词少于它时按实际到期数算） */
export const REVIEW_GOAL_DEFAULT = 5;
/** 每日新学关卡目标 */
export const NEW_LEVEL_GOAL = 1;

export interface DayGoal {
  /** 本地日期 YYYY-MM-DD */
  date: string;
  /** 今天已复习（答对）的到期词数 */
  reviewed: number;
  /** 今天首次通关的关卡数 */
  newLevels: number;
  /** 今天的复习目标词数（0 = 今天没有到期词） */
  reviewGoal: number;
  /** 复习目标是否已按"今天实际到期词数"同步过（未同步前先按默认 5 显示） */
  goalSynced: boolean;
}

export interface StreakState {
  /** 最近一次活跃的本地日期 YYYY-MM-DD */
  last: string | null;
  /** 连续活跃天数（今天活跃过则含今天） */
  streak: number;
  /** 今日目标进度 */
  day: DayGoal;
}

const KEY = "kids-english-streak-v1";

function emptyDay(date: string): DayGoal {
  return { date, reviewed: 0, newLevels: 0, reviewGoal: REVIEW_GOAL_DEFAULT, goalSynced: false };
}

function load(today: string): StreakState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    // 注意：last 允许为 null（只存了当天进度、还没达标过），所以这里只校验是对象
    if (raw && typeof raw === "object") {
      const day: DayGoal =
        raw.day && raw.day.date === today && typeof raw.day === "object"
          ? {
              date: today,
              reviewed: Number(raw.day.reviewed) || 0,
              newLevels: Number(raw.day.newLevels) || 0,
              reviewGoal: Number.isFinite(raw.day.reviewGoal)
                ? Number(raw.day.reviewGoal)
                : REVIEW_GOAL_DEFAULT,
              goalSynced: !!raw.day.goalSynced,
            }
          : emptyDay(today);
      return {
        last: typeof raw.last === "string" ? raw.last : null,
        streak: Number(raw.streak) || 0,
        day,
      };
    }
  } catch {
    /* 数据损坏按新号处理 */
  }
  return { last: null, streak: 0, day: emptyDay(today) };
}

/** 本地日期字符串（不用 toISOString：UTC 会跨时区错一天） */
function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function yesterday(d: Date = new Date()): string {
  const t = new Date(d);
  t.setDate(t.getDate() - 1);
  return localDate(t);
}

export const useStreakStore = defineStore("streak", () => {
  const saved = load(localDate());
  /** 最近活跃日 */
  const last = ref<string | null>(saved.last);
  /** 连续活跃天数 */
  const streak = ref<number>(saved.streak);
  /** 今日目标进度 */
  const day = ref<DayGoal>(saved.day);

  /**
   * 跨天检查：日期变了就把今天的计数清零。
   * 每次记账、以及 refreshDay()（应用重新可见时调用）都会走这里；
   * computed 里**不做**这种带副作用的重置 —— 那会被缓存住，跨天后读到旧值。
   */
  function rollOver(): string {
    const today = localDate();
    if (day.value.date !== today) {
      day.value = emptyDay(today);
      save();
    }
    return today;
  }

  /** 今天是否已达标（纯读，不产生副作用） */
  function goalMet(): boolean {
    const d = day.value;
    return d.date === localDate() && d.reviewed >= d.reviewGoal && d.newLevels >= NEW_LEVEL_GOAL;
  }

  const reviewGoal = computed(() => day.value.reviewGoal);
  const reviewed = computed(() => day.value.reviewed);
  const newLevels = computed(() => day.value.newLevels);
  /** 今日目标是否达成：复习够了 + 新学够 */
  const todayDone = computed(() => goalMet());

  /**
   * 应用重新可见/回到前台时调用：跨天则清零今天的进度，并让依赖它的 UI 重新计算。
   * （computed 依赖不随"日期"变化，必须有人踢一脚，否则跨天后界面会停在昨天。）
   */
  function refreshDay(): boolean {
    const before = day.value.date;
    rollOver();
    return before !== day.value.date;
  }

  function save() {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ last: last.value, streak: streak.value, day: day.value })
      );
    } catch {
      /* 无痕模式写入失败，忽略 */
    }
  }

  /**
   * 同步今日复习目标（调用方知道到期词数时调用）。
   * 传 `dueToday = 当前到期数 + 今天已复习数`：这样"边复习边缩小 due"不会让目标缩水。
   * 目标只增不减（同一天内），避免先复习后目标变小导致"瞬间达标"的错觉。
   */
  function syncReviewGoal(dueToday: number) {
    rollOver();
    const n = Math.max(0, Math.min(REVIEW_GOAL_DEFAULT, Math.floor(dueToday) || 0));
    // 第一次同步：按今天真实到期数（可能小于默认 5）；之后只增不减
    const next = day.value.goalSynced ? Math.max(day.value.reviewGoal, n) : n;
    if (next !== day.value.reviewGoal || !day.value.goalSynced) {
      day.value.reviewGoal = next;
      day.value.goalSynced = true;
      save();
    }
  }

  /** 达标结算：今天第一次达标 → 连击 +1（昨天活跃则续上，否则断档重来） */
  function settle(): boolean {
    const today = rollOver();
    if (!goalMet() || last.value === today) return false;
    streak.value = last.value === yesterday() ? streak.value + 1 : 1;
    last.value = today;
    save();
    return true;
  }

  /**
   * 复习答对一个到期词（幂等：不重复计同一次）。
   * @returns 是否"今天第一次达标"（组件据此播庆祝）
   */
  function markReview(n = 1): boolean {
    rollOver();
    day.value.reviewed += Math.max(0, n);
    save();
    return settle();
  }

  /**
   * 完成一个关卡。
   * @param firstTime 是否该关首次通关（重刷不计入"新学"）
   * @returns 是否"今天第一次达标"
   */
  function markNewLevel(firstTime = true): boolean {
    rollOver();
    if (firstTime) day.value.newLevels += 1;
    save();
    return settle();
  }

  /** 兼容旧调用（自由练习里"玩过即算"的场景）：等价于记一个新关卡 */
  function markActivity(): boolean {
    return markNewLevel(true);
  }

  function reset() {
    last.value = null;
    streak.value = 0;
    day.value = emptyDay(localDate());
    localStorage.removeItem(KEY);
  }

  return {
    last,
    streak,
    day,
    reviewGoal,
    reviewed,
    newLevels,
    todayDone,
    refreshDay,
    syncReviewGoal,
    markReview,
    markNewLevel,
    markActivity,
    reset,
  };
});
