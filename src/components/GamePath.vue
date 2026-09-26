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
import ChestReward from "./ChestReward.vue";
import { buildPathGeometry, snakeNodes, R, ROW_H, type PathGeoItem } from "../utils/pathGeometry";

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
        total: levels.filter((lv) => lv.lessonId === g.lessonId && lv.actKey !== "chest").length,
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

/* ---------- 宽度响应式布局（ResizeObserver：容器宽变化才重算 S 形 x） ---------- */
const stageEl = ref<HTMLDivElement | null>(null);
const w = ref(320);
let ro: ResizeObserver | null = null;

/** 按课预计算 S 形等距节点 x（纯函数 snakeNodes，TDD 基线）；
 *  文档流布局下垂直间距由 CSS margin 控制（ROW_H），y 仅作曲线采样参数 */
const layout = computed<GeoItem[]>(() => {
  const width = w.value;
  const lessonIds = [...new Set(levels.map((lv) => lv.lessonId))];
  const nodesByLesson = new Map<string, ReturnType<typeof snakeNodes>>();
  for (const lid of lessonIds) {
    const lvs = levels.filter((lv) => lv.lessonId === lid);
    nodesByLesson.set(lid, snakeNodes(width, lvs.length, 0, 100));
  }
  return geo.value.map((it) => {
    if (it.type === "unit") return { ...it, x: width / 2, y: 0 };
    const arr = nodesByLesson.get(it.level!.lessonId)!;
    const idx = levels.filter((lv) => lv.lessonId === it.level!.lessonId).findIndex((lv) => lv.id === it.level!.id);
    return { ...it, x: arr[idx].x, y: 0 };
  });
});

/** 关卡相对居中的横向位移（文档流：节点默认居中，translateX 左右摆动成 S 形） */
function dxOf(lv: GeoItem): number {
  return Math.round((lv.x ?? 0) - w.value / 2);
}

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

/** 点击关卡节点：锁定提示 / 可玩直达该玩法 / 宝箱关卡直接开箱 */
function enterLevel(lv: PathLevel) {
  const st = states.value[lv.id];
  if (st === "locked") {
    hapticWrong();
    showLockedTip();
    return;
  }
  hapticTap();
  if (lv.actKey === "chest") {
    chestLessonId.value = lv.lessonId;
    chestOpen.value = true;
    return;
  }
  router.push(`/lesson/${lv.lessonId}?mode=quest&step=${lv.actKey}`);
}

/** 宝箱关卡打开状态（地图上直接弹开宝箱奖励层） */
const chestOpen = ref(false);
const chestLessonId = ref("");

/** 宝箱收取完成：标记该课宝箱已领取 → 关闭层，地图状态刷新（宝箱关变 done） */
function onChestDone() {
  if (chestLessonId.value) progress.markChest(chestLessonId.value);
  chestOpen.value = false;
  chestLessonId.value = "";
}

/** 关卡圆环点亮段数（0..3）：完成=星级数（至少 1），学习中=1 段，锁定=0；
 *  宝箱关：已领取=3、可开=1、锁定=0 —— "学一部分亮一部分" */
