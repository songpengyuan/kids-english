<script lang="ts">
/** 模块级滚动记忆：KeepAlive 缓存下 GamePath 子树可能被重建，
 *  script setup 内局部变量每次挂载重置，故存模块作用域，跨实例/跨 KeepAlive 保留。 */
export let savedGameTop = 0;
</script>

<script setup lang="ts">
/**
 * 游戏模式：多邻国式关卡路径图（DOM 版）。
 *
 * - 每个课程展开为"多个关卡"（玩法序列 = 关卡序列），地图直接展示所有关卡：
 *   课名横幅（全宽渐变：课 icon + 课名 + 完成进度 + 细进度条）+ 关卡节点（圆形按钮：矢量 icon + 玩法名 + 状态角标 + 星徽章）。
 * - 无连线：关卡节点按 snakeNodes 等弧长 S 形蜿蜒排列，每课一段。
 * - 全局线性解锁：第一关总是可玩，前一关完成解锁下一关（跨课连续）。
 *   状态：done（金渐变+✓）/ active（当前，光圈脉动）/ locked（灰+锁）。
 * - 点关卡节点 → 直接开玩该玩法（/lesson/:id?mode=quest&step=<玩法>）。
 * - 全部节点为 DOM <button>：原生点击/聚焦/键盘/无障碍；滚动即普通 DOM 滚动（惯性、贴边）。
 * - 几何坐标全部来自纯函数 pathGeometry（TDD 基线），布局只随容器宽度重算（ResizeObserver）。
 */
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { lessons } from "../data/lessons";
import {
  buildLevels,
  computeStates,
  currentLevel,
  lessonDoneCount,
  type PathLevel,
  type LevelState,
} from "../data/pathLevels";
import { useProgressStore } from "../stores/progress";
import { hapticTap, hapticWrong } from "../utils/haptics";
import PathIcon from "./PathIcon.vue";
import { buildPathGeometry, snakeNodes, R, ROW_H, BAR_H, BOTTOM, type PathGeoItem } from "../utils/pathGeometry";

const router = useRouter();
const progress = useProgressStore();

const levels = buildLevels();
const states = computed(() => computeStates(levels, progress.progress));

/** 当前关卡（第一个 active）——键盘 Enter 直达 */
const activeLevel = computed(() => currentLevel(levels, states.value));

/* ---------- 地图几何（每课渐变横幅 + 蛇形蜿蜒圆节点，无连线） ---------- */

interface GeoItem extends PathGeoItem {
  level?: PathLevel;
  state?: LevelState;
  stars?: number;
  done?: number;
  total?: number;
}

/** 整图几何（课名横幅 + 关卡节点纵向坐标），横向 x 由 snakeNodes 按宽度铺列 */
const geo = computed<GeoItem[]>(() => {
  const geom = buildPathGeometry(lessons, levels);
  return geom.map((g) => {
    if (g.type === "unit") {
      return {
        ...g,
        done: lessonDoneCount(g.lessonId, progress.progress),
        total: levels.filter((lv) => lv.lessonId === g.lessonId).length,
      } as GeoItem;
    }
    const lv = levels.find((l) => l.lessonId === g.lessonId && l.actKey === g.activityKey);
    return {
      ...g,
      level: lv,
      state: lv ? states.value[lv.id] : undefined,
      stars: (progress.progress[g.lessonId] as Record<string, number> | undefined)?.[g.activityKey!] || 0,
    } as GeoItem;
  });
});

/** 地图总高（滚动容器内容高 = 末节点圆心 + 节点半径 + 底部留白） */
const pathH = computed(() => {
  const last = geo.value[geo.value.length - 1];
  return last ? last.y + R + BOTTOM : 400;
});

/* ---------- 宽度响应式布局（ResizeObserver：容器宽变化才重算 S 形 x） ---------- */
const stageEl = ref<HTMLDivElement | null>(null);
const w = ref(320);
let ro: ResizeObserver | null = null;

