<script setup lang="ts">
/**
 * 全站统一顶栏（三个主 tab 共用）。
 *
 * 左侧：tab 标题（图标 + 文字），由父组件传入 title / icon。
 * 右侧：固定三个数字徽章（⭐ 星星 / 🐚 贝壳 / 🔥 连击）。
 * 音效开关与主题开关已收敛到「我的」页设置区，顶栏不再显示。
 *
 * 三个 tab（学习 / 游戏 / 我的）切换时顶栏完全一致，只有左侧标题随 tab 变化。
 */
import { useRouter } from "vue-router";
import { useProgressStore } from "../../stores/progress";
import { useRewardsStore } from "../../stores/rewards";
import { useStreakStore } from "../../stores/streak";
import PathIcon from "../PathIcon.vue";
import ShellIcon from "../ShellIcon.vue";
import { Star } from "@lucide/vue";
import { speakZh } from "../../utils/speech";

const props = defineProps<{ title: string; icon?: string }>();

/** 顶栏标题点击即发音（认字）：学习/游戏闯关/我的 等 tab 名（中文，归音效开关） */
function sayTitle() {
  speakZh(props.title);
}

const router = useRouter();
const progress = useProgressStore();
const rewards = useRewardsStore();
const streak = useStreakStore();
</script>

<template>
  <header class="app-hdr anim-fade-up">
    <div class="hdr-row">
      <div class="hdr-left">
        <PathIcon v-if="icon" :name="icon" class="hdr-ico" />
        <span class="hdr-title" @click="sayTitle">{{ title }}</span>
      </div>
      <div class="hdr-right">
        <!-- ⭐ 总星星 -->
        <div class="badge star-badge" title="我的星星总数">
          <Star class="k-ico star-fill" />{{ progress.totalStars }}
        </div>
        <!-- 🐚 贝壳（点击进宝藏罐） -->
        <button
          class="badge treasure-badge"
          aria-label="打开宝藏罐"
          title="宝藏罐：贝壳余额"
          @click="router.push('/treasure')"
        >
          <ShellIcon />{{ rewards.shells }}
        </button>
        <!-- 🔥 连击天数（点击进连击日历） -->
        <button
          class="badge streak-badge"
          :class="{ done: streak.todayDone }"
          aria-label="打开连击日历"
          :title="streak.todayDone ? '今日目标已达成，已连击 ' + streak.streak + ' 天，点击看连击日历' : '今日目标：复习 ' + streak.reviewed + '/' + streak.reviewGoal + ' 词 + 新学 ' + streak.newLevels + '/1 关，点击看连击日历'"
          @click="router.push('/streak')"
        >
          <PathIcon name="flame" class="k-ico flame-ico" />{{ streak.streak }}
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-hdr {
  position: sticky;
  top: 0;
  z-index: 30;
  flex: none;
  width: 100%;
  padding: var(--gap-s) 0 var(--gap-xs);
  background: var(--bar-bg, var(--bg));
  -webkit-backdrop-filter: blur(var(--bar-blur, 14px));
  backdrop-filter: blur(var(--bar-blur, 14px));
  border-bottom: 1px solid var(--line, rgba(128, 128, 128, 0.16));
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
  flex: none;
}
.hdr-ico {
  font-size: var(--fs-title);
  color: var(--ink);
}
.hdr-title {
  font-size: var(--fs-title);
  font-weight: 800;
  color: var(--ink);
  white-space: nowrap;
  cursor: pointer;
}
.hdr-title:active {
  opacity: 0.6;
}
.hdr-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--gap-s);
}

/* ---------- 三个数字徽章 ---------- */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-small);
  font-weight: 800;
  padding: 4px 10px;
  border-radius: var(--radius-s);
  white-space: nowrap;
}
.star-badge {
  background: var(--card-bg);
  color: var(--ink-soft);
  box-shadow: var(--shadow-soft);
}
.star-badge .star-fill {
  color: var(--gold);
}
.treasure-badge {
  background: linear-gradient(160deg, #ffd87a, #f0b429);
  color: #6b4e00;
  box-shadow: 0 var(--press) 0 rgba(0, 0, 0, 0.18);
  transition: transform 0.1s;
}
.treasure-badge:active {
  transform: translateY(calc(var(--press) - 1px));
}
.streak-badge {
  background: var(--card-bg);
  color: var(--ink-soft);
  box-shadow: var(--shadow-soft);
  transition: background 0.3s, color 0.3s, transform 0.1s;
}
.streak-badge:active {
  transform: translateY(calc(var(--press) - 1px));
}
.streak-badge.done {
  background: linear-gradient(160deg, #ff9f43, #ff6b3d);
  color: #fff;
  box-shadow: 0 var(--press) 0 rgba(0, 0, 0, 0.18), 0 0 14px rgba(255, 122, 61, 0.4);
}
.flame-ico {
  color: #ff6b3d;
}
.streak-badge.done .flame-ico {
  color: #fff;
}
</style>
