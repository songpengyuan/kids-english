<script setup lang="ts">
/**
 * 3D 英雄展示组件
 * 使用 <model-viewer> 渲染 GLB 模型，支持自动旋转和待机动画。
 * 模型文件放在 public/models/ 下。
 */
import "@google/model-viewer";

withDefaults(defineProps<{
  src?: string;
  alt?: string;
  autoRotate?: boolean;
}>(), {
  src: "/models/ultraseven.glb",
  alt: "3D 英雄",
  autoRotate: true,
});
</script>

<template>
  <model-viewer
    :src="src"
    :alt="alt"
    :auto-rotate="autoRotate"
    camera-controls
    shadow-intensity="1"
    exposure="1"
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
