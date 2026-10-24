<script setup lang="ts">
/**
 * 底部导航（App 风格常驻）：📖 学习 / 🎧 磨耳朵 / 👤 我的
 *
 * - 学习是独立路由 #/course；游戏入口收在学习页右上角按钮（非底部主 tab）。
 * - 中间位**永远是「磨耳朵」入口**，整格只有一种行为：进/留在磨耳朵页。
 *   图标只是**状态显示**（2026-10-17 反馈：只换图标、不要做成播放键）：
 *     · 没在播 → 🎧 耳机；
 *     · 正在播 → 三根跳动的声波条（与歌单行里的 SpeakWave 同一套"声音在播"语言）。
 *   为什么不在这里放播放/暂停键：tab 的第一职责是导航，键面必须等于行为。
 *   上一版"有歌就整体换成一颗暂停键"，那颗键盖住整格唯一的命中区（52px 图标位
 *   ≈ 整格 60% 高度），孩子点上去只暂停、不导航，而磨耳朵全站只此一个入口，
 *   于是开始播放后从别的 tab 再也回不去（2026-10-17 反馈）。
 *   暂停**不需要**这颗键：磨耳朵列表里当前那首自带 `.sr-play`，播放页有完整 transport。
 *   也不把封面/歌名/进度塞进槽位——那是播放页的事，塞进来只会把歌名截成 "Walki…"。
 * - 我的 tab 高亮覆盖其子页：/me、/treasure、/report、/review。
 * - 玩法页（/course/:id）与播放页（歌词全屏页展开时）不渲染本组件（沉浸，见 App.vue）。
 */
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import PathIcon from "../PathIcon.vue";
import { speakZh } from "../../services/speech";
import { hapticTap } from "../../services/haptics";
import { usePlayerStore } from "../../stores/player";

const route = useRoute();
const router = useRouter();
const player = usePlayerStore();

const isHome = computed(() => route.name === "learn");
const isListen = computed(() => route.name === "listen");
const isMe = computed(
  () =>
    route.name === "me" ||
    route.name === "streak" ||
    route.name === "treasure" ||
    route.name === "hero-detail" ||
    route.name === "report" ||
    route.name === "review"
);

function goPractice() {
  hapticTap();
  speakZh("学习");
  if (isHome.value) return;
  void router.push("/course").catch(() => {});
}
function goMe() {
  hapticTap();
  speakZh("我的");
  if (route.name === "me") return;
  void router.push("/me").catch(() => {});
}
/** 磨耳朵入口（中间整格，任何状态下都是导航，不做播放控制） */
function goListen() {
  hapticTap();
  speakZh("磨耳朵");
  if (isListen.value) return;
  void router.push("/listen").catch(() => {});
}
</script>

<template>
  <nav class="bottom-nav" role="tablist" aria-label="主导航">
    <button
      role="tab"
      class="bn-tab"
      aria-label="学习"
      :aria-selected="isHome"
      :class="{ on: isHome }"
      @click="goPractice"
    >
      <span class="bn-zone"><PathIcon name="free" /></span>
      <span class="bn-cap">学习</span>
    </button>

    <!-- 中间位：入口形态恒定，只有"脸"在变（耳机 ⇄ 声波）。
         图标是状态显示，不是可点控件 —— 整格一个 handler，不存在内层拦截。 -->
    <button
      role="tab"
      class="bn-tab"
      :aria-label="player.playing ? '磨耳朵（正在播放）' : '磨耳朵'"
      :aria-selected="isListen"
      :class="{ on: isListen }"
      @click="goListen"
    >
      <span class="bn-zone">
        <span v-if="player.playing" class="bn-eq" aria-hidden="true"><i></i><i></i><i></i></span>
        <span v-else class="bn-ico" aria-hidden="true">🎧</span>
      </span>
      <span class="bn-cap">磨耳朵</span>
    </button>

    <button role="tab" class="bn-tab" aria-label="我的" :aria-selected="isMe" :class="{ on: isMe }" @click="goMe">
      <span class="bn-zone"><PathIcon name="me" /></span>
      <span class="bn-cap">我的</span>
    </button>
  </nav>
