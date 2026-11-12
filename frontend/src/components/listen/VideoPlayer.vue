<script setup lang="ts">
/**
 * 通用视频播放器（2026-11-12 交互重做，面向 5 岁孩子）。
 *
 * 设计口径（为什么长这样）：
 * - **待播态只给封面 + 一个播放键**：不渲染进度条、不渲染控制栏——没播的时候
 *   进度条既没有信息量，又会让孩子以为"已经开始了/已经播完了"。
 * - **控制条放在画面下方，常驻**：孩子不会因为按钮消失而找不到"停一下"；
 *   真全屏时才浮到画面底部（占用最小、白字压深色底，任何画面都看得清）。
 * - 点画面 = 暂停/继续（孩子最直观的停一下），不用先找按钮。
 * - 主控制条只留孩子真正要用的三个（上一个 / 播放暂停 / 下一个）；
 *   静音、循环、全屏是家长向的次级功能，排在右侧一小簇，仍然 ≥52px。
 * - 进度条只在开播后出现，开播前不存在。
 * - 点了播放就给反馈：缓冲期间转圈（waiting 事件驱动），加载失败给
 *   "视频走丢了，点一下再试"的大覆盖层——黑屏装死会让孩子反复戳。
 * - 隐藏的状态不改变行为：循环模式键多片时**常显**（曾只在全屏出现，
 *   而选择持久化在 localStorage——嵌入态顺序被随机改动却看不出原因）。
 * - 通用：`videos` 数组 + `embedded` 两种形态，磨耳朵与唱歌页视频共用一套；
 *   `ended` 在循环/切片**之前**发出（单视频自动重播，消费方要靠它落"看完"）；
 *   `listen: false` 用于时长口径不该算磨耳朵的场景（唱歌页有自己的领星闭环）；
 *   `cover` 覆盖位给有配套海报图的场景（如 mp4 同名 jpg），挂了回退 emoji。
 *
 * 不发 autoplay：待播态必须真实存在（孩子先看到封面+播放键，再决定播不播）。
 * 换片（上一个/下一个/播完自动切）仍自动续播，行为和旧版一致。
 *
 * 磨耳朵时长：播放段墙钟结算（与 player store 音频同一口径）——
 * play 起段 / pause·ended·换片·关闭·卸载结算，>0.5s 才计入。
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
import { emojiCoverUrl } from "../../utils/emojiCover";

export interface VideoItem {
  id: string;
  title: string;
  titleZh: string;
  /** mp4 地址（normalize 时已 asset() 补过 BASE，直接用） */
  src: string;
  /** 列表卡展示用（浮层内不使用，由磨耳朵页的卡片渲染消费） */
  emoji?: string;
  tone?: string;
  /** 封面 URL 覆盖位（如 mp4 成对产出的同名 jpg）；缺省用 emojiCoverUrl(emoji)，图挂了回退 emoji 大字 */
  cover?: string;
}

const props = withDefaults(
  defineProps<{
    videos: VideoItem[];
    startIndex?: number;
    embedded?: boolean;
    /** 计入磨耳朵时长（默认 true）：唱歌页视频收编进本组件时传 false——时长口径仍归磨耳朵页。
     *  必须显式给默认 true：Boolean prop 的 Vue 转型会把「没传」变成 false，时长就全丢了 */
    listen?: boolean;
  }>(),
  { listen: true }
);
const emit = defineEmits<{ close: []; ended: []; error: [] }>();

const progress = useProgressStore();

const idx = ref(Math.min(Math.max(props.startIndex ?? 0, 0), props.videos.length - 1));
const cur = computed(() => props.videos[idx.value] ?? props.videos[0]);

const videoEl = ref<HTMLVideoElement | null>(null);
const shellEl = ref<HTMLElement | null>(null);
const playing = ref(false);
/** 是否已经开播：封面只在首帧前显示，暂停/拖进度时不重新盖 */
const started = ref(false);
const muted = ref(false);
const curSec = ref(0);
const durSec = ref(0);
/** 画面比例：默认 16:9，metadata 到了按真实比例（各课视频比例不一致） */
const ar = ref("16 / 9");
/** 起播/缓冲中：点播放到首帧之间给转圈——孩子知道"在来了"，不会对着静止封面干戳 */
const waiting = ref(false);
/** 加载失败（404/断流）：不黑屏装死，给一个大可点的重试 */
const failed = ref(false);

/** 课程封面：与磨耳朵视频卡同一张自托管图（资产集外回退 emoji）。
 *  原生 poster 同用——旧 poster 是机构片头（Super Simple Songs 片头），不能再用。 */
