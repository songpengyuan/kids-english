<template>
  <svg
    v-if="paths.length"
    class="path-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(p, i) in paths" :key="i" :d="p" />
  </svg>
  <span v-else class="path-icon-text">{{ text || label }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ICON_PATHS, ICON_TEXT, APP_ICON_PATHS } from "../data/pathIcons";

const props = defineProps<{ name?: string; text?: string }>();
const paths = computed(() => (props.name ? ICON_PATHS[props.name] || APP_ICON_PATHS[props.name] || [] : []));
const label = computed(() => (props.name ? ICON_TEXT[props.name] : ""));
</script>

<style scoped>
.path-icon {
  width: 1em;
  height: 1em;
  vertical-align: -0.12em;
  display: inline-block;
  flex: none;
}
.path-icon-text {
  font-weight: 800;
  letter-spacing: 0.02em;
}
</style>
