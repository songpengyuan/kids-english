<script setup lang="ts">
/**
 * 游戏闯关首页：独立路由 #/game（不再由首页 ?mode=game 参数指向）。
 * 多邻国式关卡路径图；滚动条贴最右缘（slot 宽度向右扩展一个 --pad-x）。
 * KeepAlive 缓存整页（App.vue include="HomeView,GameView"），
 * 返回本页时 GamePath 的 onActivated 对比关卡状态触发解锁动效。
 */
import AppHeader from "../../components/layout/AppHeader.vue";
import GamePath from "../../components/game/GamePath.vue";

defineOptions({ name: "GameView" }); // KeepAlive include 需要稳定组件名
</script>

<template>
  <div class="game view">
    <AppHeader title="游戏闯关" icon="game" />

    <GamePath class="gp-slot" />

    <p class="foot">建议家长陪同，每次 10~15 分钟</p>
  </div>
</template>

<style scoped>
.game {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  /* 背景**故意透明**：游戏闯关地图的天空草地场景由全站背景质感层
   *（CuteBackdrop 的 sky 主题，随 #/game 路由自动切换）提供；
   *  这里不再铺任何纹理/底色，避免与场景背景叠加。 */
  background: transparent;
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

/* 游戏模式：占满剩余高度，路径图超高时可上下滚动；
   滚动条贴到视口最右缘：slot 宽度向右多伸一个 --pad-x，右缘直达视口边缘；
   地图内容自带留白（节点列 0.24/0.76 外侧留白），无需右 padding。
   注意不用负 margin（flex stretch 下负 margin 不生效），用宽度扩展。 */
.gp-slot {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  margin-top: var(--gap-s);
  width: calc(100% + var(--pad-x));
  max-width: none;
  margin-left: 0;
  margin-right: 0;
  padding-right: 0;
  -webkit-overflow-scrolling: touch;
}
</style>
