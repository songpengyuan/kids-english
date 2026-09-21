<script setup>
import { ref, computed } from "vue";
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
</script>

<template>
  <KeepAlive include="HomePage">
    <LessonView v-if="lesson" :key="lesson.id" :lesson="lesson" @back="back" />
    <HomePage v-else key="HomePage" @open="open" />
  </KeepAlive>
</template>
