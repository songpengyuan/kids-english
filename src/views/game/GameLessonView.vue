<script setup lang="ts">
/**
 * 当前课游戏地图（#/game/lesson/:id）——只显示这一课的关卡（学完的/进行中的都有），
 * 适合孩子在学某课时就地闯这课的地图；多课总地图 #/game 保留代码，入口暂移出（后续考虑启用）。
 */
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppHeader from "../../components/layout/AppHeader.vue";
import GamePath from "../../components/game/GamePath.vue";
import { getLesson } from "../../data/lessons";

const route = useRoute();
const router = useRouter();
const lessonId = computed(() => route.params.id as string);
const lesson = computed(() => getLesson(lessonId.value));

function goBack() {
  // 从学习/课程页进入 → 返回上一页；无历史（直接输地址）回学习主页
  if (window.history.length > 1) router.back();
  else void router.push("/learn");
}
</script>

<template>
  <div class="game-lesson view">
    <AppHeader show-back :title="lesson?.titleZh || '游戏闯关'" icon="game" @back="goBack" />
    <GamePath class="gp-slot" :lesson-id="lessonId" />
  </div>
</template>

<style scoped>
.game-lesson {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}
.gp-slot {
  flex: 1;
  min-height: 0;
}
</style>
