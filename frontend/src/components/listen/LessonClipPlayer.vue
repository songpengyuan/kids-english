<script setup lang="ts">
/**
 * 磨耳朵「词句」播放器 —— 按一课顺序播单词 + 亲子口语句子。
 *
 * 素材：复用 lessons.ts normalize 出来的单词 / 口语句 mp3（/lessons/<id>/audio/...），
 * 不另生成音频；文件缺失或播放失败时才回退 TTS。
 * 播完一句留 0.9s 空拍再自动下一句，整课循环，适合孩子跟读。
 * 播放期间按墙钟结算磨耳朵时长，和歌曲播放器同一口径。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ChevronDown, MessageCircle, Pause, Play, SkipBack, SkipForward } from "@lucide/vue";
import { useProgressStore } from "../../stores/progress";
import { usePlayerStore } from "../../stores/player";
import { speakText } from "../../services/speech";
import { hapticTap } from "../../services/haptics";
import type { Lesson } from "../../data/lessons";
import EmojiTile from "../ui/EmojiTile.vue";
import SpeakWave from "../ui/SpeakWave.vue";

interface Clip {
  id: string;
  kind: "word" | "phrase";
  en: string;
  zh: string;
  src: string;
  /** 单词用已有词图；口语句子没有图，用对话气泡占位 */
  image?: string;
}

const props = defineProps<{ lesson: Lesson }>();
const emit = defineEmits<{ close: [] }>();

const progressStore = useProgressStore();
const player = usePlayerStore();

/** 先单词后亲子口语：孩子先听清单词，再听整句 */
const clips = computed<Clip[]>(() => {
  const words: Clip[] = props.lesson.words.map((w) => ({
    id: `w-${w.id}`,
    kind: "word",
    en: w.en,
    zh: w.zh,
    src: w.audio || "",
    image: w.image || undefined,
  }));
  const phrases: Clip[] = props.lesson.phrases.map((p, i) => ({
    id: `p-${i}`,
    kind: "phrase",
    en: p.en,
    zh: p.zh,
    src: p.audio || "",
  }));
  return [...words, ...phrases];
});

const total = computed(() => clips.value.length);
const idx = ref(0);
const playing = ref(false);
const current = computed<Clip | null>(() => clips.value[idx.value] ?? null);
const wordCount = computed(() => props.lesson.words.length);
const phraseCount = computed(() => props.lesson.phrases.length);
const kindLabel = computed(() => (current.value?.kind === "word" ? "单词" : "亲子口语"));

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
    go((idx.value + 1) % Math.max(1, total.value));
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
  go((idx.value + 1) % Math.max(1, total.value));
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
  // 进本播放器先把全局歌曲停住
  if (player.playing) player.togglePlay();
  void go(0);
});

onBeforeUnmount(() => {
  playToken++;
  pauseCurrent();
  clearAdvance();
});
</script>

<template>
  <div class="clip-player">
    <div class="cp-bar">
      <button class="cp-chip round" aria-label="收起词句播放" @click="close">
        <ChevronDown class="k-ico" />
      </button>
      <div class="cp-song">
        <span class="cp-cover"><EmojiTile :emoji="lesson.emoji" :tone="lesson.tone" size="md" /></span>
        <div class="cp-song-text">
          <p class="cp-title">{{ lesson.title }}</p>
          <p class="cp-sub">{{ wordCount }} 个单词 · {{ phraseCount }} 句亲子口语</p>
        </div>
      </div>
      <span class="cp-count">{{ idx + 1 }} / {{ total }}</span>
    </div>

    <div class="cp-card" :class="'tone-' + lesson.tone">
      <div class="cp-kind-row">
        <span class="cp-kind">{{ kindLabel }}</span>
        <SpeakWave v-if="playing" size="sm" tone="var(--brand)" />
      </div>
      <img v-if="current?.image" class="cp-img" :src="current.image" alt="" />
      <div v-else class="cp-bubble" aria-hidden="true">
        <MessageCircle class="cp-bubble__ico" />
      </div>
      <p class="cp-en">{{ current?.en }}</p>
      <p class="cp-zh">{{ current?.zh }}</p>
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

    <p class="cp-hint">听完自动下一句，整课循环 · 跟着大声读</p>
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
/* 当前句卡：大英文做主视觉，中文只做释义 */
.cp-card {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: var(--gap-s);
  padding: var(--gap-m) var(--gap-l);
  overflow-y: auto;
  border-radius: var(--radius);
  background: var(--card-bg);
  box-shadow: var(--shadow-hard);
  text-align: center;
}
.cp-kind-row {
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
/* 单词用词图（已有素材），句子用对话气泡，避免大卡片里只剩一行字 */
.cp-img {
  width: clamp(96px, 26vw, 128px);
  height: clamp(96px, 26vw, 128px);
  object-fit: contain;
  align-self: center;
}
.cp-bubble {
  width: clamp(96px, 26vw, 128px);
  height: clamp(96px, 26vw, 128px);
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  border-radius: 50%;
  background: var(--brand-soft);
}
.cp-bubble__ico {
  width: 54%;
  height: 54%;
  color: var(--brand);
}
.cp-en {
  margin: 0;
  max-width: 100%;
  color: var(--ink);
  font-size: clamp(30px, 8.8vw, 46px);
  font-weight: var(--fw-strong);
  line-height: 1.15;
  overflow-wrap: anywhere;
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
.cp-hint {
  margin: 0;
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
  .cp-en { font-size: clamp(36px, 6vw, 56px); }
}
@media (max-height: 480px) {
  .clip-player { gap: var(--gap-xs); }
  .cp-card { gap: var(--gap-xs); padding: var(--gap-s) var(--gap-m); }
  .cp-img, .cp-bubble { width: 64px; height: 64px; }
  .cp-sub, .cp-hint { display: none; }
  .cp-en { font-size: clamp(24px, 4vw, 34px); }
}
</style>
