<script setup lang="ts">
/**
 * 游戏模式：多邻国式关卡路径图。
 *
 * - 竖屏蛇形路径：节点左右错落，SVG 曲线连接，一眼看清"还有几关"。
 * - 节点状态：locked（灰+锁）/ active（当前关卡，脉动光圈高亮）/ played（玩过未通关，绿勾）/ done（通关，金色+勾）。
 * - 解锁规则（progress store 的 isUnlocked）：第一课总是解锁，其余需前一课玩过任一玩法。
 * - 高内聚：只读 progress store，点击关卡 emit open，不碰任何业务逻辑。
 * - TS 渐进：本组件是第一批 lang="ts" 组件，类型约束后续游戏玩法直接复用。
 */
import { computed } from "vue";
import { lessons } from "../data/lessons";
import { useProgressStore } from "../stores/progress";
import { Check, Lock, Star } from "@lucide/vue";

const emit = defineEmits<{ open: [id: string] }>();
const progress = useProgressStore();

/** 关卡节点（视口无关的抽象结构） */
interface PathNode {
  id: string;
  title: string;
  titleZh: string;
  emoji: string;
  tone: string;
  state: "locked" | "active" | "ready" | "played" | "done";
  /** SVG 百分比坐标（0-100） */
  x: number;
  y: number;
  stars: number;
}

/* ---------- 蛇形路径几何（viewBox: 0 0 100 H） ---------- */
const ROW_H = 34; // 每行高度
const START_Y = 32; // 首节点中心 y
const NODE_R = 30; // 节点半径（viewBox 单位，供连线端点留空）

const lessonIds = lessons.map((l) => l.id);
/** 路径总高（SVG viewBox 高度） */
const pathH = START_Y * 2 + (lessons.length - 1) * ROW_H + 24;

const nodes = computed<PathNode[]>(() => {
  let activeAssigned = false;
  return lessons.map((l, i) => {
    let state: PathNode["state"];
    if (progress.isCompleted(l.id)) state = "done";
    else if (progress.isPlayed(l.id)) state = "played";
    else if (progress.isUnlocked(l.id, lessonIds)) {
      // 只有"第一个未玩且已解锁"的是当前关卡（▶ 引导）；其后解锁未玩的课可点但不再标 ▶
      state = activeAssigned ? "ready" : "active";
      activeAssigned = true;
    } else state = "locked";
    return {
      id: l.id,
      title: l.title,
      titleZh: l.titleZh,
      emoji: l.emoji,
      tone: l.tone,
      state,
      x: i % 2 === 0 ? 78 : 22, // 左右交替
      y: START_Y + i * ROW_H,
      stars: progress.lessonStars(l.id)
    };
  });
});

/** 当前关卡（active 节点）id，用于连线高亮 */
const activeId = computed(() => nodes.value.find((n) => n.state === "active")?.id ?? null);

const doneCount = computed(() => nodes.value.filter((n) => n.state === "done").length);

