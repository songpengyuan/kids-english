<script setup lang="ts">
/**
 * 统一顶栏（阶段 1-2：全站 topbar 一致化）。
 *
 * - 返回按钮（可选）：统一圆钮 + ChevronLeft，点击 emit('back')，由父组件决定去向；
 * - 标题：走 #title 插槽（可带图标），超长省略号；
 * - 右侧：走 #right 插槽（徽章 / 日期 / 主题切换等），保证布局对齐。
 * 替换各页手写 topbar，视觉与交互保持一致（面向儿童：大点击区、圆角、柔和阴影）。
 */
import PathIcon from "../PathIcon.vue";

defineProps<{ showBack?: boolean; backLabel?: string; close?: boolean }>();
const emit = defineEmits<{ back: [] }>();
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
      <PathIcon v-if="close" name="close" />
      <PathIcon v-else name="back" />
    </button>
    <div class="hdr-title"><slot name="title" /></div>
    <div class="hdr-right"><slot name="right" /></div>
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
</style>
