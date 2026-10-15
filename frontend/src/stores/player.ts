/**
 * 全局播放 store（磨耳朵歌曲）——跨 tab 续播的地基。
 *
 * 设计：audio 实例 + 播放状态全部放 store（模块级单例，不随组件销毁），
 * 底部播放条 / 磨耳朵列表 / 歌词页都从这一个状态源读写。
 * 切到学习/我的等任意 tab，audio 由全局单例持有，播放不中断。
 *
 * 计时：歌曲播放期间每 5s 累加一次「今日磨耳朵时长」（与视频计时解耦，
 * 视频仍由 ListenView 局部管理）。
 */
import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { lessons, asset } from "../data/lessons";
import { useProgressStore } from "./progress";
import type { RepeatMode } from "../types";

export interface PlayableSong {
  id: string;
  title: string;
  titleZh: string;
  emoji: string;
  tone: string;
  src: string;
}

/** 歌曲播放列表（有 audio 的课，排除 l6-l8 素材缺失课） */
export const SONG_LIST: PlayableSong[] = lessons
  .filter((l) => l.song.audio && !["l6", "l7", "l8"].includes(l.id))
  .map((l) => ({
    id: l.id,
    title: l.title,
    titleZh: l.titleZh,
    emoji: l.emoji,
    tone: l.tone ?? "blue",
    src: asset(l.song.audio)!,
  }));

/** 全局唯一 audio 实例（模块级创建，永随应用存活，不随路由销毁） */
const audio = new Audio();
audio.preload = "auto";

export const usePlayerStore = defineStore("player", () => {
  /** 当前曲目索引（-1 = 未选曲） */
  const currentIdx = ref(-1);
  const playing = ref(false);
  const progress = ref(0);
  const duration = ref(0);
  const repeatMode = ref<RepeatMode>("all");
  const shuffleOn = ref(false);
  /** 歌词全屏页是否展开（跨路由保持：磨耳朵页回来仍是歌词页） */
  const nowPlaying = ref(false);

  const currentSong = computed<PlayableSong | null>(
    () => (currentIdx.value >= 0 ? SONG_LIST[currentIdx.value] ?? null : null),
  );
  const currentLyrics = computed<string[]>(() => {
    const s = currentSong.value;
    if (!s) return [];
    const lesson = lessons.find((l) => l.id === s.id);
    return lesson?.song?.lyrics ?? [];
  });

  /* ---------- 磨耳朵时长累计（播放中每 5s 计一次，独立于学习时长） ---------- */
  let listenTimer: number | null = null;
  let lastTick = 0;
  function startListenTimer() {
    stopListenTimer();
    lastTick = Date.now();
    listenTimer = window.setInterval(() => {
      const sec = (Date.now() - lastTick) / 1000;
      lastTick = Date.now();
      useProgressStore().addListenActivity(sec);
    }, 5000);
  }
  function stopListenTimer() {
    if (listenTimer) {
      clearInterval(listenTimer);
      listenTimer = null;
    }
  }

  function bindAudio() {
    audio.addEventListener("timeupdate", () => {
      if (audio.duration) {
        progress.value = audio.currentTime / audio.duration;
        duration.value = audio.duration;
      }
    });
    audio.addEventListener("ended", () => {
      next();
    });
  }
  bindAudio();

  /** 切到指定曲目并播放 */
  function playSong(idx: number) {
    const s = SONG_LIST[idx];
    if (!s) return;
    currentIdx.value = idx;
    audio.src = s.src;
    void audio.play();
    playing.value = true;
    startListenTimer();
  }

  /** 列表行直接播放/暂停（不展开歌词页） */
  function playFromRow(idx: number) {
    if (currentIdx.value === idx) {
      togglePlay();
      return;
    }
    playSong(idx);
  }

  /** 进入歌词页（点整行/底部播放条）：切歌 + 展开 */
  function openLyrics(idx: number) {
    if (currentIdx.value !== idx) playSong(idx);
    nowPlaying.value = true;
  }
  function closeLyrics() {
    nowPlaying.value = false;
  }

  function togglePlay() {
    if (!audio.src) return;
    if (playing.value) {
      audio.pause();
      playing.value = false;
      stopListenTimer();
    } else {
      void audio.play();
      playing.value = true;
      startListenTimer();
    }
  }

  function next() {
    if (repeatMode.value === "one") {
      audio.currentTime = 0;
      void audio.play();
      return;
    }
    if (shuffleOn.value && SONG_LIST.length > 1) {
      let r: number;
      do {
        r = Math.floor(Math.random() * SONG_LIST.length);
      } while (r === currentIdx.value);
      playSong(r);
      return;
    }
    if (currentIdx.value < SONG_LIST.length - 1) {
      playSong(currentIdx.value + 1);
    } else if (repeatMode.value === "all") {
      playSong(0);
    } else {
      playing.value = false;
      stopListenTimer();
    }
  }

  function prev() {
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (currentIdx.value > 0) playSong(currentIdx.value - 1);
  }

  function toggleRepeat() {
    repeatMode.value =
      repeatMode.value === "off" ? "all" : repeatMode.value === "all" ? "one" : "off";
  }
  function toggleShuffle() {
    shuffleOn.value = !shuffleOn.value;
  }

  function seek(e: Event) {
    const el = e.target as HTMLInputElement;
    if (el) audio.currentTime = (Number(el.value) / 100) * (audio.duration || 0);
  }

  function formatTime(sec: number): string {
    if (!sec || !isFinite(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return {
    SONG_LIST,
    currentIdx,
    currentSong,
    currentLyrics,
    playing,
    progress,
    duration,
    repeatMode,
    shuffleOn,
    nowPlaying,
    playSong,
    playFromRow,
    openLyrics,
    closeLyrics,
    togglePlay,
    next,
    prev,
    toggleRepeat,
    toggleShuffle,
    seek,
    formatTime,
  };
});
