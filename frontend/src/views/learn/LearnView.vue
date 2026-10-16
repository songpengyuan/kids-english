<script setup lang="ts">
/**
 * 学习主页（自由练习）：独立路由 #/course。
 * 无顶部 header（沉浸式）——用 PageShell 的 bare + fill 模式，
 * 而不是自己拼一个 `.home.view` 外壳：骨架行为（内容区收缩、底部安全区）
 * 全部由 PageShell 保证，和其它页面一致。
 */
import PageShell from "../../components/ui/PageShell.vue";
import PracticeView from "./practice/PracticeView.vue";

defineOptions({ name: "LearnView" });
</script>

<template>
  <PageShell bare fill>
    <PracticeView />
  </PageShell>
</template>