/** 相邻节点间的连线（SVG path，二次曲线弓形） */
const links = computed(() =>
  nodes.value.slice(0, -1).map((a, i) => {
    const b = nodes.value[i + 1];
    const mx = 50;
    const my = a.y + ROW_H / 2;
    const d = `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
    const on = a.state !== "locked" && b.state !== "locked";
    return { d, on };
  })
);

function enter(n: PathNode) {
  if (n.state === "locked") return;
  emit("open", n.id);
}
</script>

<template>
  <div class="game-path anim-fade-up">
    <!-- 头部：模式名 + 通关进度 -->
    <div class="gp-head">
      <span class="gp-title">🎮 游戏闯关</span>
      <span class="gp-progress">{{ doneCount }} / {{ nodes.length }} 关通关</span>
    </div>
    <p class="gp-tip">从起点出发，玩过一关才能解锁下一关</p>

    <!-- 蛇形路径 -->
    <div class="path">
      <svg class="links" :viewBox="`0 0 100 ${pathH}`" preserveAspectRatio="none" aria-hidden="true">
        <path
          v-for="(lk, i) in links"
          :key="'lk' + i"
          :d="lk.d"
          fill="none"
          :class="{ on: lk.on }"
        />
      </svg>

      <button
        v-for="(n, i) in nodes"
        :key="n.id"
        class="node"
        :class="['st-' + n.state, 'tone-' + n.tone]"
        :style="{ left: n.x + '%', top: n.y / pathH * 100 + '%' }"
        :disabled="n.state === 'locked'"
        :aria-label="n.state === 'locked' ? n.title + '（未解锁）' : n.title"
        @click="enter(n)"
      >
        <span class="node-emoji">{{ n.emoji }}</span>
        <span class="node-stars" v-if="n.stars > 0"><Star class="k-ico star-fill" />{{ n.stars }}</span>
        <!-- 状态角标 -->
        <span v-if="n.state === 'locked'" class="tag"><Lock class="k-ico" /></span>
        <span v-else-if="n.state === 'done'" class="tag done"><Check class="k-ico" /></span>
        <span v-else-if="n.state === 'played'" class="tag played"><Check class="k-ico" /></span>
        <span v-else-if="n.state === 'active'" class="tag now">▶</span>
        <span v-else class="tag ready">·</span>

        <span class="node-cap">
          {{ n.titleZh }}<br /><small>{{ n.title }}</small>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.game-path {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
  width: 100%;
  max-width: 420px;
}
.gp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.gp-title {
  font-weight: 800;
  color: var(--ink);
  font-size: var(--fs-title);
}
.gp-progress {
  font-weight: 800;
  color: var(--ink-soft);
  font-size: var(--fs-small);
  background: var(--card-bg);
  border-radius: var(--radius-pill);
  padding: 4px var(--gap-m);
  box-shadow: var(--shadow-hard);
}
.gp-tip {
  margin: 0;
  font-weight: 700;
  color: var(--ink-faint);
  font-size: var(--fs-small);
  text-align: center;
}

/* ---------- 路径容器 ---------- */
.path {
  position: relative;
  height: v-bind("pathH + 'px'");
  width: 100%;
  overflow: hidden;
}
.links {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.links path {
  stroke: rgba(120, 120, 120, 0.35);
  stroke-width: 2.2;
  stroke-dasharray: 6 5;
  transition: stroke 0.3s, stroke-dasharray 0.3s;
}
.links path.on {
  stroke: var(--gold);
  stroke-width: 3.2;
  stroke-dasharray: none;
}

/* ---------- 节点 ---------- */
.node {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 78px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  touch-action: manipulation;
}
.node:disabled {
  cursor: default;
}
.node-emoji {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  font-size: 30px;
  border-radius: 50%;
  background: var(--card-bg);
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.16);
  transition: transform 0.15s;
}
.st-locked .node-emoji {
  filter: grayscale(0.9);
  opacity: 0.55;
  box-shadow: none;
}
.st-active .node-emoji {
  animation: node-pulse 1.4s ease-in-out infinite;
}
.st-done .node-emoji {
  background: linear-gradient(160deg, #ffd87a, #f0b429);
}
.node:not(:disabled):active .node-emoji {
  transform: scale(0.92);
}
@keyframes node-pulse {
  0%, 100% { box-shadow: 0 4px 0 rgba(0, 0, 0, 0.16), 0 0 0 0 rgba(255, 214, 110, 0.7); }
  50% { box-shadow: 0 4px 0 rgba(0, 0, 0, 0.16), 0 0 0 12px rgba(255, 214, 110, 0.12); }
}

/* 星星数角标（右上角） */
.node-stars {
  position: absolute;
  top: -4px;
  right: -2px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-weight: 800;
  font-size: 12px;
  color: var(--gold);
  background: var(--card-bg);
  border-radius: var(--radius-pill);
  padding: 1px 6px;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.14);
}

/* 状态角标（左下角） */
.tag {
  position: absolute;
  left: -2px;
  bottom: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--card-bg);
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.16);
  color: var(--ink-soft);
  font-size: 11px;
}
.tag.done { background: var(--gold); color: #6b4e00; }
.tag.played { background: var(--green); color: #fff; }
.tag.now { background: var(--yellow); color: #6b4e00; }
.tag.ready { background: var(--tint-green); color: var(--green-dark); }

/* 节点标题 */
.node-cap {
  font-weight: 800;
  font-size: 12px;
  line-height: 1.15;
  text-align: center;
  color: var(--ink);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6);
  white-space: nowrap;
}
.node-cap small {
  font-weight: 700;
  font-size: 10px;
  color: var(--ink-soft);
}
.st-locked .node-cap { opacity: 0.55; }
</style>
