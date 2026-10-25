<script setup lang="ts">
/**
 * 磨耳朵视频播放器（全屏浮层 + 自绘控制栏，2026-10-25 重做）。
 *
 * 为什么弃用原生 controls：电视/投屏场景下原生条三端三样（iOS/安卓/桌面）、
 * 按钮小、且没有循环模式。本组件提供与音频播放页**同一套语言**的控制：
 * 三档循环单按钮（列表循环 → 单曲循环 → 随机）+ 大号 transport + 进度条 + 全屏。
 *
 * 磨耳朵时长：播放段墙钟结算（与 player store 音频同一口径）——
 * play 起段 / pause·ended·换片·关闭·卸载结算，>0.5s 才计入。
 * 这同时修正了旧实现「interval 计时、暂停期间也多算」的 bug。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
  Maximize,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "@lucide/vue";
import { useProgressStore } from "../../stores/progress";

export interface VideoItem {
  id: string;
  title: string;
  titleZh: string;
  /** mp4 地址（normalize 时已 asset() 补过 BASE，直接用） */
  src: string;
  /** 列表卡展示用（浮层内不使用，由磨耳朵页的卡片渲染消费） */
  emoji?: string;
  tone?: string;
}

const props = defineProps<{ videos: VideoItem[]; startIndex?: number }>();
const emit = defineEmits<{ close: [] }>();

const progress = useProgressStore();

const idx = ref(Math.min(Math.max(props.startIndex ?? 0, 0), props.videos.length - 1));
const cur = computed(() => props.videos[idx.value] ?? props.videos[0]);

const videoEl = ref<HTMLVideoElement | null>(null);
const shellEl = ref<HTMLElement | null>(null);
const playing = ref(false);
const muted = ref(false);
const curSec = ref(0);
const durSec = ref(0);

/** 视频封面：optimize-videos.mjs 与 mp4 成对产出的同名 jpg（缺失时无害） */
const poster = computed(() => cur.value?.src.replace(/\.mp4$/, ".jpg"));

/** play() 的返回值在 jsdom/旧内核上可能不是 Promise，统一包一层再 catch */
function safePlay(v: HTMLVideoElement | null | undefined) {
  if (!v) return;
  void Promise.resolve(v.play()).catch(() => {});
}

/* ---------- 三档循环：与音频播放页 cycleMode 同一语言，localStorage 记住选择 ---------- */
type VideoMode = "all" | "one" | "shuffle";
const MODE_KEY = "kc-video-mode";
const MODE_META: Record<VideoMode, { label: string; icon: unknown }> = {
  all: { label: "列表循环", icon: Repeat },
  one: { label: "单曲循环", icon: Repeat1 },
  shuffle: { label: "随机", icon: Shuffle },
};
function loadMode(): VideoMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === "one" || v === "shuffle" ? v : "all";
  } catch {
    return "all";
  }
}
const mode = ref<VideoMode>(loadMode());
const modeMeta = computed(() => MODE_META[mode.value]);
function cycleMode() {
  mode.value = mode.value === "all" ? "one" : mode.value === "one" ? "shuffle" : "all";
  try {
    localStorage.setItem(MODE_KEY, mode.value);
  } catch {
    /* 隐私模式写不了就跳过 */
  }
}

/* ---------- 磨耳朵时长：播放段结算 ---------- */
let segStart = 0;
function segBegin() {
  if (!segStart) segStart = Date.now();
}
function segSettle() {
  if (!segStart) return;
  const sec = (Date.now() - segStart) / 1000;
  segStart = 0;
  if (sec > 0.5) progress.addListenActivity(sec);
}

/* ---------- transport ---------- */
function togglePlay() {
  const v = videoEl.value;
  if (!v) return;
  if (v.paused) safePlay(v);
  else v.pause();
}
/** 上一个：播过 3 秒先回开头（与音频 prev 同一习惯），否则上一个（wrap） */
function prev() {
  const v = videoEl.value;
  if (v && v.currentTime > 3) {
    v.currentTime = 0;
    return;
  }
  go(idx.value - 1 < 0 ? props.videos.length - 1 : idx.value - 1);
}
function next() {
  if (mode.value === "shuffle" && props.videos.length > 1) {
    let n = idx.value;
    while (n === idx.value) n = Math.floor(Math.random() * props.videos.length);
    go(n);
    return;
  }
  go((idx.value + 1) % props.videos.length);
}
function onEnded() {
  segSettle();
  if (mode.value === "one") {
    const v = videoEl.value;
    if (v) {
      v.currentTime = 0;
      safePlay(v);
    }
    return;
  }
  next();
}
function go(i: number) {
  segSettle();
  idx.value = i;
}
/** 换片后自动续播：src 变化不会自动 play（autoplay 属性只对首次加载生效） */
watch(cur, async () => {
  curSec.value = 0;
  durSec.value = 0;
  playing.value = false;
  await nextTick();
  safePlay(videoEl.value);
});

