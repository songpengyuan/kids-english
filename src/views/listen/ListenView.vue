<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from "vue";
import { lessons, asset } from "../../data/lessons";
import AppHeader from "../../components/layout/AppHeader.vue";
import { useProgressStore } from "../../stores/progress";
import { Play, Pause, SkipBack, SkipForward, Music, Video, X, ChevronDown } from "@lucide/vue";

type SubTab = "songs" | "videos";
const subTab = ref<SubTab>("songs");
const nowPlaying = ref(false); // 是否展开歌词页

const songList = computed(() =>
  lessons.filter((l) => l.song.audio).map((l) => ({
    id: l.id, title: l.title, titleZh: l.titleZh, emoji: l.emoji,
    tone: l.tone ?? "blue", src: asset(l.song.audio)!,
  }))
);
const videoList = computed(() =>
  lessons.filter((l) => l.song.video).map((l) => ({
    id: l.id, title: l.title, titleZh: l.titleZh, emoji: l.emoji,
    tone: l.tone ?? "blue", src: asset(l.song.video)!,
  }))
);

const audio = ref<HTMLAudioElement | null>(null);
const currentIdx = ref(-1);
const playing = ref(false);
const progress = ref(0);
const currentSong = computed(() => currentIdx.value >= 0 ? songList.value[currentIdx.value] : null);

const currentLyrics = computed(() => {
  if (!currentSong.value) return [];
  const lesson = lessons.find((l) => l.id === currentSong.value!.id);
  return lesson?.song?.lyrics ?? [];
});

function ensureAudio() {
  if (!audio.value) {
    audio.value = new Audio();
    audio.value.addEventListener("timeupdate", () => {
      if (audio.value?.duration) progress.value = audio.value.currentTime / audio.value.duration;
    });
    audio.value.addEventListener("ended", next);
  }
  return audio.value;
}
function playSong(idx: number) {
  const a = ensureAudio(); const s = songList.value[idx]; if (!s) return;
  if (currentIdx.value === idx) { togglePlay(); return; }
  currentIdx.value = idx; a.src = s.src; a.play(); playing.value = true;
  nowPlaying.value = true; startListenTimer();
}
function togglePlay() {
  const a = ensureAudio(); if (!a.src) return;
  if (playing.value) { a.pause(); playing.value = false; } else { a.play(); playing.value = true; }
}
function next() {
  if (currentIdx.value < songList.value.length - 1) playSong(currentIdx.value + 1);
  else playing.value = false;
}
function prev() {
  if (audio.value && audio.value.currentTime > 3) { audio.value.currentTime = 0; return; }
  if (currentIdx.value > 0) playSong(currentIdx.value - 1);
}
function seek(e: Event) {
  if (audio.value) audio.value.currentTime = (Number((e.target as HTMLInputElement).value) / 100) * (audio.value.duration || 0);
}
onBeforeUnmount(() => { audio.value?.pause(); stopListenTimer(); });

const progStore = useProgressStore();
let listenTimer: number | null = null;
let lastTick = 0;
function startListenTimer() {
  stopListenTimer();
  lastTick = Date.now();
  listenTimer = window.setInterval(() => {
    const now = Date.now();
    const sec = (now - lastTick) / 1000;
    lastTick = now;
    progStore.addDailyActivity(sec);
  }, 5000);
}
function stopListenTimer() {
  if (listenTimer) { clearInterval(listenTimer); listenTimer = null; }
}

const playingVideo = ref<{ src: string; titleZh: string; title: string } | null>(null);
function playVideo(v: { src: string; titleZh: string; title: string }) { playingVideo.value = v; startListenTimer(); }
</script>

