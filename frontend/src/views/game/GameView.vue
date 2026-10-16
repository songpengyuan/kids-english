<script setup lang="ts">
/**
 * 游戏闯关首页：独立路由 #/game（入口在学习页右上角"游戏"按钮）。
 * 多邻国式关卡路径图；滚动条贴最右缘（slot 宽度向右扩展一个 --pad-x）。
 * KeepAlive 缓存整页（App.vue include="LearnView,GameView"），
 * 返回本页时 GamePath 的 onActivated 对比关卡状态触发解锁动效。
 * 顶栏带返回（游戏非底部主 tab，从学习页进入，返回即回学习）。
 *
 * 设计（2026-10 统一）：骨架换 PageShell（fill 模式，让地图参与 flex 分配）。
 * 顺带修掉返回键失效——原来没绑 @back，而 HeaderBar 只 emit、没有默认行为。
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
    <GamePath class="gp-slot" />
  </PageShell>
</template>

<style scoped>
/* 游戏页背景**故意透明**：闯关地图的天空草地场景由全站背景质感层
 *（CuteBackdrop 的 sky 主题，随 #/game 路由自动切换）提供；
 *  这里不铺任何纹理/底色，避免与场景背景叠加。
 * 顶栏与地图之间的间距由骨架的 --gap-s 提供，不再额外加 margin
 *（原先两者叠加，间距是其它页面的两倍）。
 * 元素选择器直接命中骨架根节点：scoped 会把本组件的 scope id 加到子组件根元素上，
 * 因此不能写 :deep(.view)——那会编译成后代选择器，反而选不中根元素。 */
.view {
  background: transparent;
}

/* 地图占满剩余高度，路径图超高时可上下滚动；
   滚动条贴到视口最右缘：内容宽度向右多伸一个 --pad-x，右缘直达视口边缘；
   地图内容自带留白（节点列 0.24/0.76 外侧留白），无需右 padding。
   注意不用负 margin（flex stretch 下负 margin 不生效），用宽度扩展。 */
.gp-slot {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  width: calc(100% + var(--pad-x));
  max-width: none;
  -webkit-overflow-scrolling: touch;
}
</style>
