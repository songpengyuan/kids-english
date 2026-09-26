<script lang="ts">
/** 模块级滚动记忆：KeepAlive 缓存下 GamePath 子树可能被重建，
 *  script setup 内局部变量每次挂载重置，故存模块作用域，跨实例/跨 KeepAlive 保留。 */
export let savedGameTop = 0;
</script>

<script setup lang="ts">
/**
 * 游戏模式：多邻国式关卡路径图（Canvas 版）。
 *
 * - 每个课程展开为"多个关卡"（玩法序列 = 关卡序列），地图直接展示所有关卡：
 *   课名胶囊（小圆角渐变：课 icon + 课名 + 完成进度）+ 关卡节点（矢量 icon + 玩法名 + 状态角标 + 星徽章）。
 * - 无连线：关卡节点按全局序号左右交替（0.24/0.76 列）蜿蜒排列，每课一段。
 * - 全局线性解锁：第一关总是可玩，前一关完成解锁下一关（跨课连续）。
 *   状态：done（金渐变+✓）/ active（当前，光圈脉动）/ locked（灰+🔒）。
 * - 点关卡节点 → 直接开玩该玩法（/lesson/:id?mode=quest&step=<玩法>）。
 * - 解锁动效：KeepAlive 缓存下对比离开/回来快照，对新解锁关卡播金色闪光。
 * - 关卡序列与状态逻辑集中在 data/pathLevels.ts（GamePath 与 LessonView 共享）。
 */
import { computed, onActivated, onDeactivated, onMounted, onBeforeUnmount, ref } from "vue";
import { useRouter } from "vue-router";
import { lessons } from "../data/lessons";
import {
  buildLevels,
  computeStates,
  currentLevel,
  levelDone,
  lessonDoneCount,
  type PathLevel,
  type LevelState,
} from "../data/pathLevels";
import { iconEl, ICON_TEXT } from "../data/pathIcons";
import { useProgressStore } from "../stores/progress";
import { hapticTap, hapticWrong } from "../utils/haptics";
import { buildPathGeometry, hitTestPath, R, ROW_H, BAR_H, BAR_GAP, UNIT_BREAK, TOP, BOTTOM } from "../utils/pathGeometry";

const router = useRouter();
const progress = useProgressStore();

const levels = buildLevels();
const states = computed(() => computeStates(levels, progress.progress));

/** 当前关卡（第一个 active）——键盘 Enter 直达 */
const activeLevel = computed(() => currentLevel(levels, states.value));

/* ---------- 画布几何（多邻国式：每课渐变横幅 + 蛇形蜿蜒圆节点 + 细路径线） ---------- */

interface GeoItem {
  type: "unit" | "level";
  x: number;
  y: number;
  lessonId: string;
  level?: PathLevel;
  state?: LevelState;
  stars?: number;
  done?: number;
  total?: number;
}

/** 整图几何（课名胶囊 + 关卡节点坐标），宽随容器自适应 */
const geo = computed<GeoItem[]>(() => {
  // 布局坐标来自纯函数 pathGeometry（TDD 基线），这里只补充展示字段
  const geom = buildPathGeometry(lessons, levels);
  return geom.map((g) => {
    if (g.type === "unit") {
      return {
        ...g,
        x: 0,
        done: lessonDoneCount(g.lessonId, progress.progress),
        total: levels.filter((lv) => lv.lessonId === g.lessonId).length,
      } as GeoItem;
    }
    const lv = levels.find((l) => l.lessonId === g.lessonId && l.actKey === g.activityKey);
    return {
      ...g,
      x: 0,
      level: lv,
      state: lv ? states.value[lv.id] : undefined,
      stars: (progress.progress[g.lessonId] as Record<string, number> | undefined)?.[g.activityKey!] || 0,
    } as GeoItem;
  });
});

const pathH = computed(() => {
  const last = geo.value[geo.value.length - 1];
  return last ? last.y + R + BOTTOM : 400;
});

const canvasEl = ref<HTMLCanvasElement | null>(null);
const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