function onTime() {
  curSec.value = videoEl.value?.currentTime ?? 0;
}
function onMeta() {
  durSec.value = videoEl.value?.duration ?? 0;
}
function onSeek(e: Event) {
  const el = e.target as HTMLInputElement;
  const v = videoEl.value;
  if (v && durSec.value) v.currentTime = (Number(el.value) / 1000) * durSec.value;
}
const pct = computed(() => (durSec.value ? Math.round((curSec.value / durSec.value) * 1000) : 0));
function fmt(sec: number): string {
  if (!sec || !isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function toggleMute() {
  const v = videoEl.value;
  if (!v) return;
  v.muted = !v.muted;
  muted.value = v.muted;
}
function toggleFullscreen() {
  const shell = shellEl.value;
  const v = videoEl.value as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
  if (document.fullscreenElement) {
    void Promise.resolve(document.exitFullscreen()).catch(() => {});
    return;
  }
  if (shell?.requestFullscreen) {
    void Promise.resolve(shell.requestFullscreen()).catch(() => {});
    return;
  }
  v?.webkitEnterFullscreen?.(); // iOS Safari：只支持 video 元素自己的全屏
}

function close() {
  segSettle();
  emit("close");
}
onBeforeUnmount(segSettle);
</script>

<template>
  <div v-if="cur" ref="shellEl" class="vp" @click.self="close">
    <button class="vp-close round" aria-label="关闭视频" @click="close">
      <X class="k-ico" />
    </button>

    <div class="vp-body">
      <video
        ref="videoEl"
        class="vp-video"
        :src="cur.src"
        :poster="poster ?? undefined"
        playsinline
        preload="metadata"
        autoplay
        @play="playing = true; segBegin()"
        @pause="playing = false; segSettle()"
        @ended="playing = false; onEnded()"
        @timeupdate="onTime"
        @loadedmetadata="onMeta"
        @click="togglePlay"
      />

      <div class="vp-panel">
      <div class="vp-seek">
        <span class="vp-time">{{ fmt(curSec) }}</span>
        <input
          class="vp-range"
          type="range"
          min="0"
          max="1000"
          step="1"
          :value="pct"
          aria-label="播放进度"
          @input="onSeek"
        />
        <span class="vp-time">{{ fmt(durSec) }}</span>
      </div>
      <div class="vp-transport">
        <button class="vp-btn round" aria-label="上一个视频" @click="prev">
          <SkipBack class="k-ico" />
        </button>
        <button class="vp-main round" :aria-label="playing ? '暂停' : '播放'" @click="togglePlay">
          <Pause v-if="playing" class="k-ico" />
          <Play v-else class="k-ico" />
        </button>
        <button class="vp-btn round" aria-label="下一个视频" @click="next">
          <SkipForward class="k-ico" />
        </button>
        <button class="vp-btn vp-mode on" :aria-label="`播放模式：${modeMeta.label}，点击切换`" @click="cycleMode">
          <component :is="modeMeta.icon" class="k-ico" />
          <span class="vp-mode-label">{{ modeMeta.label }}</span>
        </button>
        <button class="vp-btn round" :aria-label="muted ? '取消静音' : '静音'" @click="toggleMute">
          <VolumeX v-if="muted" class="k-ico" />
          <Volume2 v-else class="k-ico" />
        </button>
        <button class="vp-btn round" aria-label="全屏" @click="toggleFullscreen">
          <Maximize class="k-ico" />
        </button>
      </div>
    </div>

    <p class="vp-caption">{{ cur.titleZh }} · {{ cur.title }}</p>
  </div>
  </div>
</template>

<style scoped>
.vp {
  position: fixed;
  inset: 0;
  z-index: var(--z-mask);
  background: var(--mask-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--gap-s);
  padding: var(--gap-m) var(--gap-m) calc(var(--gap-m) + env(safe-area-inset-bottom));
}
.vp:fullscreen {
  background: var(--black);
  padding: 0;
}
/* 真全屏：视频占满除控制栏外的全部空间（contain 黑底无缝），面板通栏 */
.vp:fullscreen .vp-body {
  width: 100%;
  height: 100%;
  justify-content: center;
}
.vp:fullscreen .vp-video {
  max-width: none;
  max-height: none;
  width: 100%;
  flex: 1;
  min-height: 0;
  border-radius: 0;
}
.vp:fullscreen .vp-panel {
  width: 100%;
  border-radius: 0;
}
.vp:fullscreen .vp-caption {
  display: none;
}
/* 旧 Safari 前缀（16.4 前不支持无前缀 :fullscreen） */
.vp:-webkit-full-screen {
  background: var(--black);
  padding: 0;
}
.vp:-webkit-full-screen .vp-body {
  width: 100%;
  height: 100%;
  justify-content: center;
}
.vp:-webkit-full-screen .vp-video {
  max-width: none;
  max-height: none;
  width: 100%;
  flex: 1;
  min-height: 0;
  border-radius: 0;
}
.vp:-webkit-full-screen .vp-panel {
  width: 100%;
  border-radius: 0;
}
.vp:-webkit-full-screen .vp-caption {
  display: none;
}
.vp-close {
  position: absolute;
  top: var(--gap-m);
  right: var(--gap-m);
  width: var(--tap-min);
  height: var(--tap-min);
  font-size: var(--fs-title);
  background: var(--mask-control);
  color: var(--mask-ink);
  z-index: 1;
}
.vp-body {
  /* 视频 + 控制栏同宽一体化：控制栏永远正好跨满视频那一行 */
  width: min(560px, 94vw);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-xs);
  min-height: 0;
}
.vp-video {
  display: block;
  /* fit-content：元素紧贴视频画面（不拉伸不留黑边），控制栏才贴得住画面下缘 */
  width: auto;
  height: auto;
  max-width: 100%;
  /* 双重限高：常规 58vh；矮视口（手机横屏 ~390px 高）再扣除控制面板+标题+内边距，
     保证整列不超高——fixed 浮层内容超高会上下两头裁切，比小视频更伤 */
  max-height: min(58vh, calc(100dvh - 240px));
  border-radius: var(--radius-s);
  background: var(--black); /* 信箱底：tokens 里 --black 的既定用途 */
}
/* 控制面板：深色圆角卡（浮层配色体系，与关闭键同源） */
.vp-panel {
  display: flex;
  flex-direction: column;
  gap: var(--gap-xs);
  width: 100%;
  padding: var(--gap-s) var(--gap-m);
  border-radius: var(--radius-s);
  background: var(--mask-control);
}
.vp-seek {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
}
.vp-time {
  font-size: var(--fs-small);
  font-variant-numeric: tabular-nums;
  color: var(--mask-ink-soft);
  min-width: 3.2em;
  text-align: center;
}
/* 进度条：原生 range + accent 着色；高度撑到触控标准，拇指够大好拖 */
.vp-range {
  flex: 1;
  height: var(--tap-min);
  accent-color: var(--brand);
  cursor: pointer;
}
.vp-transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--gap-s);
  /* 窄屏自动换行（模式/静音/全屏掉到第二行），不引入额外断点 */
  flex-wrap: wrap;
}
.vp-btn {
  width: var(--tap-min);
  height: var(--tap-min);
  font-size: var(--fs-title);
  background: transparent;
  color: var(--mask-ink);
  flex: none;
}
.vp-main {
  width: calc(var(--tap-min) + 16px);
  height: calc(var(--tap-min) + 16px);
  font-size: calc(var(--fs-title) + 6px);
  background: var(--brand);
  color: var(--on-tone);
}
/* 播放模式：唯一带文字的键（家长用的功能），与音频播放页同款文案 */
.vp-mode {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: auto;
  padding: 0 var(--gap-s);
  font-size: var(--fs-small);
}
.vp-mode-label {
  white-space: nowrap;
}
.vp-caption {
  color: var(--mask-ink-soft);
  margin: 0;
  font-weight: var(--fw-mid);
}
</style>