<template>
  <div class="listen view">
    <!-- ===== 歌词全屏页 ===== -->
    <div v-if="nowPlaying && currentSong" class="lyrics-page">
      <div class="lp-top">
        <button class="lp-collapse" @click="nowPlaying = false">
          <ChevronDown class="k-ico" />
        </button>
        <div class="lp-title-area">
          <p class="lp-title">{{ currentSong.title }}</p>
          <p class="lp-sub">{{ currentSong.titleZh }}</p>
        </div>
      </div>
      <div class="lp-lyrics">
        <p v-for="(line, i) in currentLyrics" :key="i" class="lp-line" :class="{ active: Math.round(progress * currentLyrics.length) === i }">{{ line }}</p>
        <p v-if="currentLyrics.length === 0" class="lp-line">🎵</p>
      </div>
      <div class="lp-controls">
        <button class="lp-btn" @click="prev"><SkipBack class="k-ico" /></button>
        <button class="lp-btn big" @click="togglePlay">
          <Pause v-if="playing" class="k-ico" /><Play v-else class="k-ico" />
        </button>
        <button class="lp-btn" @click="next"><SkipForward class="k-ico" /></button>
      </div>
      <input class="lp-progress" type="range" :value="Math.round(progress * 100)" @input="seek" min="0" max="100" />
    </div>

    <!-- ===== 列表页 ===== -->
    <template v-else>
      <AppHeader title="磨耳朵" icon="game" hide-badges />
      <div class="today-chip">今天磨了 <b>{{ Math.floor(progStore.todayStats.durationSec / 60) }}</b> 分钟</div>
      <div class="sub-tabs">
        <button :class="{ on: subTab === 'songs' }" @click="subTab = 'songs'"><Music class="k-ico" /> 歌曲</button>
        <button :class="{ on: subTab === 'videos' }" @click="subTab = 'videos'"><Video class="k-ico" /> 视频</button>
      </div>
      <div class="body view-body">
        <template v-if="subTab === 'songs'">
          <div class="song-list">
            <button v-for="(s, i) in songList" :key="s.id" class="song-row"
              :class="{ active: currentIdx === i }" @click="playSong(i)">
              <span class="sr-emoji tone-ico" :class="'tone-' + s.tone">{{ s.emoji }}</span>
              <span class="sr-info">
                <span class="sr-title">{{ s.title }}</span>
                <span class="sr-sub">{{ s.titleZh }}</span>
              </span>
              <span v-if="currentIdx === i && playing" class="eq"><i></i><i></i><i></i></span>
              <span v-else class="sr-play"><Play class="k-ico" /></span>
            </button>
          </div>
        </template>
        <template v-else>
          <div class="video-grid">
            <button v-for="v in videoList" :key="v.id" class="video-card" :class="'tone-' + v.tone" @click="playVideo(v)">
              <span class="vc-emoji">{{ v.emoji }}</span>
              <span class="vc-name">{{ v.title }}</span>
              <span class="vc-sub">{{ v.titleZh }}</span>
              <span class="vc-play"><Play class="k-ico" /></span>
            </button>
          </div>
        </template>
      </div>

      <!-- 迷你播放器（列表页底部） -->
      <div v-if="currentSong" class="mini-player" @click="nowPlaying = true">
        <div class="mp-album tone-ico" :class="'tone-' + currentSong.tone">{{ currentSong.emoji }}</div>
        <div class="mp-info">
          <p class="mp-title">{{ currentSong.title }}</p>
          <p class="mp-sub">{{ currentSong.titleZh }}</p>
        </div>
        <button class="mp-btn" @click.stop="togglePlay">
          <Pause v-if="playing" class="k-ico" /><Play v-else class="k-ico" />
        </button>
      </div>
    </template>

    <!-- 视频播放 -->
    <div v-if="playingVideo" class="video-mask" @click.self="playingVideo = null">
      <button class="video-close" @click="playingVideo = null"><X class="k-ico" /></button>
      <video :src="playingVideo.src" controls autoplay playsinline class="video-player" />
      <p class="video-caption">{{ playingVideo.titleZh }} · {{ playingVideo.title }}</p>
    </div>
  </div>
</template>

<style scoped>
.body { display: flex; flex-direction: column; width: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: calc(80px + var(--pad-y)); }
.today-chip { text-align: center; font-weight: 800; font-size: 13px; color: var(--ink-soft); margin-top: 6px; }
.today-chip b { color: var(--green); font-size: 16px; }
.sub-tabs { display: flex; gap: var(--gap-s); padding: 0 var(--pad-x); margin-top: var(--gap-s); }
.sub-tabs button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 0; border-radius: var(--radius-pill); background: var(--card-bg); box-shadow: var(--shadow-hard); font-weight: 800; font-size: var(--fs-small); color: var(--ink-faint); transition: all 0.2s; }
.sub-tabs button.on { background: var(--yellow); color: var(--ink); }
.sub-tabs .k-ico { width: 18px; height: 18px; }
.song-list { display: flex; flex-direction: column; gap: var(--gap-s); padding: var(--gap-s) var(--pad-x) 0; }
.song-row { display: flex; align-items: center; gap: var(--gap-m); background: var(--card-bg); border-radius: var(--radius); box-shadow: var(--shadow-hard); padding: var(--gap-s) var(--gap-m); text-align: left; transition: transform 0.08s; }
.song-row:active { transform: scale(0.98); }
.song-row.active { box-shadow: var(--shadow-hard), inset 0 0 0 2px var(--yellow); }
.sr-emoji { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 28px; flex: none; }
.sr-info { flex: 1; min-width: 0; }
.sr-title { display: block; font-weight: 800; font-size: var(--fs-body); }
.sr-sub { display: block; font-size: 12px; color: var(--ink-faint); font-weight: 700; }
.sr-play { color: var(--ink-faint); }
.sr-play .k-ico { width: 22px; height: 22px; }
.eq { display: flex; gap: 2px; align-items: flex-end; height: 18px; }
.eq i { width: 3px; background: var(--green); border-radius: 2px; animation: eq 0.8s ease-in-out infinite; }
.eq i:nth-child(1) { height: 10px; animation-delay: 0s; }
.eq i:nth-child(2) { height: 16px; animation-delay: 0.2s; }
.eq i:nth-child(3) { height: 7px; animation-delay: 0.4s; }
@keyframes eq { 0%,100% { transform: scaleY(0.5); } 50% { transform: scaleY(1.2); } }

