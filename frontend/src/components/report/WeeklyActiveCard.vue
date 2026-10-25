<script setup lang="ts">
/**
 * 每周学习时长周视图（家长中心用，2026-10-25 落地）。
 *
 * 展示口径（本地，见 utils/weeklyStats 与 PROGRESS-DATA §7）：
 *  · 玩法学习 = durationSec − listenSec（大数字 + 柱状）
 *  · 磨耳朵 = listenSec（次行）
 * 注意：ROADMAP 北极星的「主动」（会话来源判定）在事件侧/服务端 daily_stats，
 * 本地不冒用"主动/被动"措辞——家长端接服务端数据时再切换严格口径。
 * 周一~周日自然周；数据来自 progress.recentDays(30) 聚成的 4 个周桶。
 * 纯 DOM/CSS 画柱不引图表库；每根柱带 aria-label；空态有引导文案。
 */
import { computed } from "vue";
import { toMinutes, weeklyStats, type DailyLike } from "../../utils/weeklyStats";

const props = defineProps<{ days: DailyLike[] }>();

const weeks = computed(() => weeklyStats(props.days, 4));
const thisWeekIdx = computed(() => weeks.value.length - 1);
const thisWeek = computed(() => weeks.value[thisWeekIdx.value]);
const lastWeek = computed(() => (weeks.value.length >= 2 ? weeks.value[thisWeekIdx.value - 1] : null));

const thisMin = computed(() => toMinutes(thisWeek.value.practiceSec));
/** 与上周比（分钟）：null = 没有上周数据（首周） */
const diffMin = computed(() => {
  if (!lastWeek.value) return null;
  return thisMin.value - toMinutes(lastWeek.value.practiceSec);
});

/** 柱高按 4 周里最高一周归一（至少 1 分钟做分母，防全天很短时虚高） */
const maxActive = computed(() => Math.max(60, ...weeks.value.map((w) => w.practiceSec)));
function barPct(practiceSec: number) {
  if (practiceSec <= 0) return 0;
  return Math.max(8, Math.round((practiceSec / maxActive.value) * 100));
}
/** 柱底标签：本周 / 上周 / 再往前的周给月日 */
function weekLabel(weekStart: string, idx: number) {
  if (idx === thisWeekIdx.value) return "本周";
  if (lastWeek.value && idx === thisWeekIdx.value - 1) return "上周";
  return weekStart.slice(5).replace("-", "/");
}
function aria(w: { weekStart: string; practiceSec: number }, label: string) {
  return `${label}（${w.weekStart} 起）玩法学习 ${toMinutes(w.practiceSec)} 分钟`;
}
</script>

<template>
  <div class="ns">
    <div v-if="thisWeek.practiceSec === 0 && thisWeek.activities === 0" class="ns-empty">
      本周还没有学习记录——完成一次练习后，这里会出现每周学习时长
    </div>
    <template v-else>
      <div class="ns-hero">
        <span class="ns-num">{{ thisMin }}</span>
        <span class="ns-unit">分钟</span>
        <span v-if="diffMin !== null" class="ns-diff" :class="{ up: diffMin > 0, down: diffMin < 0 }">
          {{ diffMin > 0 ? `↑ 较上周多 ${diffMin}` : diffMin < 0 ? `↓ 较上周少 ${-diffMin}` : "与上周持平" }}
        </span>
      </div>
      <p class="ns-sub">
        另有磨耳朵 {{ toMinutes(thisWeek.listenSec) }} 分钟 · 完成 {{ thisWeek.activities }} 个玩法
      </p>
      <div class="ns-bars" role="img" :aria-label="`最近 ${weeks.length} 周每周学习分钟数：${weeks.map((w, i) => aria(w, weekLabel(w.weekStart, i))).join('，')}`">
        <div v-for="(w, i) in weeks" :key="w.weekStart" class="ns-col">
          <span class="ns-val">{{ toMinutes(w.practiceSec) || "" }}</span>
          <div class="ns-bar-wrap">
            <div class="ns-bar" :class="{ cur: i === thisWeekIdx }" :style="{ height: barPct(w.practiceSec) + '%' }" />
          </div>
          <span class="ns-label" :class="{ cur: i === thisWeekIdx }">{{ weekLabel(w.weekStart, i) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ns-empty {
  color: var(--ink-faint);
  font-size: var(--fs-small);
  text-align: center;
  padding: var(--gap-m) 0;
}
.ns-hero {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.ns-num {
  font-size: calc(var(--fs-title) * 1.6);
  font-weight: var(--fw-strong);
  color: var(--brand);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.ns-unit {
  color: var(--ink-soft);
  font-weight: var(--fw-mid);
}
.ns-diff {
  margin-left: auto;
  font-size: var(--fs-small);
  color: var(--ink-faint);
}
.ns-diff.up {
  color: var(--ok);
}
.ns-diff.down {
  color: var(--red);
}
.ns-sub {
  margin: var(--gap-xs) 0 0;
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.ns-bars {
  display: flex;
  align-items: flex-end;
  gap: var(--gap-s);
  height: 96px;
  margin-top: var(--gap-m);
}
.ns-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.ns-val {
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  color: var(--ink-soft);
  min-height: 1.2em;
  font-variant-numeric: tabular-nums;
}
.ns-bar-wrap {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  background: color-mix(in srgb, var(--ink-faint) 14%, transparent);
  border-radius: var(--radius-s);
  overflow: hidden;
}
.ns-bar {
  width: 100%;
  border-radius: var(--radius-s);
  background: color-mix(in srgb, var(--brand) 55%, transparent);
  transition: height 0.3s var(--ease-out);
}
.ns-bar.cur {
  background: var(--brand);
}
.ns-label {
  font-size: var(--fs-small);
  color: var(--ink-faint);
  white-space: nowrap;
}
.ns-label.cur {
  color: var(--ink);
  font-weight: var(--fw-mid);
}
</style>
