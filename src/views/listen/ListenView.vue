<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch } from "vue";
import { lessons, asset } from "../../data/lessons";
import AppHeader from "../../components/layout/AppHeader.vue";
import { useProgressStore } from "../../stores/progress";
import { Play, Pause, SkipBack, SkipForward, Music, Video, X, ChevronDown, Repeat, Repeat1, Shuffle, ListMusic } from "@lucide/vue";
import BaseDrawer from "../../components/ui/BaseDrawer.vue";
import SafeBottom from "../../components/layout/SafeBottom.vue";
import type { ListenSubTab, RepeatMode } from "../../types";

const subTab = ref<ListenSubTab>("songs");
const nowPlaying = ref(false);
const showPlaylist = ref(false);

const songList = computed(() =>
  lessons.filter((l) => l.song.audio && !["l6", "l7", "l8"].includes(l.id)).map((l) => ({
    id: l.id, title: l.title, titleZh: l.titleZh, emoji: l.emoji,
    tone: l.tone ?? "blue", src: asset(l.song.audio)!,
  }))
);
const videoList = computed(() =>
  lessons.filter((l) => l.song.video && !["l6", "l7", "l8"].includes(l.id)).map((l) => ({
    id: l.id, title: l.title, titleZh: l.titleZh, emoji: l.emoji,
    tone: l.tone ?? "blue", src: asset(l.song.video)!,
  }))
);

