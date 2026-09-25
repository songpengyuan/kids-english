<script setup>
/**
 * 底部导航（App 风格常驻三入口）：
 *   🎯 自由（自由练习课程列表） / 🎮 游戏（闯关路径图） / 👤 我的（个人中心）
 *
 * - 自由/游戏是首页（/）内的两种浏览模式，用 query ?mode=game 区分：
 *   自由 = 不带 query，游戏 = ?mode=game。URL 保持干净（#/）。
 * - 我的 tab 高亮覆盖其子页：/me、/treasure、/report、/review。
 * - 玩法页（/lesson/:id）不渲染本组件（沉浸学习，见 App.vue）。
 */
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();

const isHome = computed(() => route.name === "home");
const isGame = computed(() => isHome.value && route.query.mode === "game");
const isMe = computed(
  () => route.name === "me" || route.name === "treasure" || route.name === "report" || route.name === "review"
);

function goPractice() {
  if (isHome.value && !isGame.value) return;
  router.push({ path: "/", query: {} });
}
function goGame() {
  if (isGame.value) return;
  router.push({ path: "/", query: { mode: "game" } });
}
function goMe() {
  if (route.name === "me") return;
  router.push("/me");
}
</script>

<template>
  <nav class="bottom-nav" role="tablist" aria-label="主导航">
    <button
      role="tab"
      :aria-selected="isHome && !isGame"
      :class="{ on: isHome && !isGame }"
      @click="goPractice"
    >
      <span class="bn-ico">🎯</span>
      <span class="bn-cap">自由</span>
    </button>
    <button role="tab" :aria-selected="isGame" :class="{ on: isGame }" @click="goGame">
      <span class="bn-ico">🎮</span>
      <span class="bn-cap">游戏</span>
    </button>
    <button role="tab" :aria-selected="isMe" :class="{ on: isMe }" @click="goMe">
      <span class="bn-ico">👤</span>
      <span class="bn-cap">我的</span>
    </button>
  </nav>
</template>

<style scoped>
.bottom-nav {
  flex: none;
  display: flex;
  padding: 6px calc(var(--pad-x) + env(safe-area-inset-right)) 8px calc(var(--pad-x) + env(safe-area-inset-left));
  padding-bottom: max(8px, env(safe-area-inset-bottom));
  gap: var(--gap-s);
}
.bottom-nav button {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: clamp(4px, 1vh, 8px) 0;
  border-radius: var(--radius-s);
  font-weight: 800;
  font-size: 12px;
  color: var(--ink-faint);
  transition: background 0.2s, color 0.2s, transform 0.1s;
}
.bottom-nav button:active {
  transform: translateY(1px);
}
.bottom-nav button.on {
  color: var(--gold);
  background: rgba(240, 180, 41, 0.12);
}
.bn-ico {
  font-size: clamp(20px, min(3.4vh, 2.8vw), 28px);
  line-height: 1;
}
.bn-cap {
  font-size: 11px;
  font-weight: 800;
}
</style>
