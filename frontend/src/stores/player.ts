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
import type { RepeatMode, Tone } from "../types";

export interface PlayableSong {
  id: string;
  title: string;
  titleZh: string;
  emoji: string;
  /** 卡片色调板（tokens.css）：别写十六进制，交给 .tone-* 工具类 */
  tone: Tone;
  src: string;
  lyrics?: string[];
  /** 逐行中文翻译（与 lyrics 等长；歌词页英文下方显示） */
  lyricsZh?: string[];
}

/** 歌曲播放列表（有 audio 的课）。
 *  一课多轨时，每轨展开成独立歌曲条目（第一轨用顶层 audio，后续从 tracks 取）。
 *  注意：lessons.ts normalize 时已对 audio/video 调过 asset() 补 BASE，
 *  这里直接用，不要再 asset，否则子路径部署会拼成 /app/app/...。 */
export const SONG_LIST: PlayableSong[] = lessons
  .filter((l) => l.song.audio)
  .flatMap((l) => {
    const first = {
      id: l.id,
      title: l.song.title || l.title,
      titleZh: l.titleZh,
      emoji: l.emoji,
      tone: l.tone ?? "blue",
      src: l.song.audio!,
      lyrics: l.song.lyrics,
      lyricsZh: l.song.lyricsZh || [],
    };
    const extras = (l.song.tracks || [])
      .filter((t) => t.audio)
      .map((t, i) => ({
        id: `${l.id}-t${i + 2}`,
        title: t.title,
        // 轨道有自己的中文名（如 l11 颜色歌）就用它，别再把课程名错挂成副标题
        titleZh: t.titleZh || l.titleZh,
        emoji: l.emoji,
        tone: l.tone ?? "blue",
        src: t.audio!,
        lyrics: t.lyrics || [],
        lyricsZh: t.lyricsZh || [],
      }));
    return [first, ...extras];
  });

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
    // 每条歌（含多轨展开）自带 lyrics；兜底按 lesson id 找顶层歌词
    if (s.lyrics?.length) return s.lyrics;
    const lesson = lessons.find((l) => l.id === s.id);
    return lesson?.song?.lyrics ?? [];
  });
  /** 当前曲目逐行中文翻译（与 currentLyrics 等长；歌词页英文下方显示，缺省空数组） */
  const currentLyricsZh = computed<string[]>(() => {
    const s = currentSong.value;
    if (!s) return [];
    if (s.lyricsZh?.length) return s.lyricsZh;
    const lesson = lessons.find((l) => l.id === s.id);
    return lesson?.song?.lyricsZh ?? [];
  });

  /* ---------- 播放模式（2026-10-17 补上 UI 入口：状态一直有，界面上没有按键） ----------
   * 两种模式各管一件事，但**不允许互相矛盾的组合**：
   *   · 循环模式（repeatMode）：顺序播放 off / 列表循环 all / 单曲循环 one；
   *   · 随机（shuffleOn）：在"下一首该播哪首"上打乱顺序。
   * 为什么互斥：单曲循环 + 随机同时亮着，按钮上写着"随机"、实际永远播同一首，
   * 家长看不懂、孩子点了也没反应（next() 里 one 的分支会先返回）。
   * 规则：点开随机时若正处于单曲循环，自动退回列表循环；
   *       切到单曲循环时自动关掉随机。两个按键的状态因此永远自洽。 */
  const REPEAT_LABEL: Record<RepeatMode, string> = {
    off: "顺序播放",
    all: "列表循环",
    one: "单曲循环",
  };
  /** 当前循环模式的中文名（详情页按钮上的文字） */
  const repeatLabel = computed(() => REPEAT_LABEL[repeatMode.value]);

  /* ---------- 磨耳朵时长累计（结算式：播放段按墙钟时间结算，独立于学习时长） ----------
   * 为什么不用「每 5s 累加 5s」：标签页在后台时浏览器会节流 setInterval（Chrome 约降到 1 次/分钟），
   * 孩子磨耳朵时切到别的页面/家长输口令开新 tab，时长就会严重少算。
   * 改为「记录段起点 + 恢复/暂停/切歌/前台时结算真实时长」，后台播放的时长也能算上。
   */
  let listenTimer: number | null = null;
  /** 当前连续播放段的开始时间戳（0 = 无进行中的段） */
  let listenStartAt = 0;

  /** 结算当前播放段（按墙钟时间，含后台隐藏期），随后重置段起点 */
  function settleListen(): void {
    if (listenStartAt === 0) return;
    const sec = (Date.now() - listenStartAt) / 1000;
    listenStartAt = 0;
    if (sec > 0.5) useProgressStore().addListenActivity(sec);
  }

  function startListenTimer() {
    stopListenTimer();
    listenStartAt = Date.now();
    listenTimer = window.setInterval(() => {
      // 前台持续落盘：每 5s 结算一段并开启新段；后台被节流时此 interval 不跑，
      // 时长由「回前台/暂停/切歌时的 settleListen」按真实时间补上
      settleListen();
      listenStartAt = Date.now();
    }, 5000);
  }
  function stopListenTimer() {
    settleListen();
    if (listenTimer) {
      clearInterval(listenTimer);
      listenTimer = null;
    }
  }

  /**
   * 主动结算当前播放段（在关页 / 切后台前调用）。
   * 5s 的 interval 只在**下个 tick** 落盘，直接关标签页会丢掉最后不足一个 tick 的时长；
   * pagehide 时先结算再 flushReport，才能把这段真实听过的时间送到云端。
   *
   * 注意：这里**不能**顺手把段起点重置成 now。切后台时 store 的 visibilitychange
   * 监听只是停掉 interval、故意不结算，等回前台再按真实时间一次补上；若在这里重置，
   * 「切到别的页面继续听」的那一整段就会被吞掉（这正是本模块当初改成结算式的原因）。
   */
  function settle() {
    settleListen();
  }

  /** 页面可见性：后台停 interval（避免节流干扰），回前台且仍在播放时按真实时间补计 */
  function onVisibilityChange() {
    if (document.hidden) {
      if (listenTimer) {
        clearInterval(listenTimer);
        listenTimer = null;
      }
    } else if (playing.value) {
      startListenTimer();
    }
  }
  document.addEventListener("visibilitychange", onVisibilityChange);

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

  /** 循环模式三档轮转：顺序播放 → 列表循环 → 单曲循环 → 顺序播放。
   *  切进"单曲循环"时关掉随机（见上方 REPEAT_LABEL 处的互斥说明）。 */
  function toggleRepeat() {
    const next: RepeatMode =
      repeatMode.value === "off" ? "all" : repeatMode.value === "all" ? "one" : "off";
    if (next === "one") shuffleOn.value = false;
    repeatMode.value = next;
  }
  /** 随机开关：开随机时若正处于单曲循环，退回列表循环（否则"随机"点了没用） */
  function toggleShuffle() {
    const on = !shuffleOn.value;
    if (on && repeatMode.value === "one") repeatMode.value = "all";
    shuffleOn.value = on;
  }

  /** 三档循环：随机 → 列表循环 → 单曲循环 → 随机。
   *  界面上合并成一个按钮，点击切下一档（孩子/家长不用猜两个按钮的互斥关系）。 */
  function cycleMode() {
    if (shuffleOn.value) {
      shuffleOn.value = false;
      repeatMode.value = "all";
    } else if (repeatMode.value === "one") {
      repeatMode.value = "all";
      shuffleOn.value = true;
    } else {
      // all（或 off）→ 单曲循环
      repeatMode.value = "one";
    }
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
    currentLyricsZh,
    playing,
    progress,
    duration,
    repeatMode,
    repeatLabel,
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
    cycleMode,
    seek,
    formatTime,
    settle,
  };
});
