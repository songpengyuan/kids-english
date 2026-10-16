<script setup lang="ts">
import { computed, type Component } from "vue";
const props = defineProps<{
  modelValue: string;
  items: { value: string; label: string; icon?: Component }[];
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
      <span v-if="it.icon" class="seg-icon"><component :is="it.icon" /></span>
      {{ it.label }}
    </button>
  </div>
</template>

<style scoped>
.seg {
  position: relative;
  display: flex;
  align-items: center;
  padding: var(--gap-xs);
  background: var(--card-bg);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-hard);
}
.seg-ind {
  position: absolute;
  top: var(--gap-xs);
  bottom: var(--gap-xs);
  left: var(--gap-xs);
  width: calc((100% - var(--gap-xs) * 2) / var(--n));
  background: var(--brand-grad);
  border-radius: var(--radius-pill);
  transition: transform var(--dur-base) var(--ease-out);
  box-shadow: var(--shadow-chip);
}
.seg-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--gap-xs);
  padding: var(--gap-m) 0;
  border: none;
  background: transparent;
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
  color: var(--ink-faint);
  position: relative;
  z-index: 1;
  transition: color var(--dur-base);
  cursor: pointer;
}
.seg-btn.on {
  color: var(--on-tone);
}
.seg-icon :deep(*) {
  width: 1em;
  height: 1em;
}
</style>
