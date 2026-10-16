<script setup lang="ts">
/**
 * SpeakWave —— 「正在朗读」声波指示器（设计系统第 ③ 层）
 *
 * 抽出来的原因：这个 `<span class="wave"><i/><i/><i/></span>` + 一份
 * `wave-bounce` keyframes，在 MatchView / QuizView / HeroDetailView 里
 * **一字不差地写了三遍**（只在外层颜色和尺寸上略有出入）。三处只要改一处
 * 动画参数，另外两处就会慢慢飘——所以尺寸差异也收进 size，而不是各写各的。
 *
 * 语义：纯装饰，aria-hidden 由组件自带（朗读状态另有文字/颜色提示负责无障碍），
 * 调用方不需要再写一遍。
 *
 * 用法：
 *   <SpeakWave v-if="speaking" />                     默认中号，跟随 currentColor
 *   <SpeakWave size="sm" />                           chip/句卡里的紧凑型
 *   <SpeakWave size="lg" tone="var(--blue)" />        大按钮内 + 指定颜色
 */
withDefaults(
  defineProps<{
    /** sm=紧凑（chip 内） / md=默认 / lg=大按钮内 */
    size?: "sm" | "md" | "lg";
    /** 波纹颜色，默认跟随父级文字色 */
    tone?: string;
  }>(),
  { size: "md", tone: "currentColor" }
);

/** 三档尺寸：条宽 / 静止高 / 峰值高，一处定义三处复用 */
const SIZES = {
  sm: { w: "3px", base: "4px", peak: "9px", h: "10px" },
  md: { w: "3px", base: "4px", peak: "11px", h: "12px" },
  lg: { w: "4px", base: "6px", peak: "15px", h: "16px" },
} as const;
</script>

<template>
  <span
    class="speak-wave"
    aria-hidden="true"
    :style="{
      '--wave-w': SIZES[size].w,
      '--wave-base': SIZES[size].base,
      '--wave-peak': SIZES[size].peak,
      '--wave-h': SIZES[size].h,
      '--wave-tone': tone,
    }"
  >
    <i></i><i></i><i></i>
  </span>
</template>

<style scoped>
.speak-wave {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: var(--wave-h);
  margin-left: 2px;
  flex: none;
  pointer-events: none;
}
.speak-wave i {
  width: var(--wave-w);
  height: var(--wave-base);
  border-radius: 2px;
  background: var(--wave-tone);
  animation: speak-wave-bounce 0.7s ease-in-out infinite;
}
.speak-wave i:nth-child(2) {
  animation-delay: 0.14s;
}
.speak-wave i:nth-child(3) {
  animation-delay: 0.28s;
}
@keyframes speak-wave-bounce {
  0%,
  100% {
    height: var(--wave-base);
  }
  50% {
    height: var(--wave-peak);
  }
}

/* 尊重系统"减少动态效果"：不闪但保留静态形态，仍看得出"在朗读" */
@media (prefers-reduced-motion: reduce) {
  .speak-wave i {
    animation: none;
    height: var(--wave-peak);
  }
}
</style>
