<script setup lang="ts">
/**
 * 玩法局顶栏「本局进度」指示（多邻国式逐步圆点）。
 *
 * 职责边界（2026-10 顶部走查收口）：
 *   - 这里只表达**当前这一局**推进到第几步（答题 / 配对 / 拼句 / 转动），
 *     点做对一步亮一个；
 *   - **课程级完成度**（本课哪些玩法已亮星 / 还差几个玩法）由闯关地图节点、
 *     卡片目录星标与完成百分比承担，不在玩法局顶栏重复铺一排段块——
 *     旧版 memory/order/song/spinner 顶部那排"课程段块"和当下这局
 *     （第几对 / 第几句 / 第几转）对不上，孩子抬眼看到的是历史点亮而非当前进度。
 *
 * 渲染条件：playTotal > 1（≥2 步才有"逐个点亮"的空间感知）。
 * 浏览 / 无步数玩法（学单词单页浏览、唱童谣）playTotal 不大于 1，这里不渲染，
 * 避免摆一个无意义的单点。
 */
import { computed } from "vue";

const props = defineProps<{
  /** 本局进度 0-100（由玩法组件按"已完成 / 总量"上报） */
  playPct: number;
  /** 本局总量（题数 / 对数 / 句数 / 轮数 / 转数）；≤1 不画点 */
  playTotal: number;
}>();

/** 已完成步数（向下取整：当前进行中的那一步不算"已完成"，由 cur 指示） */
const doneCount = computed(() => Math.round((props.playPct / 100) * props.playTotal));
</script>

<template>
  <div v-if="playTotal > 1" class="hdr-play" role="img" :aria-label="`本局进度，已完成 ${doneCount} / ${playTotal} 步`">
    <span
      v-for="n in playTotal"
      :key="n"
      class="dot"
      :class="{ done: n <= doneCount, cur: n === doneCount + 1 }"
    ></span>
  </div>
</template>

<style scoped>
.hdr-play {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 0;
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
  background: var(--brand);
  border-color: var(--brand);
}
.dot.cur {
  background: var(--c-orange);
  border-color: var(--c-orange);
  transform: scale(1.2);
}
@media (min-width: 600px) {
  .hdr-play {
    gap: 6px;
  }
}
</style>
