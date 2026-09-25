<script setup lang="ts">
/**
 * 游戏模式：多邻国式关卡路径图（Canvas 版）。
 *
 * - 整条路径（连线 + 节点 + 状态角标 + 进度条 + 标题）用 Canvas 绘制：
 *   布局精确可控（节点行距 104px、半径 32px，不再像纯 DOM 那样挤在一起），
 *   也为后续"角色沿路径行走"等游戏化动画铺路。
 * - 节点状态：locked（灰+锁）/ active（当前关卡，金色光圈脉动）/ ready（可玩）/ played（绿勾）/ done（通关，金色+勾）。
 * - 解锁规则（progress store 的 isUnlocked）：第一课总是解锁，其余需前一课玩过任一玩法。
 * - 解锁动效：KeepAlive 缓存下用「离开首页时的快照 vs 返回时状态」对比，
 *   只在回到首页那一刻对新解锁节点播金色闪光扩散。
 * - 交互：canvas 点击 → 命中检测 → emit open；锁定节点点击给错误触感提示。
 */
import { computed, onActivated, onDeactivated, onMounted, onBeforeUnmount, ref } from "vue";
import { lessons } from "../data/lessons";
import { useProgressStore } from "../stores/progress";
import { hapticTap, hapticWrong } from "../utils/haptics";

const emit = defineEmits<{ open: [id: string] }>();
const progress = useProgressStore();

interface PathNode {
  id: string;
  title: string;
  titleZh: string;
  emoji: string;
  tone: string;
  state: "locked" | "active" | "ready" | "played" | "done";
  /** 画布坐标（像素，宽随容器自适应） */
  x: number;
  y: number;
  stars: number;
  done: number;
  total: number;
}

/* ---------- 玩法数口径（与 LessonView activities 一致） ---------- */
function activityCount(l: { phrases?: unknown[] }): number {
  return 5 + (l.phrases?.length ? 1 : 0);
}

/* ---------- 画布几何（像素，固定行高与半径，宽松不重叠） ---------- */
const R = 32; // 节点半径
const ROW_H = 104; // 行距：圆(64px) + 标题两行 + 进度条，留足呼吸空间
const TOP = 58; // 首节点中心 y
const pathH = computed(() => TOP + (nodes.value.length - 1) * ROW_H + 52);

/** 通关关卡数（头部进度展示） */
const doneCount = computed(() => nodes.value.filter((n) => n.state === "done").length);
const lessonIds = lessons.map((l) => l.id);

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
    const total = activityCount(l);
    const done = Math.min(total, progress.progress[l.id]?.completed?.length || 0);
    return {
      id: l.id,
      title: l.title,
      titleZh: l.titleZh,
      emoji: l.emoji,
      tone: l.tone,
      state,
      x: 0, // 每帧按容器宽重算
      y: TOP + i * ROW_H,
      stars: progress.lessonStars(l.id),
      done,
      total
    };
  });
});

/** 当前关卡（active）节点——引导卡用 */
const activeNode = computed(() => nodes.value.find((n) => n.state === "active") ?? null);


const canvasEl = ref<HTMLCanvasElement | null>(null);
const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

/* ---------- 主题色读取（暗色模式自动跟随） ---------- */
function css(name: string, fb = ""): string {
  if (typeof document === "undefined") return fb;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fb;
}
const ink = () => css("--ink", "#4a3f35");
const inkSoft = () => css("--ink-soft", "#7a7268");
const gold = () => css("--gold", "#f0b429");
const yellow = () => css("--yellow", "#ffd87a");
const toneColor = (tone: string) => css(`--c-${tone}`, "#1cb0f6");

/* ---------- 动画时间戳 ---------- */
/** 解锁闪光起始时刻（performance.now()），绘制时按 900ms 衰减 */
const unlockT0 = ref<Record<string, number>>({});

let snapshotBefore: PathNode["state"][] = [];
let raf = 0;

function triggerUnlock(id: string) {
  unlockT0.value = { ...unlockT0.value, [id]: performance.now() };
}

onDeactivated(() => {
  snapshotBefore = nodes.value.map((n) => n.state);
  cancelAnimationFrame(raf);
  raf = 0;
});

