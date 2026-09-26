<script setup lang="ts">
/**
 * 统一顶栏（阶段 1-2：全站 topbar 一致化）。
 *
 * - 返回按钮（可选）：统一圆钮 + ChevronLeft，点击 emit('back')，由父组件决定去向；
 * - 标题：走 #title 插槽（可带图标），超长省略号；
 * - 右侧：走 #right 插槽（徽章 / 日期 / 主题切换等），保证布局对齐。
 * 替换各页手写 topbar，视觉与交互保持一致（面向儿童：大点击区、圆角、柔和阴影）。
 */
import { ChevronLeft } from "@lucide/vue";

defineProps<{ showBack?: boolean; backLabel?: string }>();
const emit = defineEmits<{ back: [] }>();
</script>

<template>
  <div class="hdr">
    <button
      v-if="showBack"
      class="hdr-back"
      :aria-label="backLabel || '返回'"
      :title="backLabel || '返回'"
      @click="emit('back')"
    >
      <ChevronLeft class="k-ico" />
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
  padding: 10px 12px;
  min-height: 56px;
  box-sizing: border-box;
  background: var(--bg);
}
.hdr-back {
  flex: none;
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
}
.hdr-back:active {
  transform: translateY(2px);
}
.hdr-title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
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
}
</style>
