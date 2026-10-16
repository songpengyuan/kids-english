<script setup lang="ts">
/**
 * EmptyState —— 空状态（设计系统第 ③ 层）
 *
 * "还没有数据"的页面以前各自写一个居中块，字号、行高、图标大小都不一样。
 * 统一成一个，保证"空"这件事在全站长得一样。
 *
 * 用法：
 *   <EmptyState title="还没有卡片" desc="学完一课就能抽卡啦" />
 */
defineProps<{
  title: string;
  desc?: string;
}>();
</script>

<template>
  <div class="empty">
    <slot name="icon" />
    <p class="empty__title">{{ title }}</p>
    <p v-if="desc" class="empty__desc">{{ desc }}</p>
    <slot />
  </div>
</template>