const audio = ref<HTMLAudioElement | null>(null);
const currentIdx = ref(-1);
const playing = ref(false);
const progress = ref(0);
const duration = ref(0);
const repeatMode = ref<RepeatMode>("all");
const shuffleOn = ref(false);
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
      if (audio.value?.duration) {
        progress.value = audio.value.currentTime / audio.value.duration;
        duration.value = audio.value.duration;
      }
    });
    audio.value.addEventListener("ended", next);
  }
  return audio.value;
}
function playSong(idx: number) {
  const a = ensureAudio(); const s = songList.value[idx]; if (!s) return;
  currentIdx.value = idx; a.src = s.src; a.play(); playing.value = true;
  nowPlaying.value = true; startListenTimer();
}
/** 点整行：进入歌词页（如果是当前曲就直接展开，不切歌） */
function enterLyrics(idx: number) {
  if (currentIdx.value === idx) { nowPlaying.value = true; return; }
  playSong(idx);
}
/** 点右侧按钮：只切播放/暂停，不进歌词页（列表内直接播放，标题旁声波 eq 显示当前曲） */
function toggleRow(i: number, e: Event) {
  e.stopPropagation();
  if (currentIdx.value !== i) {
    // 与 playSong 的区别：不设 nowPlaying，留在列表页；点整行 enterLyrics 才进歌词页
    const a = ensureAudio(); const s = songList.value[i]; if (!s) return;
    currentIdx.value = i; a.src = s.src; void a.play(); playing.value = true;
    startListenTimer();
    return;
  }
  togglePlay();
}
function togglePlay() {
  const a = ensureAudio(); if (!a.src) return;
  if (playing.value) { a.pause(); playing.value = false; } else { a.play(); playing.value = true; }
}
function next() {
  if (repeatMode.value === "one") {
    if (audio.value) { audio.value.currentTime = 0; audio.value.play(); }
    return;
  }
  if (shuffleOn.value && songList.value.length > 1) {
    let r; do { r = Math.floor(Math.random() * songList.value.length); } while (r === currentIdx.value);
    playSong(r); return;
  }
  if (currentIdx.value < songList.value.length - 1) playSong(currentIdx.value + 1);
  else if (repeatMode.value === "all") playSong(0);
  else playing.value = false;
}
function prev() {
  if (audio.value && audio.value.currentTime > 3) { audio.value.currentTime = 0; return; }
  if (currentIdx.value > 0) playSong(currentIdx.value - 1);
}
function toggleRepeat() {
  repeatMode.value = repeatMode.value === "off" ? "all" : repeatMode.value === "all" ? "one" : "off";
}
function formatTime(sec: number) {
  if (!sec || !isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function seek(e: Event) {
  const el = e.target as HTMLInputElement;
  if (audio.value && el) audio.value.currentTime = (Number(el.value) / 100) * (audio.value.duration || 0);
}
watch(nowPlaying, (v) => {
  document.documentElement.classList.toggle("hide-nav", v);
});
onBeforeUnmount(() => { audio.value?.pause(); stopListenTimer(); document.documentElement.classList.remove("hide-nav"); });

const progStore = useProgressStore();
let listenTimer: number | null = null;
let lastTick = 0;
function startListenTimer() {
  stopListenTimer(); lastTick = Date.now();
  listenTimer = window.setInterval(() => {
    const sec = (Date.now() - lastTick) / 1000; lastTick = Date.now();
    progStore.addDailyActivity(sec);
  }, 5000);
}
function stopListenTimer() { if (listenTimer) { clearInterval(listenTimer); listenTimer = null; } }

const playingVideo = ref<{ src: string; titleZh: string; title: string } | null>(null);
function playVideo(v: { src: string; titleZh: string; title: string }) { playingVideo.value = v; startListenTimer(); }
</script>

<template>
  <div class="listen view">
    <!-- ===== 歌词全屏页 ===== -->
    <div v-if="nowPlaying && currentSong" class="lyrics-page" :class="{ 'anim-in': nowPlaying }">
      <div class="lp-header">
        <button class="lp-back" @click="nowPlaying = false"><ChevronDown class="k-ico" /></button>
        <div class="lp-cover" :class="'tone-' + currentSong.tone">{{ currentSong.emoji }}</div>
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
        <button class="lp-btn" @click="toggleRepeat">
          <Repeat1 v-if="repeatMode === 'one'" class="k-ico" />
          <Repeat v-else-if="repeatMode === 'all'" class="k-ico" />
          <Shuffle v-else-if="shuffleOn" class="k-ico" />
          <Repeat v-else class="k-ico" style="opacity:0.4" />
        </button>
        <button class="lp-btn" @click="prev"><SkipBack class="k-ico" /></button>
        <button class="lp-btn big" @click="togglePlay"><Pause v-if="playing" class="k-ico" /><Play v-else class="k-ico" /></button>
        <button class="lp-btn" @click="next"><SkipForward class="k-ico" /></button>
        <button class="lp-btn" @click="showPlaylist = true"><ListMusic class="k-ico" /></button>
      </div>
      <SafeBottom class="lp-progress-row" :gap="20">
        <span class="lp-time">{{ formatTime(progress * duration) }}</span>
        <input class="lp-progress" type="range" :value="Math.round(progress * 100)" @input="seek" min="0" max="100" />
        <span class="lp-time">{{ formatTime(duration) }}</span>
      </SafeBottom>
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
            <div v-for="(s, i) in songList" :key="s.id" class="song-row"
              :class="{ active: currentIdx === i }" @click="enterLyrics(i)">
              <span class="sr-emoji" :class="'tone-' + s.tone">{{ s.emoji }}</span>
              <span class="sr-info">
                <span class="sr-title-row">
                  <span class="sr-title">{{ s.title }}</span>
                  <!-- 正在播放：标题旁动态声波（孩子一眼看出哪首在唱） -->
                  <span v-if="currentIdx === i && playing" class="eq" aria-hidden="true"><i></i><i></i><i></i></span>
                </span>
                <span class="sr-sub">{{ s.titleZh }}</span>
              </span>
              <button v-if="currentIdx === i" class="sr-play" @click="toggleRow(i, $event)">
                <Pause v-if="playing" class="k-ico" /><Play v-else class="k-ico" />
              </button>
              <span v-else class="sr-play"><Play class="k-ico" /></span>
            </div>
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
    </template>

    <!-- 播放列表抽屉 -->
    <BaseDrawer :open="showPlaylist" :title="`播放列表（${songList.length}）`" @close="showPlaylist = false">
      <div class="drawer-list">
        <button v-for="(s, i) in songList" :key="s.id" class="drawer-item"
          :class="{ active: currentIdx === i }" @click="playSong(i); showPlaylist = false">
          <span class="di-idx">{{ i + 1 }}</span>
          <span class="di-emoji">{{ s.emoji }}</span>
          <span class="di-info">
            <span class="di-title">{{ s.title }}</span>
            <span class="di-sub">{{ s.titleZh }}</span>
          </span>
          <span v-if="currentIdx === i && playing" class="eq"><i></i><i></i><i></i></span>
        </button>
      </div>
    </BaseDrawer>

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
.today-chip { text-align: center; font-weight: 800; font-size: var(--fs-small); color: var(--ink-soft); margin-top: 6px; }
.today-chip b { color: var(--green); font-size: var(--fs-body); }
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
.sr-title-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.sr-title { display: block; font-weight: 800; font-size: var(--fs-body); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sr-sub { display: block; font-size: var(--fs-small); color: var(--ink-faint); font-weight: 700; }
.sr-play { color: var(--ink-faint); }
.sr-play .k-ico { width: 22px; height: 22px; }
.eq { display: flex; gap: 2px; align-items: flex-end; height: 18px; }
.eq i { width: 3px; background: var(--green); border-radius: 2px; animation: eq 0.8s ease-in-out infinite; }
.eq i:nth-child(1) { height: 10px; animation-delay: 0s; }
.eq i:nth-child(2) { height: 16px; animation-delay: 0.2s; }
.eq i:nth-child(3) { height: 7px; animation-delay: 0.4s; }
@keyframes eq { 0%,100% { transform: scaleY(0.5); } 50% { transform: scaleY(1.2); } }

/* ===== 歌词全屏页 ===== */
.lyrics-page {
  position: fixed; inset: 0; z-index: 90;
  background: transparent;
  display: flex; flex-direction: column;
  padding: env(safe-area-inset-top) var(--pad-x) 0;
  gap: var(--gap-s);
}
.lp-header { display: flex; align-items: center; gap: var(--gap-m); padding: var(--gap-s) 0; }
.lp-back {
  width: var(--tap-min); height: var(--tap-min);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--ink-soft); background: transparent;
  flex: none;
}
.lp-back .k-ico { width: 28px; height: 28px; }
.lp-cover {
  width: 56px; height: 56px; border-radius: var(--radius-s);
  display: flex; align-items: center; justify-content: center;
  font-size: 32px; flex: none;
}
.lp-title-area { flex: 1; min-width: 0; }
.lp-title { margin: 0; color: var(--ink); font-weight: 900; font-size: var(--fs-title); }
.lp-sub { margin: 2px 0 0; color: var(--ink-soft); font-weight: 700; font-size: var(--fs-small); }
.lp-lyrics {
  flex: 1; overflow-y: auto;
  padding: var(--gap-l) var(--gap-m);
  background: var(--card-bg); border-radius: var(--radius); box-shadow: var(--shadow-hard);
  text-align: left; -webkit-overflow-scrolling: touch;
}
.lp-line { color: var(--ink-faint); font-weight: 700; font-size: var(--fs-body); line-height: 2.2; transition: all 0.3s; }
.lp-line.active { color: var(--ink); font-weight: 900; }
.lp-controls { display: flex; align-items: center; justify-content: center; gap: var(--gap-m); padding: var(--gap-s) 0; }
.lp-btn {
  width: var(--tap-min); height: var(--tap-min); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--ink-soft); background: var(--card-bg); box-shadow: var(--shadow-soft);
}
.lp-btn.big {
  width: calc(var(--tap-min) + 16px); height: calc(var(--tap-min) + 16px);
  background: var(--green); color: #fff;
  box-shadow: 0 var(--press) 0 var(--green-dark);
}
.lp-btn .k-ico { width: 26px; height: 26px; }
.lp-btn.big .k-ico { width: 30px; height: 30px; }
.lp-progress-row { display: flex; align-items: center; gap: var(--gap-s); padding-left: var(--pad-x); padding-right: var(--pad-x); /* 底部安全间距由 SafeBottom 统一提供 */ }
.lp-progress { flex: 1; accent-color: var(--yellow); height: 6px; }
.lp-time { font-size: 11px; font-weight: 700; color: var(--ink-faint); min-width: 36px; text-align: center; }

/* 播放列表抽屉内容 */
.drawer-list { padding: 8px 0; }
.drawer-item { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 20px; text-align: left; }
.drawer-item:active { background: var(--tint-green); }
.drawer-item.active .di-title { color: var(--green); }
.di-idx { width: 20px; text-align: center; color: var(--ink-faint); font-weight: 700; font-size: 13px; flex: none; }
.di-emoji { font-size: 24px; flex: none; }
.di-info { flex: 1; min-width: 0; }
.di-title { display: block; color: var(--ink); font-weight: 700; font-size: 15px; }
.di-sub { display: block; color: var(--ink-faint); font-size: 12px; }

/* 视频 */
.video-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gap-s); padding: var(--gap-s) var(--pad-x) 0; }
.video-card { position: relative; border-radius: var(--radius); padding: var(--gap-m); display: flex; flex-direction: column; align-items: center; gap: 4px; box-shadow: var(--shadow-hard); min-height: 120px; transition: transform 0.08s; }
.video-card:active { transform: scale(0.96); }
.vc-emoji { font-size: 44px; }
.vc-name { font-weight: 900; font-size: var(--fs-body); }
.vc-sub { font-size: var(--fs-small); color: var(--ink-faint); font-weight: 700; }
.vc-play { position: absolute; bottom: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%; background: rgba(0,0,0,0.4); color: #fff; display: flex; align-items: center; justify-content: center; }
.vc-play .k-ico { width: 14px; height: 14px; }
.video-mask { position: fixed; inset: 0; z-index: 99; background: rgba(0,0,0,0.92); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--gap-s); }
.video-close { position: absolute; top: 14px; right: 14px; width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.2); color: #fff; display: flex; align-items: center; justify-content: center; }
.video-player { max-width: 95vw; max-height: 70vh; border-radius: 8px; }
.video-caption { color: #ccc; margin: 0; font-weight: 700; }

.lyrics-page.anim-in {
  animation: lyrics-up 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes lyrics-up {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
