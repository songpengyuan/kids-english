<script setup lang="ts">
/**
 * 歌曲详情页（/listen/song/:id）：全屏歌词 + 播放控制
 */
import { ref, computed, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { lessons, asset } from "../../data/lessons";
import AppHeader from "../../components/layout/AppHeader.vue";
import { Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Shuffle } from "@lucide/vue";

const route = useRoute();
const router = useRouter();
const songId = route.params.id as string;

const lesson = lessons.find((l) => l.id === songId);
if (!lesson) router.replace("/listen");

const audio = ref<HTMLAudioElement | null>(null);
const playing = ref(false);
const progress = ref(0);
const repeatMode = ref<"off" | "all" | "one">("off");
const shuffleOn = ref(false);

// Build playlist from all songs with audio
const playlist = lessons.filter((l) => l.song.audio);
const curIdx = playlist.findIndex((l) => l.id === songId);

const lyrics = computed(() => lesson?.song?.lyrics ?? []);

function ensureAudio() {
  if (!audio.value) {
    audio.value = new Audio();
    audio.value.addEventListener("timeupdate", () => {
      if (audio.value?.duration) progress.value = audio.value.currentTime / audio.value.duration;
    });
    audio.value.addEventListener("ended", next);
    audio.value.src = asset(lesson!.song.audio)!;
    audio.value.play();
    playing.value = true;
  }
  return audio.value;
}

function togglePlay() {
  const a = ensureAudio();
  if (playing.value) { a.pause(); playing.value = false; }
  else { a.play(); playing.value = true; }
}

function playAt(idx: number) {
  const s = playlist[idx];
  if (!s) return;
  router.replace(`/listen/song/${s.id}`);
  if (audio.value) {
    audio.value.src = asset(s.song.audio)!;
    audio.value.play();
  }
}

function next() {
  if (repeatMode.value === "one" && audio.value) { audio.value.currentTime = 0; audio.value.play(); return; }
  if (curIdx < playlist.length - 1) playAt(curIdx + 1);
  else if (repeatMode.value === "all") playAt(0);
}
function prev() {
  if (audio.value && audio.value.currentTime > 3) { audio.value.currentTime = 0; return; }
  if (curIdx > 0) playAt(curIdx - 1);
}
function toggleRepeat() {
  repeatMode.value = repeatMode.value === "off" ? "all" : repeatMode.value === "all" ? "one" : "off";
}
function seek(e: Event) {
  if (audio.value) audio.value.currentTime = (Number((e.target as HTMLInputElement).value) / 100) * (audio.value.duration || 0);
}

onBeforeUnmount(() => audio.value?.pause());
</script>

<template>
  <div v-if="lesson" class="song-detail">
    <AppHeader :title="lesson.title" icon="game" show-back hide-badges />
    <div class="sd-body">
      <div class="sd-album" :class="'tone-' + (lesson.tone ?? 'blue')">{{ lesson.emoji }}</div>
      <h1 class="sd-title">{{ lesson.title }}</h1>
      <p class="sd-sub">{{ lesson.titleZh }}</p>

      <div class="sd-lyrics">
        <p v-for="(line, i) in lyrics" :key="i" class="sd-line" :class="{ active: Math.round(progress * lyrics.length) === i }">{{ line }}</p>
      </div>

      <div class="sd-controls">
        <button class="sd-btn" :class="{ active: shuffleOn }" @click="shuffleOn = !shuffleOn"><Shuffle class="k-ico" /></button>
        <button class="sd-btn" @click="prev"><SkipBack class="k-ico" /></button>
        <button class="sd-btn big" @click="togglePlay">
          <Pause v-if="playing" class="k-ico" /><Play v-else class="k-ico" />
        </button>
        <button class="sd-btn" @click="next"><SkipForward class="k-ico" /></button>
        <button class="sd-btn" :class="{ active: repeatMode !== 'off' }" @click="toggleRepeat">
          <Repeat1 v-if="repeatMode === 'one'" class="k-ico" /><Repeat v-else class="k-ico" />
        </button>
      </div>
      <input class="sd-progress" type="range" :value="Math.round(progress * 100)" @input="seek" min="0" max="100" />
    </div>
  </div>
</template>

<style scoped>
.song-detail { display: flex; flex-direction: column; min-height: 100dvh; background: linear-gradient(180deg, #1e293b, #0f172a); }
.sd-body { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 16px 24px 30px; }
.sd-album { width: 180px; height: 180px; border-radius: 24px; display: flex; align-items: center; justify-content: center; font-size: 96px; margin-top: 10px; box-shadow: 0 12px 40px rgba(0,0,0,0.4); }
.sd-title { margin: 20px 0 4px; color: #fff; font-weight: 900; font-size: 22px; text-align: center; }
.sd-sub { margin: 0; color: rgba(255,255,255,0.5); font-weight: 700; font-size: 14px; }
.sd-lyrics { flex: 1; overflow-y: auto; width: 100%; max-width: 400px; margin-top: 20px; text-align: center; -webkit-overflow-scrolling: touch; }
.sd-line { color: rgba(255,255,255,0.35); font-weight: 700; font-size: 16px; line-height: 2; transition: all 0.3s; }
.sd-line.active { color: #fff; font-size: 18px; }
.sd-controls { display: flex; align-items: center; gap: 16px; margin: 16px 0; }
.sd-btn { width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.7); }
.sd-btn.big { width: 60px; height: 60px; background: #fff; color: #1e293b; }
.sd-btn.active { color: #4ade80; }
.sd-btn .k-ico { width: 22px; height: 22px; }
.sd-btn.big .k-ico { width: 26px; height: 26px; }
.sd-progress { width: 100%; max-width: 400px; accent-color: #4ade80; }
.tone-blue { background: #3b82f6; } .tone-green { background: #10b981; } .tone-orange { background: #f97316; }
.tone-purple { background: #8b5cf6; } .tone-pink { background: #ec4899; } .tone-teal { background: #14b8a6; }
</style>