const cover = computed(() => cur.value?.cover ?? emojiCoverUrl(cur.value?.emoji));
/** 封面覆盖图挂了（jpg 没产出/404）→ 回退 emoji 大字，不留破图 */
const coverBroken = ref(false);

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
  if (props.listen === false) return;
  if (!segStart) segStart = Date.now();
}
function segSettle() {
  if (props.listen === false) return;
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
function onPlay() {
  playing.value = true;
  started.value = true;
  waiting.value = false;
  segBegin();
}
function onPause() {
  playing.value = false;
  waiting.value = false;
  segSettle();
}
function onEnded() {
  playing.value = false;
  waiting.value = false;
  segSettle();
  // 循环/切片之前先发 ended：单视频会自动重播，消费方（如唱歌页"看完一遍"
  // 才能领星）必须赶在循环继续之前拿到这次播完的信号
  emit("ended");
  // 只有一条视频时"列表循环"就等于循环这一条：否则播完停在最后一帧，
  // 孩子以为卡住了（旧实现漏了这个分支）
  if (mode.value === "one" || props.videos.length === 1) {
    const v = videoEl.value;
    if (v) {
      v.currentTime = 0;
      safePlay(v);
    }
    return;
  }
  next();
}
/** 加载失败：404/断流不装死——先收掉转圈，再交给"再试一次"的兜底覆盖层 */
function onError() {
  waiting.value = false;
  if (!cur.value?.src) return;
  failed.value = true;
  emit("error");
}
/** 重试：重新拉一遍（断网恢复/资源后补都能救回来），拉到就接着播 */
function retry() {
  const v = videoEl.value;
  failed.value = false;
  if (!v) return;
  v.load();
  safePlay(v);
}
/** 点画面：播放中 = 暂停（孩子最直观的"停一下"），暂停中 = 接着播 */
function onStageTap() {
  if (!started.value) return; // 待播态由封面按钮负责
  togglePlay();
}
function go(i: number) {
  segSettle();
  idx.value = i;
}
/** 换片后自动续播：src 变化不会自动 play，显式续播（与旧版一致） */
watch(cur, async () => {
  curSec.value = 0;
  durSec.value = 0;
  playing.value = false;
  started.value = false;
  waiting.value = false;
  failed.value = false;
  coverBroken.value = false;
  ar.value = "16 / 9";
  await nextTick();
  safePlay(videoEl.value);
});

function onTime() {
  curSec.value = videoEl.value?.currentTime ?? 0;
}
function onMeta() {
  const v = videoEl.value;
  durSec.value = v?.duration ?? 0;
  if (v?.videoWidth && v.videoHeight) ar.value = `${v.videoWidth} / ${v.videoHeight}`;
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
onBeforeUnmount(() => {
  segSettle();
  videoEl.value?.pause();
});
</script>

<template>
  <div v-if="cur" ref="shellEl" class="vp" :class="{ 'vp--embedded': embedded }" @click.self="!embedded && close()">
    <button v-if="!embedded" class="vp-close round" aria-label="关闭视频" @click="close">
      <X class="k-ico" />
    </button>

    <div class="vp-body">
      <div class="vp-stage" :style="{ '--vp-ar': ar }">
        <video
          ref="videoEl"
          class="vp-video"
          :src="cur.src"
          :poster="cover ?? undefined"
          playsinline
          preload="metadata"
          @play="onPlay"
          @playing="waiting = false"
          @pause="onPause"
          @waiting="waiting = true"
          @canplay="waiting = false"
          @seeked="waiting = false"
          @ended="onEnded"
          @error="onError"
          @timeupdate="onTime"
          @loadedmetadata="onMeta"
          @click="onStageTap"
        />

        <!-- 待播态：封面 + 一个播放键，再无别的控件（不出现进度条） -->
        <button
          v-if="!started && !failed"
          class="vp-cover"
          :class="'tone-' + cur.tone"
          aria-label="播放视频"
          @click="togglePlay"
        >
          <span class="vp-cover__art" aria-hidden="true">
            <img v-if="cover && !coverBroken" class="vp-cover__img" :src="cover" alt="" @error="coverBroken = true" />
            <template v-else>{{ cur.emoji }}</template>
          </span>
          <span class="vp-cover__text">
            <b class="vp-cover__title">{{ cur.title }}</b>
            <small class="vp-cover__sub">{{ cur.titleZh }}</small>
            <span class="vp-cover__play">
              <Play class="k-ico" />
              <span>播放</span>
            </span>
          </span>
        </button>

        <!-- 起播/缓冲：点了播放就得有"在来了"的反馈（不挡点击，孩子仍可点画面暂停） -->
        <div v-if="waiting && !failed" class="vp-busy" aria-hidden="true">
          <span class="vp-busy__ring"></span>
        </div>

        <!-- 加载失败兜底：整个覆盖层就是重试键，孩子不用理解"刷新" -->
        <button
          v-if="failed"
          class="vp-error"
          aria-label="视频没加载出来，点一下再试"
          @click="retry"
        >
          <span class="vp-error__emoji" aria-hidden="true">{{ cur.emoji || "🎬" }}</span>
          <b class="vp-error__title">视频走丢了</b>
          <small class="vp-error__sub">点一下，再试一次</small>
        </button>
      </div>

      <!-- 播放态控制条：画面下方常驻（全屏时浮到画面底部）。
           失败态整个撤掉：进度/播放键此刻都没有意义，别跟兜底层抢地方 -->
      <div v-if="started && !failed" class="vp-ui">
        <div class="vp-seek">
          <span class="vp-time">{{ fmt(curSec) }}</span>
          <input
            class="vp-range"
            type="range"
            min="0"
            max="1000"
            step="1"
            :value="pct"
            :style="{ '--p': pct / 10 + '%' }"
            aria-label="播放进度"
            @input="onSeek"
          />
          <span class="vp-time">{{ fmt(durSec) }}</span>
        </div>
        <div class="vp-controls">
          <div class="vp-transport">
            <button v-if="videos.length > 1" class="vp-btn round" aria-label="上一个视频" @click="prev">
              <SkipBack class="k-ico" />
            </button>
            <button class="vp-main round" :aria-label="playing ? '暂停' : '播放'" @click="togglePlay">
              <Pause v-if="playing" class="k-ico" />
              <Play v-else class="k-ico" />
            </button>
            <button v-if="videos.length > 1" class="vp-btn round" aria-label="下一个视频" @click="next">
              <SkipForward class="k-ico" />
            </button>
          </div>
          <div class="vp-tools">
            <button
              v-if="videos.length > 1"
              class="vp-tool round"
              :aria-label="`播放模式：${modeMeta.label}，点击切换`"
              @click="cycleMode"
            >
              <component :is="modeMeta.icon" class="k-ico" />
            </button>
            <button class="vp-tool round" :aria-label="muted ? '取消静音' : '静音'" @click="toggleMute">
              <VolumeX v-if="muted" class="k-ico" />
              <Volume2 v-else class="k-ico" />
            </button>
            <button class="vp-tool round" aria-label="全屏" @click="toggleFullscreen">
              <Maximize class="k-ico" />
            </button>
          </div>
        </div>
      </div>
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
/* 嵌入课程播放页：不再盖住整屏，只占内容区；关闭/标题由外层共用页头承担 */
.vp--embedded {
  position: static;
  inset: auto;
  z-index: auto;
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  padding: 0;
  background: transparent;
  justify-content: center;
}
.vp--embedded .vp-body {
  width: min(900px, 100%);
}
/* 真全屏：画面占满，控制条浮在画面底部（占最少、且永远是深底白字） */
.vp:fullscreen .vp-body {
  width: 100%;
  height: 100%;
  justify-content: center;
}
.vp:fullscreen .vp-stage {
  flex: 1 1 0;
  height: auto;
  max-height: none;
  aspect-ratio: auto;
  border-radius: 0;
}
.vp:fullscreen .vp-ui {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  margin: 0;
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--mask-bg);
  border-radius: 0;
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
.vp:-webkit-full-screen .vp-stage {
  flex: 1 1 0;
  height: auto;
  max-height: none;
  aspect-ratio: auto;
  border-radius: 0;
}
.vp:-webkit-full-screen .vp-ui {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  margin: 0;
  background: var(--mask-bg);
  border-radius: 0;
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
  /* 画面 + 控制条同宽一体化：控制条永远正好跨满画面那一行 */
  width: min(560px, 94vw);
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 0;
}
/* 舞台：按视频真实比例（默认 16:9）——旧版封面是 1:1 方形，一开播画面尺寸就跳变 */
.vp-stage {
  position: relative;
  width: 100%;
  aspect-ratio: var(--vp-ar, 16 / 9);
  /* 矮视口（手机横屏 ~390px 高）限高，整列不超高；fixed 浮层超高会两头裁切 */
  max-height: min(58vh, calc(100dvh - 300px));
  border-radius: var(--radius-s);
  overflow: hidden;
  background: var(--black); /* 信箱底：tokens 里 --black 的既定用途 */
}
.vp-video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: var(--black);
}
/* 待播封面：左图右字 + 一枚大播放键（孩子不用找按钮）。
 * 行高必须锁成 cover 自身高度（absolute inset:0，高度确定）：行高 auto 时
 * 封面图按自然尺寸渲染（~300px），max-height:100% 的解析链断了——图溢出舞台、
 * 播放键被挤出可点范围（横屏实测播放键整个在舞台外） */
.vp-cover {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: minmax(0, 38%) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  align-items: center;
  gap: var(--gap-s);
  padding: var(--gap-s) var(--gap-m);
  border: 0;
  border-radius: 0;
  box-shadow: none;
  text-align: left;
  color: var(--on-tone);
}
.vp-cover__art {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: clamp(40px, 16vw, 88px);
  line-height: 1;
  filter: drop-shadow(0 4px 8px var(--mask-bg));
}
.vp-cover__img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.vp-cover__text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}
.vp-cover__title {
  font-size: var(--fs-title);
  font-weight: var(--fw-strong);
  line-height: 1.15;
  text-shadow: var(--tone-ink-shadow);
  /* 最长的一课标题两行内收住，不把播放键挤出画面 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.vp-cover__sub {
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  opacity: 0.9;
  text-shadow: var(--tone-ink-shadow);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
/* 主播放键：宽胶囊（图标 + 「播放」），比裸三角更好认，也更好按 */
.vp-cover__play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: calc(var(--tap-min) + 40px);
  height: calc(var(--tap-min) + 8px);
  margin-top: var(--gap-s);
  padding: 0 var(--gap-m);
  border-radius: var(--radius-pill);
  background: var(--brand-grad);
  box-shadow: var(--shadow-chip);
  font-size: var(--fs-body);
  font-weight: var(--fw-strong);
  color: var(--on-tone);
}
/* 手机矮横屏（≤480 高）：舞台只剩 ~90px，左图右文的信息组装不下——
 * 降级为「封面铺满 + 一枚居中播放胶囊」；课程图由 video 的 poster 铺满（contain），
 * 标题交给页头（磨耳朵页头本来就有课程名，唱歌页同理）。
 * 注意 play 键是 __text 的子元素：只藏标题/中文，__text 保留为透明容器。 */
