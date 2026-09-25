<script setup>
/**
 * 我的（/me）——个人中心，儿童友好的"成就汇总 + 功能入口"页：
 * - 身份/成就：吉祥物 + 总星星 + 连击
 * - 统计：星星 / 连击 / 贝壳 / 贴纸图鉴 / 今日时长 / 今日玩法
 * - 入口：宝藏罐 / 家长报告 / 错词复习（子页高亮"我的"tab，见 BottomNav）
 * 数据全部来自本地存储，不上传。
 */
import { computed } from "vue";
import { useProgressStore } from "../stores/progress";
import { useRewardsStore } from "../stores/rewards";
import { useStreakStore } from "../stores/streak";
import { useRouter } from "vue-router";
import ThemeToggle from "./ThemeToggle.vue";
import { ChevronRight, Flame, Star } from "@lucide/vue";

const progress = useProgressStore();
const rewards = useRewardsStore();
const streak = useStreakStore();
const router = useRouter();

function fmtDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m === 0) return `${rest} 秒`;
  return `${m} 分 ${rest} 秒`;
}

/** 待复习弱词数（有则入口带数量） */
const weakCount = computed(() => progress.getWeakWords().length);

const stickerDone = computed(() => `${rewards.stickers.length} / ${rewards.stickerTotal}`);

const todayWords = computed(() => {
  let n = 0;
  for (const id of Object.keys(progress.progress)) {
    if (id === "_daily" || id === "_last") continue;
    const words = progress.progress[id].words || {};
    for (const wordId of Object.keys(words)) {
      const w = words[wordId];
      const ts = w.lastAt || 0;
      if (ts) {
        const d = new Date(ts);
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const today = `${d.getFullYear()}-${m}-${day}`;
        const now = new Date();
        const nowM = String(now.getMonth() + 1).padStart(2, "0");
        const nowDay = String(now.getDate()).padStart(2, "0");
        if (today === `${now.getFullYear()}-${nowM}-${nowDay}`) n++;
      }
    }
  }
  return n;
});
</script>

<template>
  <div class="me view">
    <div class="topbar">
      <div class="title">👤 我的</div>
      <ThemeToggle />
    </div>

    <div class="me-body view-body">
      <!-- 身份卡 -->
      <section class="profile card anim-pop">
        <span class="pf-emoji">🦊</span>
        <div class="pf-info">
          <p class="pf-name">丞丞的学习小屋</p>
          <p class="pf-sub">
            <span class="pf-star"><Star class="k-ico star-fill" />{{ progress.totalStars }} 颗星</span>
            <span class="pf-flame"><Flame class="k-ico flame" />{{ streak.streak }} 天连击</span>
          </p>
        </div>
      </section>

      <!-- 成就统计 -->
      <section class="stats anim-fade-up">
        <div class="cell">
          <span class="v gold"><Star class="k-ico star-fill" />{{ progress.totalStars }}</span>
          <span class="k">总星星</span>
        </div>
        <div class="cell">
          <span class="v"><Flame class="k-ico flame" />{{ streak.streak }}</span>
          <span class="k">连击天数</span>
        </div>
        <div class="cell">
          <span class="v">🐚 {{ rewards.shells }}</span>
          <span class="k">贝壳</span>
        </div>
        <div class="cell">
          <span class="v">🎨 {{ stickerDone }}</span>
          <span class="k">贴纸图鉴</span>
        </div>
        <div class="cell">
          <span class="v">⏱ {{ fmtDuration(progress.todayStats.durationSec) }}</span>
          <span class="k">今日时长</span>
        </div>
        <div class="cell">
          <span class="v">🎯 {{ progress.todayStats.activities }} 次</span>
          <span class="k">今日玩法</span>
        </div>
      </section>

      <!-- 功能入口 -->
      <section class="entries anim-fade-up">
        <button class="entry" @click="router.push('/treasure')">
          <span class="en-ico">🎁</span>
          <span class="en-cap">宝藏罐</span>
          <span class="en-desc">贝壳 · 贴纸图鉴</span>
          <ChevronRight class="k-ico en-arrow" />
        </button>
        <button class="entry" @click="router.push('/report')">
          <span class="en-ico">📊</span>
          <span class="en-cap">家长报告</span>
          <span class="en-desc">今日学情 · 错词清单</span>
          <ChevronRight class="k-ico en-arrow" />
        </button>
        <button class="entry" @click="router.push('/review')">
          <span class="en-ico">📚</span>
          <span class="en-cap">错词复习</span>
          <span class="en-desc" v-if="weakCount">有 {{ weakCount }} 个词要复习</span>
          <span class="en-desc" v-else>都掌握得很好！</span>
          <ChevronRight class="k-ico en-arrow" />
        </button>
      </section>

      <p class="foot">数据只保存在这台设备上，不会上传。</p>
    </div>
  </div>
</template>

<style scoped>
.me {
  align-items: center;
}
.topbar {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  width: 100%;
  flex: none;
}
.topbar .title {
  flex: 1;
  font-weight: 800;
  font-size: var(--fs-title);
  color: var(--ink);
  text-align: center;
}
.me-body {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
  width: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: var(--pad-y);
}
.card {
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-m);
}
.profile {
  display: flex;
  align-items: center;
  gap: var(--gap-m);
  border-left: 8px solid var(--yellow);
}
.pf-emoji {
  font-size: var(--fs-emoji-xl);
  line-height: 1;
}
.pf-info {
  min-width: 0;
}
.pf-name {
  margin: 0;
  font-weight: 800;
  font-size: var(--fs-body);
  color: var(--ink);
}
.pf-sub {
  margin: 4px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-s);
  font-weight: 800;
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.pf-star .k-ico,
.stats .gold .k-ico {
  color: var(--gold);
}
.pf-flame .k-ico,
.stats .flame {
  color: #ff6b3d;
}
.flame {
  color: #ff6b3d;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--gap-s);
}
.stats .cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-s) 4px;
}
.stats .v {
  font-weight: 800;
  font-size: var(--fs-body);
  color: var(--ink);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.stats .k {
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-faint);
}

.entries {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
}
.entry {
  display: flex;
  align-items: center;
  gap: var(--gap-m);
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-s) var(--gap-m);
  transition: transform 0.1s;
  text-align: left;
}
.entry:active {
  transform: translateY(calc(var(--press) - 1px));
}
.en-ico {
  font-size: var(--fs-emoji-l);
  line-height: 1;
}
.en-cap {
  font-weight: 800;
  font-size: var(--fs-body);
  color: var(--ink);
  flex: none;
}
.en-desc {
  flex: 1;
  font-weight: 700;
  font-size: var(--fs-small);
  color: var(--ink-faint);
  text-align: right;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.en-arrow {
  color: var(--ink-faint);
  flex: none;
}
.foot {
  text-align: center;
  color: var(--ink-faint);
  font-size: 12px;
  font-weight: 600;
  margin: 0;
}
</style>