function ringOf(lv: GeoItem): number {
  const st = states.value[lv.level!.id];
  if (lv.level!.actKey === "chest") return st === "done" ? 3 : st === "active" ? 1 : 0;
  if (st === "done") return Math.min(3, Math.max(1, lv.stars || 0));
  if (st === "active") return 1;
  return 0;
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
  if (lv.actKey === "chest") {
    const zh = st === "locked" ? "未解锁" : st === "done" ? "已领取" : "可开箱";
    return `第${lv.no}关${lv.name}（${zh}）`;
  }
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
    <!-- 蛇形路径（文档流：课名横幅全宽；关卡节点默认居中，translateX 左右摆动成 S 形） -->
    <div class="gp-canvas">
      <!-- 按几何顺序交替渲染：课横幅 → 关卡 → 课横幅 → 关卡（文档流保持真实阅读顺序） -->
      <template v-for="it in layout" :key="it.type === 'unit' ? 'u-' + it.lessonId : 'l-' + (it as GeoItem).level!.id">
        <!-- 课程横幅（文档流全宽块） -->
        <div
          v-if="it.type === 'unit'"
          class="gp-unit"
          role="button"
          tabindex="0"
          :class="'tone-' + (unitLesson((it as GeoItem).lessonId)?.tone || 'blue')"
          :aria-label="`${unitLesson((it as GeoItem).lessonId)?.titleZh || ''}，已完成 ${(it as GeoItem).done || 0} 关，共 ${(it as GeoItem).total || 1} 关`"
          @click="enterUnit(it as GeoItem)"
          @keydown.enter="enterUnit(it as GeoItem)"
          @keydown.space.prevent="enterUnit(it as GeoItem)"
        >
          <PathIcon :name="(it as GeoItem).lessonId" class="u-ico" />
          <span class="u-name">{{ unitLesson((it as GeoItem).lessonId)?.titleZh }}</span>
          <span class="u-count">{{ (it as GeoItem).done || 0 }}/{{ (it as GeoItem).total || 1 }}</span>
          <span class="u-bar"><span class="u-bar-fill" :style="{ width: Math.min(100, Math.round((((it as GeoItem).done || 0) / ((it as GeoItem).total || 1)) * 100)) + '%' }"></span></span>
        </div>

        <!-- 关卡节点（文档流：默认居中，--dx 左右位移；圆按钮 + 进度圆环） -->
        <div
          v-else
          class="lv-wrap"
          :class="[states[(it as GeoItem).level!.id], { flash: flashIds.has((it as GeoItem).level!.id), chest: (it as GeoItem).level!.actKey === 'chest' }]"
          :style="{ '--dx': dxOf(it as GeoItem) + 'px' }"
        >
          <button
            class="gp-level"
            :aria-label="levelLabel((it as GeoItem).level!)"
            @click="enterLevel((it as GeoItem).level!)"
            @keydown.enter.prevent="enterLevel((it as GeoItem).level!)"
            @keydown.space.prevent="enterLevel((it as GeoItem).level!)"
          >
            <!-- 进度圆环：3 段弧，学一部分亮一部分 -->
            <svg class="lv-ring" viewBox="0 0 72 72" aria-hidden="true">
              <circle class="ring-bg" cx="36" cy="36" r="30" pathLength="100" />
              <circle
                v-for="seg in 3"
                :key="seg"
                class="ring-seg"
                :class="{ on: ringOf(it as GeoItem) >= seg }"
                cx="36"
                cy="36"
                r="30"
                pathLength="100"
                stroke-dasharray="33.34 66.66"
                :style="{ transform: 'rotate(' + ((seg - 1) * 120 - 90) + 'deg)' }"
              />
            </svg>
            <span class="lv-pulse" aria-hidden="true"></span>
            <!-- 未学习只显示锁；宝箱关显示礼物；其余显示玩法图标 -->
            <PathIcon v-if="(it as GeoItem).state === 'locked'" name="lock" class="lv-ico lv-ico-lock" />
            <PathIcon v-else-if="(it as GeoItem).level!.actKey === 'chest'" name="chest" class="lv-ico lv-ico-chest" />
            <PathIcon v-else :name="(it as GeoItem).level!.actKey" class="lv-ico" />
            <span class="lv-tag" aria-hidden="true">
              <PathIcon v-if="tagOf((it as GeoItem).level!) === 'lock'" name="lock" />
              <span v-else-if="tagOf((it as GeoItem).level!) === 'done'" class="tick">✓</span>
              <PathIcon v-else name="play" />
            </span>
            <span v-if="(it as GeoItem).stars && (it as GeoItem).level!.actKey !== 'chest'" class="lv-star" aria-hidden="true">★{{ (it as GeoItem).stars }}</span>
          </button>
          <span class="lv-name">{{ (it as GeoItem).level!.name }}</span>
        </div>
      </template>
    </div>

    <!-- 开宝箱独立关卡：地图上直接弹奖励层 -->
    <ChestReward v-if="chestOpen" @done="onChestDone" />

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
  width: 100%;
  padding-top: 16px; /* TOP：首横幅上方留白 */
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
  height: 56px; /* BAR_H */
  margin: 20px 0 38px; /* 下节留白 / 横幅底 → 首节点圆心(66-28) */
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
/* 首个横幅不额外上留白（gp-canvas 已有 TOP） */
.gp-canvas > .gp-unit:first-child {
  margin-top: 0;
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

/* ---------- 关卡节点（文档流：wrap 居中 + --dx 左右位移；按钮为圆） ---------- */
.lv-wrap {
  position: relative;
  width: max-content;
  margin: 0 auto; /* 默认水平居中 */
  transform: translateX(var(--dx, 0px)); /* 相对居中的左右摆动 */
  transition: transform var(--dur-base) var(--ease-out);
}
.lv-wrap + .lv-wrap {
  margin-top: 28px; /* 圆心距 = 28 + 56 = 84 = ROW_H（节点间等距） */
}
.gp-level {
  position: relative; /* 圆环/角标/星/光圈锚点 */
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

/* 状态样式（状态类挂在 lv-wrap 上） */
.lv-wrap.done .lv-ico { color: #c8860b; }
.lv-wrap.done .lv-tag { border-color: var(--gold); }
.lv-wrap.active .gp-level { border: 4px solid var(--c-blue, #1cb0f6); }
.lv-wrap.active .lv-ico { color: var(--c-blue, #1cb0f6); }
.lv-wrap.locked .gp-level { filter: grayscale(1) opacity(0.85); }

/* active 光圈脉动（替代 canvas 逐帧绘制） */
.lv-pulse {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 3px solid rgba(255, 214, 110, 0.5);
  pointer-events: none;
  opacity: 0;
}
.lv-wrap.active .lv-pulse {
  opacity: 1;
  animation: lv-pulse 1.6s ease-in-out infinite;
}
@keyframes lv-pulse {
  0%, 100% { transform: scale(1); opacity: 0.35; }
  50% { transform: scale(1.12); opacity: 0.15; }
}

/* 解锁闪光（金色圆环扩散一次） */
.lv-wrap.flash .gp-level::after {
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

/* ---------- 关卡进度圆环（3 段弧：学一部分亮一部分） ---------- */
.lv-ring {
  position: absolute;
  inset: -8px;
  width: 72px;
  height: 72px;
  pointer-events: none;
}
.ring-bg {
  fill: none;
  stroke: rgba(128, 128, 128, 0.18);
  stroke-width: 5;
}
.ring-seg {
  fill: none;
  stroke: transparent;
  stroke-width: 5;
  stroke-linecap: round;
  transform-origin: 36px 36px;
  transition: stroke var(--dur-base) var(--ease-out);
}
.lv-wrap.done .ring-seg.on { stroke: var(--gold, #f0b429); }
.lv-wrap.active .ring-seg.on { stroke: var(--c-blue, #1cb0f6); }
.lv-wrap.chest .ring-seg.on { stroke: #d98e04; }
.lv-wrap.locked .ring-seg.on { stroke: #c9c2b8; }

/* 未学习关卡：主体只显示大锁（玩法图标不展示） */
.lv-wrap.locked .lv-ico-lock {
  width: 30px;
  height: 30px;
  color: #b8b0a4;
}

/* 宝箱独立关卡：金色礼物节点 */
.lv-wrap.chest .gp-level {
  background: linear-gradient(160deg, #ffe9a8, #ffd87a);
  box-shadow: 0 3px 0 rgba(176, 120, 0, 0.32);
}
.lv-wrap.chest .lv-ico-chest {
  width: 30px;
  height: 30px;
  color: #8a5a00;
}
/* 已领取：稍褪色示意"开过了" */
.lv-wrap.chest.done .gp-level {
  filter: grayscale(0.35) opacity(0.82);
}
.lv-wrap.chest .lv-tag {
  border-color: rgba(176, 120, 0, 0.4);
}
</style>