/* ---------- 主题色读取（暗色自动跟随） ---------- */
function css(name: string, fb = ""): string {
  if (typeof document === "undefined") return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;
}
const ink = () => css("--ink", "#4a3f35");
const inkSoft = () => css("--ink-soft", "#7a7268");
const inkFaint = () => css("--ink-faint", "#b9b2a6");
const gold = () => css("--gold", "#f0b429");
const yellow = () => css("--yellow", "#ffd87a");
const toneColor = (tone: string) => css(`--c-${tone}`, "#1cb0f6");

/* ---------- 滚动位置记忆（底部 tab 切换不丢位置） ----------
 * KeepAlive 缓存 HomePage 时 v-else 分支的 GamePath 会被卸载（unmount 时内容已清空），
 * 不能依赖 deactivated/unmount 时机保存；改为 scroll 事件实时记录到模块级变量，挂载时恢复。 */
const rootEl = ref<HTMLDivElement | null>(null);
function onScroll() {
  if (rootEl.value) savedGameTop = rootEl.value.scrollTop;
}
function restoreTop() {
  requestAnimationFrame(() => {
    if (rootEl.value) rootEl.value.scrollTop = savedGameTop;
  });
}

/* ---------- 解锁闪光 ---------- */
const unlockT0 = ref<Record<string, number>>({});
let snapshotBefore: Record<string, LevelState> = {};
let raf = 0;

function triggerUnlock(id: string) {
  unlockT0.value = { ...unlockT0.value, [id]: performance.now() };
}

onDeactivated(() => {
  snapshotBefore = { ...states.value };
  cancelAnimationFrame(raf);
  raf = 0;
});
onBeforeUnmount(() => {
  rootEl.value?.removeEventListener("scroll", onScroll);
  cancelAnimationFrame(raf);
});
onActivated(() => {
  levels.forEach((lv) => {
    if (snapshotBefore[lv.id] === "locked" && states.value[lv.id] !== "locked") triggerUnlock(lv.id);
  });
  restoreTop();
  startLoop();
});
onMounted(() => {
  rootEl.value?.addEventListener("scroll", onScroll, { passive: true });
  startLoop();
  restoreTop();
});


function startLoop() {
  if (raf) return;
  raf = requestAnimationFrame(loop);
}
function loop() {
  draw();
  raf = requestAnimationFrame(loop);
}

/** 节点在整条关卡序列中的下标（左右交替列） */
function altIndex(it: GeoItem): number {
  return levels.findIndex((lv) => lv.id === it.level!.id);
}

function layoutItems(w: number): GeoItem[] {
  return geo.value.map((it) =>
    it.type === "level" ? { ...it, x: (altIndex(it) % 2 === 0 ? 0.24 : 0.76) * w } : { ...it, x: w / 2 }
  );
}

