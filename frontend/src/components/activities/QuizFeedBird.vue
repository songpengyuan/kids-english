<script setup lang="ts">
/**
 * 听音选图的「喂乐乐鸟」舞台角色（2026-11-15 杠杆③ 玩法玩具化皮肤首例）。
 *
 * 设计口径（讨论拍板：听音选图→喂怪兽，逻辑不动换皮；素材纪律=零新画）：
 *  - 喂的是乐乐鸟本人而非新画怪兽——复用吉祥物资产，和角色贯穿/收藏册体系
 *    闭环（孩子喂自己熟悉的角色，attachment 更深）；
 *  - 纯展示件：情绪由父组件（QuizView）按答题结果驱动——idle 呼吸待喂 /
 *    yum 答对嚼词 / oops 答错垂头；飞行入嘴由父组件经 useFlyToEl 编排；
 *  - 舞台内有实体鸟时，全局吉祥物浮层在 quiz 内退位（避免两只鸟同框）。
 */
import { ref } from "vue";

defineProps<{ mood: "idle" | "yum" | "oops" }>();

/** 根元素暴露给父组件：飞行食物的落点（鸟嘴中心） */
const root = ref<HTMLElement | null>(null);
defineExpose({ root });
</script>

<template>
  <div ref="root" class="feed-bird" :class="`feed-bird--${mood}`" aria-hidden="true">
    <img class="feed-bird__img" src="/mascot/toucan.webp" alt="" draggable="false" />
  </div>
</template>

<style scoped>
.feed-bird {
  flex: none;
  width: clamp(56px, 10vw, 80px);
  pointer-events: none; /* 纯展示：不吃触控，点了算喇叭的 */
  user-select: none;
}
.feed-bird__img {
  width: 100%;
  height: auto;
  display: block;
  border-radius: var(--radius-pill);
  background: var(--white);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-chip);
}
/* idle：呼吸待喂 */
.feed-bird--idle .feed-bird__img {
  animation: feed-breathe 3.2s ease-in-out infinite;
}
/* yum：答对嚼词——快速压扁弹起 ×2（prefers-reduced-motion 全局兜底停摆） */
.feed-bird--yum .feed-bird__img {
  animation: feed-chew 0.45s ease-in-out 2;
}
/* oops：答错垂头 */
.feed-bird--oops .feed-bird__img {
  animation: feed-droop 0.6s ease-out both;
}
@keyframes feed-breathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.06);
  }
}
@keyframes feed-chew {
  0%,
  100% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.14, 0.86);
  }
  70% {
    transform: scale(0.92, 1.08);
  }
}
@keyframes feed-droop {
  0% {
    transform: rotate(0deg);
  }
  45% {
    transform: rotate(-9deg) translateY(3px);
  }
  100% {
    transform: rotate(-6deg) translateY(1px);
  }
}
</style>
