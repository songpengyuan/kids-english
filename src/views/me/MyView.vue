<script setup lang="ts">
/**
 * 我的（/me）——孩子视角：
 *   - 身份卡：⭐ 总星星 + 🔥 连击
 *   - 今日目标
 *   - 大入口：宝藏罐 / 奥特曼卡片
 *   - 到期复习
 *   家长内容（报告/设置/统计）收进"家长中心"
 */
import { computed } from "vue";
import { useProgressStore } from "../../stores/progress";
import { useRewardsStore } from "../../stores/rewards";
import { FORM_TOTAL } from "../../data/heroes";
import { useStreakStore } from "../../stores/streak";
import { useCardsStore } from "../../stores/cards";
import { useRouter } from "vue-router";
import { lessons } from "../../data/lessons";
import { dueWords } from "../../utils/reviewQueue";
import AppHeader from "../../components/layout/AppHeader.vue";
import { ChevronRight, Flame, Star, Shield } from "@lucide/vue";
import { speakZh } from "../../services/speech";

const progress = useProgressStore();
const rewards = useRewardsStore();
const streak = useStreakStore();
const cards = useCardsStore();
const router = useRouter();

const allWords = lessons.flatMap((l) => l.words);
const weakCount = computed(() => dueWords(progress.getReviewQueue(), allWords).length);
const heroDone = computed(() => `${rewards.ownedCount} / ${FORM_TOTAL}`);

const goalPct = computed(() => {
  const r = streak.reviewGoal > 0 ? Math.min(1, streak.reviewed / streak.reviewGoal) : 1;
  const l = Math.min(1, streak.newLevels / 1);
  return Math.round(((r + l) / 2) * 100);
});

function sayProfile() {
  speakZh(`丞丞的学习小屋，${progress.totalStars} 颗星，${streak.streak} 天连击`);
}
function sayEntry(name: string, path: string) {
  speakZh(name);
  router.push(path);
}
</script>

<template>
  <div class="me view">
    <AppHeader title="我的" icon="me" hide-badges />
    <div class="me-body view-body">
      <!-- 身份卡 -->
      <section class="profile card anim-pop" @click="sayProfile">
        <span class="pf-emoji">🦊</span>
        <div class="pf-info">
          <p class="pf-name">丞丞的学习小屋</p>
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
      </section>

      <!-- 到期复习 -->
      <button v-if="weakCount > 0" class="entry anim-fade-up" @click="sayEntry('复习一下', '/learn/review')">
        <span class="en-ico">📖</span>
        <span class="en-cap">复习一下</span>
        <span class="en-desc">{{ weakCount }} 个词</span>
        <ChevronRight class="k-ico en-arrow" />
      </button>

      <!-- 家长中心 -->
      <button class="parent-entry anim-fade-up" @click="sayEntry('家长中心', '/me/parent')">
        <Shield class="k-ico" />
        <span>家长中心</span>
        <ChevronRight class="k-ico" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.me-body { display: flex; flex-direction: column; gap: var(--gap-s); width: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: var(--pad-y); }
.card { background: var(--card-bg); border-radius: var(--radius); box-shadow: var(--shadow-hard); padding: var(--gap-m); }
.profile { display: flex; align-items: center; gap: var(--gap-m); border-left: 8px solid var(--yellow); }
.pf-emoji { font-size: var(--fs-emoji-xl); }
.pf-name { margin: 0; font-weight: 800; font-size: var(--fs-body); }
.pf-sub { margin: 4px 0 0; display: flex; gap: var(--gap-s); font-weight: 800; font-size: var(--fs-small); color: var(--ink-soft); }
.pf-star .k-ico { color: var(--gold); }
.pf-flame { display: inline-flex; align-items: center; gap: 4px; }
.pf-flame .k-ico { color: #ff6b3d; }
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
