<script setup lang="ts">
/**
 * 吉祥物「乐乐鸟」——巨嘴鸟，黏土 3D（复用已定稿词图风格的资产拷贝，
 * 与 l10 课时词图解耦）。全 App 单实例，挂在 App.vue。
 *
 * 双形态（2026-11-15 v1，方案经用户批准）：
 *  - dock 常驻：/course、/me、课程详情（/course/:id 无子路径）左下角常驻，
 *    底栏上方，可点击说话（点按驱动：它只回应，从不自动推进流程）；
 *  - popup 事件驱动：其余页面（玩法页）不常驻，useMascot 的事件
 *    （答错打气/结算庆祝/开箱）触发临时飞入，TTL 后自动离场。
 *
 * 显隐纪律：只认路径（nav-visibility.ts 的历史事故教训——绝不让全局播放
 * 状态参与显隐判断）。/listen 播放页与 /gate 门禁页一律不出现。
 *
 * 会话首访问候：dock 首次可见时说一次（sessionStorage 幂等，重开标签页再问候）。
 * 延迟 1.2s 错开首屏；不与课时菜单报课名（useLessonFlow boot 400ms）同屏竞争——
 * greeting 只在课程列表/详情的 dock 上说。
 */
import { computed, onBeforeUnmount, watch } from "vue";
import { useRoute } from "vue-router";
import { useMascot } from "../../composables/useMascot";
import { shouldShowNav } from "../layout/nav-visibility";
import { hapticTap } from "../../services/haptics";
import { sfxChirp } from "../../services/effects";

const route = useRoute();
const { bubble, mood, popupActive, greet, idleChatter } = useMascot();

/** dock 常驻页：两个主 tab + 课程详情本体（无 stage/about 子路径） */
const dockVisible = computed(() => {
  const p = route.path;
  if (p === "/course" || p === "/me") return true;
  return /^\/course\/[^/]+$/.test(p);
});

/** 课程详情页底栏是隐藏的（沉浸页）：落点跟着底栏真实显隐走，别悬在半空 */
const withNav = computed(() => shouldShowNav(route.path));

/** 硬排除：磨耳朵播放页（歌词是主角，且音乐门本就压住 TTS）与门禁页（家长操作） */
const suppressed = computed(() => route.path === "/listen" || route.path.startsWith("/gate"));

const shown = computed(() => !suppressed.value && (dockVisible.value || popupActive.value));

/* ---------- 会话首访问候 ---------- */
const GREET_FLAG = "mascot-greeted-v1";
let greeted = false;
let greetTimer: number | null = null;

watch(
  dockVisible,
  (v) => {
    if (!v || greeted || suppressed.value) return;
    if (sessionStorage.getItem(GREET_FLAG)) {
      greeted = true; // 本标签页已问候过：不再触发，也不再写
      return;
    }
    greeted = true;
    sessionStorage.setItem(GREET_FLAG, "1");
    greetTimer = window.setTimeout(greet, 1200); // 错开首屏渲染
  },
  { immediate: true }
);

// 事件出场（popup 飞入）先"啾"一声：鸟的听觉身份，两连高频短音，
// 比语音更早确认"是乐乐鸟来了"（语音可能被音乐门/静音开关压住）
watch(popupActive, (v) => {
  if (v) sfxChirp();
});

function onTap() {
  hapticTap();
  sfxChirp();
  idleChatter();
}

onBeforeUnmount(() => {
  if (greetTimer !== null) clearTimeout(greetTimer);
});
</script>

<template>
  <Transition name="mascot-pop">
    <div
      v-if="shown"
      class="mascot"
      :class="[`mascot--${mood}`, { 'mascot--popup': !dockVisible, 'mascot--no-nav': !withNav }]"
    >
      <Transition name="bubble-pop">
        <p v-if="bubble" class="mascot-bubble" role="status">{{ bubble }}</p>
      </Transition>
      <button
        type="button"
        class="mascot-btn"
        aria-label="乐乐鸟"
        @click="onTap"
      >
        <img class="mascot-img" src="/mascot/toucan.webp" alt="" draggable="false" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
