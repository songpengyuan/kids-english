<script setup>
/**
 * 全站背景质感层 —— 两个主题，由路由自动切换：
 *  · 默认（水彩晕染）：不规则水彩色斑 + 纸纹颗粒 + 低打扰云朵/星星/圆点。
 *  · 游戏闯关地图（?mode=game）：天空草地场景（太阳 / 云朵 / 草地山丘 / 碎星）。
 *  两版都支持暗色模式（夜空 / 月亮 / 暗丘）。
 *
 * 三层质感（都是纯 CSS / 一个内联 SVG，无图片资源）：
 *  1. 底色：顶部与 --bg 完全一致（状态栏 theme-color 不会跳色），向下过渡
 *  2. 彩层：水彩版=多团不规则品牌色斑；天空版=天空渐变 + 太阳 + 云 + 草地
 *  3. 细颗粒：内联 SVG feTurbulence 噪声（140px 无缝平铺）压到 3~7% 不透明度，
 *     像水彩纸/布纹，消掉渐变的"塑料感"。静态图层，不掉帧。
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
/** 游戏闯关地图页：只 ?mode=game（游戏主页路径图）切天空场景；quest 关卡内保持水彩，答题更专注。 */
const isSky = computed(() => route.query.mode === "game");

const stars = [
  { top: "12%", left: "6%", s: 1, d: 0 },
  { top: "26%", left: "88%", s: 0.7, d: 1.2 },
  { top: "64%", left: "4%", s: 0.85, d: 2.1 },
  { top: "78%", left: "92%", s: 1.1, d: 0.6 },
  { top: "44%", left: "96%", s: 0.6, d: 1.7 }
];
const skyStars = [
  { top: "12%", left: "50%", s: 0.7, d: 0.3 },
  { top: "22%", left: "78%", s: 0.6, d: 1.1 },
  { top: "34%", left: "88%", s: 0.9, d: 2.0 },
  { top: "52%", left: "94%", s: 0.7, d: 0.8 },
  { top: "26%", left: "6%", s: 0.5, d: 1.7 },
  { top: "46%", left: "2%", s: 0.8, d: 2.6 }
];
const dots = [
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
    <!-- 水彩版装饰：云朵 + 星星 + 圆点 -->
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
  /* 水彩晕染：5 团品牌色斑（蓝/粉/紫/绿/橙）+ 顶部白光 + 暖纸底（向下微微加深）。
   * 色斑位置错落、半径不均，像水彩在纸上晕开。顺序：先写的在上层。
   * ⚠️ 全部用固定 rgba（不用 color-mix(var(--token))：scoped 样式下会被浏览器解析丢弃，
   *    导致整条 background-image 变 none —— 背景就只剩纯色）。 */
  background-image:
    radial-gradient(58% 40% at 6% 4%, rgba(28, 176, 246, 0.30), transparent 68%),
    radial-gradient(46% 36% at 92% 8%, rgba(255, 99, 132, 0.25), transparent 70%),
    radial-gradient(52% 42% at 88% 46%, rgba(160, 120, 255, 0.25), transparent 72%),
    radial-gradient(48% 40% at 12% 58%, rgba(88, 214, 141, 0.23), transparent 70%),
    radial-gradient(42% 34% at 54% 96%, rgba(255, 178, 54, 0.25), transparent 72%),
    radial-gradient(60% 26% at 50% -6%, rgba(255, 255, 255, 0.5), transparent 70%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.22) 100%);
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
  opacity: 0.05;
  pointer-events: none;
}

