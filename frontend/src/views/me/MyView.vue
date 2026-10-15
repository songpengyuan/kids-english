<script setup lang="ts">
/**
 * 我的（/me）——孩子视角：
 *   - 身份卡：⭐ 总星星 + 🔥 连击
 *   - 今日目标
 *   - 大入口：宝藏罐 / 奥特曼卡片
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
import { ChevronRight, Flame, Star, Shield } from "@lucide/vue";
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
});

/** 身份卡：云模式登录后显示当前孩子（未登录保持"丞丞的学习小屋"） */
const kidName = computed(() => auth.currentChild?.name ?? "丞丞");
const kidAvatar = computed(() => auth.currentChild?.avatar ?? "🦊");

const allWords = lessons.flatMap((l) => l.words);
const weakCount = computed(() => dueWords(progress.getReviewQueue(), allWords).length);
const heroDone = computed(() => `${rewards.ownedCount} / ${FORM_TOTAL}`);

const goalPct = computed(() => {
  const r = streak.reviewGoal > 0 ? Math.min(1, streak.reviewed / streak.reviewGoal) : 1;
  const l = Math.min(1, streak.newLevels / 1);
  return Math.round(((r + l) / 2) * 100);
});

/** 今日学习 / 磨耳朵时长（汽水音乐式：大数字展示，点击进学习日历） */
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
</script>