/** 按课预计算 S 形等距节点（纯函数 snakeNodes，TDD 基线） */
const layout = computed<GeoItem[]>(() => {
  const width = w.value;
  const lessonIds = [...new Set(levels.map((lv) => lv.lessonId))];
  const nodesByLesson = new Map<string, ReturnType<typeof snakeNodes>>();
  for (const lid of lessonIds) {
    const lvs = levels.filter((lv) => lv.lessonId === lid);
    const first = geo.value.find((g) => g.type === "level" && g.level!.lessonId === lid)!;
    nodesByLesson.set(lid, snakeNodes(width, lvs.length, first.y, first.y + (lvs.length - 1) * ROW_H));
  }
  return geo.value.map((it) => {
    if (it.type === "unit") return { ...it, x: width / 2 };
    const arr = nodesByLesson.get(it.level!.lessonId)!;
    const idx = levels.filter((lv) => lv.lessonId === it.level!.lessonId).findIndex((lv) => lv.id === it.level!.id);
    return { ...it, x: arr[idx].x, y: arr[idx].y };
  });
});

/** 课程横幅（unit）与关卡节点（level）分组 */
const units = computed(() => layout.value.filter((it) => it.type === "unit") as GeoItem[]);
const levelItems = computed(() => layout.value.filter((it) => it.type === "level") as GeoItem[]);

function measure() {
  const el = stageEl.value;
  if (!el) return;
  w.value = el.clientWidth || 320;
}
function scheduleMeasure() {
  // 等容器定宽后量一次（含 KeepAlive 恢复）
  requestAnimationFrame(measure);
}

/* ---------- 滚动位置记忆（底部 tab 切换不丢位置） ---------- */
function onScroll() {
  if (stageEl.value) savedGameTop = stageEl.value.scrollTop;
}
function restoreTop() {
  requestAnimationFrame(() => {
    if (stageEl.value) stageEl.value.scrollTop = savedGameTop;
  });
}

/* ---------- 解锁闪光（金色圆环扩散，CSS 动画一次播放） ---------- */
const flashIds = ref(new Set<string>());
let snapshotBefore: Record<string, LevelState> = {};

onDeactivated(() => {
  snapshotBefore = { ...states.value };
  ro?.disconnect();
  ro = null;
});
onBeforeUnmount(() => {
  stageEl.value?.removeEventListener("scroll", onScroll);
  ro?.disconnect();
  ro = null;
});
onActivated(() => {
  const flash = new Set<string>();
  levels.forEach((lv) => {
    if (snapshotBefore[lv.id] === "locked" && states.value[lv.id] !== "locked") flash.add(lv.id);
  });
  if (flash.size) flashIds.value = flash;
  // 动画跑完自动移除 class（CSS animation forwards 后清理）
  setTimeout(() => {
    if (flashIds.value.size) flashIds.value = new Set();
  }, 1200);
  restoreTop();
  measure();
  startRO();
});
onMounted(() => {
  stageEl.value?.addEventListener("scroll", onScroll, { passive: true });
  measure();
  startRO();
  restoreTop();
});

function startRO() {
  if (ro || !stageEl.value) return;
  ro = new ResizeObserver(scheduleMeasure);
  ro.observe(stageEl.value);
}

/* ---------- 交互：点关卡直接开玩 ---------- */
const lockedMsg = ref(false);
let lockedTimer: ReturnType<typeof setTimeout> | null = null;

/** 锁关点击：可见提示（震动之外，给孩子明确的"先解锁"反馈） */
function showLockedTip() {
  lockedMsg.value = true;
  if (lockedTimer) clearTimeout(lockedTimer);
  lockedTimer = setTimeout(() => {
    lockedMsg.value = false;
  }, 1600);
}

/** 点击关卡节点：锁定提示 / 可玩直达该玩法 */
function enterLevel(lv: PathLevel) {
  const st = states.value[lv.id];
  if (st === "locked") {
    hapticWrong();
    showLockedTip();
  } else {
    hapticTap();
    router.push(`/lesson/${lv.lessonId}?mode=quest&step=${lv.actKey}`);
  }
}

/** 点击课程横幅 → 进该课第一关 */
function enterUnit(it: GeoItem) {
  const first = levels.find((lv) => lv.lessonId === it.lessonId);
  if (!first) return;
  const st = states.value[first.id];
  if (st === "locked") {
    hapticWrong();
    showLockedTip();
  } else {
    hapticTap();
    router.push(`/lesson/${first.lessonId}?mode=quest&step=${first.actKey}`);
  }
}

