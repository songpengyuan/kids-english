<script setup lang="ts">
/**
 * BaseButton —— 通用按钮（设计系统第 ③ 层）
 *
 * 只负责"把 variant/size/block 翻译成 base.css 里的 .k-btn 修饰类"，
 * **不再自带任何样式**：以前这里有一份和 base.css 重复的 .k-btn 全套 scoped 样式，
 * 而且变体名（.k-btn-blue）和 base.css 的（.k-btn.blue）对不上，
 * 等于同一颗按钮有两处定义、其中一处还是死的。现在 base.css 是唯一定义处。
 */
import { computed } from "vue";

import type { ButtonVariant } from "../../types";

const props = withDefaults(defineProps<{
  variant?: ButtonVariant;
  disabled?: boolean;
  block?: boolean;
  size?: "md" | "lg";
}>(), {
  variant: "green",
  disabled: false,
  block: false,
  size: "md",
});

const emit = defineEmits<{ (e: "click"): void }>();

const cls = computed(() => ({
  [`k-btn-${props.variant}`]: true,
  "k-btn-block": props.block,
  "k-btn-lg": props.size === "lg",
}));
</script>

<template>
  <button class="k-btn" :class="cls" :disabled="disabled" @click="emit('click')">
    <slot />
  </button>
</template>
