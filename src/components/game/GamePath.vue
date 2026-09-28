<script lang="ts">
/** 模块级滚动记忆：KeepAlive 缓存下 GamePath 子树可能被重建，
 *  script setup 内局部变量每次挂载重置，故存模块作用域，跨实例/跨 KeepAlive 保留。 */
export let savedGameTop = 0;
/** 上次定位/看到过的"当前关"：当前关变了（通关推进）→ 进地图时自动跟过去 */
export let lastSeenLevelId = "";
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
 * - 点关卡节点 → 直接开玩该玩法（/quest/:id?step=<玩法>，独立路由）。
 * - 全部节点为 DOM <button>：原生点击/聚焦/键盘/无障碍；滚动即普通 DOM 滚动（惯性、贴边）。
 * - 几何坐标全部来自纯函数 pathGeometry（TDD 基线），布局只随容器宽度重算（ResizeObserver）。
 */
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { lessons } from "../../data/lessons";
import {
  buildLevels,
  computeStates,
  currentLevel,
  lessonDoneCount,
  type PathLevel,
  type LevelState,
} from "../../data/pathLevels";
import { useProgressStore } from "../../stores/progress";
import { speak } from "../../services/speech";
import { hapticTap } from "../../services/haptics";
import { sfxWrong } from "../../services/effects";
import PathIcon from "../PathIcon.vue";
import ChestReward from "../rewards/ChestReward.vue";
import { buildPathGeometry, snakeNodes, R, ROW_H, type PathGeoItem } from "../../utils/pathGeometry";
import { marginBefore, overhangOf } from "../../utils/pathGeometry";

const router = useRouter();
const progress = useProgressStore();

const levels = buildLevels();
const states = computed(() => computeStates(levels, progress.progress));

/** 当前关卡（第一个 active）——键盘 Enter 直达 */
const activeLevel = computed(() => currentLevel(levels, states.value));
/** 当前关 id（自动定位用） */
const activeId = computed(() => activeLevel.value?.id ?? "");

/* ---------- 地图几何（每课渐变横幅 + 蛇形蜿蜒圆节点，无连线） ---------- */

