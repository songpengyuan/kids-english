<script setup lang="ts">
/**
 * 学习日历（/me/calendar）——点「我的 → 今日学习卡片」进入。
 *
 * 月历网格展示每天学习情况（数据源 progress.dailyLog，保留最近 30 天）：
 *  - 每格显示当天「学习时长 / 磨耳朵时长」；
 *  - 点击某天 → 底部详情条：学习 X 分钟、磨耳朵 Y 分钟、完成玩法 N 次；
 *  - 月份可前后翻（有数据的月份才有内容）。
 */
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useProgressStore } from "../../stores/progress";
import HeaderBar from "../../components/layout/HeaderBar.vue";
import PathIcon from "../../components/PathIcon.vue";
import { CalendarDays, ChevronLeft, ChevronRight } from "@lucide/vue";
import { speakZh } from "../../services/speech";

const progress = useProgressStore();
const router = useRouter();

const now = new Date();
const viewYear = ref(now.getFullYear());
const viewMonth = ref(now.getMonth()); // 0-11
const selected = ref<string | null>(null);

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

const monthTitle = computed(() => `${viewYear.value} 年 ${viewMonth.value + 1} 月`);
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
    arr.push(
      `${viewYear.value}-${String(viewMonth.value + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    );
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

/** 当天数据（无记录返回空档） */
function dayInfo(date: string | null): DayInfo | null {
  if (!date) return null;
  const d = progress.dailyLog[date];
  if (!d || (d.durationSec <= 0 && (d.listenSec ?? 0) <= 0)) return null;
  return { date, durationSec: d.durationSec, listenSec: d.listenSec ?? 0, activities: d.activities };
}

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
    speakZh(`${Number(m)} 月 ${Number(d)} 日，学习${fmtShort(info.durationSec)}，磨耳朵${fmtShort(info.listenSec)}`);
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
</script>

<template>
  <div class="cal view">
    <HeaderBar show-back back-label="返回" @back="router.push('/me')">
      <template #title><PathIcon name="me" class="hdr-ico" /> 学习日历</template>
    </HeaderBar>

    <div class="cal-body view-body">
      <!-- 本月汇总 -->
      <section class="sum card">
        <CalendarDays class="k-ico sum-ico" />
        <div class="sum-nums">
          <span>本月学习 <b>{{ fmtShort(monthSummary.learn) || "0m" }}</b></span>
          <span>· 磨耳朵 <b>{{ fmtShort(monthSummary.listen) || "0m" }}</b></span>
          <span>· 玩法 <b>{{ monthSummary.acts }}</b> 次</span>
        </div>
      </section>

      <!-- 月份切换 -->
      <section class="month-bar card">
        <button class="mb-btn" aria-label="上个月" @click="prevMonth"><ChevronLeft class="k-ico" /></button>
        <span class="mb-title">{{ monthTitle }}</span>
        <button class="mb-btn" aria-label="下个月" @click="nextMonth"><ChevronRight class="k-ico" /></button>
      </section>

      <!-- 日历网格 -->
      <section class="cal-grid card">
        <div class="cg-week">
          <span v-for="w in WEEKDAYS" :key="w" class="cg-weekday">{{ w }}</span>
        </div>
        <div class="cg-cells">
          <template v-for="(c, i) in cells" :key="i">
            <button
              v-if="c"
              class="cg-day"
              :class="{
                has: !!dayInfo(c),
                today: c === today,
                selected: c === selected,
              }"
              :aria-label="`${Number(c.slice(5, 7))}月${Number(c.slice(8))}日`"
              @click="tapDay(c)"
            >
              <span class="cg-num">{{ dayNum(c) }}</span>
              <span class="cg-tags">
                <span v-if="dayInfo(c)" class="cg-tag learn">{{ fmtShort(dayInfo(c)!.durationSec) }}</span>
                <span v-if="(dayInfo(c)?.listenSec ?? 0) > 0" class="cg-tag listen">{{ fmtShort(dayInfo(c)!.listenSec) }}</span>
              </span>
            </button>
            <span v-else class="cg-day blank"></span>
          </template>
        </div>
      </section>

      <!-- 选中日期详情 -->
      <section v-if="selectedInfo" class="detail card">
        <p class="dt-date">{{ Number(selectedInfo.date.slice(5, 7)) }} 月 {{ Number(selectedInfo.date.slice(8)) }} 日</p>
        <div class="dt-rows">
          <span class="dt-row"><b>📖 学习</b>{{ fmtFull(selectedInfo.durationSec) }}</span>
          <span class="dt-row"><b>🎧 磨耳朵</b>{{ fmtFull(selectedInfo.listenSec) }}</span>
          <span class="dt-row"><b>🎯 完成玩法</b>{{ selectedInfo.activities }} 次</span>
        </div>
      </section>

      <p class="cal-foot">点格子看那天学了多少；只有最近 30 天有记录。</p>
    </div>
  </div>
</template>

<style scoped>
.cal-body { display: flex; flex-direction: column; gap: var(--gap-s); width: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: var(--pad-y); }
.card { background: var(--card-bg); border-radius: var(--radius); box-shadow: var(--shadow-hard); padding: var(--gap-m); }

/* 本月汇总 */
.sum { display: flex; align-items: center; gap: var(--gap-s); }
.sum-ico { width: 20px; height: 20px; color: var(--brand); flex: none; }
.sum-nums { font-weight: 700; font-size: var(--fs-small); color: var(--ink-soft); }
.sum-nums b { color: var(--ink); }

/* 月份切换 */
.month-bar { display: flex; align-items: center; justify-content: space-between; padding: var(--gap-s) var(--gap-m); }
.mb-btn {
  width: 36px; height: 36px; border: 0; border-radius: 50%;
  background: var(--line, #e5e2db); color: var(--ink);
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.mb-btn .k-ico { width: 18px; height: 18px; }
.mb-title { font-weight: 800; font-size: var(--fs-body); }

/* 日历网格 */
.cg-week { display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 6px; }
.cg-weekday { text-align: center; font-size: 12px; font-weight: 800; color: var(--ink-faint); padding: 4px 0; }
.cg-cells { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.cg-day {
  position: relative;
  min-height: 52px;
  border: 0;
  border-radius: 10px;
  background: var(--line, #efede8);
  color: var(--ink);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
  padding: 4px 0;
  box-sizing: border-box;
}
.cg-day.blank { background: transparent; cursor: default; }
.cg-day.has { background: var(--brand-soft, #e3f5ff); }
.cg-day.today { box-shadow: inset 0 0 0 2px var(--brand); }
.cg-day.selected { box-shadow: inset 0 0 0 2px var(--accent, #8a5a2b); }
.cg-num { font-size: 13px; font-weight: 800; line-height: 1.1; }
.cg-tags { display: flex; gap: 2px; flex-wrap: wrap; justify-content: center; }
.cg-tag { font-size: 10px; font-weight: 800; line-height: 1; padding: 2px 3px; border-radius: 4px; color: #fff; }
.cg-tag.learn { background: var(--brand, #00a3ff); }
.cg-tag.listen { background: var(--accent, #8a5a2b); }

/* 选中详情 */
.detail { display: flex; flex-direction: column; gap: var(--gap-s); }
.dt-date { margin: 0; font-weight: 900; font-size: var(--fs-body); }
.dt-rows { display: flex; flex-direction: column; gap: 6px; }
.dt-row { display: flex; justify-content: space-between; font-weight: 700; font-size: 14px; color: var(--ink-soft); }
.dt-row b { color: var(--ink); }

.cal-foot { text-align: center; font-size: 12px; color: var(--ink-faint); margin: 0; }
</style>