<template>
  <div class="me view">
    <!-- 无顶部 header（汽水音乐式） -->
    <div class="me-body view-body">
      <!-- 今日学习 / 磨耳朵时长（汽水音乐式：总时长大数字置顶，点击进学习日历） -->
      <section class="today-card anim-pop" @click="sayToday">
        <div class="tc-head">
          <h3>今日学习</h3>
          <ChevronRight class="k-ico tc-arrow" />
        </div>
        <div class="tc-nums">
          <div class="tc-item">
            <span class="tc-big">{{ fmtMin(today.durationSec) }}</span>
            <span class="tc-label">学习</span>
          </div>
          <div class="tc-divider"></div>
          <div class="tc-item">
            <span class="tc-big">{{ fmtMin(today.listenSec ?? 0) }}</span>
            <span class="tc-label">磨耳朵</span>
          </div>
        </div>
        <p class="tc-foot">点我看看每天的学习情况</p>
      </section>

      <!-- 身份卡 -->
      <section class="profile card anim-fade-up" @click="sayProfile">
        <span class="pf-emoji">{{ kidAvatar }}</span>
        <div class="pf-info">
          <p class="pf-name">{{ kidName }}的学习小屋</p>
          <p class="pf-sub">
            <span class="pf-star"><Star class="k-ico star-fill" />{{ progress.totalStars }} 颗星</span>
            <span class="pf-flame"><Flame class="k-ico flame" />{{ streak.streak }} 天连击</span>
          </p>
        </div>
      </section>

      <!-- 今日目标 -->
      <section class="goal card anim-fade-up" :class="{ done: streak.todayDone }">
        <div class="goal-head">
          <h3>今日目标</h3>
          <span class="goal-state">{{ streak.todayDone ? "🎉 完成啦" : "加油" }}</span>
        </div>
        <div class="goal-bar"><div class="goal-fill" :style="{ width: goalPct + '%' }"></div></div>
        <p class="goal-line">复习 <b>{{ streak.reviewed }}/{{ streak.reviewGoal }}</b> · 新学 <b>{{ streak.newLevels }}/1</b></p>
      </section>

      <!-- 孩子大入口 -->
      <section class="kid-grid">
        <button class="kid-card treasure anim-fade-up" @click="sayEntry('宝藏罐', '/me/treasure')">
          <span class="kc-emoji">🎁</span>
          <span class="kc-name">宝藏罐</span>
          <span class="kc-desc">🐚 {{ rewards.shells }}</span>
        </button>
        <button class="kid-card cards anim-fade-up" style="animation-delay:0.08s" @click="sayEntry('我的卡片', '/me/cards')">
          <span class="kc-emoji">🎴</span>
          <span class="kc-name">奥特曼卡片</span>
          <span class="kc-desc">{{ cards.uniqueCount }}/{{ cards.allCards.length }} 张</span>
        </button>
        <button class="kid-card model3d anim-fade-up" style="animation-delay:0.16s" @click="sayEntry('3D英雄', '/me/model3d')">
          <span class="kc-emoji">🧑‍🚀</span>
          <span class="kc-name">3D 英雄</span>
          <span class="kc-desc">拖动看看</span>
        </button>
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
.me-body { display: flex; flex-direction: column; gap: var(--gap-s); width: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: max(var(--gap-m), env(safe-area-inset-top)) 0 var(--pad-y); }
.card { background: var(--card-bg); border-radius: var(--radius); box-shadow: var(--shadow-hard); padding: var(--gap-m); }
.profile { display: flex; align-items: center; gap: var(--gap-m); border-left: 8px solid var(--yellow); }
.pf-emoji { font-size: var(--fs-emoji-xl); }
.pf-name { margin: 0; font-weight: 800; font-size: var(--fs-body); }
.pf-sub { margin: 4px 0 0; display: flex; gap: var(--gap-s); font-weight: 800; font-size: var(--fs-small); color: var(--ink-soft); }
.pf-star .k-ico { color: var(--gold); }
.pf-flame { display: inline-flex; align-items: center; gap: 4px; }
.pf-flame .k-ico { color: #ff6b3d; }
/* 今日学习时长卡片（汽水音乐式） */
.today-card {
  background: linear-gradient(135deg, var(--green-dark, #2c6e49), var(--green, #4c9a6b));
  color: #fff;
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-m);
  cursor: pointer;
}
.tc-head { display: flex; justify-content: space-between; align-items: center; }
.tc-head h3 { margin: 0; font-size: var(--fs-small); font-weight: 800; opacity: 0.9; letter-spacing: 1px; }
.tc-arrow { width: 16px; height: 16px; opacity: 0.9; }
.tc-nums { display: flex; align-items: center; gap: var(--gap-m); margin-top: var(--gap-s); }
.tc-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.tc-big { font-size: 26px; font-weight: 900; letter-spacing: 1px; }
.tc-label { font-size: 12px; font-weight: 700; opacity: 0.85; }
.tc-divider { width: 1px; height: 34px; background: rgba(255, 255, 255, 0.35); }
.tc-foot { margin: var(--gap-s) 0 0; text-align: center; font-size: 12px; font-weight: 700; opacity: 0.8; }
.goal { display: flex; flex-direction: column; gap: var(--gap-s); }
.goal.done { box-shadow: var(--shadow-hard), inset 0 0 0 2px var(--green); }
.goal-head { display: flex; justify-content: space-between; align-items: baseline; }
.goal-head h3 { margin: 0; }
.goal-state { font-weight: 800; font-size: var(--fs-small); color: var(--ink-soft); }
.goal-bar { height: 10px; border-radius: 999px; background: var(--line); overflow: hidden; }
.goal-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--green), var(--green-dark)); transition: width 0.5s; }
.goal-line { margin: 0; font-weight: 700; font-size: var(--fs-small); color: var(--ink-soft); }
.goal-line b { color: var(--ink); }
.kid-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gap-s); }
.kid-card { border-radius: var(--radius); padding: var(--gap-m); display: flex; flex-direction: column; align-items: center; gap: 6px; box-shadow: var(--shadow-hard); transition: transform 0.08s; }
.kid-card:active { transform: scale(0.96); }
.kid-card.treasure { background: linear-gradient(180deg, #fef3c7, #fde68a); }
.kid-card.cards { background: linear-gradient(180deg, #dbeafe, #bfdbfe); }
.kid-card.model3d { background: linear-gradient(180deg, #e9d5ff, #ddd6fe); }
.kc-emoji { font-size: 48px; }
.kc-name { font-weight: 900; font-size: var(--fs-body); }
.kc-desc { font-weight: 800; font-size: var(--fs-small); color: var(--ink-soft); }
.entry { display: flex; align-items: center; gap: var(--gap-m); background: var(--card-bg); border-radius: var(--radius); box-shadow: var(--shadow-hard); padding: var(--gap-s) var(--gap-m); text-align: left; }
.en-ico { font-size: 24px; }
.en-cap { font-weight: 800; flex: none; }
.en-desc { flex: 1; text-align: right; font-size: var(--fs-small); color: var(--ink-faint); font-weight: 700; }
.en-arrow { color: var(--ink-faint); }
.parent-entry { display: flex; align-items: center; justify-content: center; gap: 6px; padding: var(--gap-s); margin-top: auto; font-size: 13px; font-weight: 700; color: var(--ink-faint); background: none; }
.parent-entry .k-ico { width: 16px; height: 16px; }
</style>