interface GeoItem extends PathGeoItem {
  level?: PathLevel;
  state?: LevelState;
  stars?: number;
  done?: number;
  total?: number;
  /** 该关是否有进度环（决定可见轮廓的外扩量，用于算与上一关的间距） */
  ring?: boolean;
  /** 与上一项之间的 margin-top（px）：上一项是关卡时按"视觉留白恒等"算，横幅时另算 */
  marginTop?: number;
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
      ring: lv ? ringOf({ level: lv, state: states.value[lv.id] } as GeoItem) > 0 : false,
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
  const withX = geo.value.map((it) => {
    if (it.type === "unit") return { ...it, x: width / 2, y: 0 };
    const arr = nodesByLesson.get(it.level!.lessonId)!;
    const idx = levels.filter((lv) => lv.lessonId === it.level!.lessonId).findIndex((lv) => lv.id === it.level!.id);
    return { ...it, x: arr[idx].x, y: 0 };
  });
  // 纵向节奏：按"上一项是横幅还是关卡 + 两关各自有没有环"动态给 margin，
  // 让相邻两关**可见轮廓之间**的留白处处相等（见 utils/pathGeometry 的说明）
  let prevOverhang: ReturnType<typeof overhangOf> | null = null;
  return withX.map((it) => {
    if (it.type === "unit") {
      prevOverhang = null; // 横幅下方没有关卡名
      return it;
    }
    const cur = overhangOf(!!it.ring);
    const marginTop = Math.round(marginBefore(prevOverhang, cur));
    prevOverhang = cur;
    return { ...it, marginTop };
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
  updateStuck();
}

/* ---------- 课程横幅吸顶态：滚动吸顶时切毛玻璃（防止关卡从标题下透出） ---------- */
const stuckId = ref("");
function updateStuck() {
  const el = stageEl.value;
  if (!el) return;
  // sticky top:8px 是相对滚动容器（.game-path）的，视口锚点 = 容器视口顶部 + 8
  const anchor = el.getBoundingClientRect().top + 8;
  let id = "";
  el.querySelectorAll<HTMLElement>(".gp-unit").forEach((u) => {
    const r = u.getBoundingClientRect();
    // 文档序最后一个顶到吸顶锚点的横幅 = 当前吸顶的那个（被顶走的已滚出）
    if (Math.abs(r.top - anchor) < 3 && r.bottom > anchor) id = u.dataset.lessonId || "";
  });
  if (id !== stuckId.value) stuckId.value = id;
}
function restoreTop() {
  requestAnimationFrame(() => {
    if (stageEl.value) stageEl.value.scrollTop = savedGameTop;
  });
}

/**
 * 把某一关滚到可视区中部。
 * 地图有 35 关（≈4 屏），孩子不该自己去翻——进地图默认定位到"当前该玩的那一关"，
 * 解锁新关后也自动跟着走（多邻国式）。
 */
function centerLevel(id: string, smooth = false) {
  const el = stageEl.value;
  if (!el || !id) return;
  const node = el.querySelector<HTMLElement>(`[data-lv-id="${id}"]`);
  if (!node) return;
  const nr = node.getBoundingClientRect();
  const cr = el.getBoundingClientRect();
  const top = Math.max(
    0,
    Math.min(
      el.scrollTop + (nr.top - cr.top) - (el.clientHeight - nr.height) / 2,
      el.scrollHeight - el.clientHeight
    )
  );
  if (smooth) el.scrollTo({ top, behavior: "smooth" });
  else el.scrollTop = top;
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
  requestAnimationFrame(updateStuck);
  const flash = new Set<string>();
  levels.forEach((lv) => {
    if (snapshotBefore[lv.id] === "locked" && states.value[lv.id] !== "locked") flash.add(lv.id);
  });
  if (flash.size) flashIds.value = flash;
  // 动画跑完自动移除 class（CSS animation forwards 后清理）
  setTimeout(() => {
    if (flashIds.value.size) flashIds.value = new Set();
  }, 1200);
  // 解锁了新关 → 自动滚到新解锁的那一关（孩子一眼看到"可以玩这个了"）；
  // 没解锁变化 → 恢复离开时的位置。
  const firstNew = [...flash][0];
  if (firstNew) {
    lastSeenLevelId = firstNew;
    requestAnimationFrame(() => centerLevel(firstNew, true));
  } else if (activeId.value && activeId.value !== lastSeenLevelId) {
    // 在别处通关了（当前关推进）→ 回来时跟到新关卡
    lastSeenLevelId = activeId.value;
    requestAnimationFrame(() => centerLevel(activeId.value, true));
  } else restoreTop();
  measure();
  startRO();
});
onMounted(() => {
  stageEl.value?.addEventListener("scroll", onScroll, { passive: true });
  requestAnimationFrame(updateStuck);
  measure();
  startRO();
  // 当前关变了（通关推进）或首次进入 → 定位到当前该玩的那一关；否则恢复上次的滚动位置
  const id = activeId.value;
  if (id && id !== lastSeenLevelId) {
    lastSeenLevelId = id;
    requestAnimationFrame(() => centerLevel(id));
  } else if (savedGameTop > 0) restoreTop();
  else requestAnimationFrame(() => centerLevel(id));
});

function startRO() {
  if (ro || !stageEl.value) return;
  ro = new ResizeObserver(scheduleMeasure);
  ro.observe(stageEl.value);
}

/* ---------- 交互：点关卡直接开玩 ---------- */
/** 锁关点击反馈：抖动动画中的关卡 id 集合（配合异常音效 + 震动，动画结束后移除） */
const shakeIds = ref(new Set<string>());
let shakeTimer: ReturnType<typeof setTimeout> | null = null;

/** 锁关点击：异常音（温柔下行，含触感震动）+ 该关抖动动画——不弹文字提示，孩子交互从简 */
function shakeLocked(id: string) {
  sfxWrong();
  shakeIds.value = new Set(shakeIds.value).add(id);
  if (shakeTimer) clearTimeout(shakeTimer);
  shakeTimer = setTimeout(() => {
    shakeIds.value = new Set();
  }, 500);
}

/** 点击关卡节点：锁定提示 / 可玩直达该玩法 / 宝箱关卡直接开箱 */
function enterLevel(lv: PathLevel) {
  const st = states.value[lv.id];
  if (st === "locked") {
    shakeLocked(lv.id);
    return;
  }
  hapticTap();
  if (lv.actKey === "chest") {
    chestLessonId.value = lv.lessonId;
    chestOpen.value = true;
    return;
  }
  router.push(`/game/quest/${lv.lessonId}?step=${lv.actKey}`);
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

/** 圆环分段总数：6 段，每段 60°（窄间距、圆头，参考多邻国环形进度样式） */
const RING_SEGS = 6;

/** 关卡圆环点亮段数（0..6）：每颗星 = 2 段；宝箱关已领取 = 6 段。
 *  **0 表示该关还没有进度 —— 此时整个圆环不渲染**（未玩过的当前关、锁定关都没有环）。 */
function ringOf(lv: GeoItem): number {
  const st = states.value[lv.level!.id];
  if (lv.level!.actKey === "chest") return st === "done" ? RING_SEGS : 0;
  if (st === "done") return Math.min(3, Math.max(1, lv.stars || 0)) * 2;
  return 0;
}

/** 点击课程横幅 → 朗读课程标题并进该课第一关 */
function enterUnit(it: GeoItem) {
  const first = levels.find((lv) => lv.lessonId === it.lessonId);
  if (!first) return;
  const st = states.value[first.id];
  if (st === "locked") {
    shakeLocked(first.id);
  } else {
    const title = lessons.find((x) => x.id === it.lessonId)?.title;
    if (title) speak(title, { ttsOnly: true });
    hapticTap();
    router.push(`/game/quest/${first.lessonId}?step=${first.actKey}`);
  }
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
      <template v-for="(it, i) in layout" :key="it.type === 'unit' ? 'u-' + it.lessonId : 'l-' + (it as GeoItem).level!.id">
        <!-- 课程横幅（文档流全宽块） -->
        <div
          v-if="it.type === 'unit'"
          class="gp-unit"
          :class="['tone-' + (unitLesson((it as GeoItem).lessonId)?.tone || 'blue'), { 'is-stuck': stuckId === (it as GeoItem).lessonId }]"
          role="button"
          tabindex="0"
          :data-lesson-id="(it as GeoItem).lessonId"
          :aria-label="`${unitLesson((it as GeoItem).lessonId)?.title || ''}（${unitLesson((it as GeoItem).lessonId)?.titleZh || ''}），已完成 ${(it as GeoItem).done || 0} 关，共 ${(it as GeoItem).total || 1} 关`"
          @click="enterUnit(it as GeoItem)"
          @keydown.enter="enterUnit(it as GeoItem)"
          @keydown.space.prevent="enterUnit(it as GeoItem)"
        >
          <span class="u-name">{{ unitLesson((it as GeoItem).lessonId)?.title }}</span>
          <span class="u-count">{{ (it as GeoItem).done || 0 }}/{{ (it as GeoItem).total || 1 }}</span>
        </div>

        <!-- 关卡节点（文档流：默认居中，--dx 左右位移；圆按钮 + 进度圆环） -->
        <div
          v-else
          class="lv-wrap"
          :class="[states[(it as GeoItem).level!.id], { flash: flashIds.has((it as GeoItem).level!.id), chest: (it as GeoItem).level!.actKey === 'chest', shake: shakeIds.has((it as GeoItem).level!.id) }, 'tone-' + (unitLesson((it as GeoItem).level!.lessonId)?.tone || 'blue')]"
          :style="{ '--dx': dxOf(it as GeoItem) + 'px', '--gap-above': ((it as GeoItem).marginTop ?? 0) + 'px' }"
          :data-lv-id="(it as GeoItem).level!.id"
        >
          <!-- 关卡进度环：6 段断开圆弧（每颗星 = 2 段），**只有该关有进度时才显示**
               （挂 lv-wrap 层：wrap 无边框，绝对定位恒定与按钮同心） -->
          <svg
            v-if="ringOf(it as GeoItem) > 0"
            class="lv-ring"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            :style="{ '--ring-delay': (i % 7) * 0.18 + 's' }"
            aria-hidden="true"
          >
            <circle
              v-for="seg in RING_SEGS"
              :key="seg"
              class="ring-seg"
              :class="{ on: ringOf(it as GeoItem) >= seg }"
              cx="50"
              cy="50"
              r="43"
              pathLength="100"
              stroke-dasharray="12.2 4.467"
              :style="{ transform: 'rotate(' + ((seg - 1) * 60 - 90) + 'deg)' }"
            />
          </svg>
            <button
              class="gp-level"
              :aria-label="levelLabel((it as GeoItem).level!)"
              @click="enterLevel((it as GeoItem).level!)"
              @keydown.enter.prevent="enterLevel((it as GeoItem).level!)"
              @keydown.space.prevent="enterLevel((it as GeoItem).level!)"
            >
              <span class="lv-pulse" aria-hidden="true"></span>
              <!-- 未学习只显示锁；宝箱关显示礼物；其余显示玩法图标 -->
              <PathIcon v-if="(it as GeoItem).state === 'locked'" name="lock" class="lv-ico lv-ico-lock" />
              <PathIcon v-else-if="(it as GeoItem).level!.actKey === 'chest'" name="chest" class="lv-ico lv-ico-chest" />
              <PathIcon v-else :name="(it as GeoItem).level!.actKey" class="lv-ico" />
              <span v-if="(it as GeoItem).stars && (it as GeoItem).level!.actKey !== 'chest'" class="lv-star" aria-hidden="true">★{{ (it as GeoItem).stars }}</span>
            </button>
          <span class="lv-name">{{ (it as GeoItem).level!.name }}</span>
        </div>
      </template>
    </div>

    <!-- 开宝箱独立关卡：地图上直接弹奖励层 -->
    <ChestReward v-if="chestOpen" @done="onChestDone" />

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
/* 宽屏档（iPad/Mac）：地图更舒展，S 形摆动幅度随容器宽自动放大 */
@media (min-width: 768px) {
  .game-path {
    max-width: 600px;
  }
}
.gp-canvas {
  width: 100%;
  padding-top: 16px; /* TOP：首横幅上方留白 */
}
/* ---------- 课程横幅 ---------- */
.gp-unit {
  /* 透明吸顶标题行：文档流中无背景色块（地图上只有圆环关卡与投影）；
     滚动吸顶时切毛玻璃（.is-stuck），保证滚过的关卡不会从标题下透出 */
  position: sticky;
  top: 8px;
  z-index: 5;
  height: 44px;
  margin: 20px 0 0;
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  color: var(--ink-1);
  cursor: pointer;
  background: transparent;
  transition: background var(--dur-base), box-shadow var(--dur-base), transform var(--dur-fast) var(--ease-out);
}
/* 课程横幅 tone：--tone 与关卡节点同源（主色 + 投影色） */
.gp-unit.tone-blue { --tone: var(--c-blue); --tone-deep: var(--c-blue-deep); }
.gp-unit.tone-orange { --tone: var(--c-orange); --tone-deep: var(--c-orange-deep); }
.gp-unit.tone-purple { --tone: var(--c-purple); --tone-deep: var(--c-purple-deep); }
.gp-unit.tone-pink { --tone: var(--c-pink); --tone-deep: var(--c-pink-deep); }
.gp-unit.tone-green { --tone: var(--c-green); --tone-deep: var(--c-green-deep); }
.gp-unit.tone-teal { --tone: var(--c-teal); --tone-deep: var(--c-teal-deep); }
/* 吸顶：不用毛玻璃，改课程主题色淡底（滚过的关卡不透出），标题字 = 主题色 */
.gp-unit.is-stuck {
  background: color-mix(in srgb, var(--tone) 16%, rgba(255, 255, 255, 0.92));
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--tone) 30%, transparent),
    0 8px 24px color-mix(in srgb, var(--tone) 14%, rgba(0, 0, 0, 0.1));
}
:root[data-theme="dark"] .gp-unit.is-stuck {
  background: color-mix(in srgb, var(--tone) 24%, rgba(22, 24, 28, 0.88));
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--tone) 35%, transparent),
    0 8px 24px rgba(0, 0, 0, 0.3);
}
.gp-unit:active {
  transform: scale(0.985);
}
/* 首个横幅不额外上留白（gp-canvas 已有 TOP） */
.gp-canvas > .gp-unit:first-child {
  margin-top: 0;
}
/* 课程名：主题色；横幅内绝对居中（文案长时省略），进度计数靠右 */
.u-name {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  max-width: 72%;
  color: var(--tone, var(--ink-1));
  font-weight: 800;
  font-size: 17px;
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:root[data-theme="dark"] .u-name {
  color: color-mix(in srgb, var(--tone) 78%, #fff);
}
.u-count {
  margin-left: auto;
  font-weight: 800;
  font-size: 13px;
  opacity: 0.75;
  flex: none;
}
/* 常态（未吸顶）：横幅底部一条主题色分割线，把课程名与下方关卡分开；
   吸顶成通栏色块后隐藏分割线 */
.gp-unit::after {
  content: "";
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 0;
  height: 2px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--tone, var(--c-blue)) 38%, transparent);
  opacity: 1;
  transition: opacity var(--dur-base);
}
.gp-unit.is-stuck::after {
  opacity: 0;
}

