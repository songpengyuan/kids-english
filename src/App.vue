<script setup>
import { ref, computed, onMounted } from "vue";
import HomePage from "./components/HomePage.vue";
import LessonView from "./components/LessonView.vue";
import { getLesson } from "./data/lessons";

const currentId = ref(null); // null = 首页
const lesson = computed(() => (currentId.value ? getLesson(currentId.value) : null));

function open(id) {
  currentId.value = id;
}
function back() {
  currentId.value = null;
}

/**
 * 调试深链：?lesson=l4
 * 直接在真机（iPad / 手机）上打开指定课时，省去一路点进来；
 * 验收某个页面的布局时很有用，日常使用不受影响。
 */
onMounted(() => {
  const id = new URLSearchParams(location.search).get("lesson");
  if (id && getLesson(id)) currentId.value = id;
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
