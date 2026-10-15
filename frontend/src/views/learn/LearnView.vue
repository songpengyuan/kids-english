<script setup lang="ts">
/**
 * 学习主页（自由练习）：独立路由 #/learn。
 * 无顶部 header（沉浸式）；闯关入口在课程网格最底部。
 */
import { useRouter } from "vue-router";
import PathIcon from "../../components/PathIcon.vue";
import PracticeView from "./practice/PracticeView.vue";
import { speakZh } from "../../services/speech";
import { useProgressStore } from "../../stores/progress";
import { lessons } from "../../data/lessons";

defineOptions({ name: "LearnView" });

const router = useRouter();
const progress = useProgressStore();
function goGame() {
  speakZh("游戏闯关");
  const id = progress.lastLesson || lessons[0]?.id || "l4";
  void router.push(`/game/lesson/${id}`);
}
</script>

<template>
  <div class="home view">
    <PracticeView class="pv-slot" />
  </div>
</template>

<style scoped>
.pv-slot {
  flex: 1;
  min-height: 0;
}
</style>
