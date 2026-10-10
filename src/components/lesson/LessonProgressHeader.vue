<script setup lang="ts">
/**
 * 玩法页顶栏进度指示（多邻国式）：
 *   - 段落式关卡进度：每段 = 本课一个玩法（done 绿 / cur 橙脉冲 / todo 空心）
 *   - 单局答题进度条：步骤型玩法（学/辨/连/读）显示 x/y
 */
import type { QuestAct } from "../../composables/useQuest";

defineProps<{
  activities: QuestAct[];
  stage: string;
  /** 单局进度 0-100 */
  playPct: number;
  /** 本局总量 */
  playTotal: number;
  /** 当前玩法 key（用于高亮 cur） */
  currentKey: string;
  /** 查某玩法是否已获星 */
  hasStars: (key: string) => boolean;
}>();

const stepKeys = ["learn", "quiz", "match", "speak"];
</script>

<template>
  <div class="hdr-play" role="img" aria-label="关卡进度">
    <!-- 答题中：显示当前玩法的逐题圆点，做对一个亮一个 -->
    <template v-if="stepKeys.includes(stage) && playTotal > 0">
      <span
        v-for="n in playTotal"
        :key="n"
        class="dot"
        :class="{ done: n <= Math.round((playPct / 100) * playTotal), cur: n === Math.round((playPct / 100) * playTotal) + 1 }"
      ></span>
    </template>
    <!-- 非答题页（菜单/童谣/亲子对话）：显示活动块进度 -->
    <template v-else>
      <span
        v-for="a in activities"
        :key="a.key"
        class="seg"
        :class="{ done: hasStars(a.key), cur: a.key === currentKey }"
      ></span>
    </template>
  </div>
</template>

<style scoped>
.hdr-play {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.seg {
  flex: none;
  width: 15px;
  height: 12px;
  border-radius: 999px;
  background: var(--card-bg);
  border: 2px solid var(--line);
  transition: background 0.25s, border-color 0.25s, transform 0.25s;
}
.seg.done {
  background: var(--green);
  border-color: var(--green);
}
.dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--card-bg);
  border: 2px solid var(--line);
  transition: background 0.25s, transform 0.25s;
}
.dot.done {
  background: var(--green);
  border-color: var(--green);
}
.dot.cur {
  background: var(--c-orange);
  border-color: var(--c-orange);
  transform: scale(1.2);
}
.seg.cur {
  background: var(--c-orange);
  border-color: var(--c-orange);
  animation: seg-pulse 1.2s ease-in-out infinite;
}
@keyframes seg-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.22); }
}
@media (prefers-reduced-motion: reduce) {
  .seg.cur { animation: none; }
}

</style>
