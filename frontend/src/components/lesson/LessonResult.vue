<script setup lang="ts">
/**
 * 结算页（阶段 1-3：闯关/自由练习两套结算统一）。
 *
 * - 星星展示（1~3 星渐次弹出）；
 * - 闯关模式：第 N 关完成大徽章 + 玩法名 + 重玩提示；
 * - 今日目标首次达成：连击火焰横幅；
 * - 开宝箱（ChestReward）统一挂载，25% 随机掉英雄卡片；
 * - 底部动作：返回地图/下一关（quest）、再选玩法/下一课（free），由父组件处理。
 */
import { Star } from "@lucide/vue";
import { ref } from "vue";
import PathIcon from "../PathIcon.vue";
import ChestReward from "../rewards/ChestReward.vue";

import type { Card } from "../../stores/cards";
import BaseButton from "../ui/BaseButton.vue";

defineProps<{
  mode: "quest" | "free";
  stars: number;
  streakJustHit: boolean;
  streakDays: number;
  questLevel?: number;
  actName?: string;
  nextLevel?: { actKey: string; name: string } | null;
  nextLesson?: { id: string; title: string } | null;
  /** 课内通关奖励卡片 */
  rewardCard?: Card | null;
}>();

const emit = defineEmits<{
  backToMap: [];
  goNextLevel: [];
  toMenu: [];
  goNextLesson: [];
}>();

/**
 * 宝箱收取完就卸载 —— ChestReward 通过 @done 通知（收取完成 / 点关闭）。
 * 之前这里没接 @done：收取后组件仍留在 collected 态，界面卡在"已收进宝藏罐"没法退出。
 */
const chestDone = ref(false);
/** 防止"下一关/下一课"按钮重复点击导致连续跳转 */
const navClicked = ref(false);
function nav(fn: () => void) {
  if (navClicked.value) return;
  navClicked.value = true;
  fn();
}
</script>