/* 层级：高于底栏(--z-floating:40)与玩法内容，低于宝箱浮层(60)/弹窗遮罩(--z-mask:100) */
.mascot {
  position: fixed;
  left: max(10px, env(safe-area-inset-left));
  bottom: calc(var(--nav-h) + env(safe-area-inset-bottom) + 4px);
  z-index: 45;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  pointer-events: none; /* 容器不挡触控，只有鸟本身可点 */
}
/* popup（玩法页事件出场）：页面没有底栏，贴到安全区上方，且更小更收敛 */
.mascot--popup {
  bottom: calc(env(safe-area-inset-bottom) + 10px);
}
/* 课程详情等 dock 页若底栏隐藏（沉浸页），落点同 popup，不按 nav-h 抬高 */
.mascot--no-nav {
  bottom: calc(env(safe-area-inset-bottom) + 10px);
}

.mascot-btn {
  pointer-events: auto;
  /* 贴纸圆盘底：黏土鸟本体偏深，直接叠在课程卡/玩法底色上对比度不足
     （走查实测），加奶白圆盘让它像一枚贴纸，任何底色都跳得出来 */
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  /* 固定白底（--card-bg 会随暗色主题变深，深鸟叠深盘又糊了）：贴纸语义，
     暗色主题下白盘反而更跳、更像孩子贴的贴纸 */
  background: var(--white);
  padding: 5px;
  box-shadow: var(--shadow-chip);
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  line-height: 1;
}
.mascot-btn:active {
  transform: scale(0.9);
}
.mascot-img {
  width: clamp(56px, 10vw, 76px);
  height: auto;
  display: block;
  user-select: none;
}
.mascot--popup .mascot-img {
  width: clamp(48px, 9vw, 60px);
}

/* ---------- 情绪动效（prefers-reduced-motion 由 App.vue 全局兜底停摆） ---------- */
.mascot--idle .mascot-img {
  animation: mascot-breathe 3.2s ease-in-out infinite;
}
.mascot--cheer .mascot-img {
  animation: mascot-hop 0.55s ease-in-out infinite;
}
.mascot--oops .mascot-img {
  animation: mascot-droop 0.6s ease-out both;
}
@keyframes mascot-breathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}
@keyframes mascot-hop {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  30% {
    transform: translateY(-10px) rotate(-5deg);
  }
  65% {
    transform: translateY(0) rotate(4deg);
  }
}
@keyframes mascot-droop {
  0% {
    transform: rotate(0deg) translateY(0);
  }
  45% {
    transform: rotate(-9deg) translateY(3px);
  }
  100% {
    transform: rotate(-6deg) translateY(1px);
  }
}

/* ---------- 气泡（双通道先例：LessonLevelList chestHint） ---------- */
.mascot-bubble {
  pointer-events: none;
  margin: 0;
  max-width: min(240px, 62vw);
  padding: 8px 14px;
  background: var(--card-bg);
  color: var(--ink);
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  line-height: 1.4;
  border: 1px solid var(--line);
  border-radius: var(--radius-s);
  border-bottom-left-radius: 4px;
  box-shadow: var(--shadow-chip);
}
.bubble-pop-enter-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.bubble-pop-leave-active {
  transition: opacity 0.22s ease;
}
.bubble-pop-enter-from {
  opacity: 0;
  transform: translateY(6px) scale(0.92);
}
.bubble-pop-leave-to {
  opacity: 0;
}

/* ---------- 出入场 ---------- */
.mascot-pop-enter-active {
  transition: opacity 0.24s ease, transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.mascot-pop-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.mascot-pop-enter-from {
  opacity: 0;
  transform: translateY(16px) scale(0.7);
}
.mascot-pop-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.85);
}
</style>
