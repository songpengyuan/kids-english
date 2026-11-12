<script setup lang="ts">
/**
 * SkIcon —— 拟物化图标（SKEUO-SPEC 的 L1 层）
 *
 * 底部 tab 那套 3D 实物图标（黏土 claymorphism 质感），推广到页面内
 * **大尺寸、语义明确**的孩子入口。原则：能让孩子一眼认出"这是什么东西"的位置用它，
 * 紧凑的信息行（数字旁的小图标）仍用 lucide 线条图标 —— 拟物图缩到 <32px 会糊。
 *
 * 与 IconTile 的分工：
 *  · IconTile → 线条图标 + 彩色方块，能随主题变色、能表达任意语义
 *  · SkIcon   → 真实小物件图片，自带颜色不可变色，只表达"实物入口"
 *
 * 素材：frontend/public/nav/*.webp（与底部 tab 同一套，同光源同圆角语言）
 */
import { computed } from "vue";

export type SkIconName = "learn" | "listen" | "me" | "review" | "jar" | "calendar";

const props = withDefaults(
  defineProps<{
    name: SkIconName;
    /** sm 28px / md 40px / lg 52px —— 低于 28px 不建议用拟物图 */
    size?: "sm" | "md" | "lg";
    /** 次要/未激活态：降饱和 + 收一点，与底部 tab 未选中态同一处理 */
    dim?: boolean;
  }>(),
  { size: "md", dim: false }
);

const src = computed(() => `/nav/${props.name}.webp`);
</script>

<template>
  <img
    class="sk-icon"
    :class="[`sk-icon--${size}`, { 'sk-icon--dim': dim }]"
    :src="src"
    alt=""
    aria-hidden="true"
    draggable="false"
  />
</template>

<style scoped>
.sk-icon {
  display: inline-block;
  flex: none;
  object-fit: contain;
  /* 拟物图自带柔和投影会与容器底色的边缘打架，统一只补一层落地影，
   * 让它像"放在面上的一张立体贴纸"而不是"贴上去的图片"。
   * 两层而不是一层：卡片底色与图形同色系时（金罐放金卡、蓝日历放蓝卡），
   * 单层淡影分不开，第二层更实的近影负责把轮廓"抬"起来。 */
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.22)) drop-shadow(0 1px 0 rgba(255, 255, 255, 0.35));
  transition: opacity var(--dur-base), transform var(--dur-base), filter var(--dur-base);
  -webkit-user-drag: none;
  user-select: none;
}
.sk-icon--sm {
  width: 28px;
  height: 28px;
}
.sk-icon--md {
  width: 40px;
  height: 40px;
}
.sk-icon--lg {
  width: 52px;
  height: 52px;
}
/* 未激活：与底部 tab 的 .bn-img 同一套降饱和语言 */
.sk-icon--dim {
  opacity: 0.7;
  transform: scale(0.92);
  filter: saturate(0.82) drop-shadow(0 2px 2px rgba(0, 0, 0, 0.16));
}
</style>
