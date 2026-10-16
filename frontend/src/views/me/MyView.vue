<script setup lang="ts">
/**
 * 我的（/me）——孩子视角（汽水音乐式 v2 重设计）：
 *   - Hero：水蓝渐变头部（身份 + 今日学习/磨耳朵大数字 + 日历入口）
 *   - 数据小卡行：贝壳 / 卡片 / 英雄
 *   - 今日目标
 *   - 到期复习
 *   家长内容（报告/设置/统计）收进"家长中心"
 */
import { computed, onMounted, ref } from "vue";
import { useProgressStore } from "../../stores/progress";
import { useRewardsStore } from "../../stores/rewards";
import { FORM_TOTAL } from "../../data/heroes";
import { useStreakStore } from "../../stores/streak";
import { useCardsStore } from "../../stores/cards";
import { useAuthStore } from "../../stores/auth";
import { useRoute, useRouter } from "vue-router";
import { lessons } from "../../data/lessons";
import { dueWords } from "../../utils/reviewQueue";
import ParentGate from "../../components/gate/ParentGate.vue";
import { ChevronRight, Flame, Star, Shield, CalendarDays } from "@lucide/vue";
import { speakZh } from "../../services/speech";

const progress = useProgressStore();
const rewards = useRewardsStore();
const streak = useStreakStore();
const cards = useCardsStore();
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

/** 家长门禁弹层（双模式壳层）：家长中心需答对算术题才放行 */
const showGate = ref(false);

/**
 * 家长中心入口（亲子模式壳）：
 *  - 已解锁（本会话答对过）→ 直接进；
 *  - 未解锁 → 弹算术门禁，答对后进入；
 *  - 守卫重定向深链 ?parentGate=1（手动输入家长区 URL）→ 自动弹门禁。
 */
function openParent() {
  speakZh("家长中心");
  if (auth.parentUnlocked) {
    router.push("/me/parent");
    return;
  }
  showGate.value = true;
}
function onGatePass() {
  auth.unlockParent();
  showGate.value = false;
  router.push("/me/parent");
}
function onGateClose() {
  showGate.value = false;
}
onMounted(() => {
  // 深链/守卫重定向回来：?parentGate=1 → 弹门禁，并清掉 query（避免刷新重复弹）
  if (route.query.parentGate === "1") {
    showGate.value = true;
    router.replace({ query: {} });
  }
  // 进入"我的"页拉一次云端最新进度（今日学习/磨耳朵跨设备可见；失败静默，保留本地）
  progress.syncFromServer();
});

/** 身份：云模式登录后显示当前孩子（未登录保持"丞丞的学习小屋"） */
const kidName = computed(() => auth.currentChild?.name ?? "丞丞");
const kidAvatar = computed(() => auth.currentChild?.avatar ?? "🦊");

const allWords = lessons.flatMap((l) => l.words);
const weakCount = computed(() => dueWords(progress.getReviewQueue(), allWords).length);

const goalPct = computed(() => {
  const r = streak.reviewGoal > 0 ? Math.min(1, streak.reviewed / streak.reviewGoal) : 1;
  const l = Math.min(1, streak.newLevels / 1);
  return Math.round(((r + l) / 2) * 100);
});

