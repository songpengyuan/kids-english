<script setup lang="ts">
/**
 * 3D 模型展示组件（封装 <model-viewer>）
 */
import "@google/model-viewer";
import { computed, ref, onMounted } from "vue";

const props = withDefaults(defineProps<{
  src?: string;
  alt?: string;
  autoRotate?: boolean;
}>(), {
  src: "",
  alt: "3D 模型",
  autoRotate: true,
});

const loaded = ref(false);
const resolvedSrc = computed(() => {
  if (!props.src) return `${import.meta.env.BASE_URL}models/ultraseven.glb`;
  if (props.src.startsWith("http") || props.src.startsWith("/")) return props.src;
  return `${import.meta.env.BASE_URL}${props.src}`;
});

onMounted(() => {
  // 给 model-viewer 一点时间加载
  setTimeout(() => (loaded.value = true), 500);
});
</script>

<template>
  <div class="mv-wrap">
    <div v-if="!loaded" class="mv-loading">加载中…</div>
    <model-viewer
      :src="resolvedSrc"
      :alt="alt"
      :auto-rotate="autoRotate"
      camera-controls
      shadow-intensity="1"
      exposure="1.2"
      tone-mapping="neutral"
      camera-orbit="0deg 75deg 4.5m"
      field-of-view="30deg"
      environment-image="neutral"
    ></model-viewer>
  </div>
</template>

<style scoped>
.mv-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 50% 40%, #fff8e1, #ffe082);
  border-radius: 16px;
  overflow: hidden;
}
.mv-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-weight: 700;
  z-index: 1;
}
model-viewer {
  width: 100%;
  height: 100%;
  --poster-color: transparent;
  background: transparent;
}
</style>
