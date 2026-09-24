<script setup>
import { ref, computed, onMounted } from "vue";
import HomePage from "./components/HomePage.vue";
import LessonView from "./components/LessonView.vue";
import { getLesson } from "./data/lessons";
import { initPWA, applyUpdateIfIdle } from "./utils/pwa";

const currentId = ref(null); // null = 首页
const lesson = computed(() => (currentId.value ? getLesson(currentId.value) : null));

function open(id) {
  currentId.value = id;
}
function back() {
  currentId.value = null;
  // 若有挂起的版本更新，回到首页正是安全刷新时机
  applyUpdateIfIdle();
}

/**
 * 调试深链：?lesson=l4
 * 直接在真机（iPad / 手机）上打开指定课时，省去一路点进来；
 * 验收某个页面的布局时很有用，日常使用不受影响。
 */
onMounted(() => {
  const id = new URLSearchParams(location.search).get("lesson");
  if (id && getLesson(id)) currentId.value = id;
  // 「在首页 = 可安全刷新」：有新版本时首页静默刷新，玩法中不打断
  initPWA(() => currentId.value === null);
});
</script>

<template>
  <KeepAlive include="HomePage">
    <LessonView
      v-if="lesson"
      :key="lesson.id"
      :lesson="lesson"
      @back="back"
      @next-lesson="open"
    />
    <HomePage v-else key="HomePage" @open="open" />
  </KeepAlive>
</template>
