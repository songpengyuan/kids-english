<!--
  闯关玩法页（路由 /game/quest/:id/:stage?）。

  与自由课程玩法（/learn/:id）共享同一套玩法页与流程引擎
  （useLessonFlow + useQuest）：useQuest 按路由前缀 /game/quest 识别闯关身份，
  因此这里只需薄壳转发 learn/LessonView，保证"一个路由对应一个 view 文件"。

  注意：此壳不参与 KeepAlive（App.vue include 仅 LearnView,GameView），
  闯关玩法每次进入重新创建，与过往行为一致。
-->
<template>
  <LessonView />
</template>

<script setup lang="ts">
import LessonView from "../learn/LessonView.vue";
</script>
