<script setup lang="ts">
/**
 * 首页（自由练习）：独立路由 #/ 承载。
 * 游戏闯关已拆为独立路由 #/game（GameView.vue），不再用 ?mode=game 参数切换——
 * 两种模式各自独立 URL、独立缓存，KeepAlive include 见 App.vue。
 * 顶栏由统一 AppHeader 渲染，右侧 ⭐🐚🔥 三个数字 + 开关一致。
 */
import AppHeader from "../components/layout/AppHeader.vue";
import PracticeView from "./practice/PracticeView.vue";

defineOptions({ name: "HomeView" }); // KeepAlive include 需要稳定组件名
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
