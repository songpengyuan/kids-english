<script setup>
import { ref, computed, onMounted } from "vue";
import HomePage from "./components/HomePage.vue";
import LessonView from "./components/LessonView.vue";
import CuteBackdrop from "./components/CuteBackdrop.vue";
import { getLesson } from "./data/lessons";
import { initPWA, applyUpdateIfIdle } from "./utils/pwa";

const currentId = ref(null); // null = 首页
const lesson = computed(() => (currentId.value ? getLesson(currentId.value) : null));

function open(id) {
  currentId.value = id;
}
function back() {
  currentId.value = null;
  // 深链参数（?lesson=xx&stage=yy）只在"进入应用"那一刻生效。
  // 回首页时清掉：挂起的版本更新会在回首页时 location.reload()，
  // 若 URL 里还留着深链，刷新后会直接跳回课程里——表现为"返回按钮失灵"。
  if (location.search) {
    history.replaceState(null, "", location.pathname);
  }
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
  <CuteBackdrop />
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
