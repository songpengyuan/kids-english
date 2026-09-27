<script setup lang="ts">
/**
 * 火焰详情页（/streak）——连击日历：
 * - 顶部状态卡：当前连击天数 + 今日目标达成情况
 * - 日历：按月展示，已打卡（达标）橙底 ✓、今天进行中半色、无记录留空
 * - 打卡口径与火焰徽章一致：完成今日目标（复习够到期词 + 新学 1 关）就算打卡
 * - 历史从本版本开始积累（旧数据只有连续天数，无法回溯，过去日期显示为空）
 */
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useStreakStore } from "../stores/streak";
import HeaderBar from "../components/layout/HeaderBar.vue";
import PathIcon from "../components/PathIcon.vue";
import { CheckCircle2 } from "@lucide/vue";
import { speakZh } from "../utils/speech";

const streak = useStreakStore();
const router = useRouter();

function goBack() {
  router.back();
}

/** 本地日期 YYYY-MM-DD */
function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const today = localDate();
const now = new Date();
/** 当前展示的月份（默认当月，可前后翻月） */
const viewYear = ref(now.getFullYear());
const viewMonth = ref(now.getMonth()); // 0-11

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

const monthTitle = computed(() => `${viewYear.value} 年 ${viewMonth.value + 1} 月`);

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

/** 当月 1 号是星期几（周一 = 0 … 周日 = 6） */
function firstWeekday(y: number, m: number): number {
  return (new Date(y, m, 1).getDay() + 6) % 7;
}

/** 日历格子：null 为占位（月首空白/补足整周），字符串为该日 YYYY-MM-DD */
const cells = computed<(string | null)[]>(() => {
  const total = daysInMonth(viewYear.value, viewMonth.value);
  const lead = firstWeekday(viewYear.value, viewMonth.value);
  const arr: (string | null)[] = [];
  for (let i = 0; i < lead; i++) arr.push(null);
  for (let d = 1; d <= total; d++) {
    arr.push(
      `${viewYear.value}-${String(viewMonth.value + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    );
  }
  while (arr.length % 7 !== 0) arr.push(null);
  return arr;
});

/** 格子状态：done 已打卡 / doing 有进度未达标（今天进行中）/ today / future / none */
function dayState(date: string | null): "done" | "doing" | "today" | "future" | "none" {
  if (!date) return "none";
  if (date > today) return "future";
  const h = streak.history[date];
  if (h && h.done) return "done";
  if (h) return "doing";
  if (date === today) return "today";
  return "none";
}

/** 本月打卡天数（含今天已达标） */
const monthDone = computed(
  () =>
    cells.value.filter(
      (d) => d && d.startsWith(`${viewYear.value}-${String(viewMonth.value + 1).padStart(2, "0")}`) && streak.history[d]?.done
    ).length
);

function prevMonth() {
  if (viewMonth.value === 0) {
    viewYear.value -= 1;
    viewMonth.value = 11;
  } else {
    viewMonth.value -= 1;
  }
}
function nextMonth() {
  if (viewMonth.value === 11) {
    viewYear.value += 1;
    viewMonth.value = 0;
  } else {
    viewMonth.value += 1;
  }
}

/** 点格子读日历（认字/认数）：X月X日，已打卡 / 未打卡 */
function sayDay(date: string) {
  const [, m, d] = date.split("-");
  const st = dayState(date);
  if (st === "done") speakZh(`${Number(m)} 月 ${Number(d)} 日，已打卡`);
  else if (st === "doing") speakZh(`${Number(m)} 月 ${Number(d)} 日，进行中`);
  else if (st === "today") speakZh(`今天，${todayDoneText.value}`);
  else speakZh(`${Number(m)} 月 ${Number(d)} 日，没有打卡`);
}

const todayDoneText = computed(() => (streak.todayDone ? "已打卡" : "还没打卡，加油"));

/** 格子无障碍标签：X月X日 */
function sayDayLabel(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)} 月 ${Number(d)} 日`;
}

/** 格子日期号（模板窄化安全：null 返回空串） */
function dayNum(date: string | null): string {
  return date ? String(Number(date.slice(-2))) : "";
}
</script>

<template>
  <div class="streak view">
    <HeaderBar show-back back-label="返回" @back="goBack">
      <template #title>
        <PathIcon name="flame" class="hdr-flame" />
        <span>连击日历</span>
      </template>
      <template #right>
        <span class="today-badge" :class="{ done: streak.todayDone }">
          <CheckCircle2 v-if="streak.todayDone" class="k-ico tb-ico" />
          <span v-else class="tb-dot" aria-hidden="true"></span>
          {{ todayDoneText }}
        </span>
      </template>
    </HeaderBar>

    <div class="streak-body view-body">
      <!-- 状态卡：连击 + 今日目标 -->
      <section class="status card">
        <div class="st-big">
          <PathIcon name="flame" class="st-flame" />
          <b class="st-num">{{ streak.streak }}</b>
          <span class="st-unit">天连击</span>
        </div>
        <div class="st-goal" :class="{ done: streak.todayDone }">
          <span class="st-goal-state">{{ streak.todayDone ? "今日已打卡" : "今日进行中" }}</span>
          <span class="st-goal-line">
            复习到期词 <b>{{ streak.reviewed }}/{{ streak.reviewGoal }}</b>
            · 新学关卡 <b>{{ streak.newLevels }}/1</b>
          </span>
        </div>
      </section>

      <!-- 日历 -->
      <section class="cal card">
        <div class="cal-head">
          <button class="cal-nav" aria-label="上个月" @click="prevMonth">
            <PathIcon name="back" class="nav-l" />
          </button>
          <span class="cal-title">{{ monthTitle }}</span>
          <button class="cal-nav" aria-label="下个月" @click="nextMonth">
            <PathIcon name="back" class="nav-r" />
          </button>
        </div>
        <div class="cal-grid">
          <span v-for="w in WEEKDAYS" :key="w" class="cal-wd">{{ w }}</span>
          <button
            v-for="(cell, i) in cells"
            :key="i"
            class="cal-cell"
            :class="[dayState(cell)]"
            :disabled="!cell || dayState(cell) === 'future'"
            :aria-label="cell ? sayDayLabel(cell) : undefined"
            @click="cell && sayDay(cell)"
          >
            <template v-if="cell">
              <span class="cc-num">{{ dayNum(cell) }}</span>
              <span v-if="dayState(cell) === 'done'" class="cc-mark">✓</span>
            </template>
          </button>
        </div>
        <p class="cal-sum">
          本月已打卡 <b>{{ monthDone }}</b> 天
        </p>
      </section>

      <!-- 口径说明 -->
      <p class="cal-note" @click="speakZh('完成今日目标，复习到期词加新学一关，就算打卡')">
        完成今日目标（复习到期词 + 新学 1 关）就算打卡 · 记录从今天开始积累
      </p>
    </div>
  </div>
</template>

<style scoped>
.streak {
  align-items: center;
}
.streak-body {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
  width: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: var(--pad-y);
}
.today-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--fs-small);
  font-weight: 800;
  padding: 6px 12px;
  border-radius: var(--radius-s);
  background: var(--card-bg);
  color: var(--ink-soft);
  box-shadow: var(--shadow-soft);
  white-space: nowrap;
}
.today-badge.done {
  background: linear-gradient(160deg, #ff9f43, #ff6b3d);
  color: #fff;
  box-shadow: 0 var(--press) 0 rgba(0, 0, 0, 0.18);
}
.tb-ico {
  color: #fff;
}
.tb-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--blue);
  box-shadow: 0 0 0 3px rgba(28, 176, 246, 0.25);
}
.hdr-flame {
  color: #ff6b3d;
  font-size: 1.1em;
}
.card {
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-m);
}