/* ---------- 天空草地版（游戏闯关地图 ?mode=game） ---------- */
.backdrop.sky {
  background-image:
    linear-gradient(180deg, #8ec8f5 0%, #cde9ff 42%, #eef7e0 78%, #d4e6b8 100%);
}
.backdrop.sky::after {
  opacity: 0.03; /* 天空颗粒更轻，保持通透 */
}
/* 太阳：左上暖光 */
.sky-sun {
  position: absolute;
  top: 5%;
  left: 8%;
  width: clamp(48px, 9vw, 80px);
  height: clamp(48px, 9vw, 80px);
  border-radius: 50%;
  background: radial-gradient(circle at 38% 34%, #fff6c8, #ffd76e 62%, #ffc94d);
  box-shadow: 0 0 36px 12px rgba(255, 224, 130, 0.45);
  animation: sun-breathe 4.6s ease-in-out infinite;
}
@keyframes sun-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}
/* 天空云朵：更白更大更实（区别于水彩版的半透明） */
.backdrop.sky .cloud {
  background: rgba(255, 255, 255, 0.92);
  box-shadow:
    calc(var(--w, 26px)) calc(var(--h, -12px)) 0 -4px rgba(255, 255, 255, 0.92);
}
.backdrop.sky .cloud.c1 { --w: 34px; --h: -14px; top: 9%; left: 6%; transform: scale(1.35); }
.backdrop.sky .cloud.c2 { --w: 22px; --h: -10px; top: 22%; left: 52%; transform: scale(1.05); }
.backdrop.sky .cloud.c3 { --w: 16px; --h: -7px; top: 58%; left: 74%; transform: scale(0.85); opacity: 0.9; }
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
  background: linear-gradient(180deg, #9fd87a 0%, #76b85c 100%);
  pointer-events: none;
}
.hill.h1 { left: -12%; width: 58%; height: 36%; }
.hill.h2 { right: -16%; width: 66%; height: 44%; }
.hill.h3 { left: 28%; bottom: -12%; width: 46%; height: 32%; opacity: 0.9; }

/* 装饰元素（水彩版与天空版共用类） */
.cloud {
  position: absolute;
  width: clamp(70px, 16vw, 150px);
  height: clamp(24px, 5.4vw, 48px);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.8);
  box-shadow:
    calc(var(--w, 26px)) calc(var(--h, -12px)) 0 -4px rgba(255, 255, 255, 0.8);
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
  background-image:
    radial-gradient(58% 40% at 6% 4%, rgba(28, 176, 246, 0.24), transparent 68%),
    radial-gradient(46% 36% at 92% 8%, rgba(255, 99, 132, 0.18), transparent 70%),
    radial-gradient(52% 42% at 88% 46%, rgba(160, 120, 255, 0.26), transparent 72%),
    radial-gradient(48% 40% at 12% 58%, rgba(88, 214, 141, 0.18), transparent 70%),
    radial-gradient(42% 34% at 54% 96%, rgba(255, 178, 54, 0.18), transparent 72%),
    radial-gradient(60% 26% at 50% -6%, rgba(28, 176, 246, 0.16), transparent 70%),
    linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.16) 100%);
}
:root[data-theme="dark"] .backdrop::after {
  opacity: 0.07;
}
/* 天空版：夜空渐变 + 月亮 + 暗丘 + 夜云 */
:root[data-theme="dark"] .backdrop.sky {
  background-image:
    radial-gradient(70% 40% at 78% -6%, rgba(120, 100, 220, 0.24), transparent 70%),
    radial-gradient(60% 36% at 8% 30%, rgba(60, 130, 210, 0.18), transparent 72%),
    linear-gradient(180deg, #0d1325 0%, #1b2340 46%, #26304f 76%, #1a2b22 100%);
}
:root[data-theme="dark"] .backdrop.sky::after {
  opacity: 0.06;
}
:root[data-theme="dark"] .sky-sun {
  background: radial-gradient(circle at 42% 38%, #ffffff 0%, #eef2ff 62%, #d5e0ff 100%);
  box-shadow: 0 0 36px 14px rgba(190, 210, 255, 0.55);
}
:root[data-theme="dark"] .backdrop.sky .cloud {
  background: rgba(206, 219, 246, 0.24);
  box-shadow:
    calc(var(--w, 26px)) calc(var(--h, -12px)) 0 -4px rgba(206, 219, 246, 0.24);
}
:root[data-theme="dark"] .backdrop .cloud {
  background: rgba(150, 160, 190, 0.20);
  box-shadow:
    calc(var(--w, 26px)) calc(var(--h, -12px)) 0 -4px rgba(150, 160, 190, 0.20);
}
:root[data-theme="dark"] .backdrop.sky .deco-star {
  color: rgba(255, 255, 255, 0.98);
  opacity: 0.9;
}
:root[data-theme="dark"] .hill {
  background: linear-gradient(180deg, #2d4d3c 0%, #1c3428 100%);
}
/* 尊重系统"减少动态效果" */
@media (prefers-reduced-motion: reduce) {
  .cloud, .deco-star, .dot, .sky-sun { animation: none; }
}
</style>
