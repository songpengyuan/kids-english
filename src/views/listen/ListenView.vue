<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from "vue";
import { lessons, asset } from "../../data/lessons";
import AppHeader from "../../components/layout/AppHeader.vue";
import { Play, Pause, SkipBack, SkipForward, Music, Video, X, Repeat, Repeat1, Shuffle } from "@lucide/vue";

type SubTab = "songs" | "videos";
const subTab = ref<SubTab>("songs");

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
const repeatMode = ref<"off"|"all"|"one">("off"); // 循环模式
const shuffleOn = ref(false); // 随机播放
const currentSong = computed(() => currentIdx.value >= 0 ? songList.value[currentIdx.value] : null);

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
}
function togglePlay() {
  const a = ensureAudio(); if (!a.src) return;
  if (playing.value) { a.pause(); playing.value = false; } else { a.play(); playing.value = true; }
}
function next() {
  // 单曲循环：重新播当前
  if (repeatMode.value === "one") {
    if (audio.value) { audio.value.currentTime = 0; audio.value.play(); }
    return;
  }
  // 随机
  if (shuffleOn.value) {
    if (songList.value.length <= 1) return;
    let r;
    do { r = Math.floor(Math.random() * songList.value.length); } while (r === currentIdx.value);
    playSong(r); return;
  }
  // 顺序
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
function seek(e: Event) {
  if (audio.value) audio.value.currentTime = (Number((e.target as HTMLInputElement).value) / 100) * (audio.value.duration || 0);
}
onBeforeUnmount(() => audio.value?.pause());

const playingVideo = ref<{ src: string; titleZh: string; title: string } | null>(null);
function playVideo(v: { src: string; titleZh: string; title: string }) { playingVideo.value = v; }
</script>

<template>
  <div class="listen view">
    <AppHeader title="磨耳朵" icon="game" />
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
              <span class="sr-title">{{ s.titleZh }}</span>
              <span class="sr-sub">{{ s.title }}</span>
            </span>
            <span v-if="currentIdx === i && playing" class="eq"><i></i><i></i><i></i></span>
            <span v-else class="sr-play"><Play class="k-ico" /></span>
          </button>
        </div>
        <div v-if="currentSong" class="mini-player">
          <div class="mp-album tone-ico" :class="'tone-' + currentSong.tone">{{ currentSong.emoji }}</div>
          <div class="mp-info">
            <p class="mp-title">{{ currentSong.titleZh }}</p>
            <div class="mp-bar"><input type="range" :value="Math.round(progress * 100)" @input="seek" min="0" max="100" /></div>
          </div>
          <button class="mp-btn" :class="{ active: shuffleOn }" @click="shuffleOn = !shuffleOn" title="随机">
            <Shuffle class="k-ico" />
          </button>
          <button class="mp-btn" @click="prev"><SkipBack class="k-ico" /></button>
          <button class="mp-btn big" @click="togglePlay">
            <Pause v-if="playing" class="k-ico" /><Play v-else class="k-ico" />
          </button>
          <button class="mp-btn" @click="next"><SkipForward class="k-ico" /></button>
          <button class="mp-btn" :class="{ active: repeatMode !== 'off' }" @click="toggleRepeat" title="循环">
            <Repeat1 v-if="repeatMode === 'one'" class="k-ico" />
            <Repeat v-else class="k-ico" />
          </button>
        </div>
      </template>
      <template v-else>
        <div class="video-grid">
          <button v-for="v in videoList" :key="v.id" class="video-card" :class="'tone-' + v.tone" @click="playVideo(v)">
            <span class="vc-emoji">{{ v.emoji }}</span>
            <span class="vc-name">{{ v.titleZh }}</span>
            <span class="vc-sub">{{ v.title }}</span>
            <span class="vc-play"><Play class="k-ico" /></span>
          </button>
        </div>
      </template>
    </div>
    <div v-if="playingVideo" class="video-mask" @click.self="playingVideo = null">
      <button class="video-close" @click="playingVideo = null"><X class="k-ico" /></button>
      <video :src="playingVideo.src" controls autoplay playsinline class="video-player" />
      <p class="video-caption">{{ playingVideo.titleZh }} · {{ playingVideo.title }}</p>
    </div>
  </div>
</template>

<style scoped>
.body { display: flex; flex-direction: column; width: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: calc(80px + var(--pad-y)); }
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
.mini-player { position: fixed; bottom: calc(64px + env(safe-area-inset-bottom)); left: 0; right: 0; max-width: 480px; margin-inline: var(--pad-x); z-index: 35; display: flex; align-items: center; gap: var(--gap-s); background: var(--card-bg); border-radius: var(--radius); box-shadow: 0 8px 24px rgba(0,0,0,0.18); padding: 8px 12px; }
.mp-album { width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 24px; flex: none; }
.mp-info { flex: 1; min-width: 0; }
.mp-title { margin: 0; font-weight: 800; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mp-bar input { width: 100%; height: 4px; accent-color: var(--green); }
.mp-btn { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--ink-soft); flex: none; }
.mp-btn.big { width: 44px; height: 44px; background: var(--green); color: #fff; }
.mp-btn.active { color: var(--green); background: rgba(74, 222, 128, 0.15); }
.mp-btn .k-ico { width: 20px; height: 20px; }
.mp-btn.big .k-ico { width: 22px; height: 22px; }
.video-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gap-s); padding: var(--gap-s) var(--pad-x) 0; }
.video-card { position: relative; border-radius: var(--radius); padding: var(--gap-m); display: flex; flex-direction: column; align-items: center; gap: 4px; box-shadow: var(--shadow-hard); min-height: 120px; transition: transform 0.08s; }
.video-card:active { transform: scale(0.96); }
.vc-emoji { font-size: 44px; }
.vc-name { font-weight: 900; font-size: var(--fs-body); }
.vc-sub { font-size: 11px; color: var(--ink-faint); font-weight: 700; }
.vc-play { position: absolute; bottom: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%; background: rgba(0,0,0,0.4); color: #fff; display: flex; align-items: center; justify-content: center; }
.vc-play .k-ico { width: 14px; height: 14px; }
.video-mask { position: fixed; inset: 0; z-index: 90; background: rgba(0,0,0,0.92); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--gap-s); }
.video-close { position: absolute; top: 14px; right: 14px; width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.2); color: #fff; display: flex; align-items: center; justify-content: center; }
.video-player { max-width: 95vw; max-height: 70vh; border-radius: 8px; }
.video-caption { color: #ccc; margin: 0; font-weight: 700; }
.tone-blue { background: #dbeafe; } .tone-green { background: #d1fae5; } .tone-orange { background: #fed7aa; }
.tone-purple { background: #e9d5ff; } .tone-pink { background: #fce7f3; } .tone-teal { background: #99f6e4; }
</style>