<template>
  <div class="result view-body view-center">
    <!-- 闯关：关卡完成大画面 -->
    <template v-if="mode === 'quest'">
      <div class="quest-done-badge anim-pop">第 {{ questLevel }} 关完成！</div>
      <div class="stars">
        <span
          v-for="n in 3"
          :key="n"
          class="star"
          :class="{ dim: n > stars }"
          :style="{ '--d': n * 0.28 + 's' }"
        >
          <Star class="k-ico star-fill" />
        </span>
      </div>
      <h2>{{ actName }} · 获得 <span class="star-num">{{ stars }}</span> 颗星</h2>
      <p v-if="stars < 3" class="quest-total-stars">重玩可拿满 3 星</p>
      <!-- 今日目标首次达成：连击火焰横幅 -->
      <div v-if="streakJustHit" class="streak-banner anim-pop">
        <PathIcon name="flame" class="k-ico flame-ico" /> 今日目标达成！已连续 {{ streakDays }} 天
      </div>
      <!-- 普通关卡完成也开宝箱：与所有宝箱统一规则，25% 随机掉英雄卡片 -->
      <ChestReward v-if="!chestDone" @done="chestDone = true" />
      <div class="btn-row">
        <BaseButton variant="green" @click="emit('backToMap')">返回闯关地图</BaseButton>
        <BaseButton v-if="nextLevel" :disabled="navClicked" @click="nav(() => emit('goNextLevel'))">
          下一关：<PathIcon :name="nextLevel.actKey" /> {{ nextLevel.name }} →
        </BaseButton>
      </div>
    </template>

    <!-- 自由练习 -->
    <template v-else>
      <div class="stars">
        <span
          v-for="n in 3"
          :key="n"
          class="star"
          :class="{ dim: n > stars }"
          :style="{ '--d': n * 0.28 + 's' }"
        >
          <Star class="k-ico star-fill" />
        </span>
      </div>
      <h2>真棒！获得 <span class="star-num">{{ stars }}</span> 颗星</h2>
      <!-- 课内通关：奥特曼卡片奖励 -->
      <div v-if="rewardCard" class="card-reward anim-pop">
        <div class="card" :class="'rarity-' + rewardCard.rarity">
          <div class="card-emoji">{{ rewardCard.emoji }}</div>
          <div class="card-name">{{ rewardCard.name }}</div>
          <div class="card-rarity">{{ rewardCard.rarity }}</div>
        </div>
        <p class="card-tip">🎉 获得新卡片！</p>
      </div>
      <div v-if="streakJustHit" class="streak-banner anim-pop">
        <PathIcon name="flame" class="k-ico flame-ico" /> 今日目标达成！已连续 {{ streakDays }} 天
      </div>
      <!-- 收取完成（或点关闭）就卸载，避免卡在"已收进宝藏罐"那一屏 -->
      <ChestReward v-if="!chestDone" @done="chestDone = true" />
      <div class="btn-row">
        <BaseButton variant="green" @click="emit('toMenu')">再选一个玩法</BaseButton>
        <BaseButton v-if="nextLesson" variant="gray" :disabled="navClicked" @click="nav(() => emit('goNextLesson'))">
          下一课：<PathIcon :name="nextLesson.id" /> {{ nextLesson.title }}
        </BaseButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.stars {
  display: flex;
  gap: var(--gap-m);
  justify-content: center;
  align-items: center;
  margin: 6px 0 4px;
}
.star {
  position: relative;
  width: clamp(56px, 12vh, 80px);
  height: clamp(56px, 12vh, 80px);
  display: flex;
  align-items: center;
  justify-content: center;
  /* 星星实心金色（原 --star-gold 未定义导致深色，这里直接给值） */
  color: #ffb020;
}
/* 拿到手的星：金色实心 + 光晕 + 逐个弹出（第 1/2/3 颗错峰 0.28s 出现） */
.star-fill {
  fill: currentColor;
}
.star:not(.dim) {
  filter: drop-shadow(0 4px 14px rgba(255, 176, 32, 0.5));
}
.star:not(.dim) .star-fill {
  animation: star-pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  animation-delay: var(--d);
}
.star:not(.dim)::after {
  content: "";
  position: absolute;
  inset: -8%;
  z-index: -1;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 193, 7, 0.4), transparent 62%);
  animation: star-glow 0.6s ease both;
  animation-delay: var(--d);
}
/* 没拿到的星：淡灰，也要逐个淡入但不出光 */
.star.dim {
  color: #d8d0be;
  filter: none;
}
.star.dim .star-fill {
  animation: star-fade 0.45s ease both;
  animation-delay: var(--d);
}
/* 中间的星抬高一档（多邻国式三星构图） */
.star:nth-child(2) {
  margin-top: -14px;
}
.star .k-ico {
  width: 100%;
  height: 100%;
}
/* 逐星入场：从小旋转弹出 + 定型后轻微悬浮 */
@keyframes star-pop {
  0% {
    opacity: 0;
    transform: scale(0) rotate(-30deg);
  }
  60% {
    opacity: 1;
    transform: scale(1.25) rotate(6deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0);
  }
}
@keyframes star-glow {
  0% {
    opacity: 0;
    transform: scale(0.4);
  }
  55% {
    opacity: 1;
    transform: scale(1.15);
  }
  100% {
    opacity: 0.85;
    transform: scale(1);
  }
}
@keyframes star-fade {
  0% {
    opacity: 0;
    transform: scale(0.5);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
.star:not(.dim) .star-fill {
  animation: star-pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both,
    float-y 2.4s ease-in-out 0.9s infinite;
}
.star-num {
  color: #ffb020;
  font-size: 1.2em;
}
.btn-row {
  display: flex;
  gap: var(--gap-s);
  flex-wrap: wrap;
  justify-content: center;
}
/* 关卡完成大徽章：暖金渐变（token 混色，暗色主题自动跟随） */
.quest-done-badge {
  font-weight: var(--fw-strong);
  font-size: var(--fs-big);
  color: var(--ink);
  background: linear-gradient(180deg, var(--card-bg), color-mix(in srgb, var(--yellow) 20%, var(--card-bg)));
  border: 3px solid color-mix(in srgb, var(--yellow) 70%, transparent);
  padding: 10px 22px;
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-hard);
}
.quest-total-stars {
  margin: 0;
  font-weight: var(--fw-mid);
  font-size: var(--fs-small);
  color: var(--ink-faint);
}
/* 奥特曼卡片奖励 */
.card-reward {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.card {
  width: clamp(120px, 22vh, 160px);
  border-radius: var(--radius);
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: linear-gradient(180deg, #fff, #fef3c7);
  border: 3px solid var(--gold, #f0b429);
  box-shadow: 0 4px 20px rgba(240, 180, 41, 0.4);
}
.card.rarity-SR {
  border-color: #a855f7;
  box-shadow: 0 4px 20px rgba(168, 85, 247, 0.4);
  background: linear-gradient(180deg, #fff, #f3e8ff);
}
.card.rarity-SSR {
  border-color: #f59e0b;
  box-shadow: 0 0 30px rgba(245, 158, 11, 0.6);
  background: linear-gradient(180deg, #fffbeb, #fef3c7);
}
.card-emoji {
  font-size: 48px;
}
.card-name {
  font-weight: var(--fw-strong);
  font-size: 14px;
}
.card-rarity {
  font-size: 12px;
  font-weight: var(--fw-strong);
  color: var(--gold, #f0b429);
  background: rgba(240, 180, 41, 0.15);
  padding: 2px 10px;
  border-radius: var(--radius-pill);
}
.card-tip {
  margin: 0;
  font-weight: var(--fw-strong);
}
.streak-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: var(--fw-strong);
  color: #b45309;
  background: #fef3c7;
  border-radius: var(--radius-pill);
  padding: 8px 16px;
}
.flame-ico {
  color: #ea580c;
}

/* 手机横屏（项目约定断点）：纵向空间珍贵，星星/徽章/按钮全线收紧 */
@media (max-height: 480px) {
  .stars {
    gap: var(--gap-s);
  }
  .star {
    width: 44px;
    height: 44px;
  }
  .star:nth-child(2) {
    margin-top: -8px;
  }
  .star-num {
    font-size: 1.1em;
  }
  h2 {
    margin: 2px 0;
    font-size: var(--fs-body);
  }
  .quest-done-badge {
    font-size: var(--fs-title);
    padding: 6px 16px;
    border-width: 2px;
  }
  /* 奥特曼卡片奖励 */
.card-reward {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.card {
  width: clamp(120px, 22vh, 160px);
  border-radius: var(--radius);
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: linear-gradient(180deg, #fff, #fef3c7);
  border: 3px solid var(--gold, #f0b429);
  box-shadow: 0 4px 20px rgba(240, 180, 41, 0.4);
}
.card.rarity-SR {
  border-color: #a855f7;
  box-shadow: 0 4px 20px rgba(168, 85, 247, 0.4);
  background: linear-gradient(180deg, #fff, #f3e8ff);
}
.card.rarity-SSR {
  border-color: #f59e0b;
  box-shadow: 0 0 30px rgba(245, 158, 11, 0.6);
  background: linear-gradient(180deg, #fffbeb, #fef3c7);
}
.card-emoji {
  font-size: 48px;
}
.card-name {
  font-weight: var(--fw-strong);
  font-size: 14px;
}
.card-rarity {
  font-size: 12px;
  font-weight: var(--fw-strong);
  color: var(--gold, #f0b429);
  background: rgba(240, 180, 41, 0.15);
  padding: 2px 10px;
  border-radius: var(--radius-pill);
}
.card-tip {
  margin: 0;
  font-weight: var(--fw-strong);
}
.streak-banner {
    padding: 5px 12px;
    font-size: var(--fs-small);
  }
  .btn-row .k-btn {
    min-height: 44px;
    padding: 8px 14px;
    font-size: var(--fs-small);
  }
}
</style>