/* 状态卡 */
.status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-s);
}
.st-big {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.st-flame {
  color: #ff6b3d;
  font-size: 1.6em;
  align-self: center;
}
.st-num {
  font-size: 34px;
  line-height: 1;
  color: var(--ink);
}
.st-unit {
  font-weight: 800;
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.st-goal {
  text-align: right;
}
.st-goal-state {
  font-weight: 800;
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.st-goal.done .st-goal-state {
  color: var(--green-dark);
}
.st-goal-line {
  display: block;
  margin-top: 2px;
  font-weight: 700;
  font-size: 12px;
  color: var(--ink-faint);
}
.st-goal-line b {
  color: var(--ink-soft);
}

/* 日历 */
.cal {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
}
.cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-s);
}
.cal-title {
  font-weight: 800;
  font-size: var(--fs-body);
  color: var(--ink);
}
.cal-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg);
  color: var(--ink-soft);
  box-shadow: var(--shadow-soft);
  transition: transform 0.1s;
}
.cal-nav:active {
  transform: translateY(1px);
}
.nav-l {
  font-size: 18px;
}
.nav-r {
  font-size: 18px;
  transform: rotate(180deg);
}
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.cal-wd {
  text-align: center;
  font-weight: 800;
  font-size: 11px;
  color: var(--ink-faint);
  padding: 2px 0;
}
.cal-cell {
  position: relative;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-s);
  background: transparent;
  color: var(--ink-soft);
  font-weight: 800;
  font-size: var(--fs-small);
  transition: transform 0.1s, background 0.2s;
}
.cal-cell:not(:disabled):active {
  transform: translateY(1px);
}
.cal-cell.done {
  background: linear-gradient(160deg, #ff9f43, #ff6b3d);
  color: #fff;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.15);
}
.cal-cell.doing {
  background: color-mix(in srgb, #ff6b3d 18%, transparent);
  color: #ff6b3d;
}
.cal-cell.today {
  box-shadow: inset 0 0 0 2px var(--gold);
}
.cal-cell.future {
  color: var(--ink-faint);
  opacity: 0.45;
}
.cc-mark {
  position: absolute;
  right: 3px;
  bottom: 2px;
  font-size: 11px;
  font-weight: 900;
}
.cal-sum {
  margin: 0;
  text-align: center;
  font-weight: 700;
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.cal-sum b {
  color: var(--ink);
}
.cal-note {
  margin: 0;
  text-align: center;
  font-weight: 600;
  font-size: 12px;
  color: var(--ink-faint);
}
</style>
