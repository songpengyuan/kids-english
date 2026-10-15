<script setup lang="ts">
/**
 * 掌握度趋势（家长报告用）：
 * - 7 根柱子 = 最近 7 天的学习时长；柱顶小字 = 当天结束时"已掌握单词数"
 * - 顶部一行汇总：已掌握 / 学习中 / 本周新增掌握
 *
 * 数据来自 progress.recentDays()（每日快照，见 stores/progress.ts）。
 * 用纯 DOM/CSS 画，不引图表库；每根柱子带 aria-label，家长用读屏也能看。
 */
import { computed } from "vue";

export interface TrendDay {
  date: string;
  durationSec: number;
  activities: number;
  mastered: number;
}

const props = defineProps<{ days: TrendDay[] }>();

/** 柱子高度按 7 天里最长的一天归一（至少 1 分钟做分母，避免全天很短时柱子虚高） */
const maxSec = computed(() => Math.max(60, ...props.days.map((d) => d.durationSec)));

function barPct(d: TrendDay) {
  if (d.durationSec <= 0) return 0;
  return Math.max(8, Math.round((d.durationSec / maxSec.value) * 100));
}

/** 周一~周日（按日期取星期，家长一眼对上"上周几"） */
function weekday(date: string) {
  const d = new Date(`${date}T12:00:00`);
  return ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
}

function minutes(sec: number) {
  return Math.round(sec / 60);
}

/** 本周新增掌握 = 最后一天 - 第一天（第一天缺失时按 0 起算） */
const gained = computed(() => {
  if (!props.days.length) return 0;
  const first = props.days[0].mastered;
  const last = props.days[props.days.length - 1].mastered;
  return Math.max(0, last - first);
});
</script>

<template>
  <div class="trend">
    <div v-if="days.length === 0" class="trend-empty">完成一次练习后，这里会出现掌握度趋势</div>
    <template v-else>
      <p class="trend-sum">
        最近 {{ days.length }} 天掌握单词
        <b>{{ days[days.length - 1].mastered }}</b> 个，
        <span :class="{ up: gained > 0 }">本周新增 {{ gained }} 个</span>
      </p>
      <div class="bars" role="img" :aria-label="`最近 ${days.length} 天学习时长与掌握词数趋势`">
        <div v-for="d in days" :key="d.date" class="col">
          <span class="m">{{ d.mastered }}</span>
          <div class="bar-wrap">
            <div
              class="bar"
              :style="{ height: barPct(d) + '%' }"
              :aria-label="`${d.date}（周${weekday(d.date)}）学习 ${minutes(d.durationSec)} 分钟，掌握 ${d.mastered} 个词`"
            ></div>
          </div>
          <span class="d">{{ weekday(d.date) }}</span>
        </div>
      </div>
      <p class="trend-hint">柱高 = 当天学习时长，柱顶数字 = 当天结束时已掌握的单词数</p>
    </template>
  </div>
</template>

<style scoped>
.trend {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
}
.trend-empty,
.trend-hint {
  margin: 0;
  color: var(--ink-soft);
  font-weight: 700;
  font-size: var(--fs-small);
}
.trend-sum {
  margin: 0;
  font-weight: 700;
  color: var(--ink);
  font-size: var(--fs-body);
}
.trend-sum b {
  font-size: var(--fs-title);
  color: var(--green-dark);
}
.trend-sum .up {
  color: var(--green-dark);
}
.bars {
  display: flex;
  align-items: flex-end;
  gap: var(--gap-s);
  height: clamp(96px, 18vh, 150px);
}
.col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  height: 100%;
}
.m {
  font-size: var(--fs-small);
  font-weight: 800;
  color: var(--ink-soft);
  flex: none;
}
.bar-wrap {
  flex: 1;
  width: 100%;
  max-width: 34px;
  display: flex;
  align-items: flex-end;
  background: color-mix(in srgb, var(--line) 60%, transparent);
  border-radius: var(--radius-s);
  overflow: hidden;
}
.bar {
  width: 100%;
  background: linear-gradient(180deg, var(--blue), var(--blue-dark));
  border-radius: var(--radius-s);
  transition: height var(--dur-slow) var(--ease-out);
}
.d {
  font-size: var(--fs-small);
  font-weight: 800;
  color: var(--ink-soft);
  flex: none;
}
</style>
