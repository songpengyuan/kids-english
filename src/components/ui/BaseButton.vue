<script setup lang="ts">
import { computed } from "vue";

type Variant = "green" | "blue" | "orange" | "gray";

const props = withDefaults(defineProps<{
  variant?: Variant;
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

<style scoped>
.k-btn {
  background: var(--green);
  color: var(--on-tone);
  font-size: var(--fs-btn);
  font-weight: 700;
  padding: clamp(10px, 1.8vh, 14px) clamp(20px, 3vw, 32px);
  border-radius: var(--radius-s);
  box-shadow: 0 var(--press) 0 var(--green-dark);
  transition: transform var(--dur-fast), box-shadow var(--dur-fast);
  min-height: var(--tap-min);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4em;
}
.k-btn:active {
  transform: translateY(calc(var(--press) - 1px)) scale(0.97);
  box-shadow: 0 1px 0 var(--green-dark);
}

.k-btn-blue { background: var(--blue); box-shadow: 0 var(--press) 0 var(--blue-dark); }
.k-btn-blue:active { box-shadow: 0 1px 0 var(--blue-dark); }
.k-btn-orange { background: var(--orange); box-shadow: 0 var(--press) 0 var(--orange-dark); }
.k-btn-orange:active { box-shadow: 0 1px 0 var(--orange-dark); }
.k-btn-gray { background: var(--btn-plain-bg); color: var(--ink); box-shadow: 0 var(--press) 0 var(--btn-plain-deep); }
.k-btn-gray:active { box-shadow: 0 1px 0 var(--btn-plain-deep); }

.k-btn:disabled {
  background: var(--btn-off-bg);
  color: var(--btn-off-ink);
  box-shadow: 0 var(--press) 0 var(--btn-off-deep);
  cursor: default;
}
.k-btn:disabled:active { transform: none; box-shadow: 0 var(--press) 0 var(--btn-off-deep); }

.k-btn-block { width: 100%; }
.k-btn-lg { padding: clamp(14px, 2.4vh, 20px) clamp(28px, 4vw, 48px); font-size: var(--fs-title); }

@media (hover: hover) and (pointer: fine) {
  .k-btn:hover { transform: translateY(-1px); box-shadow: 0 calc(var(--press) + 2px) 0 var(--green-dark); }
  .k-btn-blue:hover { box-shadow: 0 calc(var(--press) + 2px) 0 var(--blue-dark); }
  .k-btn-orange:hover { box-shadow: 0 calc(var(--press) + 2px) 0 var(--orange-dark); }
  .k-btn-gray:hover { box-shadow: 0 calc(var(--press) + 2px) 0 var(--btn-plain-deep); }
  .k-btn:disabled:hover { transform: none; box-shadow: 0 var(--press) 0 var(--btn-off-deep); }
}
</style>
