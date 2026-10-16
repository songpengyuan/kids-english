<script setup lang="ts">
/**
 * 统一子页面顶栏（全站唯一子页面顶栏组件，组件库契约：子页面一律用 HeaderBar）。
 *
 * - 返回按钮（可选）：统一圆钮 + PathIcon back，点击 emit('back')，由父组件决定去向；
 * - 标题：走 #title 插槽（可带图标），绝对居中、超长省略号；
 * - 右侧：showBadges 时内置星/贝壳/连击三徽章（全局状态、点击跳转）；
 *         也可走 #right 插槽放自定义内容（日期、数量等）；
 * 面向儿童：大点击区、圆角、柔和阴影。
 */
import { useRouter } from "vue-router";
import { useProgressStore } from "../../stores/progress";
import { useRewardsStore } from "../../stores/rewards";
import { useStreakStore } from "../../stores/streak";
import PathIcon from "../PathIcon.vue";
import ShellIcon from "../ShellIcon.vue";
import { Star } from "@lucide/vue";
import { speakZh } from "../../services/speech";

defineProps<{
  showBack?: boolean;
  backLabel?: string;
  close?: boolean;
  /** 显示全局徽章（星/贝壳/连击）。自定义 #right 插槽与 showBadges 二选一 */
  showBadges?: boolean;
}>();

const emit = defineEmits<{ back: [] }>();

const router = useRouter();
const progress = useProgressStore();
const rewards = useRewardsStore();
const streak = useStreakStore();

function goTreasure() {
  speakZh("宝藏罐");
  router.push("/me/treasure");
}
function goStreak() {
  speakZh("连击日历");
  router.push("/me/streak");
}
</script>

<template>
  <div class="hdr">
    <button
      v-if="showBack"
      class="hdr-back" :class="{ isClose: close }"
      :aria-label="close ? '关闭' : backLabel || '返回'"
      :title="close ? '关闭' : backLabel || '返回'"
      @click="emit('back')"
    >
      <!-- 答题页"退出"用房子图标（孩子一看就知道回菜单/主页，✕ 太抽象） -->
      <PathIcon v-if="close" name="home" />
      <PathIcon v-else name="back" />
    </button>
    <div class="hdr-title"><slot name="title" /></div>
    <div class="hdr-right">
      <!-- 全局数字徽章：星 / 贝壳（进宝藏罐）/ 连击（进连击日历） -->
      <template v-if="showBadges">
        <div class="badge star-badge" title="我的星星总数">
          <Star class="k-ico star-fill" />{{ progress.totalStars }}
        </div>
        <button
          class="badge treasure-badge"
          aria-label="打开宝藏罐"
          title="宝藏罐：贝壳余额"
          @click="goTreasure"
        >
          <ShellIcon />{{ rewards.shells }}
        </button>
        <button
          class="badge streak-badge"
          :class="{ done: streak.todayDone }"
          aria-label="打开连击日历"
          :title="streak.todayDone ? '今日目标已达成，已连击 ' + streak.streak + ' 天，点击看连击日历' : '今日目标：复习 ' + streak.reviewed + '/' + streak.reviewGoal + ' 词 + 新学 ' + streak.newLevels + '/1 关，点击看连击日历'"
          @click="goStreak"
        >
          <PathIcon name="flame" class="k-ico flame-ico" />{{ streak.streak }}
        </button>
      </template>
      <slot name="right" />
    </div>
  </div>
</template>

<style scoped>
.hdr {
  /* App 化：顶栏固定在视口顶部，内容滚动时不离开 */
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 10px;
  padding:
    calc(10px + env(safe-area-inset-top))
    calc(var(--pad-x) + env(safe-area-inset-right))
    10px
    calc(var(--pad-x) + env(safe-area-inset-left));
  min-height: 56px;
  box-sizing: border-box;
  /* 毛玻璃：半透明 + 模糊，让全站背景质感透上来，仍能遮住滚到下面的内容 */
  background: var(--bar-bg, var(--bg));
  -webkit-backdrop-filter: blur(var(--bar-blur, 14px));
  backdrop-filter: blur(var(--bar-blur, 14px));
}
.hdr-back {
  flex: none;
  position: relative;
  z-index: 2; /* 盖住绝对定位的标题，保证返回按钮始终可点 */
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--card-bg);
  color: var(--ink);
  box-shadow: var(--shadow-hard);
  transition: transform 0.1s;
  font-size: 22px;
}
.hdr-back:active {
  transform: translateY(2px);
}
/* 关闭按钮：弱化底色但尺寸按儿童触控目标放大（52px ≥ --tap-min）；
   图标随 font-size 走（PathIcon 1em），浅灰弱化不变 */
.hdr-back.isClose {
  background: transparent;
  box-shadow: none;
  color: var(--ink-faint);
  width: 52px;
  height: 52px;
  font-size: 24px;
}
.hdr-back.isClose:hover {
  color: var(--ink-soft);
}
.hdr-title {
  /* 标题绝对居中：不管右侧有没有徽章，所有子页面标题位置一致 */
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  max-width: 62%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 800;
  font-size: var(--fs-title);
  color: var(--ink);
  overflow: hidden;
  white-space: nowrap;
}
.hdr-title :deep(*) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hdr-right {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

/* ---------- 全局数字徽章（星/贝壳/连击） ---------- */
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
