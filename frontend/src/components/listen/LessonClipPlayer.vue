<script setup lang="ts">
/**
 * 磨耳朵「词句」播放器 —— 按顺序播各课的单词 + 亲子口语句子。
 *
 * 素材：复用 lessons.ts normalize 出来的单词 / 口语句 mp3（/lessons/<id>/audio/...），
 * 不另生成音频；文件缺失或播放失败时才回退 TTS。
 * 播完一句留 0.9s 空拍再自动下一句，循环范围是**全部课程**（2026-11-13 课程级口径：
 * 循环/上一句/下一句都在跨课流上转，页面页头靠 change 事件落到当前句所属课程），
 * 适合孩子跟读。
 * 播放期间按墙钟结算磨耳朵时长，和歌曲播放器同一口径。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ChevronDown, MessageCircle, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from "@lucide/vue";
import { useProgressStore } from "../../stores/progress";
import { usePlayerStore } from "../../stores/player";
import { speakText } from "../../services/speech";
import { hapticTap } from "../../services/haptics";
import type { Lesson } from "../../data/lessons";
import { phraseCoverUrl } from "../../utils/phraseCover";
import { useViewport } from "../../composables/useViewport";
import EmojiTile from "../ui/EmojiTile.vue";
import SpeakWave from "../ui/SpeakWave.vue";

interface Clip {
  id: string;
  kind: "word" | "phrase";
  en: string;
  zh: string;
  src: string;
  /** 这句/词属于哪一课：跨课推进时消费方靠它把页面落到对应课程 */
  lessonId: string;
  /** 单词用已有词图；口语句子优先复用句中的词图，提问/场景句用通用拟物图 */
  image?: string;
}

const props = defineProps<{ lessons: Lesson[]; startLessonId?: string; embedded?: boolean }>();
const emit = defineEmits<{ close: []; change: [lessonId: string] }>();

const progressStore = useProgressStore();
const player = usePlayerStore();
const { width, height } = useViewport();
/** 宽屏双栏只给真正有横向余量的视口：竖屏 600+，横屏 768+；低高度走横向压缩 */
const isWide = computed(
  () => height.value > 480 && width.value >= 600 && (width.value <= height.value || width.value >= 768),
);

/** 先单词后亲子口语，逐课衔接：l1 词→l1 句→l2 词→…整条跨课流 */
const clips = computed<Clip[]>(() =>
  props.lessons.flatMap((l) => {
    const words: Clip[] = l.words.map((w) => ({
      id: `w-${w.id}`,
      kind: "word",
      en: w.en,
      zh: w.zh,
      src: w.audio || "",
      lessonId: l.id,
      image: w.image || undefined,
    }));
    const phrases: Clip[] = l.phrases.map((p, i) => ({
      id: `p-${l.id}-${i}`,
      kind: "phrase",
      en: p.en,
      zh: p.zh,
      src: p.audio || "",
      lessonId: l.id,
      image: phraseCoverUrl(p.en, l.words) || undefined,
    }));
    return [...words, ...phrases];
  }),
);

const total = computed(() => clips.value.length);
const idx = ref(0);
const playing = ref(false);
const current = computed<Clip | null>(() => clips.value[idx.value] ?? null);
/** 当前句所属课程（页头/卡片底色跟着它走，跨课推进时逐句切换） */
const curLesson = computed<Lesson>(
  () => props.lessons.find((l) => l.id === current.value?.lessonId) ?? props.lessons[0],
);
const wordCount = computed(() => curLesson.value.words.length);
const phraseCount = computed(() => curLesson.value.phrases.length);
const kindLabel = computed(() => (current.value?.kind === "word" ? "单词" : "亲子口语"));
/** 长句降低字号，避免在右侧文字栏里被拆成过多短行 */
const longText = computed(() => (current.value?.en.length ?? 0) > 26);

/* ---------- 三档循环：与歌曲/视频播放器同一套交互（localStorage 记住选择） ---------- */
type ClipMode = "all" | "one" | "shuffle";
const MODE_KEY = "kc-clip-mode";
const MODE_META: Record<ClipMode, { label: string; icon: unknown }> = {
  all: { label: "整课循环", icon: Repeat },
  one: { label: "单句循环", icon: Repeat1 },
  shuffle: { label: "随机播放", icon: Shuffle },
};
function loadMode(): ClipMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === "one" || v === "shuffle" ? v : "all";
  } catch {
    return "all";
  }
}
const mode = ref<ClipMode>(loadMode());
const modeMeta = computed(() => MODE_META[mode.value]);
const hintText = computed(() => {
  if (mode.value === "one") return "听完重复本句 · 跟着大声读";
  if (mode.value === "shuffle") return "听完随机跳一句 · 跟着大声读";
  return "听完自动下一句，整课循环 · 跟着大声读";
});
function cycleMode() {
  hapticTap();
  mode.value = mode.value === "all" ? "one" : mode.value === "one" ? "shuffle" : "all";
  try {
    localStorage.setItem(MODE_KEY, mode.value);
  } catch {
    /* 隐私模式写不了就跳过 */
  }
}
/** manual=true 手动点下一句，单句循环也允许往下走；自动结束才按模式 */
function nextIndex(manual = false): number {
  const n = Math.max(1, total.value);
  if (!manual && mode.value === "one") return idx.value;
  if (mode.value === "shuffle" && n > 1) {
    let next = idx.value;
    while (next === idx.value) next = Math.floor(Math.random() * n);
    return next;
  }
  return (idx.value + 1) % n;
}