/* ---------- 已通关关卡：主色调跟随所属课程横幅（孩子一眼看出这组关卡属于哪门课） ---------- */
.lv-wrap.tone-blue { --tone: var(--c-blue); }
.lv-wrap.tone-orange { --tone: var(--c-orange); }
.lv-wrap.tone-purple { --tone: var(--c-purple); }
.lv-wrap.tone-pink { --tone: var(--c-pink); }
.lv-wrap.tone-green { --tone: var(--c-green); }
.lv-wrap.tone-teal { --tone: var(--c-teal); }
/* 通关（done）：按钮圆形背景 = 课程主色调渐变（与课程横幅同款），图标白色，圆+阴影保持不变；
   宝箱关（.chest）保持金色奖励语义不变。 */
.lv-wrap.done[class*="tone-"]:not(.chest) .gp-level {
  --face: linear-gradient(180deg, var(--tone), color-mix(in srgb, var(--tone) 70%, #000));
  --base: color-mix(in srgb, var(--tone) 55%, #000);
}
.lv-wrap.done[class*="tone-"]:not(.chest) .lv-ico {
  color: #fff;
}
/* 暗黑模式：课程色与深底混合（跟随横幅在暗色下的观感） */
:root[data-theme="dark"] .lv-wrap.done[class*="tone-"]:not(.chest) .gp-level {
  --face: linear-gradient(180deg, color-mix(in srgb, var(--tone) 62%, #16181c), color-mix(in srgb, var(--tone) 42%, #000));
  --base: color-mix(in srgb, var(--tone) 32%, #000);
}

/* ---------- 关卡节点（文档流：wrap 居中 + --dx 左右位移；按钮为圆） ---------- */
.lv-wrap {
  position: relative;
  width: max-content;
  margin: 0 auto; /* 默认水平居中 */
  /* 关卡名参与文档流（不再 absolute 溢出节点底部，避免遮挡下方课程横幅） */
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 按钮 → 关卡名的间距（与 utils/pathGeometry 的 LABEL_GAP 保持一致）：
     18px 保证关卡名不会被本关自己的进度环（向下外扩 17px）压到 */
  gap: 18px;
  transform: translateX(var(--dx, 0px)); /* 相对居中的左右摆动 */
  transition: transform var(--dur-base) var(--ease-out);
}
/* 与上一项的间距由 JS 按"视觉留白恒等"逐关算好（--gap-above，见 utils/pathGeometry）。
 * 有环/无环的可见轮廓高度不同，固定 margin 会让留白在 28~50px 之间跳；
 * 现在每对相邻关卡的留白都等于 VISUAL_GAP（40px）。 */
.lv-wrap {
  margin-top: var(--gap-above, 22px);
  transition: transform var(--dur-base) var(--ease-out), margin-top var(--dur-slow) var(--ease-out);
}
.gp-level {
  /* 3D 立体按钮（参考图）：顶面 + 下方一圈更深的底座色构成厚度。
   * 顶面是**椭圆不是正圆** —— 参考图是俯视透视的圆柱，横向略宽、纵向略扁。 */
  --face: #fff;
  --base: rgba(0, 0, 0, 0.22);
  --depth: 7px;
  position: relative; /* 角标/星/光圈锚点 */
  width: 68px;
  height: 57px; /* 68 × 57 ≈ 参考图的透视比例 */
  border-radius: 50%;
  border: none;
  background: var(--face);
  /* 底座（实心圆下移 = 圆柱侧壁）+ 落地投影 */
  box-shadow: 0 var(--depth) 0 var(--base), 0 calc(var(--depth) + 5px) 14px rgba(0, 0, 0, 0.12);
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
  /* 保留 3D 底座，再叠一圈键盘焦点环 */
  box-shadow: 0 var(--depth) 0 var(--base), 0 0 0 4px var(--focus-ring, rgba(28, 176, 246, 0.4));
}
.gp-level:active {
  /* 按下：底座压扁 + 整体下沉，模拟按下去 */
  --depth: 1px;
  transform: translateY(5px) scale(0.97);
}
.lv-ico {
  width: 27px; /* 57px 高的椭圆顶面 + 右下角标，图标略收一点才不被打到 */
  height: 27px;
  color: var(--ink-faint);
  pointer-events: none;
}
/* 说明：原来右下角还有个 ✓ 角标表示"已通关"，但进度环已在表达同一件事
 * （有环 = 做过的关卡），两个标记重复 → 2026-09-27 去掉，节点更干净。 */
.lv-star {
  position: absolute;
  right: 2px;
  top: 3px;
  height: 19px;
  min-width: 19px;
  padding: 0 3px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.12);
  color: var(--gold);
  font-size: 10px;
  font-weight: 900;
  line-height: 15px;
  text-align: center;
  pointer-events: none;
}
/* 锁关点击抖动：保留 --dx 平移基准，左右快速抖动（配合异常音效 + 震动） */
.lv-wrap.shake {
  animation: lv-shake 0.5s ease;
}
.lv-wrap.shake .lv-ico-lock {
  animation: lock-wiggle 0.5s ease;
}
@keyframes lv-shake {
  0%, 100% { transform: translateX(var(--dx, 0px)); }
  20% { transform: translateX(calc(var(--dx, 0px) - 7px)); }
  40% { transform: translateX(calc(var(--dx, 0px) + 7px)); }
  60% { transform: translateX(calc(var(--dx, 0px) - 5px)); }
  80% { transform: translateX(calc(var(--dx, 0px) + 5px)); }
}
@keyframes lock-wiggle {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-12deg); }
  50% { transform: rotate(10deg); }
  75% { transform: rotate(-8deg); }
}

.lv-name {
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.2;
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
  inset: -8px;
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

/* ---------- 关卡进度圆环（6 段断开圆弧，每颗星 = 2 段） ----------
 * 挂在 lv-wrap 层：wrap 无边框，绝对定位恒定与按钮同心（active 边框不造成偏移）。
 * **只在"该关有进度"时渲染**（见 ringOf）：未玩过的当前关、锁定关没有环。 */
.lv-ring {
  position: absolute;
  /* 横向按"按钮中心"居中（不能用 inset：关卡名比按钮宽时 wrap 会变宽，环会偏心）；
   * 用 margin-left 而非 transform 居中 —— 把 transform 留给呼吸微动画 */
  left: 50%;
  margin-left: -52.5px;
  top: -17px;
  /* 105 × 91 + preserveAspectRatio="none"：正圆投影拉伸成椭圆，
   * 与 68 × 57 的椭圆按钮四周保持均匀 8px 间隙（105 × 0.4 - 34 = 8）。
   * 上下各外扩 17px —— 这个外扩量写进了 utils/pathGeometry 的 RING_OVERHANG，
   * 由"视觉留白恒等"的间距算法统一补偿；改这里的尺寸必须同步改常量。 */
  width: 105px;
  height: 91px;
  pointer-events: none;
  will-change: transform;
  animation:
    ring-in var(--dur-base) var(--ease-out) both,
    ring-breathe 3.4s var(--ease-in-out) var(--ring-delay, 0s) infinite;
}
@keyframes ring-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
/* 进度环呼吸微动画：最小状态贴住"含底座与落地阴影的完整按钮实体"（阴影也纳入贴合参照），放大只一点点（各关按序号错峰 → 地图上像波浪） */
@keyframes ring-breathe {
  0%, 100% { transform: scale(0.95); }
  50% { transform: scale(1.01); }
}
.ring-seg {
  fill: none;
  stroke: rgba(128, 128, 128, 0.12); /* 未点亮的段：浅灰轨道（圆头、段间留缝，颜色弱化） */
  stroke-width: 6;
  stroke-linecap: round;
  transform-origin: 50px 50px;
  transition: stroke var(--dur-base) var(--ease-out);
}
.lv-wrap.done .ring-seg.on { stroke: var(--gold, #f0b429); }
.lv-wrap.chest .ring-seg.on { stroke: #d98e04; }

/* 未学习关卡：主体只显示大锁（玩法图标不展示） */
.lv-wrap.locked .lv-ico-lock {
  width: 30px;
  height: 30px;
  color: #b8b0a4;
}

/* 宝箱独立关卡：金色礼物节点 */
.lv-wrap.chest .gp-level {
  --face: linear-gradient(160deg, #ffe9a8, #ffd87a);
  --base: rgba(176, 120, 0, 0.42);
}
.lv-wrap.chest .lv-ico-chest {
  width: 34px;
  height: 34px;
  color: #8a5a00;
}
/* 已领取：稍褪色示意"开过了" */
.lv-wrap.chest.done .gp-level {
  filter: grayscale(0.35) opacity(0.82);
}
.lv-wrap.chest .lv-tag {
  border-color: rgba(176, 120, 0, 0.4);
}

/* 暗色主题：深底上黑色半透明底座几乎看不见 → 换成更深的实色、空段提亮一档，保住立体与环的层次 */
:root[data-theme="dark"] .gp-level {
  --base: rgba(0, 0, 0, 0.55);
}
:root[data-theme="dark"] .ring-seg {
  stroke: rgba(210, 210, 210, 0.14);
}
</style>
