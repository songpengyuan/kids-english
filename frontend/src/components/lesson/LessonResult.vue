<script setup lang="ts">
/**
 * 结算页（阶段 1-3：闯关/自由练习两套结算统一）。
 *
 * - 星星展示（1~3 星渐次弹出）；
 * - 闯关模式：第 N 关完成大徽章 + 玩法名 + 重玩提示；
 * - 今日目标首次达成：连击火焰横幅；
 * - 开宝箱（ChestReward）**只在自由练习结算挂载**：
 *   2026-10-19 产品口径调整——闯关完成直接停在「第 N 关完成」大画面，不再插一段开箱；
 *   返回地图只走左上角 ←（闯关模式顶栏 back-label 就是「返回闯关地图」），
 *   底部保留「下一关」一个动作，避免孩子误点直接退出连锁闯关。
 * - 底部动作：下一关（quest）、再选玩法/下一课（free），由父组件处理。
 */
import { Star } from "@lucide/vue";
import { ref } from "vue";
import PathIcon from "../PathIcon.vue";
import ChestReward from "../rewards/ChestReward.vue";
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
}>();

const emit = defineEmits<{
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
      <!-- 闯关完成不开箱：停在大画面，只给「下一关」一个出口（返回地图走左上角 ←） -->
      <div v-if="nextLevel" class="btn-row">
        <BaseButton :disabled="navClicked" @click="nav(() => emit('goNextLevel'))">
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
  /* 星星实心亮金（--star-gold，比通用 --gold 更亮更暖） */
  color: var(--star-gold);
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
  color: var(--star-dim);
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
  color: var(--star-gold);
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
  font-size: var(--fs-hero);
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
.streak-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: var(--fw-strong);
  color: var(--streak-ink);
  background: var(--streak-bg);
  border-radius: var(--radius-pill);
  padding: 8px 16px;
}
.flame-ico {
  color: var(--streak-flame);
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
  /* ⚠️ 这里曾有一份 .card-reward / .card / .card.rarity-* / .card-tip 的**逐字重复**定义，
   * 而且因为上面 @media 的大括号多撑了一段，整块被吞进"手机横屏"媒体查询里 ——
   * 只在矮屏生效、且与媒体查询外的同名规则值完全相同，纯冗余（2026-10 删除）。
   * 2026-10-17：卡片奖励整体下线（奖励统一走宝藏罐），媒体查询内外两份都已清除。 */
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