/* ---------- 绘制 ---------- */
function draw() {
  const cv = canvasEl.value;
  if (!cv) return;
  const w = cv.clientWidth || 320;
  const h = pathH.value;
  if (cv.width !== Math.round(w * dpr)) cv.width = Math.round(w * dpr);
  if (cv.height !== Math.round(h * dpr)) cv.height = Math.round(h * dpr);
  if (cv.style.height !== h + "px") cv.style.height = h + "px";

  const ctx = cv.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const items = layoutItems(w);
  const now = performance.now();

  // 1) 细路径线（多邻国式）：解锁段淡金实线、锁定段浅灰虚线，细且不抢节点
  const lvItems = items.filter((it) => it.type === "level") as GeoItem[];
  for (let i = 0; i < lvItems.length - 1; i++) {
    const a = lvItems[i];
    const b = lvItems[i + 1];
    const mid = (a.y + b.y) / 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y + R);
    ctx.quadraticCurveTo((a.x + b.x) / 2, mid, b.x, b.y - R);
    const on = a.state !== "locked" && b.state !== "locked";
    if (on) {
      ctx.strokeStyle = "rgba(240,180,41,0.45)";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = "rgba(168,162,150,0.55)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 2) 课程横幅 + 关卡节点
  for (const it of items) {
    if (it.type === "unit") drawUnit(ctx, it, w);
    else drawLevel(ctx, it, now);
  }
}

/** 课程横幅（多邻国式）：全宽渐变栏 = 课 icon + 课名 + 完成进度 x/y + 底部细进度条 */
function drawUnit(ctx: CanvasRenderingContext2D, it: GeoItem, w: number) {
  const lesson = lessons.find((l) => l.id === it.lessonId);
  if (!lesson) return;
  const done = it.done || 0;
  const total = it.total || 1;
  const h = BAR_H;
  const y = it.y - h / 2;

  // 全宽渐变横幅（课程色调）
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  const c = toneColor(lesson.tone);
  g.addColorStop(0, c);
  g.addColorStop(1, shade(c, -24));
  ctx.beginPath();
  roundRect(ctx, 0, y, w, h, 14);
  ctx.fillStyle = g;
  ctx.fill();
  // 底部微光条
  ctx.beginPath();
  roundRect(ctx, 0, y + h - 8, w, 8, 0);
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  ctx.fill();

  // 左：课 icon（白）+ 课名
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const uic = iconEl(lesson.id, "#ffffff");
  if (uic && uic.complete && uic.naturalWidth > 0) {
    ctx.drawImage(uic, 16, y + (h - 30) / 2, 30, 30);
  } else if (ICON_TEXT[lesson.id]) {
    ctx.font = "800 18px 'Baloo 2','PingFang SC','Hiragino Sans GB',sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText(ICON_TEXT[lesson.id], 16, y + h / 2 + 1);
  }
  ctx.font = "800 18px 'Baloo 2','PingFang SC','Hiragino Sans GB',sans-serif";
  ctx.fillStyle = "#fff";
  ctx.fillText(lesson.titleZh, 58, y + h / 2 + 1);

  // 右：完成进度 x/y
  ctx.font = "800 14px 'Baloo 2','PingFang SC',sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillText(`${done}/${total}`, w - 16, y + h / 2 + 1);

  // 底部细进度条
  const barY = y + h - 12;
  ctx.beginPath();
  roundRect(ctx, 16, barY, w - 32, 5, 2.5);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fill();
  if (total > 0) {
    ctx.beginPath();
    roundRect(ctx, 16, barY, (w - 32) * Math.min(1, done / total), 5, 2.5);
    ctx.fillStyle = "#fff";
    ctx.fill();
  }
}

function drawLevel(ctx: CanvasRenderingContext2D, it: GeoItem, now: number) {
  const { x, y } = it;
  const lv = it.level!;
  const state = it.state!;

  // 解锁闪光（金色圆环扩散）
  const t0 = unlockT0.value[lv.id];
  if (t0) {
    const p = (now - t0) / 900;
    if (p < 1) {
      ctx.beginPath();
      ctx.arc(x, y, R * (1 + p * 1.2), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,214,110,${0.85 * (1 - p)})`;
      ctx.lineWidth = 6;
      ctx.stroke();
    }
  }

  // active：金色光圈脉动
  if (state === "active") {
    const pulse = 0.5 + 0.5 * Math.sin(now / 320);
    ctx.beginPath();
    ctx.arc(x, y, R + 4 + pulse * 7, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,214,110,${0.3 + pulse * 0.3})`;
    ctx.lineWidth = 3.5;
    ctx.stroke();
  }

  // 多邻国式节点：白底圆 + 浅投影 + 状态彩色描边 + 彩色 icon
  ctx.beginPath();
  ctx.arc(x, y + 3, R, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  let ring = "#d6d2c7"; // 锁定：浅灰描边
  let iconColor = "#b9b2a6";
  if (state === "done") {
    ring = gold();
    iconColor = "#c8860b";
  } else if (state === "active") {
    ring = toneColor(lv.tone);
    iconColor = shade(toneColor(lv.tone), -30);
  }
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.strokeStyle = ring;
  ctx.lineWidth = state === "active" ? 4 : state === "done" ? 3.5 : 2.5;
  ctx.stroke();

  // 锁定压灰
  if (state === "locked") ctx.globalAlpha = 0.85;

  // 玩法 icon 居中（彩色描边，与状态一致）
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const ic = iconEl(lv.actKey, iconColor);
  if (ic && ic.complete && ic.naturalWidth > 0) {
    ctx.drawImage(ic, x - 13, y - 13, 26, 26);
  } else if (ICON_TEXT[lv.actKey]) {
    ctx.font = "800 13px 'Baloo 2','PingFang SC','Hiragino Sans GB',sans-serif";
    ctx.fillStyle = iconColor;
    ctx.fillText(ICON_TEXT[lv.actKey], x, y);
  }
  ctx.globalAlpha = 1;

  // 状态角标（右下）：🔒 / ✓ / ▶
  const tagR = 11;
  const tx = x + R * 0.72;
  const ty = y + R * 0.72;
  ctx.beginPath();
  ctx.arc(tx, ty, tagR, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.14)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = "bold 10px sans-serif";
  if (state === "locked") {
    ctx.fillStyle = "#9a938a";
    ctx.fillText("🔒", tx, ty + 1);
  } else if (state === "done") {
    ctx.fillStyle = "#6b4e00";
    ctx.fillText("✓", tx, ty);
  } else {
    ctx.fillStyle = "#6b4e00";
    ctx.fillText("▶", tx, ty);
  }

  // 星星徽章（右上）
  if (it.stars) {
    const sx = x + R * 0.72;
    const sy = y - R * 0.72;
    ctx.beginPath();
    ctx.arc(sx, sy, 10, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.stroke();
    ctx.font = "bold 9px sans-serif";
    ctx.fillStyle = gold();
    ctx.fillText("★" + it.stars, sx, sy + 0.5);
  }

  // 玩法名小字（节点下方）
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = "700 11px 'Baloo 2','PingFang SC','Hiragino Sans GB',sans-serif";
  ctx.fillStyle = state === "locked" ? inkFaint() : ink();
  ctx.fillText(lv.name, x, y + R + 14);
}

function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- 交互：点关卡直接开玩 ---------- */
function onCanvasClick(e: MouseEvent) {
  const cv = canvasEl.value;
  if (!cv) return;
  const rect = cv.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const w = cv.clientWidth || rect.width;
  // 命中判定来自纯函数 hitTestPath（TDD 基线）：关卡节点优先于课程横幅
  const hit = hitTestPath(layoutItems(w), px, py, w);
  if (!hit) return;
  if (hit.type === "level") {
    if (hit.state === "locked") {
      hapticWrong();
    } else {
      hapticTap();
      router.push(`/lesson/${hit.level!.lessonId}?mode=quest&step=${hit.level!.actKey}`);
    }
    return;
  }
  // 课程横幅命中 → 进该课第一关
  const first = levels.find((lv) => lv.lessonId === hit.lessonId);
  if (!first) return;
  const st = states.value[first.id];
  if (st === "locked") {
    hapticWrong();
  } else {
    hapticTap();
    router.push(`/lesson/${first.lessonId}?mode=quest&step=${first.actKey}`);
  }
}

function enterCurrent() {
  if (activeLevel.value) {
    hapticTap();
    router.push(`/lesson/${activeLevel.value.lessonId}?mode=quest&step=${activeLevel.value.actKey}`);
  }
}

/** canvas 无障碍描述 */
const pathLabel = computed(() => {
  const s = geo.value
    .filter((it) => it.type === "level")
    .map((it) => {
      const st = it.state === "locked" ? "未解锁" : it.state === "done" ? "已通关" : "可玩";
      return `第${it.level!.no}关${it.level!.name}（${st}）`;
    })
    .join("，");
  return `关卡路径：${s}`;
});
</script>

<template>
  <div ref="rootEl" class="game-path anim-fade-up">
    <!-- 蛇形路径（Canvas 整绘：课名胶囊 + 圆节点蜿蜒，点节点直接开玩） -->
    <div class="path">
      <canvas
        ref="canvasEl"
        role="img"
        :aria-label="pathLabel"
        tabindex="0"
        @click="onCanvasClick"
        @keydown.enter="enterCurrent"
      ></canvas>
    </div>
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
.path {
  position: relative;
  width: 100%;
}
.path canvas {
  display: block;
  width: 100%;
  touch-action: manipulation;
  cursor: pointer;
  outline: none;
}
</style>
