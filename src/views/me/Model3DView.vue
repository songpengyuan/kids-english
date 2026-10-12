<script setup lang="ts">
/**
 * 3D 模型展示页（/me/model3d）
 * 独立入口，展示赛罗/宇航员 3D 模型
 */
import { useRouter } from "vue-router";
import HeaderBar from "../../components/layout/HeaderBar.vue";
import ModelViewer from "../../components/ui/ModelViewer.vue";

const router = useRouter();
function goBack() {
  router.back();
}
</script>

<template>
  <div class="model3d view">
    <HeaderBar show-back back-label="返回" @back="goBack" />
    <div class="stage">
      <ModelViewer src="/models/ultraseven.glb" alt="3D 英雄" />
    </div>
    <p class="tip">👆 可以用手指拖动旋转模型</p>
  </div>
</template>

<style scoped>
.model3d {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.stage {
  flex: 1;
  margin: var(--gap-s);
  border-radius: var(--radius-l, 24px);
  background: radial-gradient(circle at 50% 40%, rgba(252, 211, 77, 0.25), transparent 70%), var(--card-bg);
  box-shadow: var(--shadow-hard);
  overflow: hidden;
}
.tip {
  text-align: center;
  margin: 0 0 var(--gap-m);
  color: var(--ink-soft);
  font-weight: 700;
  font-size: 13px;
}
</style>
