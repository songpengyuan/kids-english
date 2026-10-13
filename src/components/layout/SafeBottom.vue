<script setup lang="ts">
/**
 * SafeBottom —— 底部安全区容器（手机 / iPad 全面屏 Home 指示条防遮挡）。
 *
 * 所有"贴屏幕底部"的内容（录音键、继续按钮、进度条、结算操作区…）包一层本组件：
 *   - `margin-top: auto` 自动把内容推到屏幕底部（父容器须为 flex column，如玩法页的 `.view`）；
 *   - `padding-bottom` 统一预留 基础呼吸间距 + `env(safe-area-inset-bottom)`，
 *     不再各处手写 env()；普通设备（无 Home 条）自动回落到基础间距；
 *   - class 透传到根元素，原容器样式（flex / gap / 对齐）照常写在该 class 上。
 *
 * 用法（原 .mic-zone 等贴底容器去掉 margin-top:auto 与底部 padding 后）：
 *   <SafeBottom class="mic-zone" :gap="28"> … </SafeBottom>
 *
 * 横屏矮屏等需要更小间距的场景，外部 class 覆盖 --safe-gap 变量即可：
 *   .lf-safe { --safe-gap: 12px; }
 */
withDefaults(defineProps<{ gap?: number }>(), { gap: 16 });
</script>

<template>
  <div class="safe-bottom" :style="{ '--safe-gap': `${gap}px` }">
    <slot />
  </div>
</template>

<style scoped>
.safe-bottom {
  /* 推到底部（父容器须是 flex column，如 .view） */
  margin-top: auto;
  width: 100%;
  /* 全面屏：Home 指示条高度；普通设备：基础呼吸间距（取较大者，保证两者都不贴死）。
     !important：安全距离是不可被同元素其他 class 的 padding 简写覆盖的（曾发生覆盖导致贴底） */
  padding-bottom: max(var(--safe-gap, 16px), env(safe-area-inset-bottom, 0px)) !important;
}
</style>
