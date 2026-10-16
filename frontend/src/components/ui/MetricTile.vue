<script setup lang="ts">
/**
 * MetricTile —— 指标块（设计系统第 ③ 层）
 *
 * 「3/81」这类收集进度以前是等宽平铺，孩子分不清哪个是"我有的"、
 * 哪个是"一共有多少"。改成两级排版：分子大且深、分母小且浅。
 *
 * 用法：<MetricTile :value="3" :total="81" label="英雄" />
 */
defineProps<{
  value: string | number;
  /** 总量分母；不传表示这不是一个"x/y"型的指标 */
  total?: string | number;
  label: string;
}>();
</script>

<template>
  <div class="metric">
    <span class="metric__num">
      {{ value }}<small v-if="total !== undefined">/{{ total }}</small>
    </span>
    <span class="metric__label">{{ label }}</span>
  </div>
</template>
