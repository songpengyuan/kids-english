<script setup lang="ts">
/**
 * 学习日历（/me/calendar）——全站唯一的学习记录日历。
 *
 * 2026-10-16 合并：原先有「学习日历」和「连击日历」两个页面，
 * 渲染的都是同一个 7 列月网格，只是格子里填的东西不同（分钟 vs 打卡），
 * 逻辑、翻月、请求各写一套。现在合成一页：
 *   - 顶部：连击 / 本月打卡（来自原连击日历）
 *   - 中部：本月学习 / 磨耳朵 / 玩法汇总
 *   - 网格：每格显示当天时长，达标日额外标一个火焰点
 * 旧路径 /me/streak 由 router 重定向到这里。
 *
 * 数据来源：GET /children/{id}/calendar?year=&month=，失败时静默降级到本地缓存。
 */
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useProgressStore } from "../../stores/progress";
import { useAuthStore } from "../../stores/auth";
import { useStreakStore } from "../../stores/streak";
import { request } from "../../services/api";
import PageShell from "../../components/ui/PageShell.vue";
import IconTile from "../../components/ui/IconTile.vue";
import MetricTile from "../../components/ui/MetricTile.vue";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Flame } from "@lucide/vue";
import { speakZh } from "../../services/speech";

const progress = useProgressStore();
const streak = useStreakStore();
const router = useRouter();
const auth = useAuthStore();

const now = new Date();
const viewYear = ref(now.getFullYear());
const viewMonth = ref(now.getMonth()); // 0-11
const selected = ref<string | null>(null);

/** 服务器返回的当月日历数据 */
const monthDays = ref<
  Record<string, { durationSec: number; listenSec: number; activities: number; mastered: number }>
>({});
const loading = ref(false);

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

const monthTitle = computed(() => `${viewYear.value} 年 ${viewMonth.value + 1} 月`);
const monthPrefix = computed(
  () => `${viewYear.value}-${String(viewMonth.value + 1).padStart(2, "0")}`
);
const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}
function firstWeekday(y: number, m: number): number {
  return (new Date(y, m, 1).getDay() + 6) % 7;
}

/** 日历格子：null=占位，字符串=该日 YYYY-MM-DD */
const cells = computed<(string | null)[]>(() => {
  const total = daysInMonth(viewYear.value, viewMonth.value);
  const lead = firstWeekday(viewYear.value, viewMonth.value);
  const arr: (string | null)[] = [];
  for (let i = 0; i < lead; i++) arr.push(null);
  for (let d = 1; d <= total; d++) {
    arr.push(`${monthPrefix.value}-${String(d).padStart(2, "0")}`);
  }
  while (arr.length % 7 !== 0) arr.push(null);
  return arr;
});

interface DayInfo {
  date: string;
  durationSec: number;
  listenSec: number;
  activities: number;
}

/** 当天数据（优先用服务器拉的当月数据，没有则查本地缓存） */
function dayInfo(date: string | null): DayInfo | null {
  if (!date) return null;
  let d = monthDays.value[date];
  if (!d) {
    const local = progress.dailyLog[date];
    if (!local) return null;
    d = {
      durationSec: local.durationSec,
      listenSec: local.listenSec ?? 0,
      activities: local.activities,
      mastered: local.mastered,
    };
  }
  if (d.durationSec <= 0 && (d.listenSec ?? 0) <= 0) return null;
  return { date, durationSec: d.durationSec, listenSec: d.listenSec ?? 0, activities: d.activities };
}

/** 该日是否达成当日目标（连击口径，来自 streak store） */
function dayDone(date: string | null): boolean {
  return !!date && !!streak.history[date]?.done;
}

/** 本月打卡天数（含今天已达标） */
const monthDone = computed(
  () => cells.value.filter((d) => d && d.startsWith(monthPrefix.value) && dayDone(d)).length
);