onActivated(() => {
  // 回到首页：离开时还是 locked、现在可玩 → 刚解锁 → 播闪光
  nodes.value.forEach((n, i) => {
    const prev = snapshotBefore[i];
    if (prev === "locked" && n.state !== "locked") triggerUnlock(n.id);
  });
  startLoop();
});

onMounted(startLoop);
onBeforeUnmount(() => cancelAnimationFrame(raf));

function startLoop() {
  if (raf) return;
  raf = requestAnimationFrame(loop);
}
function loop() {
  draw();
  raf = requestAnimationFrame(loop);
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

  // 节点坐标随容器宽自适应（左右交替列）
  const list = nodes.value.map((n, i) => ({
    ...n,
    x: (i % 2 === 0 ? 0.27 : 0.73) * w
  }));

  const now = performance.now();
  drawLinks(ctx, list);
  for (const n of list) drawNode(ctx, n, now);
}

function drawLinks(ctx: CanvasRenderingContext2D, list: PathNode[]) {
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i];
    const b = list[i + 1];
    const mid = (a.y + b.y) / 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y + R);
    ctx.quadraticCurveTo((a.x + b.x) / 2, mid, b.x, b.y - R);
    const on = a.state !== "locked" && b.state !== "locked";
    if (on) {
      ctx.strokeStyle = gold();
      ctx.lineWidth = 3.5;
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = "rgba(120,120,120,0.4)";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 6]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawNode(ctx: CanvasRenderingContext2D, n: PathNode, now: number) {
  const { x, y } = n;

  // 解锁闪光（金色圆环扩散）
  const t0 = unlockT0.value[n.id];
  if (t0) {
    const p = (now - t0) / 900;
    if (p < 1) {
      ctx.beginPath();
      ctx.arc(x, y, R * (1 + p * 1.15), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,214,110,${0.85 * (1 - p)})`;
      ctx.lineWidth = 6;
      ctx.stroke();
    }
  }

  // active：金色光圈脉动
  if (n.state === "active") {
    const pulse = 0.5 + 0.5 * Math.sin(now / 320);
    ctx.beginPath();
    ctx.arc(x, y, R + 4 + pulse * 7, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,214,110,${0.3 + pulse * 0.3})`;
    ctx.lineWidth = 3.5;
    ctx.stroke();
  }

  // 节点圆底
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  let g: CanvasGradient;
  if (n.state === "locked") {
    g = ctx.createLinearGradient(x, y - R, x, y + R);
    g.addColorStop(0, "#e9e5db");
    g.addColorStop(1, "#d4cfc3");
  } else if (n.state === "done") {
    g = ctx.createLinearGradient(x, y - R, x, y + R);
    g.addColorStop(0, yellow());
    g.addColorStop(1, gold());
  } else {
    const c = toneColor(n.tone);
    g = ctx.createLinearGradient(x, y - R, x, y + R);
    g.addColorStop(0, c);
    g.addColorStop(1, shade(c, -18));
  }
  ctx.fillStyle = g;
  ctx.fill();
  // 底部阴影
  ctx.beginPath();
  ctx.arc(x, y + 3, R, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.fill();
  // 主体盖回
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  // 锁定：整体压灰
  if (n.state === "locked") {
    ctx.globalAlpha = 0.45;
  }

  // emoji 居中
  ctx.font = "28px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText(n.emoji, x, y + 1);

  ctx.globalAlpha = 1;

  // 状态角标（右下）
  const tagR = 12;
  const tx = x + R * 0.72;
  const ty = y + R * 0.72;
  ctx.beginPath();
  ctx.arc(tx, ty, tagR, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.14)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = "bold 11px sans-serif";
  ctx.fillStyle = n.state === "locked" ? "#9a938a" : "#6b4e00";
  if (n.state === "locked") ctx.fillText("🔒", tx, ty + 1);
  else if (n.state === "done") ctx.fillText("✓", tx, ty);
  else if (n.state === "played") { ctx.fillStyle = "#58cc02"; ctx.fillText("✓", tx, ty); }
  else if (n.state === "active") ctx.fillText("▶", tx, ty);
  else ctx.fillText("·", tx, ty);

  // 星星徽章（右上）
  if (n.stars > 0) {
    const sx = x + R * 0.72;
    const sy = y - R * 0.72;
    ctx.beginPath();
    ctx.arc(sx, sy, 11, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.stroke();
    ctx.font = "bold 10px sans-serif";
    ctx.fillStyle = gold();
    ctx.fillText("★" + n.stars, sx, sy + 0.5);
  }

  // 完成度进度条（圆下方）
  const barW = 56;
  const barY = y + R + 8;
  ctx.fillStyle = "rgba(120,120,120,0.22)";
  roundRect(ctx, x - barW / 2, barY, barW, 5, 3);
  ctx.fill();
  if (n.state !== "locked") {
    const pct = n.done / n.total;
    const fillC = n.state === "done" ? gold() : css("--c-green", "#58cc02");
    ctx.fillStyle = fillC;
    roundRect(ctx, x - barW / 2, barY, barW * Math.min(1, pct), 5, 3);
    ctx.fill();
  }

  // 标题两行（圆下方）
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 12px 'Baloo 2','PingFang SC','Hiragino Sans GB',sans-serif`;
  ctx.fillStyle = ink();
  ctx.fillText(n.titleZh, x, y + R + 26);
  ctx.font = "700 10px 'Baloo 2','PingFang SC','Hiragino Sans GB',sans-serif";
  ctx.fillStyle = inkSoft();
  ctx.fillText(n.title, x, y + R + 40);
}

/** 十六进制颜色加深（用于节点渐变深端） */
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

/* ---------- 交互：canvas 点击 → 命中检测 ---------- */
function onCanvasClick(e: MouseEvent) {
  const cv = canvasEl.value;
  if (!cv) return;
  const rect = cv.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const w = cv.clientWidth || rect.width;
  const list = nodes.value.map((n, i) => ({
    ...n,
    x: (i % 2 === 0 ? 0.27 : 0.73) * w
  }));
  for (const n of list) {
    if (Math.hypot(px - n.x, py - n.y) <= R + 8) {
      if (n.state === "locked") {
        hapticWrong();
      } else {
        hapticTap();
        emit("open", n.id);
      }
      return;
    }
  }
}

function enterCurrent() {
  if (activeNode.value) {
    hapticTap();
    emit("open", activeNode.value.id);
  }
}

/** canvas 无障碍描述 */
const pathLabel = computed(() => {
  const s = nodes.value
    .map((n) => `${n.titleZh}（${n.state === "locked" ? "未解锁" : n.state === "done" ? "已通关" : "可玩"}）`)
    .join("，");
  return `关卡路径：${s}`;
});
</script>

<template>
  <div class="game-path anim-fade-up">
    <!-- 头部：模式名 + 通关进度 -->
    <div class="gp-head">
      <span class="gp-title">🎮 游戏闯关</span>
      <span class="gp-progress">{{ doneCount }} / {{ nodes.length }} 关通关</span>
    </div>
    <p class="gp-tip">从起点出发，玩过一关才能解锁下一关</p>

    <!-- 当前关卡引导卡：告诉孩子这关是什么、玩到哪了 -->
    <div v-if="activeNode" class="guide-card anim-pop">
      <div class="gc-info">
        <p class="gc-label">🎯 当前关卡</p>
        <p class="gc-title">{{ activeNode.emoji }} {{ activeNode.titleZh }}</p>
        <p class="gc-sub">{{ activeNode.title }} · 已玩 {{ activeNode.done }}/{{ activeNode.total }} 种玩法</p>
      </div>
      <button class="k-btn small" @click="enterCurrent">开始</button>
    </div>

    <!-- 蛇形路径（Canvas 整绘） -->
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

/* ---------- 当前关卡引导卡 ---------- */
.guide-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-s);
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-s) var(--gap-m);
  border-left: 6px solid var(--gold);
}
.gc-label {
  margin: 0;
  font-weight: 800;
  font-size: 12px;
  color: var(--gold);
}
.gc-title {
  margin: 0;
  font-weight: 800;
  color: var(--ink);
  font-size: var(--fs-body);
}
.gc-sub {
  margin: 0;
  font-weight: 700;
  font-size: 12px;
  color: var(--ink-soft);
}
.guide-card .k-btn {
  flex-shrink: 0;
}

/* ---------- 路径画布 ---------- */
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
