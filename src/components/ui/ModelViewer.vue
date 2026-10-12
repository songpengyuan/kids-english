<script setup lang="ts">
/**
 * 3D 模型展示组件（封装 <model-viewer>）
 */
import "@google/model-viewer";
import { computed } from "vue";

const props = withDefaults(defineProps<{
  src?: string;
  alt?: string;
  autoRotate?: boolean;
  exposure?: number;
}>(), {
  src: "",
  alt: "3D 模型",
  autoRotate: true,
  exposure: 1.2,
});

const resolvedSrc = computed(() => {
  if (!props.src) return `${import.meta.env.BASE_URL}models/ultraseven.glb`;
  if (props.src.startsWith("http") || props.src.startsWith("/")) return props.src;
  return `${import.meta.env.BASE_URL}${props.src}`;
});
</script>

<template>
  <model-viewer
    :src="resolvedSrc"
    :alt="alt"
    :auto-rotate="autoRotate"
    camera-controls
    shadow-intensity="1"
    :exposure="exposure"
    tone-mapping="neutral"
  ></model-viewer>
</template>

<style scoped>
model-viewer {
  width: 100%;
  height: 100%;
  --poster-color: transparent;
  background: transparent;
}
</style>
