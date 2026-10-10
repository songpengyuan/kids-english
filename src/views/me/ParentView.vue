<script setup lang="ts">
/**
 * 家长中心（/me/parent）——大人用的：
 *   家长报告 / 今日统计 / 声音与暗黑设置 / 数据说明
 */
import { useProgressStore } from "../../stores/progress";
import { useRewardsStore } from "../../stores/rewards";
import { FORM_TOTAL } from "../../data/heroes";
import { useRouter } from "vue-router";
import AppHeader from "../../components/layout/AppHeader.vue";
import SoundToggle from "../../components/layout/SoundToggle.vue";
import ThemeToggle from "../../components/layout/ThemeToggle.vue";
import { ChevronRight, BarChart3, Clock, Activity, Volume2, Moon, Trash2 } from "@lucide/vue";
import { speakZh } from "../../services/speech";

const progress = useProgressStore();
const rewards = useRewardsStore();
const router = useRouter();

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  return m ? `${m} 分 ${Math.round(sec % 60)} 秒` : `${Math.round(sec)} 秒`;
}

function go(path: string) { router.push(path); }
</script>

<template>
  <div class="parent view">
    <AppHeader title="家长中心" icon="me" />
    <div class="body view-body">
      <!-- 家长报告 -->
      <button class="entry" @click="go('/me/report')">
        <BarChart3 class="k-ico" />
        <div class="e-body">
          <div class="e-name">家长报告</div>
          <div class="e-desc">掌握度趋势 · 待巩固词</div>
        </div>
        <ChevronRight class="k-ico arrow" />
      </button>

      <!-- 今日统计 -->
      <section class="stats card">
        <h3>今日学习</h3>
        <div class="stat-row">
          <Clock class="k-ico" />
          <span>时长</span>
          <b>{{ fmtDuration(progress.todayStats.durationSec) }}</b>
        </div>
        <div class="stat-row">
          <Activity class="k-ico" />
          <span>玩法次数</span>
          <b>{{ progress.todayStats.activities }} 次</b>
        </div>
        <div class="stat-row">
          <span>🐚</span>
          <span>贝壳</span>
          <b>{{ rewards.shells }}</b>
        </div>
        <div class="stat-row">
          <span>🦸</span>
          <span>英雄图鉴</span>
          <b>{{ rewards.ownedCount }}/{{ FORM_TOTAL }}</b>
        </div>
      </section>

      <!-- 设置 -->
      <section class="settings card">
        <h3>设置</h3>
        <div class="set-row">
          <span class="set-label"><Volume2 class="k-ico" /> 声音</span>
          <SoundToggle />
        </div>
        <div class="set-row">
          <span class="set-label"><Moon class="k-ico" /> 暗黑模式</span>
          <ThemeToggle />
        </div>
      </section>

      <p class="foot">学习记录只存在这台设备上，不上传云端</p>
      <p class="foot">建议每次陪学 10~15 分钟</p>
    </div>
  </div>
</template>

<style scoped>
.body { display: flex; flex-direction: column; gap: var(--gap-s); width: 100%; overflow-y: auto; padding-bottom: var(--pad-y); }
.entry { display: flex; align-items: center; gap: var(--gap-s); background: var(--card-bg); border-radius: var(--radius); box-shadow: var(--shadow-hard); padding: var(--gap-m); text-align: left; width: 100%; }
.entry > .k-ico { width: 24px; height: 24px; color: var(--ink-soft); }
.e-body { flex: 1; }
.e-name { font-weight: 800; }
.e-desc { font-size: 12px; color: var(--ink-faint); font-weight: 700; }
.arrow { color: var(--ink-faint); }
.card { background: var(--card-bg); border-radius: var(--radius); box-shadow: var(--shadow-hard); padding: var(--gap-m); }
.card h3 { margin: 0 0 var(--gap-s); font-size: var(--fs-small); color: var(--ink-soft); }
.stat-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-weight: 700; font-size: 14px; }
.stat-row > .k-ico { width: 18px; height: 18px; color: var(--ink-faint); }
.stat-row span:nth-child(2) { flex: 1; color: var(--ink-soft); }
.set-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
.set-label { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; }
.set-label .k-ico { width: 18px; height: 18px; }
.foot { text-align: center; color: var(--ink-faint); font-size: 12px; margin: 0; }
</style>
