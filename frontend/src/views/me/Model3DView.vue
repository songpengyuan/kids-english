<script setup lang="ts">
/**
 * 3D 模型展示页（/me/model3d）
 * 多模型切换：宇航员 / 机器人 / 马 / 头盔 / 牛油果
 */
import { useRouter } from "vue-router";
import { ref } from "vue";
import HeaderBar from "../../components/layout/HeaderBar.vue";
import ModelViewer from "../../components/ui/ModelViewer.vue";

const router = useRouter();
function goBack() {
  router.back();
}

interface ModelItem {
  key: string;
  name: string;
  emoji: string;
  src: string;
  orbit: string;
}

const MODELS: ModelItem[] = [
  { key: "astro", name: "宇航员", emoji: "🧑‍🚀", src: "models/ultraseven.glb", orbit: "0deg 75deg 4.5m" },
  { key: "robot", name: "小机器人", emoji: "🤖", src: "models/RobotExpressive.glb", orbit: "0deg 75deg 2.8m" },
  { key: "horse", name: "小马", emoji: "🐴", src: "models/Horse.glb", orbit: "0deg 75deg 3m" },
  { key: "helmet", name: "钢铁头盔", emoji: "🪖", src: "models/Helmet.glb", orbit: "0deg 75deg 0.4m" },
];

const active = ref(0);
</script>

<template>
  <div class="model3d view">
    <HeaderBar show-back back-label="返回" @back="goBack" />
    <div class="stage">
      <ModelViewer :key="active" :src="MODELS[active].src" :alt="MODELS[active].name" :camera-orbit="MODELS[active].orbit" />
    </div>
    <div class="switcher">
      <button
        v-for="(m, i) in MODELS"
        :key="m.key"
        class="sw-btn"
        :class="{ on: i === active }"
        @click="active = i"
      >
        <span class="sw-emoji">{{ m.emoji }}</span>
        <span class="sw-name">{{ m.name }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.model3d {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: var(--gap-s);
}
.stage {
  flex: 1;
  margin: var(--gap-s) var(--gap-s) 0;
  border-radius: var(--radius-l, 24px);
  box-shadow: var(--shadow-hard);
  overflow: hidden;
  min-height: 0;
}
.switcher {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 0 var(--gap-s) var(--gap-m);
}
.sw-btn {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 16px;
  border-radius: 16px;
  background: var(--card-bg);
  box-shadow: var(--shadow-hard);
  border: 2.5px solid transparent;
  cursor: pointer;
  transition: transform 0.1s;
}
.sw-btn:active { transform: scale(0.95); }
.sw-btn.on {
  border-color: var(--gold);
}
.sw-emoji { font-size: 28px; }
.sw-name { font-size: 12px; font-weight: 800; color: var(--ink); }
</style>