@media (max-height: 480px) {
  .vp-cover {
    display: block;
    padding: 0;
  }
  .vp-cover__art,
  .vp-cover__title,
  .vp-cover__sub {
    display: none;
  }
  .vp-cover__text {
    display: contents;
  }
  .vp-cover__play {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    margin-top: 0;
    min-width: calc(var(--tap-min) + 24px);
    height: var(--tap-min);
  }
}
/* 缓冲转圈：不挡点击（点画面仍可暂停），只在画面上冒出来 */
.vp-busy {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.vp-busy__ring {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 4px solid var(--mask-control);
  border-top-color: var(--brand);
  animation: vp-spin 0.9s linear infinite;
}
/* 失败兜底：整个覆盖层就是重试键（黑底大字，孩子不用理解"刷新"） */
.vp-error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--gap-xs);
  border: 0;
  border-radius: 0;
  background: var(--black);
  color: var(--mask-ink);
  padding: var(--gap-m);
}
.vp-error__emoji {
  font-size: clamp(44px, 12vw, 72px);
  line-height: 1;
}
.vp-error__title {
  font-size: var(--fs-title);
  font-weight: var(--fw-strong);
}
.vp-error__sub {
  margin-top: var(--gap-xs);
  padding: 8px var(--gap-m);
  border-radius: var(--radius-pill);
  background: var(--brand-grad);
  color: var(--on-tone);
  font-size: var(--fs-body);
  font-weight: var(--fw-strong);
  box-shadow: var(--shadow-chip);
}
/* 控制区：深色圆角卡，常驻在画面下方——不遮画面，按钮也不用跟亮的画面抢对比度 */
.vp-ui {
  display: flex;
  flex-direction: column;
  gap: var(--gap-xs);
  width: 100%;
  margin-top: var(--gap-s);
  padding: var(--gap-s) var(--gap-m);
  border-radius: var(--radius-s);
  background: var(--mask-bg);
}
/* 手机矮横屏（≤480 高）：两行控制条（进度行 + transport 行 ≈122px）会把画面
 * 整个挤没（stage 被 flex 压到 0，实测 844×390 画面消失）。横屏的行业标准
 * 是单行播放器：进度+时间+全部键合并一行，控制区 ~48px，画面保得住。
 * display:contents 把嵌套结构打散重排为平铺一行，DOM 与竖屏完全一致。 */