/** 格子小字：学习时长（如 3m / 1h） */
function fmtShort(sec: number): string {
  const m = Math.round((sec || 0) / 60);
  if (m <= 0) return "";
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? m % 60 + "m" : ""}` : `${m}m`;
}

const selectedInfo = computed<DayInfo | null>(() => dayInfo(selected.value));

/** 点击某天：选中 + 读日历（认字/认数） */
function tapDay(date: string | null) {
  if (!date) return;
  selected.value = date;
  const info = dayInfo(date);
  const [, m, d] = date.split("-");
  if (info) {
    speakZh(
      `${Number(m)} 月 ${Number(d)} 日，学习${fmtShort(info.durationSec)}，磨耳朵${fmtShort(info.listenSec)}`
    );
  } else if (date === today) {
    speakZh("今天还没有学习记录");
  } else {
    speakZh(`${Number(m)} 月 ${Number(d)} 日，没有学习`);
  }
}

function prevMonth() {
  if (viewMonth.value === 0) {
    viewYear.value -= 1;
    viewMonth.value = 11;
  } else {
    viewMonth.value -= 1;
  }
  selected.value = null;
}
function nextMonth() {
  if (viewMonth.value === 11) {
    viewYear.value += 1;
    viewMonth.value = 0;
  } else {
    viewMonth.value += 1;
  }
  selected.value = null;
}

/** 本月合计（有数据的格子求和，供顶部汇总） */
const monthSummary = computed(() => {
  let learn = 0;
  let listen = 0;
  let acts = 0;
  for (const c of cells.value) {
    const info = dayInfo(c);
    if (info) {
      learn += info.durationSec;
      listen += info.listenSec;
      acts += info.activities;
    }
  }
  return { learn, listen, acts };
});

function fmtFull(sec: number): string {
  const m = Math.round((sec || 0) / 60);
  if (m <= 0) return "0 分钟";
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h} 小时${m % 60 ? ` ${m % 60} 分` : ""}`;
  }
  return `${m} 分钟`;
}

function dayNum(date: string | null): string {
  return date ? String(Number(date.slice(-2))) : "";
}

/** 请求当月日历数据 */
async function fetchCalendar() {
  const childId = auth.currentChildId;
  if (!childId) return;
  loading.value = true;
  try {
    const json = await request<{
      ok: boolean;
      days: Array<{
        date: string;
        durationSec?: number;
        listenSec?: number;
        activities?: number;
        mastered?: number;
      }>;
    }>(`/children/${childId}/calendar?year=${viewYear.value}&month=${viewMonth.value + 1}`);
    if (json.ok && json.days) {
      const map: Record<
        string,
        { durationSec: number; listenSec: number; activities: number; mastered: number }
      > = {};
      for (const d of json.days) {
        map[d.date] = {
          durationSec: d.durationSec ?? 0,
          listenSec: d.listenSec ?? 0,
          activities: d.activities ?? 0,
          mastered: d.mastered ?? 0,
        };
      }
      monthDays.value = map;
    }
  } catch {
    // 后端不可用时静默降级到本地数据
  } finally {
    loading.value = false;
  }
}

// 初始加载 + 切月时重新请求
fetchCalendar();
watch([viewYear, viewMonth], fetchCalendar);
</script>

<template>
  <PageShell title="学习日历" icon="me" scroll @back="router.push('/me')">
    <!-- 连击 / 本月打卡（合并自原「连击日历」页） -->
    <section class="card sum-row">
      <span class="sum-item">
        <IconTile tone="orange"><Flame class="k-ico" /></IconTile>
        <MetricTile :value="streak.streak" label="天连击" />
      </span>
      <span class="sum-sep" aria-hidden="true" />
      <span class="sum-item">
        <IconTile tone="green"><Check class="k-ico" /></IconTile>
        <MetricTile :value="monthDone" label="本月打卡" />
      </span>
    </section>

    <!-- 本月汇总 -->
    <section class="card month-sum">
      <CalendarDays class="k-ico sum-ico" />
      <p class="sum-nums">
        本月学习 <b>{{ fmtShort(monthSummary.learn) || "0m" }}</b>
        · 磨耳朵 <b>{{ fmtShort(monthSummary.listen) || "0m" }}</b>
        · 玩法 <b>{{ monthSummary.acts }}</b> 次
      </p>
    </section>

    <!-- 月份切换 -->
    <section class="card month-bar">
      <button class="mb-btn" aria-label="上个月" @click="prevMonth">
        <ChevronLeft class="k-ico" />
      </button>
      <span class="mb-title">{{ monthTitle }}</span>
      <button class="mb-btn" aria-label="下个月" @click="nextMonth">
        <ChevronRight class="k-ico" />
      </button>
    </section>

    <!-- 日历网格 -->
    <section class="card cal-grid">
      <div class="cg-week">
        <span v-for="w in WEEKDAYS" :key="w" class="cg-weekday">{{ w }}</span>
      </div>
      <div class="cg-cells">
        <template v-for="(c, i) in cells" :key="i">
          <button
            v-if="c"
            class="cg-day"
            :class="{ has: !!dayInfo(c), today: c === today, selected: c === selected }"
            :aria-label="`${Number(c.slice(5, 7))}月${Number(c.slice(8))}日`"
            @click="tapDay(c)"
          >
            <span class="cg-num">{{ dayNum(c) }}</span>
            <span class="cg-tags">
              <span v-if="dayInfo(c)" class="cg-tag learn">{{ fmtShort(dayInfo(c)!.durationSec) }}</span>
              <span v-if="(dayInfo(c)?.listenSec ?? 0) > 0" class="cg-tag listen">{{
                fmtShort(dayInfo(c)!.listenSec)
              }}</span>
            </span>
            <!-- 当日达标（连击口径）：角上一个火焰点 -->
            <span v-if="dayDone(c)" class="cg-dot" aria-label="已打卡">
              <Flame class="k-ico" />
            </span>
          </button>
          <span v-else class="cg-day blank" />
        </template>
      </div>
    </section>

    <!-- 选中日期详情 -->
    <section v-if="selectedInfo" class="card detail">
      <p class="dt-date">
        {{ Number(selectedInfo.date.slice(5, 7)) }} 月
        {{ Number(selectedInfo.date.slice(8)) }} 日
      </p>
      <div class="dt-rows">
        <span class="dt-row"><b>学习</b>{{ fmtFull(selectedInfo.durationSec) }}</span>
        <span class="dt-row"><b>磨耳朵</b>{{ fmtFull(selectedInfo.listenSec) }}</span>
        <span class="dt-row"><b>完成玩法</b>{{ selectedInfo.activities }} 次</span>
      </div>
    </section>

    <p class="cal-foot">点格子看那天学了多少；只有最近 30 天有记录。</p>
  </PageShell>
