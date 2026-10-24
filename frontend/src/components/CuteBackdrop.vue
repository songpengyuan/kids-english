<script setup lang="ts">
/**
 * 全站背景质感层 —— 两个主题，由路由自动切换：
 *  · 默认（暖纸底）：纯色 --bg + 纸纹颗粒 + 低打扰云朵/星星/圆点（学习/我的等）。
 *  · 关卡地图（#/game 总地图、#/course/:id/game 本课地图）：暖纸底或夜空 +
 *    太阳/月亮 + 云朵 + 草地山丘 + 碎星。
 *  玩法页（/game/quest/…）**保持默认水彩**——答题时背景越安静越专注。
 *
 * 质感构成（都是纯 CSS / 一个内联 SVG，无图片资源）：
 *  1. 底色：**纯色 --bg**，与顶栏/状态栏 theme-color 完全一致（不跳色）。
 *     历史上试过整屏渐变/极光/水彩色斑，都会在状态栏与卡片边缘产生色差，已回退。
 *  2. 装饰：太阳/月亮、卡通云（胶囊 + 两个上凸圆）、草地山丘、星星/圆点。
 *  3. 细颗粒：内联 SVG feTurbulence 噪声（140px 无缝平铺）压到 3~7% 不透明度，
 *     像水彩纸/布纹，消掉纯色的"塑料感"。静态图层，不掉帧。
 *
 * 元素层原则：
 *  · pointer-events: none，绝不挡操作；
 *  · 只用主题 token / 固定色值上色，暗色下自动切换；
 *  · 动画都是缓慢的 CSS 循环，GPU 合成层，不耗电；
 *  · 手机横屏（高度 < 480px）整体隐藏，把每一像素高度留给内容。
 *
 * 挂在 App.vue 最外层（fixed + z-index:-1），所有页面共享；
 * ⚠️ 页面级容器**不要**再铺不透明 var(--bg)，否则会把这层质感整片盖掉
 *    （地图页 .game 就踩过这个坑，已改透明）。
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import { Star } from "@lucide/vue";

const route = useRoute();
/**
 * 主题由路由 meta 决定（见 router/index.ts）：
 *   · meta.sky = true → 天空草地场景（#/game 多课总地图、#/course/:id/game 本课地图）；
 *   · 其余（含 /game/quest/… 答题页）→ 默认暖纸底，答题时背景越安静越专注。
 * 用 meta 而不是拼路径：地图路由从 /game/lesson/:id 搬到 /course/:id/game 后，
 * 背景不会因为忘改前缀而静默失效，也不会把玩法页误判成地图。
 */
const isSky = computed(() => route.meta.sky === true);

interface Deco {
  top: string;
  left: string;
  s: number;
  d: number;
}

const stars: Deco[] = [
  { top: "12%", left: "6%", s: 1, d: 0 },
  { top: "26%", left: "88%", s: 0.7, d: 1.2 },
  { top: "64%", left: "4%", s: 0.85, d: 2.1 },
  { top: "78%", left: "92%", s: 1.1, d: 0.6 },
  { top: "44%", left: "96%", s: 0.6, d: 1.7 }
];
const skyStars: Deco[] = [
  { top: "12%", left: "50%", s: 0.7, d: 0.3 },
  { top: "22%", left: "78%", s: 0.6, d: 1.1 },
  { top: "34%", left: "88%", s: 0.9, d: 2.0 },
  { top: "52%", left: "94%", s: 0.7, d: 0.8 },
  { top: "26%", left: "6%", s: 0.5, d: 1.7 },
  { top: "46%", left: "2%", s: 0.8, d: 2.6 }
];
const dots: Deco[] = [
  { top: "18%", left: "22%", s: 10, d: 0.4 },
  { top: "70%", left: "14%", s: 7, d: 1.5 },
  { top: "84%", left: "70%", s: 12, d: 2.4 },
  { top: "8%", left: "70%", s: 8, d: 1.1 }
];