</template>

<style scoped>
.bottom-nav {
  /* App 化：底栏脱离文档流，固定钉在视口底部（内容再高也不会把它挤出/盖住） */
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: var(--z-floating);
  margin-inline: auto;
  max-width: 1180px; /* 与 #app 同宽居中 */
  display: flex;
  gap: var(--gap-s);
  padding:
    4px
    calc(var(--pad-x) + env(safe-area-inset-right))
    max(4px, env(safe-area-inset-bottom))
    calc(var(--pad-x) + env(safe-area-inset-left));
  /* 毛玻璃：与 HeaderBar 同一套 token（--bar-bg / --bar-blur） */
  background: var(--bar-bg, var(--bg));
  -webkit-backdrop-filter: blur(var(--bar-blur, 14px));
  backdrop-filter: blur(var(--bar-blur, 14px));
  box-shadow: var(--shadow-bar-up);
}
.bn-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px 0 2px;
  /* 显式透明：全局 button 重置没有重置 background，不写这一行就会带出
   * 浏览器默认的浅灰底（左右两个 tab 是 <button>、中间是 <div>，
   * 三者底色就会不一致）。选中态由 .on 上色。 */
  background: transparent;
  border-radius: var(--radius-s);
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
  color: var(--ink-faint);
  transition: background var(--dur-base), color var(--dur-base), transform var(--dur-fast);
  /* 移动端：消除轻滑误判成滚动/双击缩放导致的 click 丢失（"有时点不过去"） */
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}
.bn-tab:active {
  transform: translateY(1px);
}
.bn-tab.on {
  color: var(--brand);
  background: var(--brand-soft);
}
/* 命中动画：图标弹跳 + 淡入 */
.bn-tab.on .bn-ico {
  animation: tab-pop var(--dur-base) var(--ease-pop);
}
.bn-tab.on .bn-cap {
  animation: tab-fade var(--dur-base) ease;
}
@keyframes tab-pop {
  0% { transform: scale(0.82); }
  55% { transform: scale(1.16); }
  100% { transform: scale(1); }
}
@keyframes tab-fade {
  from { opacity: 0.4; }
  to { opacity: 1; }
}
/* 图标位：三格统一高度。
 * 三种"脸"（PathIcon / 耳机 emoji / 声波条）的光学高度不同，靠固定高的图标位，
 * 三格的标签才能落在同一条基线上（否则底栏会像以前那样左右不齐）。 */
.bn-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  font-size: var(--fs-title);
  line-height: 1;
}
.bn-ico {
  position: relative;
  line-height: 1;
}
/* 正在播放：三根跳动的声波条（取代 🎧）。
 * 用 em 定尺寸，跟着 .bn-zone 的 font-size 走，光学大小与左右两个图标一致；
 * 这是"状态显示"，不是键 —— 整格都是导航，别给它加 click。
 * 与歌单行里「正在播放」的 SpeakWave 是同一套语言：会动的声波 = 声音在放。 */
.bn-eq {
  display: inline-flex;
  align-items: flex-end;
  gap: 0.14em;
  height: 0.92em;
  color: var(--brand);
}
.bn-eq i {
  width: 0.2em;
  height: 0.42em;
  border-radius: 0.1em;
  background: currentColor;
  animation: bn-eq 0.9s ease-in-out infinite;
}
.bn-eq i:nth-child(2) {
  animation-delay: 0.16s;
}
.bn-eq i:nth-child(3) {
  animation-delay: 0.32s;
}
@keyframes bn-eq {
  0%,
  100% {
    height: 0.42em;
  }
  50% {
    height: 0.92em;
  }
}
/* 减少动态偏好：不跳，但保留"高矮不一"的静态波形，仍看得出在放歌 */
@media (prefers-reduced-motion: reduce) {
  .bn-eq i {
    animation: none;
  }
  .bn-eq i:nth-child(1) {
    height: 0.56em;
  }
  .bn-eq i:nth-child(2) {
    height: 0.92em;
  }
  .bn-eq i:nth-child(3) {
    height: 0.72em;
  }
}
.bn-cap {
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
}
</style>
