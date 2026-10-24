<script setup lang="ts">
/**
 * 游戏闯关首页：多课总地图（#/game）。
 *
 * ⚠️ 2026-10-17 起**入口已收起**：课程页/「我的」里的闯关都直接进本课地图
 * （#/course/:id/game）。本页与数据保留，作为将来的"全站总览地图"。
 * 两者共用 GamePath：本页不传 lesson = 全部课程 + 跨课连续序号；
 * 本课地图传 lesson = 只画这一课 + 本课内序号。
 *
 * 滚动由 GamePath 自带的 .game-path-scroll 负责；本页只提供剩余高度。
 * KeepAlive 缓存整页（App.vue include="LearnView,GameView"），
 * 返回本页时 GamePath 的 onActivated 对比关卡状态触发解锁动效。
 * 顶栏带返回（游戏非底部主 tab，从学习页进入，返回即回学习）。
 */
import { useRouter } from "vue-router";
import PageShell from "../../components/ui/PageShell.vue";
import GamePath from "../../components/game/GamePath.vue";

defineOptions({ name: "GameView" }); // KeepAlive include 需要稳定组件名

const router = useRouter();

/** 从学习/课程页进入 → 返回上一页；无历史（直接输地址）回学习主页 */
function goBack() {
  if (window.history.length > 1) router.back();
  else void router.push("/course");
}
</script>

<template>
  <PageShell
    fill
    title="游戏闯关"
    icon="game"
    show-badges
    back-label="返回"
    @back="goBack"
  >
    <GamePath />
  </PageShell>
</template>

<style scoped>
/* 游戏页背景**故意透明**：闯关地图的天空草地场景由全站背景质感层
 *（CuteBackdrop 的 sky 主题，随 #/game 路由自动切换）提供；
 *  这里不铺任何纹理/底色，避免与场景背景叠加。
 * 元素选择器直接命中骨架根节点：scoped 会把本组件的 scope id 加到子组件根元素上，
 * 因此不能写 :deep(.view)——那会编译成后代选择器，反而选不中根元素。 */
.view {
  background: transparent;
}
</style>