@media (max-height: 480px) {
  .vp-ui {
    flex-direction: row;
    align-items: center;
    gap: var(--gap-s);
    padding: var(--gap-xs) var(--gap-m);
  }
  .vp-seek,
  .vp-controls,
  .vp-transport,
  .vp-tools {
    display: contents;
  }
  .vp-time {
    min-width: 2.5em;
    font-size: var(--fs-small);
  }
  /* 嵌入磨耳朵页：页头+tabs+底导航吃掉 ~210px，常规「画面+控制条」两块竖排
   * 怎么排都会把画面挤没（flex 收缩实测把 stage 压到 31px）。矮横屏复用真全屏
   * 的浮层形态：画面拿满内容区，单行控制条浮在画面底部（深底白字不遮主体）。
   * 仅对 embedded 生效——唱歌页的容器高度不受 flex 约束，走默认布局。 */
  .vp--embedded .vp-body {
    position: relative;
    height: 100%;
  }
  .vp--embedded .vp-stage {
    flex: 1 1 0;
    max-height: none;
    min-height: 120px;
  }
  .vp--embedded .vp-ui {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    margin-top: 0;
    border-radius: 0 0 var(--radius-s) var(--radius-s);
    padding: var(--gap-xs) var(--gap-m);
  }
  /* 矮舞台的失败兜底：竖排三行装不下（实测被裁掉下半截）——行内化成
     「🐻 视频走丢了 [点一下，再试一次]」一行，整体仍居中 */
  .vp-error {
    flex-direction: row;
    gap: var(--gap-s);
  }
  .vp-error__emoji {
    font-size: 30px;
  }
  .vp-error__title {
    font-size: var(--fs-body);
  }
  .vp-error__sub {
    margin-top: 0;
    padding: 6px var(--gap-m);
  }
}
.vp-seek {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
}
.vp-time {
  font-size: var(--fs-small);
  font-variant-numeric: tabular-nums;
  color: var(--mask-ink);
  min-width: 3em;
  text-align: center;
}
/* 进度条：显式轨道 + 大拇指（与音频播放页同一套滑块语言） */
.vp-range {
  flex: 1;
  height: var(--slider-thumb);
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  cursor: pointer;
}
.vp-range::-webkit-slider-runnable-track {
  height: var(--gap-xs);
  border-radius: var(--radius-pill);
  background: linear-gradient(90deg, var(--brand) 0 var(--p), var(--mask-control) var(--p) 100%);
}
.vp-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: var(--slider-thumb);
  height: var(--slider-thumb);
  margin-top: calc((var(--gap-xs) - var(--slider-thumb)) / 2);
  border: 3px solid var(--black);
  border-radius: var(--radius-pill);
  background: var(--brand);
  box-shadow: var(--shadow-soft);
}
.vp-range::-moz-range-track {
  height: var(--gap-xs);
  border-radius: var(--radius-pill);
  background: var(--mask-control);
}
.vp-range::-moz-range-progress {
  height: var(--gap-xs);
  border-radius: var(--radius-pill);
  background: var(--brand);
}
.vp-range::-moz-range-thumb {
  width: var(--slider-thumb);
  height: var(--slider-thumb);
  border: 3px solid var(--black);
  border-radius: var(--radius-pill);
  background: var(--brand);
}
/* 主控制居中；次级键靠右、无底色，只在需要时出现（不跟主键抢视线） */
.vp-controls {
  /* 三列网格：主控键落在正中，次级键贴右——加不加次级键都不会把主键挤偏 */
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--gap-xs);
}
.vp-transport {
  grid-column: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--gap-xs);
}
.vp-tools {
  grid-column: 3;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--gap-xs);
}
.vp-btn {
  width: var(--tap-min);
  height: var(--tap-min);
  font-size: var(--fs-title);
  background: var(--mask-control);
  color: var(--mask-ink);
}
.vp-tool {
  width: var(--tap-min);
  height: var(--tap-min);
  font-size: var(--fs-title);
  background: transparent;
  color: var(--mask-ink-soft);
}
.vp-main {
  width: calc(var(--tap-min) + 8px);
  height: calc(var(--tap-min) + 8px);
  font-size: calc(var(--fs-title) + 4px);
  background: var(--brand);
  color: var(--on-tone);
}
@keyframes vp-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .vp-busy__ring {
    animation: none;
  }
}
</style>