let audio: HTMLAudioElement | null = null;
let advanceTimer = 0;
let playToken = 0;
let segmentStart = 0;

function settleListenTime() {
  if (!segmentStart) return;
  const sec = Math.round((Date.now() - segmentStart) / 1000);
  segmentStart = 0;
  if (sec >= 1) progressStore.addListenActivity(sec);
}

function markPlaying() {
  playing.value = true;
  if (!segmentStart) segmentStart = Date.now();
}

function clearAdvance() {
  if (advanceTimer) {
    clearTimeout(advanceTimer);
    advanceTimer = 0;
  }
}

function stopAudio() {
  if (audio) {
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio = null;
  }
}

function pauseCurrent() {
  clearAdvance();
  stopAudio();
  playing.value = false;
  settleListenTime();
}

/** 播完一句：留一拍再进下一句，整课循环 */
function scheduleNext() {
  playing.value = false;
  settleListenTime();
  clearAdvance();
  advanceTimer = window.setTimeout(() => {
    go(nextIndex());
  }, 900);
}

async function fallbackSpeak(text: string, token: number) {
  await speakText(text, { ttsOnly: true, rate: 0.8, lang: "en-US" });
  if (token !== playToken) return;
  scheduleNext();
}

async function go(i: number) {
  const clip = clips.value[i];
  if (!clip) return;
  clearAdvance();
  stopAudio();
  idx.value = i;
  playing.value = false;
  // 换句唯一出入口：跨课推进时让页面落到这句所属的课程
  emit("change", clip.lessonId);

  const token = ++playToken;
  if (!clip.src) {
    markPlaying();
    await fallbackSpeak(clip.en, token);
    return;
  }

  const a = new Audio(clip.src);
  audio = a;
  a.onended = () => {
    if (token !== playToken) return;
    scheduleNext();
  };
  a.onerror = () => {
    if (token !== playToken) return;
    void fallbackSpeak(clip.en, token);
  };
  try {
    await a.play();
    if (token !== playToken) {
      a.pause();
      return;
    }
    markPlaying();
  } catch {
    // 浏览器拦自动播放（或资源暂不可用）：停在当前句，等孩子点主键
    if (token === playToken) playing.value = false;
  }
}

function toggle() {
  hapticTap();
  if (playing.value) {
    pauseCurrent();
    return;
  }
  if (audio && audio.src && audio.currentTime > 0) {
    void audio.play().then(() => markPlaying()).catch(() => (playing.value = false));
    return;
  }
  void go(idx.value);
}

function prev() {
  hapticTap();
  go((idx.value - 1 + total.value) % Math.max(1, total.value));
}

function next() {
  hapticTap();
  go(nextIndex(true));
}

function close() {
  playToken++;
  pauseCurrent();
  emit("close");
}

// 词句和歌曲共用耳朵：底栏若重新开歌，本播放器立刻让位
watch(() => player.playing, (on) => {
  if (on) pauseCurrent();
});

onMounted(() => {
  // 进本播放器先把全局歌曲停住；起点 = 指定课程的第一句（没指定就从流头开始）
  if (player.playing) player.togglePlay();
  const start = props.startLessonId
    ? clips.value.findIndex((c) => c.lessonId === props.startLessonId)
    : -1;
  void go(start >= 0 ? start : 0);
});

onBeforeUnmount(() => {
  playToken++;
  pauseCurrent();
  clearAdvance();
});
</script>

