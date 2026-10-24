<script setup lang="ts">
/**
 * 统一子页面顶栏（全站唯一子页面顶栏组件，组件库契约：子页面一律用 HeaderBar）。
 *
 * - 返回按钮（可选）：统一圆钮 + PathIcon back，点击 emit('back')，由父组件决定去向；
 * - 标题：走 #title 插槽（可带图标），占返回键与右侧之间的中列，超长省略号；
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
  // 连击日历已并入学习日历（两个页面都是同一个月网格，重复维护）；
  // 这里保持"点火焰看日历"的语义，但落到合并后的唯一页面。
  speakZh("学习日历");
  router.push("/me/calendar");
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
  z-index: var(--z-bar);
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  padding:
    calc(var(--pad-y) + env(safe-area-inset-top))
    calc(var(--pad-x) + env(safe-area-inset-right))
    var(--pad-y)
    calc(var(--pad-x) + env(safe-area-inset-left));
  min-height: 56px; /* 结构性下限：保证顶栏不会因字号变小而塌陷 */
  box-sizing: border-box;
  /* 毛玻璃：半透明 + 模糊，让全站背景质感透上来，仍能遮住滚到下面的内容 */
  background: var(--bar-bg, var(--bg));
  -webkit-backdrop-filter: blur(var(--bar-blur, 14px));
  backdrop-filter: blur(var(--bar-blur, 14px));
}
.hdr-back {
  flex: none;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--tap-min);
  height: var(--tap-min);
  border-radius: var(--radius-pill);
  background: var(--card-bg);
  color: var(--ink);
  box-shadow: var(--shadow-hard);
  transition: transform var(--dur-fast);
  font-size: var(--fs-title);
}
.hdr-back:active {
  transform: translateY(2px);
}
/* 关闭按钮：弱化底色（不加阴影，免得在沉浸式玩法页抢注意力），但触控区不变小 */
.hdr-back.isClose {
  background: transparent;
  box-shadow: none;
  color: var(--ink-faint);
}
.hdr-back.isClose:hover {
  color: var(--ink-soft);
}
.hdr-title {
  /* 标题占「返回键与右侧之间」的中列：宽度由 flex 分配，装不下就省略号。
   * 曾经绝对居中（left:50% + max-width:62%）——右侧徽章/切换簇宽的页面
   * （课程详情 192px 簇）在 390px 下必然侵入标题带，星徽章盖住"…什么"。
   * 改 flex 中列后重叠在结构上不可能发生；两侧宽度相近时视觉上仍是居中。 */
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--gap-xs);
  font-weight: var(--fw-strong);
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
  position: relative;
  z-index: 2; /* 与标题中列互斥的最后一道保险：右侧簇永远画在标题之上、永远可点 */
  display: flex;
  align-items: center;
  /* 窄屏徽章簇收紧一档：390 下 3 徽章 + 切换按钮的页面（课程详情）给标题多让 12px */
  gap: var(--gap-xs);
  margin-left: auto;
}
@media (min-width: 600px) {
  .hdr-right {
    gap: var(--gap-s);
  }
}
</style>