/**
 * 细颗粒噪声：feTurbulence 生成分形噪声 → 去饱和成灰度 → stitchTiles 保证 140px 平铺无缝。
 * baseFrequency 0.9 偏高频 = 更细的水彩纸纹（旧版 0.85 偏布纹）。
 * 内联 data URI，不占网络请求；配合 .backdrop::after 的低不透明度使用。
 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E" +
  "%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E" +
  "%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E" +
  "%3Crect width='140' height='140' filter='url(%23g)'/%3E%3C/svg%3E\")";

/** 颗粒层用内联样式注入（避免在 CSS 里再写一长串转义） */
const grainStyle = { "--grain": GRAIN };
</script>

<template>
  <div class="backdrop" :class="{ sky: isSky }" :style="grainStyle" aria-hidden="true">
    <!-- 默认（暖纸底）装饰：云朵 + 星星 + 圆点 -->
    <template v-if="!isSky">
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
    </template>

    <!-- 天空版装饰：太阳 + 云朵 + 草地山丘 + 少量碎星 -->
    <template v-else>
      <span class="sky-sun"></span>
      <span class="cloud c1"></span>
      <span class="cloud c2"></span>
      <span class="cloud c3"></span>
      <Star
        v-for="(st, i) in skyStars"
        :key="'ss' + i"
        class="star-fill deco-star"
        :style="{ top: st.top, left: st.left, '--s': st.s, '--d': st.d + 's' }"
      />
      <span class="hill h1"></span>
      <span class="hill h2"></span>
      <span class="hill h3"></span>
    </template>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: -1; /* 负层级：垫在内容下面、body 背景上面（#app 不创建层叠上下文，恰好可用） */
  pointer-events: none;
  overflow: hidden;
  /* 底色 = 纯色 --bg：与顶栏/状态栏 theme-color 完全一致，不做整屏渐变
   *（历史尝试过水彩/极光渐变，都会与状态栏或卡片边缘跳色，已回退）。
   * 质感交给颗粒层 + 低干扰装饰（云朵/星星/圆点）。 */
  background: var(--bg);
}
/* 细颗粒：在打底之上、云朵/星星之下（负 z-index 子层 = 父背景之上、其余内容之下） */
.backdrop::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background-image: var(--grain);
  background-repeat: repeat;
  opacity: 0.05;
  pointer-events: none;
}

/* ---------- 天空草地版（关卡地图：#/game 与 #/course/:id/game） ---------- */
.backdrop.sky {
  background: var(--bg);
}
.backdrop.sky::after {
  opacity: 0.03; /* 天空颗粒更轻，保持通透 */
}
/* 太阳：左上暖光 */
.sky-sun {
  position: absolute;
  top: 14%;
  left: 8%;
  width: clamp(48px, 9vw, 80px);
  height: clamp(48px, 9vw, 80px);
  border-radius: 50%;
  background: var(--backdrop-sun);
  box-shadow: 0 0 36px 12px rgba(255, 224, 130, 0.45);
  animation: sun-breathe 4.6s ease-in-out infinite;
}
@keyframes sun-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}
/* 天空云朵：比默认版更白、更软，但仍是背景陪衬（别抢关卡节点） */
.backdrop.sky .cloud { --cloud-op: 0.62; background: rgba(255, 255, 255, 1); }
.backdrop.sky .cloud.c1 { top: 30%; left: 4%; transform: scale(1.2); }
.backdrop.sky .cloud.c2 { top: 22%; left: 52%; transform: scale(1.05); }
.backdrop.sky .cloud.c3 { top: 58%; left: 74%; transform: scale(0.85); }
/* 天空碎星：亮色下很淡（点缀），暗色下自然显亮 */
.backdrop.sky .deco-star {
  color: rgba(255, 255, 255, 0.9);
  opacity: 0.35;
}
/* 草地山丘：底部椭圆色带，地图内容浮在草地上 */
.hill {
  position: absolute;
  bottom: -16%;
  border-radius: 50% 50% 0 0 / 100% 100% 0 0;
  background: var(--backdrop-hill);
  pointer-events: none;
}
.hill.h1 { left: -12%; width: 58%; height: 36%; }
.hill.h2 { right: -16%; width: 66%; height: 44%; }
.hill.h3 { left: 28%; bottom: -12%; width: 46%; height: 32%; opacity: 0.9; }