/* 迷你播放器 */
.mini-player { position: fixed; bottom: calc(64px + env(safe-area-inset-bottom)); left: 0; right: 0; max-width: 480px; margin-inline: var(--pad-x); z-index: 35; background: var(--card-bg); border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.18); padding: 10px 14px; display: flex; align-items: center; gap: 10px; }
.mp-album { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 26px; flex: none; }
.mp-info { flex: 1; min-width: 0; }
.mp-title { margin: 0; font-weight: 800; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mp-sub { margin: 1px 0 0; font-size: 11px; color: var(--ink-faint); font-weight: 700; }
.mp-btn { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--green); color: #fff; flex: none; }
.mp-btn .k-ico { width: 20px; height: 20px; }

/* 歌词全屏页 */
.lyrics-page { position: fixed; inset: 0; z-index: 90; background: linear-gradient(180deg, #1e293b, #0f172a); display: flex; flex-direction: column; padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom); }
.lp-top { display: flex; align-items: center; gap: 8px; padding: 12px 16px; }
.lp-collapse { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.8); }
.lp-collapse .k-ico { width: 26px; height: 26px; }
.lp-title-area { flex: 1; text-align: center; }
.lp-title { margin: 0; color: #fff; font-weight: 900; font-size: 18px; }
.lp-sub { margin: 2px 0 0; color: rgba(255,255,255,0.5); font-weight: 700; font-size: 13px; }
.lp-lyrics { flex: 1; overflow-y: auto; padding: 20px 32px; text-align: left; -webkit-overflow-scrolling: touch; }
.lp-line { color: rgba(255,255,255,0.3); font-weight: 700; font-size: 17px; line-height: 2.2; transition: all 0.3s; }
.lp-line.active { color: #fff; font-size: 19px; font-weight: 900; }
.lp-controls { display: flex; align-items: center; justify-content: center; gap: 40px; padding: 16px 0 8px; }
.lp-btn { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.8); }
.lp-btn.big { width: 64px; height: 64px; background: #fff; color: #1e293b; }
.lp-btn .k-ico { width: 26px; height: 26px; }
.lp-btn.big .k-ico { width: 30px; height: 30px; }
.lp-progress { width: 85%; max-width: 420px; margin: 0 auto 20px; accent-color: #4ade80; }

/* 视频 */
.video-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gap-s); padding: var(--gap-s) var(--pad-x) 0; }
.video-card { position: relative; border-radius: var(--radius); padding: var(--gap-m); display: flex; flex-direction: column; align-items: center; gap: 4px; box-shadow: var(--shadow-hard); min-height: 120px; transition: transform 0.08s; }
.video-card:active { transform: scale(0.96); }
.vc-emoji { font-size: 44px; }
.vc-name { font-weight: 900; font-size: var(--fs-body); }
.vc-sub { font-size: 11px; color: var(--ink-faint); font-weight: 700; }
.vc-play { position: absolute; bottom: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%; background: rgba(0,0,0,0.4); color: #fff; display: flex; align-items: center; justify-content: center; }
.vc-play .k-ico { width: 14px; height: 14px; }
.video-mask { position: fixed; inset: 0; z-index: 95; background: rgba(0,0,0,0.92); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--gap-s); }
.video-close { position: absolute; top: 14px; right: 14px; width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.2); color: #fff; display: flex; align-items: center; justify-content: center; }
.video-player { max-width: 95vw; max-height: 70vh; border-radius: 8px; }
.video-caption { color: #ccc; margin: 0; font-weight: 700; }
.tone-blue { background: #dbeafe; } .tone-green { background: #d1fae5; } .tone-orange { background: #fed7aa; }
.tone-purple { background: #e9d5ff; } .tone-pink { background: #fce7f3; } .tone-teal { background: #99f6e4; }
</style>
