<script setup lang="ts">
/**
 * 学习主页（自由练习）：独立路由 #/learn（与 #/game、#/me 三入口对称）。
 * 游戏闯关在 #/game（GameView.vue）；#/ 旧链接自动重定向到 #/learn。
 * 顶栏由统一 AppHeader 渲染，右侧 ⭐🐚🔥 三个数字 + 开关一致。
 */
import AppHeader from "../../components/layout/AppHeader.vue";
import PracticeView from "./practice/PracticeView.vue";

defineOptions({ name: "LearnView" }); // KeepAlive include 需要稳定组件名
</script>

<template>
  <div class="home view">
    <AppHeader title="学习" icon="free" />

    <PracticeView class="pv-slot" />

    <p class="foot">建议家长陪同，每次 10~15 分钟</p>
  </div>
</template>

<style scoped>
.home {
  position: relative;
}
.pv-slot {
  flex: 1;
  min-height: 0;
}
.foot {
  text-align: center;
  color: var(--ink-faint);
  font-weight: 700;
  font-size: var(--fs-small);
  margin: 0;
  flex: none;
}
@media (max-height: 480px) {
  .foot {
    display: none;
  }
}
</style>
