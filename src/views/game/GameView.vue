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
  /* 关卡地图背景纹理：多邻国式彩色圆点（浅色主题），不随内容滚动。
   * ⚠️ 底色**故意透明**：全站背景质感层（CuteBackdrop，微渐变+柔光+颗粒）在 z-index:-1，
   *    这里一旦铺不透明底色就会把它整片盖掉（地图页曾经就是"最平"的一页）。 */
  background-color: transparent;
  background-image:
    radial-gradient(circle at 16% 18%, rgba(28, 176, 246, 0.12) 0 8px, transparent 9px),
    radial-gradient(circle at 78% 8%, rgba(255, 178, 54, 0.13) 0 6px, transparent 7px),
    radial-gradient(circle at 88% 42%, rgba(255, 99, 132, 0.10) 0 7px, transparent 8px),
    radial-gradient(circle at 10% 60%, rgba(88, 214, 141, 0.11) 0 5px, transparent 6px),
    radial-gradient(circle at 55% 92%, rgba(160, 120, 255, 0.12) 0 7px, transparent 8px),
    radial-gradient(circle at 30% 78%, rgba(28, 176, 246, 0.08) 0 5px, transparent 6px);
}
/* 暗色主题：圆点提亮一点，保持童趣但不刺眼 */
:root[data-theme="dark"] .game {
  background-image:
    radial-gradient(circle at 16% 18%, rgba(84, 200, 255, 0.16) 0 8px, transparent 9px),
    radial-gradient(circle at 78% 8%, rgba(255, 196, 90, 0.16) 0 6px, transparent 7px),
    radial-gradient(circle at 88% 42%, rgba(255, 128, 156, 0.13) 0 7px, transparent 8px),
    radial-gradient(circle at 10% 60%, rgba(104, 224, 168, 0.13) 0 5px, transparent 6px),
    radial-gradient(circle at 55% 92%, rgba(180, 146, 255, 0.16) 0 7px, transparent 8px),
    radial-gradient(circle at 30% 78%, rgba(84, 200, 255, 0.10) 0 5px, transparent 6px);
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