<template>
  <div class="clip-player" :class="{ 'clip-player--embedded': embedded }">
    <div v-if="!embedded" class="cp-bar">
      <button class="cp-chip round" aria-label="收起词句播放" @click="close">
        <ChevronDown class="k-ico" />
      </button>
      <div class="cp-song">
        <span class="cp-cover"><EmojiTile :emoji="curLesson.emoji" :tone="curLesson.tone" size="md" /></span>
        <div class="cp-song-text">
          <p class="cp-title">{{ curLesson.title }}</p>
          <p class="cp-sub">{{ wordCount }} 个单词 · {{ phraseCount }} 句亲子口语</p>
        </div>
      </div>
      <span class="cp-count">{{ idx + 1 }} / {{ total }}</span>
    </div>

    <div class="cp-card" :class="['tone-' + curLesson.tone, { 'is-wide': isWide }]">
      <div class="cp-kind-row">
        <span class="cp-kind">{{ kindLabel }}</span>
        <span v-if="embedded" class="cp-kind-count">{{ idx + 1 }} / {{ total }}</span>
        <SpeakWave v-if="playing" size="sm" tone="var(--brand)" />
      </div>
      <div class="cp-visual">
        <img v-if="current?.image" class="cp-img" :src="current.image" alt="" />
        <div v-else class="cp-bubble" aria-hidden="true">
          <MessageCircle class="cp-bubble__ico" />
        </div>
      </div>
      <div class="cp-copy">
        <p class="cp-en" :class="{ 'is-long': longText }">{{ current?.en }}</p>
        <p class="cp-zh">{{ current?.zh }}</p>
      </div>
    </div>

    <div class="cp-transport">
      <button class="cp-side round" aria-label="上一句" @click="prev">
        <SkipBack class="k-ico" />
      </button>
      <button class="cp-main round" :aria-label="playing ? '暂停' : '播放'" @click="toggle">
        <Pause v-if="playing" class="k-ico" /><Play v-else class="k-ico" />
      </button>
      <button class="cp-side round" aria-label="下一句" @click="next">
        <SkipForward class="k-ico" />
      </button>
    </div>

    <div class="cp-foot">
      <button class="cp-mode" :aria-label="`切换循环方式，当前${modeMeta.label}`" @click="cycleMode">
        <component :is="modeMeta.icon" class="k-ico" />
        <span>{{ modeMeta.label }}</span>
      </button>
      <p class="cp-hint">{{ hintText }}</p>
    </div>
  </div>
</template>

<style scoped>
/* 和歌曲播放页同一套浮层边界：底栏以上，底栏始终可点 */
.clip-player {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: calc(var(--nav-h) + env(safe-area-inset-bottom));
  z-index: var(--z-bar);
  display: flex;
  flex-direction: column;
  gap: var(--gap-m);
  padding:
    max(var(--gap-s), env(safe-area-inset-top))
    var(--pad-x)
    var(--gap-m);
  background: var(--bg);
}
/* 嵌入课程播放页：去掉自己的浮层头/背景/边界，模式与课程标题由外层共用页头承担 */
.clip-player--embedded {
  position: static;
  inset: auto;
  z-index: auto;
  height: 100%;
  min-height: 0;
  padding: 0;
  background: transparent;
}
/* PC/iPad 上内容不再拉满整屏，统一收在一个舒服的阅读宽度里 */
.cp-bar,
.cp-card,
.cp-transport,
.cp-foot {
  width: 100%;
  max-width: 1040px;
  margin-inline: auto;
}
.cp-bar {
  display: flex;
  align-items: center;
  gap: var(--gap-xs);
}
.cp-song {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--gap-xs);
}
/* 封面收进 40px 内，给下面的单词/句子让出整块高度 */
.cp-cover {
  display: inline-flex;
  flex: none;
}
.cp-cover :deep(.emoji-tile) {
  font-size: 22px;
  border-radius: var(--radius-s);
}
.cp-song-text {
  min-width: 0;
}
.cp-chip {
  width: 40px;
  height: 40px;
  background: var(--card-bg);
  color: var(--ink-soft);
  box-shadow: var(--shadow-soft);
  font-size: var(--fs-body);
}
.cp-count {
  flex: none;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  background: var(--brand-soft);
  color: var(--brand);
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
  font-variant-numeric: tabular-nums;
}
.cp-title {
  margin: 0;
  color: var(--ink);
  font-size: var(--fs-body);
  font-weight: var(--fw-strong);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cp-sub {
  margin: 2px 0 0;
  color: var(--ink-soft);
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 当前句卡：手机纵向（类型→图→文字），宽屏横向（图左、类型/文字右） */
.cp-card {
  flex: 1 1 0;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: auto auto auto;
  grid-template-areas:
    "kind"
    "visual"
    "copy";
  align-content: center;
  align-items: center;
  justify-items: center;
  gap: clamp(8px, 1.8vh, 18px);
  padding: clamp(14px, 2.4vh, 28px) clamp(16px, 3.4vw, 40px);
  overflow-y: auto;
  border-radius: var(--radius);
  background: var(--card-bg);
  box-shadow: var(--shadow-hard);
  text-align: center;
}
.cp-kind-row {
  grid-area: kind;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--gap-xs);
}
.cp-kind {
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--brand-soft);
  color: var(--brand);
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
}
.cp-kind-count {
  color: var(--ink-faint);
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  font-variant-numeric: tabular-nums;
}
/* 图区：手机约占屏宽一半，PC/iPad 用大图上墙，比旧版 96–128px 明显放大 */
.cp-visual {
  grid-area: visual;
  width: min(60vw, 38vh, 360px);
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;
}
.cp-img,
.cp-bubble {
  width: 100%;
  height: 100%;
}
.cp-img {
  object-fit: contain;
}
.cp-bubble {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--brand-soft);
}
.cp-bubble__ico {
  width: 54%;
  height: 54%;
  color: var(--brand);
}
.cp-copy {
  grid-area: copy;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-xs);
  min-width: 0;
}
.cp-en {
  margin: 0;
  max-width: 100%;
  color: var(--ink);
  font-size: clamp(34px, 5.2vw, 74px);
  font-weight: var(--fw-strong);
  line-height: 1.15;
  overflow-wrap: anywhere;
  text-wrap: balance;
}
.cp-en.is-long {
  font-size: clamp(21px, 3.2vw, 46px);
  line-height: 1.24;
}
.cp-zh {
  margin: 0;
  max-width: 100%;
  color: var(--ink-soft);
  font-size: var(--fs-body);
  font-weight: var(--fw-mid);
  line-height: 1.4;
}
.cp-transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--gap-m);
}
.cp-side {
  width: 44px;
  height: 44px;
  background: var(--card-bg);
  color: var(--ink-soft);
  box-shadow: var(--shadow-soft);
  font-size: var(--fs-body);
}
.cp-main {
  width: clamp(56px, 15vw, 64px);
  height: clamp(56px, 15vw, 64px);
  background: var(--brand);
  color: var(--on-tone);
  box-shadow: 0 var(--press) 0 var(--brand-dark), var(--shadow-soft);
  font-size: var(--fs-title);
}
.cp-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--gap-xs);
}
.cp-mode {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: var(--radius-pill);
  background: var(--card-bg);
  color: var(--ink-soft);
  box-shadow: var(--shadow-soft);
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
}
.cp-mode .k-ico {
  width: 1em;
  height: 1em;
}
.cp-hint {
  margin: 0;
  flex: 1;
  text-align: center;
  color: var(--ink-faint);
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
}
@media (min-width: 600px) {
  .cp-chip { width: var(--tap-min); height: var(--tap-min); font-size: var(--fs-title); }
  .cp-side { width: var(--tap-min); height: var(--tap-min); font-size: var(--fs-title); }
  .cp-main { width: var(--play-btn); height: var(--play-btn); font-size: var(--fs-hero); }
  .cp-cover :deep(.emoji-tile) { font-size: 26px; }
}
/* 宽屏：图左、文字右，图区跨两行；卡片最高 1040px，不再是一根窄条。
   isWide 由 useViewport 按设计系统档位算：竖屏 600+ / 横屏 768+，且高度够用。 */
