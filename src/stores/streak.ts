/**
 * 连击火焰（streak）store——每日目标 + 连续学习天数。
 *
 * - 多邻国式留存机制：孩子每天完成 ≥1 个玩法即达成今日目标，
 *   连续天数（🔥）是比星星/贝壳更"上瘾"的坚持信号。
 * - 存储独立键 kids-english-streak-v1，与进度/奖励解耦；不依赖任何外部时钟，
 *   只按本地日历日判断"今天/昨天"，跨时区安全。
 * - 达成庆祝是 UI 副作用：store 只记账，组件 watch todayDone 变化自行庆祝。
 */
import { defineStore } from "pinia";
import { computed, ref } from "vue";

export interface StreakState {
  /** 最近一次活跃的本地日期 YYYY-MM-DD */
  last: string | null;
  /** 连续活跃天数（今天活跃过则含今天） */
  streak: number;
}

const KEY = "kids-english-streak-v1";

function load(): StreakState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && typeof raw === "object" && typeof raw.last === "string") {
      return { last: raw.last, streak: Number(raw.streak) || 0 };
    }
  } catch {
    /* 数据损坏按新号处理 */
  }
  return { last: null, streak: 0 };
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
  const saved = load();
  /** 最近活跃日 */
  const last = ref<string | null>(saved.last);
  /** 连续活跃天数 */
  const streak = ref<number>(saved.streak);

  /** 今天是否已达成目标（派生） */
  const todayDone = computed(() => last.value === localDate());

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ last: last.value, streak: streak.value }));
    } catch {
      /* 无痕模式写入失败，忽略 */
    }
  }

  /**
   * 完成一次玩法后调用（幂等：今天已达标则不重复累计）。
   * @returns 是否"今天第一次达标"（组件据此播庆祝）
   */
  function markActivity(): boolean {
    const today = localDate();
    const firstToday = last.value !== today;
    if (firstToday) {
      // 昨天活跃 → 续上连击；否则断档重来
      streak.value = last.value === yesterday() ? streak.value + 1 : 1;
      last.value = today;
      save();
    }
    return firstToday;
  }

  function reset() {
    last.value = null;
    streak.value = 0;
    localStorage.removeItem(KEY);
  }

  return { last, streak, todayDone, markActivity, reset };
});
