<script setup>
/**
 * 全站背景装饰 —— 低打扰的可爱元素（云朵 / 星星 / 气泡）。
 *
 * 原则：
 *  · pointer-events: none，绝不挡操作；
 *  · 只用主题 token 上色，暗色下自动变淡；
 *  · 动画都是缓慢的 CSS 循环，GPU 合成层，不耗电；
 *  · 手机横屏（高度 < 480px）整体隐藏，把每一像素高度留给内容。
 * 挂在 App.vue 最外层，所有页面共享，切换页面不重建。
 */
import { Star } from "@lucide/vue";

const stars = [
  { top: "12%", left: "6%", s: 1, d: 0 },
  { top: "26%", left: "88%", s: 0.7, d: 1.2 },
  { top: "64%", left: "4%", s: 0.85, d: 2.1 },
  { top: "78%", left: "92%", s: 1.1, d: 0.6 },
  { top: "44%", left: "96%", s: 0.6, d: 1.7 }
];
const dots = [
  { top: "18%", left: "22%", s: 10, d: 0.4 },
  { top: "70%", left: "14%", s: 7, d: 1.5 },
  { top: "84%", left: "70%", s: 12, d: 2.4 },
  { top: "8%", left: "70%", s: 8, d: 1.1 }
];
</script>

<template>
  <div class="backdrop" aria-hidden="true">
    <span class="cloud c1"></span>
    <span class="cloud c2"></span>
    <span class="cloud c3"></span>
    <Star
      v-for="(st, i) in stars"
      :key="'s' + i"
      class="star-fill deco-star"
      :style="{ top: st.top, left: st.left, '--s': st.s, '--d': st.d + 's' }"
    />
    <span
      v-for="(dt, i) in dots"
      :key="'d' + i"
      class="dot"
      :style="{ top: dt.top, left: dt.left, '--s': dt.s + 'px', '--d': dt.d + 's' }"
    ></span>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: -1; /* 负层级：垫在内容下面、body 背景上面（#app 不创建层叠上下文，恰好可用） */
  pointer-events: none;
  overflow: hidden;
}
.cloud {
  position: absolute;
  width: clamp(70px, 16vw, 150px);
  height: clamp(24px, 5.4vw, 48px);
  border-radius: 999px;
  background: color-mix(in srgb, var(--card-bg) 72%, transparent);
  box-shadow:
    calc(var(--w, 26px)) calc(var(--h, -12px)) 0 -4px color-mix(in srgb, var(--card-bg) 72%, transparent);
  animation: cloud-drift ease-in-out infinite alternate;
}
.cloud.c1 { --w: 26px; --h: -12px; top: 7%; left: 8%; animation-duration: 17s; }
.cloud.c2 { --w: 18px; --h: -9px; top: 17%; left: 58%; animation-duration: 23s; transform: scale(0.7); }
.cloud.c3 { --w: 14px; --h: -7px; top: 56%; left: 78%; animation-duration: 29s; transform: scale(0.5); opacity: 0.7; }
@keyframes cloud-drift {
  from { translate: -2.5% 0; }
  to { translate: 2.5% 0; }
}
.deco-star {
  position: absolute;
  width: clamp(13px, 2.2vw, 22px);
  height: clamp(13px, 2.2vw, 22px);
  color: var(--progress-hi);
  opacity: 0.5;
  scale: var(--s, 1);
  animation: twinkle 3.6s ease-in-out infinite;
  animation-delay: var(--d, 0s);
}
@keyframes twinkle {
  0%, 100% { opacity: 0.22; rotate: 0deg; }
  50% { opacity: 0.62; rotate: 14deg; }
}
.dot {
  position: absolute;
  width: var(--s, 9px);
  height: var(--s, 9px);
  border-radius: 50%;
  background: color-mix(in srgb, var(--purple) 26%, transparent);
  animation: bob 5.2s ease-in-out infinite;
  animation-delay: var(--d, 0s);
}
@keyframes bob {
  0%, 100% { translate: 0 0; }
  50% { translate: 0 -7px; }
}
/* 手机横屏：高度金贵，装饰整体让位 */
@media (max-height: 480px) {
  .backdrop { display: none; }
}
/* 尊重系统"减少动态效果" */
@media (prefers-reduced-motion: reduce) {
  .cloud, .deco-star, .dot { animation: none; }
}
</style>
