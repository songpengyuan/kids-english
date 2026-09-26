<script setup lang="ts">
/**
 * 首页壳（阶段 2-2）：按底部导航 mode 路由到 自由练习/游戏闯关 两个子视图。
 * 保留 KeepAlive 需要的稳定组件名；URL 兼容：#/ 与 #/?mode=game。
 */
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useProgressStore } from "../stores/progress";
import { useRewardsStore } from "../stores/rewards";
import { useStreakStore } from "../stores/streak";
import { Star } from "@lucide/vue";
import ThemeToggle from "./layout/ThemeToggle.vue";
import PathIcon from "./PathIcon.vue";
import PracticeView from "../views/practice/PracticeView.vue";
import GameView from "../views/game/GameView.vue";

defineOptions({ name: "HomePage" }); // KeepAlive include 需要稳定组件名

const route = useRoute();
const router = useRouter();
const progress = useProgressStore();
const rewards = useRewardsStore();
const streak = useStreakStore();
const mode = computed(() => (route.query.mode === "game" ? "game" : "practice"));
</script>

<template>
  <div class="home view">
    <!-- 顶部 header bar（一行）：自由 = mascot+徽章 / 游戏 = 标题+连击；主题切换并入 bar 右侧 -->
    <header class="hero anim-fade-up">
      <div class="hdr-row">
        <div class="hdr-left">
          <svg v-if="mode === 'practice'" class="mascot" viewBox="0 0 64 64" aria-hidden="true">
            <path
              d="M32 4l7.6 15.6 17.2 2.4-12.5 12 3 17L32 43.2 16.7 51l3-17-12.5-12 17.2-2.4z"
              fill="var(--yellow)"
              stroke="var(--gold)"
              stroke-width="2.5"
              stroke-linejoin="round"
            />
            <g class="face">
              <circle cx="26" cy="30" r="2.6" fill="#4a3f35" />
              <circle cx="38" cy="30" r="2.6" fill="#4a3f35" />
              <path d="M27 36q5 4.5 10 0" stroke="#4a3f35" stroke-width="2.4" fill="none" stroke-linecap="round" />
              <circle cx="22.5" cy="34.5" r="2.6" fill="#ff9f9f" opacity=".65" />
              <circle cx="41.5" cy="34.5" r="2.6" fill="#ff9f9f" opacity=".65" />
            </g>
          </svg>
          <span v-else class="hdr-title">游戏闯关</span>
        </div>
        <div class="hdr-right">
          <span
            v-if="mode === 'game'"
            class="hdr-streak"
            :title="streak.todayDone ? '今日目标已达成，已连击 ' + streak.streak + ' 天' : '完成一个玩法点亮今天的火焰'"
          ><PathIcon name="flame" class="k-ico flame-ico" />{{ streak.streak }}</span>
          <div v-else class="badges">
            <div class="star-badge" title="我的星星总数">
              <Star class="k-ico star-fill" />{{ progress.totalStars }}
            </div>
            <button class="treasure-badge" aria-label="打开宝藏罐" title="宝藏罐：贝壳余额" @click="router.push('/treasure')">
              <PathIcon name="shell" class="k-ico shell-ico" />{{ rewards.shells }}
            </button>
            <div class="streak-badge" :class="{ done: streak.todayDone }" :title="streak.todayDone ? '今日目标已达成，已连击 ' + streak.streak + ' 天' : '完成一个玩法点亮今天的火焰'">
              <PathIcon name="flame" class="k-ico flame-ico" />{{ streak.streak }}
            </div>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>

    <PracticeView v-if="mode === 'practice'" />
    <GameView v-else />

    <p class="foot">建议家长陪同，每次 10~15 分钟</p>
  </div>
</template>

<style scoped>
.home {
  position: relative;
}
.hero {
  position: sticky;
  top: 0;
  z-index: 30;
  flex: none;
  width: 100%;
  padding: var(--gap-s) 0 var(--gap-xs);
  background: var(--bg);
  border-bottom: 1px solid var(--line, rgba(128,128,128,0.16));
}
.hdr-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-s);
  width: 100%;
}
.hdr-left {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-xs);
  min-width: 0;
}
.hdr-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--gap-s);
}
.hdr-title {
  font-size: var(--fs-title);
  font-weight: 800;
  color: var(--ink);
  white-space: nowrap;
}
.hdr-streak {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 800;
  font-size: var(--fs-small);
  color: #6b4e00;
  background: linear-gradient(160deg, #ffe9a8, #ffd87a);
  border: 2px solid var(--gold);
  border-radius: var(--radius-pill);
  padding: 4px var(--gap-m);
  box-shadow: var(--shadow-hard);
  white-space: nowrap;
  flex: none;
}
.mascot {
  width: 1.4em;
  height: 1.4em;
  animation: float-y 2.8s ease-in-out infinite;
  flex: none;
}
.mascot .face {
  transform-origin: 32px 30px;
  animation: blink 4.2s infinite;
}
@keyframes blink {
  0%, 92%, 100% { transform: scaleY(1); }
  95%, 97% { transform: scaleY(0.12); }
}
.badges {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--gap-s);
}
.hdr-right .star-badge,
.hdr-right .treasure-badge,
.hdr-right .streak-badge {
  font-size: var(--fs-small);
  padding: 4px 10px;
  gap: 4px;
  white-space: nowrap;
}
.streak-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--card-bg);
  color: var(--ink-soft);
  border-radius: var(--radius-s);
  padding: clamp(6px, 1.2vh, 10px) clamp(10px, 1.6vw, 16px);
  box-shadow: 0 var(--press) 0 rgba(0, 0, 0, 0.12);
  font-weight: 800;
  font-size: var(--fs-body);
  transition: background 0.3s, color 0.3s;
}
.streak-badge.done {
  position: static;
  background: linear-gradient(160deg, #ff9f43, #ff6b3d);
  color: #fff;
  box-shadow: 0 var(--press) 0 rgba(0, 0, 0, 0.18), 0 0 14px rgba(255, 122, 61, 0.4);
}
.treasure-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(160deg, #ffd87a, #f0b429);
  color: #6b4e00;
  border-radius: var(--radius-s);
  padding: clamp(6px, 1.2vh, 10px) clamp(10px, 1.6vw, 16px);
  box-shadow: 0 var(--press) 0 rgba(0, 0, 0, 0.18);
  font-weight: 800;
  font-size: var(--fs-body);
  transition: transform 0.1s;
}
.treasure-badge:active {
  transform: translateY(calc(var(--press) - 1px));
}
.foot {
  text-align: center;
  color: var(--ink-faint);
  font-weight: 700;
  font-size: var(--fs-small);
  margin: 0;
  flex: none;
}
@media (max-height: 480px) {
  .hero h1 {
    font-size: 22px;
  }
  .sub,
  .foot {
    display: none;
  }
  .mascot {
    animation: none;
  }
}
</style>
