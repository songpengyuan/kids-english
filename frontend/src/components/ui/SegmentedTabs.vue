<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{
  modelValue: string;
  items: { value: string; label: string }[];
}>();
const emit = defineEmits<{
  "update:modelValue": [v: string];
}>();
const activeIdx = computed(() =>
  Math.max(0, props.items.findIndex((it) => it.value === props.modelValue))
);
</script>

<template>
  <div class="seg" :style="{ '--n': items.length }">
    <span class="seg-ind" :style="{ transform: `translateX(${activeIdx * 100}%)` }" />
    <button
      v-for="(it, i) in items"
      :key="it.value"
      class="seg-btn"
      :class="{ on: it.value === modelValue }"
      @click="emit('update:modelValue', it.value)"
    >
      {{ it.label }}
    </button>
  </div>
</template>

<style scoped>
.seg {
  position: relative;
  display: flex;
  padding: 4px;
  background: var(--card-bg);
  border-radius: 999px;
  box-shadow: var(--shadow-hard);
}
.seg-ind {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc((100% - 8px) / var(--n));
  background: var(--brand-grad, linear-gradient(135deg, #1e7fd0, #38a3e8, #6cc3f5));
  border-radius: 999px;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(28, 176, 246, 0.35);
}
.seg-btn {
  flex: 1;
  padding: 10px 0;
  border: none;
  background: transparent;
  font-weight: 800;
  font-size: var(--fs-small);
  color: var(--ink-faint);
  position: relative;
  z-index: 1;
  transition: color 0.2s;
  cursor: pointer;
}
.seg-btn.on {
  color: #fff;
}
</style>
