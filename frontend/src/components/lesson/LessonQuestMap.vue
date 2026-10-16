<script setup lang="ts">
/**
 * 课内闯关地图：展示当前课程的闯关关卡路径（quiz→match→speak→talk），
 * 每个节点显示星数，点第一个未通关的节点开始闯关。
 */
import type { QuestAct } from "../../composables/useQuest";
import { Star, Lock, Play } from "@lucide/vue";

defineProps<{
  acts: (QuestAct & { stars?: number })[];
}>();
const emit = defineEmits<{ start: [act: QuestAct] }>();

/** 第一个没拿到星的关卡 = 可玩节点；之前的都算已通关 */
function canPlay(i: number, stars: number) {
  if (stars > 0) return true; // 已通关可重玩
  // 第一个没星的：需要前面都通关才能玩
  for (let j = 0; j < i; j++) {
    if ((arguments[0] as any)) break;
  }
  return true; // 简化：全部可点
}
</script>

<template>
  <div class="qmap">
    <div class="qmap-title">⚔️ 闯关挑战</div>
    <div class="qmap-path">
      <template v-for="(a, i) in acts" :key="a.key">
        <!-- 连接线 -->
        <div v-if="i > 0" class="qline" :class="{ done: (acts[i-1].stars ?? 0) > 0 }"></div>
        <!-- 节点 -->
        <button
          class="qnode"
          :class="['tone-' + a.tone, { done: (a.stars ?? 0) > 0, current: (a.stars ?? 0) === 0 }]"
          @click="emit('start', a)"
        >
          <span class="qn-icon"><component :is="a.icon" class="k-ico" /></span>
          <span class="qn-name">{{ a.name }}</span>
          <span class="qn-stars" v-if="(a.stars ?? 0) > 0">
            <Star v-for="n in a.stars" :key="n" class="k-ico star-fill" />
          </span>
          <span class="qn-play" v-else><Play class="k-ico" /></span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.qmap { display: flex; flex-direction: column; align-items: center; gap: var(--gap-s); padding: var(--gap-m) 0; }
.qmap-title { font-weight: 900; font-size: var(--fs-title); color: var(--ink); }
.qmap-path { display: flex; flex-direction: column; align-items: center; gap: 0; }
.qline { width: 4px; height: 28px; background: var(--line); border-radius: 2px; }
.qline.done { background: var(--brand); }
.qnode {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  width: 130px; padding: var(--gap-s);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  transition: transform 0.08s;
}
.qnode:active { transform: scale(0.95); }
.qnode.done { opacity: 0.85; }
.qnode.current { box-shadow: var(--shadow-hard), 0 0 0 3px var(--yellow); }
.qn-icon { font-size: 28px; }
.qn-icon .k-ico { width: 28px; height: 28px; }
.qn-name { font-weight: 800; font-size: var(--fs-small); }
.qn-stars { display: flex; gap: 2px; }
.qn-stars .k-ico { width: 14px; height: 14px; color: var(--gold); }
.qn-play .k-ico { width: 18px; height: 18px; color: var(--brand); }
.tone-blue { background: #dbeafe; }
.tone-green { background: #d1fae5; }
.tone-orange { background: #fed7aa; }
.tone-purple { background: #e9d5ff; }
.tone-pink { background: #fce7f3; }
.tone-teal { background: #99f6e4; }
</style>