/** 状态角标内容：lock / done / play */
function tagOf(lv: PathLevel): string {
  const st = states.value[lv.id];
  if (st === "locked") return "lock";
  if (st === "done") return "done";
  return "play";
}

/** 单关无障碍描述 */
function levelLabel(lv: PathLevel): string {
  const st = states.value[lv.id];
  const zh = st === "locked" ? "未解锁" : st === "done" ? "已通关" : "可玩";
  return `第${lv.no}关${lv.name}（${zh}）`;
}

/** 横幅里的课程 */
function unitLesson(id: string) {
  return lessons.find((l) => l.id === id);
}
</script>

<template>
  <div ref="stageEl" class="game-path anim-fade-up">
    <!-- 蛇形路径（DOM：课名横幅 + 圆节点按钮蜿蜒，原生滚动/点击/聚焦） -->
    <div class="gp-canvas" :style="{ height: pathH + 'px' }">
      <!-- 课程横幅 -->
      <div
        v-for="u in units"
        :key="'u-' + u.lessonId"
        class="gp-unit"
        role="button"
        tabindex="0"
        :class="'tone-' + (unitLesson(u.lessonId)?.tone || 'blue')"
        :style="{ top: u.y - BAR_H / 2 + 'px' }"
        :aria-label="`${unitLesson(u.lessonId)?.titleZh || ''}，已完成 ${u.done || 0} 关，共 ${u.total || 1} 关`"
        @click="enterUnit(u)"
        @keydown.enter="enterUnit(u)"
        @keydown.space.prevent="enterUnit(u)"
      >
        <PathIcon :name="u.lessonId" class="u-ico" />
        <span class="u-name">{{ unitLesson(u.lessonId)?.titleZh }}</span>
        <span class="u-count">{{ u.done || 0 }}/{{ u.total || 1 }}</span>
        <span class="u-bar"><span class="u-bar-fill" :style="{ width: Math.min(100, Math.round(((u.done || 0) / (u.total || 1)) * 100)) + '%' }"></span></span>
      </div>

      <!-- 关卡节点（圆形按钮，S 形蜿蜒） -->
      <button
        v-for="lv in levelItems"
        :key="'l-' + lv.level!.id"
        class="gp-level"
        :class="[states[lv.level!.id], { flash: flashIds.has(lv.level!.id) }]"
        :style="{ left: lv.x - R + 'px', top: lv.y - R + 'px' }"
        :aria-label="levelLabel(lv.level!)"
        @click="enterLevel(lv.level!)"
        @keydown.enter.prevent="enterLevel(lv.level!)"
        @keydown.space.prevent="enterLevel(lv.level!)"
      >
        <span class="lv-pulse" aria-hidden="true"></span>
        <PathIcon :name="lv.level!.actKey" class="lv-ico" />
        <span class="lv-tag" aria-hidden="true">
          <PathIcon v-if="tagOf(lv.level!) === 'lock'" name="lock" />
          <span v-else-if="tagOf(lv.level!) === 'done'" class="tick">✓</span>
          <PathIcon v-else name="play" />
        </span>
        <span v-if="lv.stars" class="lv-star" aria-hidden="true">★{{ lv.stars }}</span>
        <span class="lv-name">{{ lv.level!.name }}</span>
      </button>
    </div>

    <Transition name="tip">
      <p v-if="lockedMsg" class="locked-tip anim-pop" role="status">先完成前面的关卡就能解锁啦</p>
    </Transition>
  </div>
</template>

<style scoped>
.game-path {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
  width: 100%;
  max-width: 440px;
  margin-inline: auto; /* 内容区居中 */
}
.gp-canvas {
  position: relative;
  width: 100%;
}
.locked-tip {
  margin: var(--gap-s) auto 0;
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--surface-soft);
  color: var(--text-soft);
  font-size: 14px;
  text-align: center;
  box-shadow: var(--shadow-soft);
}

