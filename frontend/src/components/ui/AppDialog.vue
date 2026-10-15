<script setup lang="ts">
/**
 * 通用对话框（AppDialog）
 *
 * 用途：玩法引导、规则说明、确认提示等"遮罩 + 居中卡片"形态的统一底座。
 * 抽离原因：TalkView 引导卡等各处在重复"遮罩 + role=dialog + 弹出/收起动画"，
 * 统一后交互一致、样式可集中维护。
 *
 * 用法（父组件控制 v-if 显示）：
 *   <AppDialog v-if="open" aria-label="玩法说明" @close="open = false">
 *     <template #default="{ close }">
 *       内容……
 *       <button class="k-btn" @click="close">知道了</button>
 *     </template>
 *   </AppDialog>
 *
 * - 点击遮罩或调用 slot 的 close() 会先播放收起动画，再 emit('close') 由父组件移除。
 * - 进入动画用全局 anim-pop；卡片样式走主题 token，深浅色自动适配。
 */
import { ref } from "vue";

defineProps<{ ariaLabel?: string }>();
const emit = defineEmits<{ close: [] }>();

/** 收起动画中：先播退场再通知父组件移除，避免"啪一下消失" */
const leaving = ref(false);
function requestClose() {
  if (leaving.value) return;
  leaving.value = true;
  window.setTimeout(() => emit("close"), 180);
}
</script>

<template>
  <div class="app-dialog-mask" :class="{ leaving }" @click.self="requestClose">
    <div class="app-dialog-card anim-pop" :class="{ leaving }" role="dialog" :aria-label="ariaLabel">
      <slot :close="requestClose" />
    </div>
  </div>
</template>

<style scoped>
.app-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 100);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--overlay, rgba(0, 0, 0, 0.45));
  transition: opacity 0.18s ease;
}
.app-dialog-mask.leaving {
  opacity: 0;
}
.app-dialog-card {
  width: min(420px, 100%);
  max-height: 80vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: var(--surface, #fff);
  color: var(--text, inherit);
  border-radius: var(--radius-lg, 20px);
  padding: 22px 20px;
  box-shadow: var(--shadow-strong, 0 18px 44px rgba(0, 0, 0, 0.24));
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.app-dialog-card.leaving {
  opacity: 0;
  transform: scale(0.94);
}
</style>