</template>

<style scoped>
/* ---------- 连击 / 打卡汇总 ---------- */
.sum-row {
  display: flex;
  align-items: center;
  justify-content: space-around;
}
.sum-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-xs);
}
.sum-sep {
  width: 1px;
  align-self: stretch;
  background: var(--line);
}

/* ---------- 本月汇总 ---------- */
.month-sum {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
}
.sum-ico {
  width: 1.2em;
  height: 1.2em;
  color: var(--brand);
  flex: none;
}
.sum-nums {
  margin: 0;
  font-weight: var(--fw-mid);
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.sum-nums b {
  color: var(--ink);
}

/* ---------- 月份切换 ---------- */
.month-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--gap-s) var(--gap-m);
}
.mb-btn {
  width: var(--tap-min);
  height: var(--tap-min);
  border-radius: 50%;
  background: var(--line);
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--dur-fast) var(--ease-out);
}
.mb-btn:active {
  transform: scale(0.94);
}
.mb-btn .k-ico {
  width: 0.5em;
  height: 0.5em;
}
.mb-title {
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
}

/* ---------- 日历网格 ---------- */
.cg-week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: var(--gap-xs);
}
.cg-weekday {
  text-align: center;
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
  color: var(--ink-faint);
  padding: var(--gap-xs) 0;
}
.cg-cells {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--gap-xs);
}
.cg-day {
  position: relative;
  min-height: var(--tap-min);
  border-radius: var(--radius-s);
  background: var(--line);
  color: var(--ink);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: var(--gap-xs) 0;
  transition: transform var(--dur-fast) var(--ease-out);
}
.cg-day:active {
  transform: scale(0.94);
}
.cg-day.blank {
  background: transparent;
  cursor: default;
}
.cg-day.has {
  background: var(--brand-soft);
}
.cg-day.today {
  box-shadow: inset 0 0 0 2px var(--brand);
}
.cg-day.selected {
  box-shadow: inset 0 0 0 2px var(--orange-dark);
}
.cg-num {
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
  line-height: 1.1;
}
.cg-tags {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  justify-content: center;
}
.cg-tag {
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
  line-height: 1;
  padding: 2px 3px;
  border-radius: var(--radius-s);
  color: var(--on-tone);
}
.cg-tag.learn {
  background: var(--brand);
}
.cg-tag.listen {
  background: var(--orange);
}
/* 达标角标：贴在格子右上角，与数字不重叠 */
.cg-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  font-size: var(--fs-small);
  line-height: 1;
  color: var(--orange-dark);
}
.cg-dot .k-ico {
  width: 0.8em;
  height: 0.8em;
  fill: currentColor;
}

/* ---------- 选中详情 ---------- */
.detail {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
}
.dt-date {
  margin: 0;
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
}
.dt-rows {
  display: flex;
  flex-direction: column;
  gap: var(--gap-xs);
}
.dt-row {
  display: flex;
  justify-content: space-between;
  font-weight: var(--fw-mid);
  font-size: var(--fs-body);
  color: var(--ink-soft);
}
.dt-row b {
  color: var(--ink);
}

.cal-foot {
  text-align: center;
  font-size: var(--fs-small);
  color: var(--ink-faint);
  margin: 0;
}
</style>