/* ---------- 课程横幅 ---------- */
.gp-unit {
  position: absolute;
  left: 0;
  right: 0;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  color: #fff;
  cursor: pointer;
  box-shadow: var(--shadow-soft);
  transition: transform var(--dur-fast) var(--ease-out), filter var(--dur-fast);
}
.gp-unit:active {
  transform: scale(0.985);
}
.u-ico {
  width: 30px;
  height: 30px;
  color: #fff;
  flex: none;
}
.u-name {
  font-weight: 800;
  font-size: 18px;
  line-height: 1;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.u-count {
  font-weight: 800;
  font-size: 14px;
  opacity: 0.95;
  flex: none;
}
.u-bar {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 10px;
  height: 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.35);
  overflow: hidden;
}
.u-bar-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: #fff;
  transition: width var(--dur-slow) var(--ease-out);
}

/* tone 色板（与 tokens 卡片同源 hue） */
.gp-unit.tone-orange { background: linear-gradient(180deg, var(--c-orange), color-mix(in srgb, var(--c-orange) 70%, #000)); }
.gp-unit.tone-blue { background: linear-gradient(180deg, var(--c-blue), color-mix(in srgb, var(--c-blue) 70%, #000)); }
.gp-unit.tone-purple { background: linear-gradient(180deg, var(--c-purple), color-mix(in srgb, var(--c-purple) 70%, #000)); }
.gp-unit.tone-pink { background: linear-gradient(180deg, var(--c-pink), color-mix(in srgb, var(--c-pink) 70%, #000)); }
.gp-unit.tone-green { background: linear-gradient(180deg, var(--c-green), color-mix(in srgb, var(--c-green) 70%, #000)); }
.gp-unit.tone-teal { background: linear-gradient(180deg, var(--c-teal), color-mix(in srgb, var(--c-teal) 70%, #000)); }

/* ---------- 关卡节点 ---------- */
.gp-level {
  position: absolute;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: #fff;
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  outline: none;
  transition: transform var(--dur-fast) var(--ease-pop), box-shadow var(--dur-fast);
  -webkit-tap-highlight-color: transparent;
}
.gp-level:focus-visible {
  box-shadow: 0 0 0 4px var(--focus-ring, rgba(28, 176, 246, 0.4));
}
.gp-level:active {
  transform: scale(0.9);
}
.lv-ico {
  width: 26px;
  height: 26px;
  color: var(--ink-faint);
  pointer-events: none;
}
.lv-tag {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  border: 1.5px solid rgba(0, 0, 0, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  pointer-events: none;
}
.lv-tag .tick {
  color: #6b4e00;
  font-weight: 900;
  font-size: 12px;
}
.lv-tag svg {
  width: 12px;
  height: 12px;
  color: #9a938a;
}
.lv-star {
  position: absolute;
  right: 2px;
  top: 2px;
  height: 18px;
  min-width: 18px;
  padding: 0 3px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.12);
  color: var(--gold);
  font-size: 11px;
  font-weight: 900;
  line-height: 16px;
  text-align: center;
  pointer-events: none;
}
.lv-name {
  position: absolute;
  left: 50%;
  top: calc(100% + 6px);
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-soft);
  pointer-events: none;
}

/* 状态样式 */
.gp-level.done .lv-ico { color: #c8860b; }
.gp-level.done .lv-tag { border-color: var(--gold); }
.gp-level.active { border: 4px solid var(--c-blue, #1cb0f6); }
.gp-level.active .lv-ico { color: var(--c-blue, #1cb0f6); }
.gp-level.locked { filter: grayscale(1) opacity(0.85); }

/* active 光圈脉动（替代 canvas 逐帧绘制） */
.lv-pulse {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 3px solid rgba(255, 214, 110, 0.5);
  pointer-events: none;
  opacity: 0;
}
.gp-level.active .lv-pulse {
  opacity: 1;
  animation: lv-pulse 1.6s ease-in-out infinite;
}
@keyframes lv-pulse {
  0%, 100% { transform: scale(1); opacity: 0.35; }
  50% { transform: scale(1.12); opacity: 0.15; }
}

/* 解锁闪光（金色圆环扩散一次） */
.gp-level.flash::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 6px solid rgba(255, 214, 110, 0.9);
  animation: lv-flash 0.9s var(--ease-out) forwards;
  pointer-events: none;
}
@keyframes lv-flash {
  from { transform: scale(1); opacity: 0.9; }
  to { transform: scale(2.1); opacity: 0; }
}
</style>
