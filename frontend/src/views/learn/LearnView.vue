<script setup lang="ts">
/**
 * 学习主页（/learn，默认首页态 = 今日任务，P0-1）
 * 孩子打开只做一个对的选择：今日任务卡（复习 N / 本课下一关 / 磨耳朵 5 分钟）。
 * 「全部课程」为次级入口，点开进入课程网格（PracticeView），可返回今日任务。
 * 无顶部 header（沉浸式）；闯关入口在课程网格最底部。
 */
import { ref } from "vue";
import TodayTask from "../../components/today/TodayTask.vue";
import PracticeView from "./practice/PracticeView.vue";
import { ChevronLeft } from "@lucide/vue";
import { speakZh } from "../../services/speech";

defineOptions({ name: "LearnView" });

/** 视图切换：true=课程列表（次级），false=今日任务（默认首页态） */
const showLessons = ref(false);
function backToToday() {
  speakZh("今日任务");
  showLessons.value = false;
}
</script>

<template>
  <div class="home view">
    <TodayTask v-if="!showLessons" class="pv-slot" @all-lessons="showLessons = true" />
    <template v-else>
      <button class="back-today" @click="backToToday">
        <ChevronLeft class="k-ico" />
        今日任务
      </button>
      <PracticeView class="pv-slot" />
    </template>
  </div>
</template>

<style scoped>
.pv-slot {
  flex: 1;
  min-height: 0;
}
.back-today {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  margin: var(--gap-s) var(--pad-x) 0;
  align-self: flex-start;
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--brand-soft, #e3f5ff);
  color: var(--brand-dark, #0086d6);
  font-weight: 900;
  font-size: var(--fs-small);
  box-shadow: var(--shadow-hard);
}
.back-today:active {
  transform: translateY(2px);
}
</style>
