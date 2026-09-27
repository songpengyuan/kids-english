<script setup lang="ts">
/**
 * 首页壳（阶段 2-2）：按底部导航 mode 路由到 自由练习/游戏闯关 两个子视图。
 * 保留 KeepAlive 需要的稳定组件名；URL 兼容：#/ 与 #/?mode=game。
 *
 * 顶栏由统一 AppHeader 渲染：三个 tab（学习/游戏/我的）切来切去顶栏一致，
 * 只有左侧标题随 mode 变化，右侧始终是 ⭐🐚🔥 三个数字 + 开关。
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import AppHeader from "../components/layout/AppHeader.vue";
import PracticeView from "./practice/PracticeView.vue";
import GameView from "./game/GameView.vue";

defineOptions({ name: "HomeView" }); // KeepAlive include 需要稳定组件名

const route = useRoute();
const mode = computed(() => (route.query.mode === "game" ? "game" : "practice"));
</script>

<template>
  <div class="home view">
    <AppHeader
      :title="mode === 'game' ? '游戏闯关' : '学习'"
      :icon="mode === 'game' ? 'game' : 'free'"
    />

    <KeepAlive>
      <PracticeView v-if="mode === 'practice'" />
      <GameView v-else />
    </KeepAlive>

    <p class="foot">建议家长陪同，每次 10~15 分钟</p>
  </div>
</template>

<style scoped>
.home {
  position: relative;
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