.cp-card.is-wide {
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  grid-template-rows: auto 1fr;
  grid-template-areas:
    "visual kind"
    "visual copy";
  justify-items: stretch;
  gap: var(--gap-m) clamp(24px, 4vw, 56px);
  padding: clamp(24px, 3.4vh, 42px) clamp(28px, 4vw, 56px);
  text-align: left;
}
.cp-card.is-wide .cp-kind-row {
  justify-self: start;
  justify-content: flex-start;
  align-self: end;
}
.cp-card.is-wide .cp-visual {
  justify-self: center;
  width: min(34vw, 40vh, 380px);
}
.cp-card.is-wide .cp-copy {
  align-items: flex-start;
  align-self: center;
  justify-content: center;
}
.cp-card.is-wide .cp-en {
  font-size: clamp(36px, 4.4vw, 68px);
}
.cp-card.is-wide .cp-en.is-long {
  font-size: clamp(24px, 2.7vw, 44px);
}
.cp-card.is-wide .cp-zh {
  font-size: clamp(15px, 1.5vw, 20px);
}
/* 低高度（横屏手机 / 小窗）：先压间距，再把图文并成横向，别把图挤没 */
@media (max-height: 480px) {
  .clip-player { gap: var(--gap-xs); }
  .cp-card {
    grid-template-columns: 96px minmax(0, 1fr);
    grid-template-rows: auto 1fr;
    grid-template-areas:
      "visual kind"
      "visual copy";
    gap: var(--gap-xs) var(--gap-m);
    padding: var(--gap-s) var(--gap-m);
    text-align: left;
  }
  .cp-sub { display: none; }
  .cp-visual { width: 96px; }
  .cp-kind-row { justify-self: start; justify-content: flex-start; align-self: end; }
  .cp-copy { align-items: flex-start; align-self: center; }
  .cp-zh { font-size: var(--fs-small); }
  .cp-en { font-size: clamp(24px, 4vw, 34px); }
  .cp-en.is-long { font-size: clamp(18px, 2.8vw, 28px); }
}
</style>
