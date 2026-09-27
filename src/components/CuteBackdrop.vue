<script setup>
/**
 * 全站背景质感层 —— "底 + 光 + 粒"三层 + 低打扰可爱元素（云朵 / 星星 / 圆点）。
 *
 * 三层质感（都是纯 CSS / 一个内联 SVG，无图片资源）：
 *  1. 微渐变打底：顶部与 --bg 完全一致（状态栏 theme-color 不会跳色），向下压暗 6%
 *     —— 纯平色底在大屏上会显得"糊"，微渐变立刻有纵深
 *  2. 柔和彩光：三团超大半径的品牌色柔光（8~12% 不透明度），让底不再死板
 *  3. 细颗粒：内联 SVG feTurbulence 噪声（140px 无缝平铺）压到 4~7% 不透明度，
 *     像纸张/布纹，消掉渐变的"塑料感"。静态图层，不掉帧。
 *
 * 元素层原则：
 *  · pointer-events: none，绝不挡操作；
 *  · 只用主题 token 上色，暗色下自动变淡；
 *  · 动画都是缓慢的 CSS 循环，GPU 合成层，不耗电；
 *  · 手机横屏（高度 < 480px）整体隐藏，把每一像素高度留给内容。
 *
 * 挂在 App.vue 最外层（fixed + z-index:-1），所有页面共享；
 * ⚠️ 页面级容器**不要**再铺不透明 var(--bg)，否则会把这层质感整片盖掉
 *    （地图页 .game 就踩过这个坑，已改透明）。
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

/**
 * 细颗粒噪声：feTurbulence 生成分形噪声 → 去饱和成灰度 → stitchTiles 保证 140px 平铺无缝。
 * 内联 data URI，不占网络请求；配合 .backdrop::after 的低不透明度使用。
 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E" +
  "%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E" +
  "%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E" +
  "%3Crect width='140' height='140' filter='url(%23g)'/%3E%3C/svg%3E\")";

/** 颗粒层用内联样式注入（避免在 CSS 里再写一长串转义） */
const grainStyle = { "--grain": GRAIN };
</script>

<template>
  <div class="backdrop" :style="grainStyle" aria-hidden="true">
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
  /* 打底（微渐变）+ 三团柔光。顺序：先写的在上层 */
  background-image:
    radial-gradient(72% 30% at 50% -8%, color-mix(in srgb, #fff 45%, transparent), transparent 72%),
    radial-gradient(58% 42% at 8% 2%, color-mix(in srgb, var(--blue) 15%, transparent), transparent 72%),
    radial-gradient(46% 38% at 96% 16%, color-mix(in srgb, var(--pink) 13%, transparent), transparent 74%),
    radial-gradient(70% 46% at 58% 104%, color-mix(in srgb, var(--purple) 13%, transparent), transparent 76%),
    linear-gradient(180deg, var(--bg) 0%, color-mix(in srgb, var(--bg) 92%, #000) 100%);
  background-color: var(--bg); /* 渐变兜底（老浏览器/极端 DPR） */
}
/* 细颗粒：在打底之上、云朵/星星之下（负 z-index 子层 = 父背景之上、其余内容之下） */
.backdrop::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background-image: var(--grain);
  background-repeat: repeat;
  opacity: 0.045;
  pointer-events: none;
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
/* 暗色：底色更沉、彩光给足（深底上低不透明度看不见）、颗粒略强（深色更容易显脏） */
:root[data-theme="dark"] .backdrop {
  background-image:
    radial-gradient(72% 30% at 50% -8%, color-mix(in srgb, var(--blue) 14%, transparent), transparent 72%),
    radial-gradient(58% 42% at 8% 2%, color-mix(in srgb, var(--blue) 20%, transparent), transparent 72%),
    radial-gradient(46% 38% at 96% 16%, color-mix(in srgb, var(--pink) 16%, transparent), transparent 74%),
    radial-gradient(70% 46% at 58% 104%, color-mix(in srgb, var(--purple) 18%, transparent), transparent 76%),
    linear-gradient(180deg, var(--bg) 0%, color-mix(in srgb, var(--bg) 88%, #000) 100%);
}
:root[data-theme="dark"] .backdrop::after {
  opacity: 0.07;
}
/* 尊重系统"减少动态效果" */
@media (prefers-reduced-motion: reduce) {
  .cloud, .deco-star, .dot { animation: none; }
}
</style>
