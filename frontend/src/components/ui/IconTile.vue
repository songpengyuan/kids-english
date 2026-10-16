<script setup lang="ts">
/**
 * IconTile —— 图标砖（设计系统第 ③ 层）
 *
 * 替代页面里的装饰性 emoji。原因：
 *   1. emoji 在 iOS / Android / 桌面渲染差异极大（🎴 在部分机型是红色扑克牌，
 *      与"我的卡片"的语义完全不符）；
 *   2. emoji 无法随主题变色，暗黑模式下会变成一块突兀的高饱和色；
 *   3. 尺寸不受排版系统控制（emoji 的字号与中文字号对不齐）。
 *
 * 统一成"圆角色块 + lucide 图标"后：尺寸跟 em 走（配合流体字号），
 * 配色直接复用 .tone-* 色调板，暗黑模式自动适配。
 *
 * 用法：<IconTile tone="gold"><Star class="k-ico" /></IconTile>
 */
import type { Tone } from "../../types";

withDefaults(
  defineProps<{
    /** 取自 base.css 的 .tone-* 色调板，是全站唯一允许的彩色来源 */
    tone?: Tone;
    size?: "md" | "sm";
  }>(),
  { tone: "blue", size: "md" }
);
</script>

<template>
  <span
    class="icon-tile"
    :class="[`tone-${tone}`, { 'icon-tile--sm': size === 'sm' }]"
    aria-hidden="true"
  >
    <slot />
  </span>
</template>