/* 装饰元素（两个主题共用）：卡通云 = 胶囊主体 + 两个上凸圆。
 * 之前是"胶囊 + box-shadow 再叠一坨"，真机上像白色/灰色药丸。
 * 三个形状用**同一个实色**、透明度统一加在外层 opacity 上 —— 若各自带 alpha，
 * 叠加区域会变深，出现"三个圆片"的接缝。 */
.cloud {
  --cloud-op: 0.5;
  position: absolute;
  width: clamp(62px, 13vw, 128px);
  height: clamp(20px, 4.2vw, 38px);
  border-radius: 999px;
  background: rgba(255, 255, 255, 1);
  opacity: var(--cloud-op);
  animation: cloud-drift ease-in-out infinite alternate;
}
.cloud::before,
.cloud::after {
  content: "";
  position: absolute;
  border-radius: 50%;
  background: inherit;
}
.cloud::before { left: 13%; bottom: 34%; width: 44%; aspect-ratio: 1; }
.cloud::after { left: 43%; bottom: 40%; width: 31%; aspect-ratio: 1; }
.cloud.c1 { top: 30%; left: 5%; animation-duration: 17s; }
/* 常规页（学习/我的等，非天空场景）：云朵静止——横向漂移会被误读为"页面在左右滚动"；
   天空草地场景保留慢漂移（空旷背景上更自然） */
.backdrop:not(.sky) .cloud {
  animation: none;
}
.cloud.c2 { --cloud-op: 0.4; top: 17%; left: 58%; animation-duration: 23s; transform: scale(0.72); }
.cloud.c3 { --cloud-op: 0.3; top: 56%; left: 78%; animation-duration: 29s; transform: scale(0.55); }
@keyframes cloud-drift {
  from { translate: -2.5% 0; }
  to { translate: 2.5% 0; }
}
.deco-star {
  position: absolute;
  width: clamp(13px, 2.2vw, 22px);
  height: clamp(13px, 2.2vw, 22px);
  color: rgba(255, 214, 110, 0.9);
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
  background: rgba(160, 120, 255, 0.28);
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

/* ---------- 暗色模式 ---------- */
/* 水彩版：底色更沉、色斑降饱和压深（深底上低不透明度看不见）、颗粒略强（深色更容易显脏） */
:root[data-theme="dark"] .backdrop {
  background: var(--bg);
}
:root[data-theme="dark"] .backdrop::after {
  opacity: 0.07;
}
/* 天空版：夜空渐变 + 月亮 + 暗丘 + 夜云 */
:root[data-theme="dark"] .backdrop.sky {
  background: var(--bg);
}
:root[data-theme="dark"] .backdrop.sky::after {
  opacity: 0.06;
}
:root[data-theme="dark"] .sky-sun {
  background: var(--backdrop-moon);
  box-shadow: 0 0 36px 14px rgba(190, 210, 255, 0.55);
}
:root[data-theme="dark"] .backdrop.sky .cloud {
  background: rgba(206, 219, 246, 1);
  opacity: calc(var(--cloud-op) * 0.4);
}
:root[data-theme="dark"] .backdrop .cloud {
  background: rgba(160, 172, 200, 1);
  opacity: calc(var(--cloud-op) * 0.34);
}
:root[data-theme="dark"] .backdrop.sky .deco-star {
  color: rgba(255, 255, 255, 0.98);
  opacity: 0.9;
}
:root[data-theme="dark"] .hill {
  background: var(--backdrop-hill-night);
}
/* 尊重系统"减少动态效果" */
@media (prefers-reduced-motion: reduce) {
  .cloud, .deco-star, .dot, .sky-sun, .backdrop { animation: none; }
}
</style>