/** 今日学习 / 磨耳朵时长（汽水音乐式大数字，点击进学习日历） */
const today = progress.todayStats;
function fmtMin(sec: number): string {
  const m = Math.round((sec || 0) / 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}小时${m % 60 ? m % 60 + "分" : ""}`;
  }
  return `${m}分钟`;
}
function sayToday() {
  speakZh(`今天学了${fmtMin(today.durationSec)}，磨耳朵${fmtMin(today.listenSec ?? 0)}`);
  router.push("/me/calendar");
}

function sayProfile() {
  speakZh(`${kidName.value}的学习小屋，${progress.totalStars} 颗星，${streak.streak} 天连击`);
}
function sayEntry(name: string, path: string) {
  speakZh(name);
  router.push(path);
}

function goGame() {
  speakZh("游戏闯关");
  const id = progress.lastLesson || lessons[0]?.id || "l4";
  router.push(`/game/lesson/${id}`);
}
</script>

<template>
  <div class="me view">
    <!-- 无顶部 header（汽水音乐式） -->
    <div class="me-body">
      <!-- Hero：水蓝渐变头部（身份 + 今日大数字 + 日历入口，点击整卡进日历） -->
      <section class="hero anim-pop" @click="sayToday">
        <span class="hero-deco hero-deco-a" aria-hidden="true">🎵</span>
        <span class="hero-deco hero-deco-b" aria-hidden="true">⭐</span>
        <button class="hero-cal" aria-label="学习日历" @click.stop="sayToday">
          <CalendarDays class="k-ico" /> 日历
        </button>

        <div class="hero-id">
          <span class="hero-avatar" aria-hidden="true" @click.stop="sayProfile">{{ kidAvatar }}</span>
          <div class="hero-id-info">
            <p class="hero-name">{{ kidName }}</p>
            <p class="hero-meta">
              <span><Star class="k-ico star-fill" />{{ progress.totalStars }} 颗星</span>
              <span><Flame class="k-ico flame" />{{ streak.streak }} 天连击</span>
            </p>
          </div>
        </div>

        <div class="hero-nums">
          <div class="hn-item">
            <span class="hn-icon" aria-hidden="true">📖</span>
            <span class="hn-big">{{ fmtMin(today.durationSec) }}</span>
            <span class="hn-label">今日学习</span>
          </div>
          <div class="hn-divider" aria-hidden="true"></div>
          <div class="hn-item">
            <span class="hn-icon" aria-hidden="true">🎧</span>
            <span class="hn-big">{{ fmtMin(today.listenSec ?? 0) }}</span>
            <span class="hn-label">磨耳朵</span>
          </div>
        </div>
        <p class="hero-foot">点我看看每天的学习情况 →</p>
      </section>

      <!-- 数据小卡行（贝壳 / 卡片 / 英雄，点击进对应页面） -->
      <section class="stat-row">
        <button class="stat anim-fade-up" @click="sayEntry('宝藏罐', '/me/treasure')">
          <span class="st-emoji" aria-hidden="true">🐚</span>
          <span class="st-num">{{ rewards.shells }}</span>
          <span class="st-label">贝壳</span>
        </button>
        <button class="stat anim-fade-up" style="animation-delay:0.06s" @click="sayEntry('我的卡片', '/me/cards')">
          <span class="st-emoji" aria-hidden="true">🎴</span>
          <span class="st-num">{{ cards.uniqueCount }}/{{ cards.allCards.length }}</span>
          <span class="st-label">卡片</span>
        </button>
        <button class="stat anim-fade-up" style="animation-delay:0.12s" @click="sayEntry('3D英雄', '/me/model3d')">
          <span class="st-emoji" aria-hidden="true">🧑‍🚀</span>
          <span class="st-num">{{ rewards.ownedCount }}/{{ FORM_TOTAL }}</span>
          <span class="st-label">英雄</span>
        </button>
      </section>

      <!-- 闯关挑战 -->
      <button class="game-entry anim-fade-up" @click="goGame">
        <span class="ge-emoji">🎮</span>
        <div class="ge-body">
          <span class="ge-title">闯关挑战</span>
          <span class="ge-sub">打完单词，进游戏赢英雄卡</span>
        </div>
        <ChevronRight class="k-ico ge-arrow" />
      </button>

      <!-- 今日目标 -->
      <section class="goal card anim-fade-up" :class="{ done: streak.todayDone }">
        <div class="goal-head">
          <h3>今日目标</h3>
          <span class="goal-state">{{ streak.todayDone ? "🎉 完成啦" : "加油" }}</span>
        </div>
        <div class="goal-bar"><div class="goal-fill" :style="{ width: goalPct + '%' }"></div></div>
        <p class="goal-line">复习 <b>{{ streak.reviewed }}/{{ streak.reviewGoal }}</b> · 新学 <b>{{ streak.newLevels }}/1</b></p>
      </section>

      <!-- 到期复习 -->
      <button v-if="weakCount > 0" class="entry anim-fade-up" @click="sayEntry('复习一下', '/learn/review')">
        <span class="en-ico">📖</span>
        <span class="en-cap">复习一下</span>
        <span class="en-desc">{{ weakCount }} 个词</span>
        <ChevronRight class="k-ico en-arrow" />
      </button>

      <!-- 家长中心（双模式门禁入口） -->
      <button class="parent-entry anim-fade-up" @click="openParent">
        <Shield class="k-ico" />
        <span>家长中心</span>
        <ChevronRight class="k-ico" />
      </button>
    </div>

    <!-- 家长门禁弹层：答对算术题解锁（防孩子误入家长区） -->
    <ParentGate v-if="showGate" @pass="onGatePass" @close="onGateClose" />
  </div>
</template>

<style scoped>
/* 滚动容器：子项不参与 flex 压缩（时长数字永不塌陷） */
.me-body { display: flex; flex-direction: column; gap: var(--gap-s); width: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: max(var(--gap-m), env(safe-area-inset-top)) 0 var(--pad-y); }
.me-body > * { flex-shrink: 0; }

/* ---------- Hero：水蓝渐变头部（身份 + 大数字 + 日历） ---------- */
.hero {
  position: relative;
  overflow: hidden;
  background: var(--brand-grad, linear-gradient(135deg, #1e7fd0, #38a3e8, #6cc3f5));
  color: #fff;
  border-radius: 24px;
  box-shadow: 0 10px 26px rgba(23, 110, 180, 0.32);
  padding: 16px 18px 14px;
  cursor: pointer;
}
.hero-deco { position: absolute; opacity: 0.16; pointer-events: none; }
.hero-deco-a { right: -8px; top: -12px; font-size: 56px; transform: rotate(18deg); }
.hero-deco-b { left: -16px; bottom: -22px; font-size: 48px; transform: rotate(-12deg); }
.hero-cal {
  position: absolute; right: 14px; top: 14px;
  display: inline-flex; align-items: center; gap: 4px;
  background: rgba(255, 255, 255, 0.22);
  border: none; border-radius: 999px; padding: 6px 12px;
  font-size: 12px; font-weight: 800; color: #fff;
}
.hero-cal .k-ico { width: 14px; height: 14px; }
.hero-id { display: flex; align-items: center; gap: 12px; margin-top: 24px; }
.hero-avatar {
  font-size: 32px; width: 52px; height: 52px; flex: none;
  background: rgba(255, 255, 255, 0.22);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.hero-name { margin: 0; font-size: 17px; font-weight: 900; line-height: 1.25; }
.hero-meta { margin: 5px 0 0; display: flex; gap: 14px; font-size: 12px; font-weight: 800; opacity: 0.92; }
.hero-meta .k-ico { width: 13px; height: 13px; }
.star-fill { color: #ffd76e; }
.flame { color: #ffb199; }
.hero-nums { display: flex; align-items: center; gap: var(--gap-m); margin-top: 18px; }
.hn-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.hn-icon { font-size: 20px; line-height: 1; }
.hn-big { font-size: 26px; font-weight: 900; letter-spacing: 0.5px; line-height: 1.1; }
.hn-label { font-size: 12px; font-weight: 800; opacity: 0.9; }
.hn-divider { width: 1px; height: 54px; background: rgba(255, 255, 255, 0.35); }
.hero-foot { margin: 14px 0 0; text-align: center; font-size: 12px; font-weight: 700; opacity: 0.85; }

/* ---------- 数据小卡行 ---------- */
.stat-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--gap-s); }
.stat { background: var(--card-bg); border-radius: 18px; box-shadow: var(--shadow-soft); padding: 14px 8px; display: flex; flex-direction: column; align-items: center; gap: 4px; transition: transform 0.08s; }
.stat:active { transform: scale(0.96); }
.st-emoji { font-size: 28px; line-height: 1.2; }
.st-num { font-size: 17px; font-weight: 900; color: var(--ink); line-height: 1.2; }
.st-label { font-size: 11px; font-weight: 700; color: var(--ink-faint); }

/* ---------- 今日目标 ---------- */
.card { background: var(--card-bg); border-radius: 18px; box-shadow: var(--shadow-soft); padding: 16px; }
.goal { display: flex; flex-direction: column; gap: 8px; }
.goal.done { box-shadow: var(--shadow-soft), inset 0 0 0 2px var(--ok); }
.goal-head { display: flex; justify-content: space-between; align-items: baseline; }
.goal-head h3 { margin: 0; font-size: 15px; font-weight: 900; }
.goal-state { font-weight: 800; font-size: 12px; color: var(--ink-soft); }
.goal-bar { height: 8px; border-radius: 999px; background: var(--line); overflow: hidden; }
.goal-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--brand), var(--brand-dark)); transition: width 0.5s; }
.goal-line { margin: 0; font-weight: 700; font-size: 12px; color: var(--ink-soft); }
.goal-line b { color: var(--ink); }

/* ---------- 入口行（闯关 / 复习 / 家长） ---------- */
.game-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 18px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.3);
  text-align: left;
}
.game-entry:active { transform: scale(0.98); }
.ge-emoji { font-size: 28px; }
.ge-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.ge-title { font-size: 15px; font-weight: 900; }
.ge-sub { font-size: 12px; font-weight: 700; opacity: 0.85; }
.ge-arrow { width: 18px; height: 18px; opacity: 0.8; }

.entry {
  display: flex; align-items: center; gap: 12px;
  background: var(--card-bg); border-radius: 18px; box-shadow: var(--shadow-soft);
  padding: 14px 16px; text-align: left;
}
.en-ico { font-size: 24px; }
.en-cap { font-weight: 800; font-size: 14px; flex: none; }
.en-desc { flex: 1; text-align: right; font-size: 12px; color: var(--ink-faint); font-weight: 700; }
.en-arrow { color: var(--ink-faint); width: 18px; height: 18px; }

.parent-entry {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 12px; margin-top: 4px;
  font-size: 13px; font-weight: 700; color: var(--ink-faint);
  background: var(--card-bg); border-radius: 18px; box-shadow: var(--shadow-soft);
}
.parent-entry .k-ico { width: 16px; height: 16px; }
</style>
