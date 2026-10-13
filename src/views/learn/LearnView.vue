<script setup lang="ts">
/**
 * 学习主页（自由练习）：独立路由 #/learn（与 #/game、#/me 三入口对称）。
 * 游戏闯关在 #/game（GameView.vue）；#/ 旧链接自动重定向到 #/learn。
 * 顶栏由统一 AppHeader 渲染，右侧 ⭐🐚🔥 三个数字 + 开关一致；
 * 右上角 action 位放"游戏"入口（游戏非底部主 tab，收在此处进入闯关地图）。
 */
import { useRouter } from "vue-router";
import AppHeader from "../../components/layout/AppHeader.vue";
import PathIcon from "../../components/PathIcon.vue";
import PracticeView from "./practice/PracticeView.vue";
import { speakZh } from "../../services/speech";
import { useProgressStore } from "../../stores/progress";
import { lessons } from "../../data/lessons";

defineOptions({ name: "LearnView" }); // KeepAlive include 需要稳定组件名

const router = useRouter();
const progress = useProgressStore();
function goGame() {
  speakZh("游戏闯关");
  // 当前课游戏地图（只显示这一课的关卡）；多课总地图 #/game 入口暂搁置
  const id = progress.lastLesson || lessons[0]?.id || "l4";
  void router.push(`/game/lesson/${id}`);
}
</script>

<template>
  <div class="home view">
    <AppHeader title="学习" icon="free">
      <template #action>
        <button class="game-entry" aria-label="进入游戏闯关" @click="goGame">
          <PathIcon name="game" class="ge-ico" /><span>游戏</span>
        </button>
      </template>
    </AppHeader>

    <PracticeView class="pv-slot" />
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
/* 右上角"游戏"入口：金色小胶囊（与宝藏罐徽章同语言，5 岁孩子可识别的醒目按钮） */
.game-entry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-small);
  font-weight: 800;
  color: #6b4e00;
  background: linear-gradient(160deg, #ffd87a, #f0b429);
  box-shadow: 0 var(--press) 0 rgba(0, 0, 0, 0.18);
  padding: 4px 12px;
  border-radius: var(--radius-s);
  white-space: nowrap;
  flex: none;
  transition: transform 0.1s;
}
.game-entry:active {
  transform: translateY(calc(var(--press) - 1px));
}
.ge-ico {
  width: 16px;
  height: 16px;
}
@media (max-height: 480px) {
  .foot {
    display: none;
  }
}
</style>
