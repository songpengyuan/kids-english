<script setup lang="ts">
/**
 * 游戏闯关首页（阶段 2-2：从 HomePage 拆分）。
 * 多邻国式关卡路径图；滚动条贴最右缘（slot 宽度向右扩展一个 --pad-x）。
 */
import GamePath from "../../components/GamePath.vue";
</script>

<template>
  <div class="game">
    <GamePath class="gp-slot" />
  </div>
</template>

<style scoped>
.game {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
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
