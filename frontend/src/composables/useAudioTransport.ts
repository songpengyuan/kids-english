/**
 * 音频播放 transport：playing/进度/缓冲/循环/拖动条——童谣页与磨耳朵页共用的"播放器机芯"。
 *
 * 抽出来的原因：SongView（课内唱童谣）与 stores/player.ts（磨耳朵全局单例）
 * 曾是两套各自维护的播放语义；把 transport 下沉后，页面级播放（课件伴奏）直接复用，
 * 全局播放器（跨页连续播放）仍走 player store——两者共享这一份机芯语义。
 *
 * 用法：
 *   const t = useAudioTransport(audioEl, seekEl, {
 *     onEnded: () => { ... },      // 自然播完（循环判定由内部处理，loop=true 时回调不触发）
 *     onMissing: () => { ... },    // 音频打不开（<audio> @error）
 *   });
 *   t.play(); t.pause();
 *   <audio ref="audioEl" @ended="t.handleEnded" @timeupdate="t.handleTimeUpdate" ... />
 */
import { computed, ref, type Ref } from "vue";
import { hapticTap } from "../services/haptics";

const LOOP_KEY = "kids-english-song-loop";
/* 会话内兜底：iOS 无痕模式 localStorage 写入会被拒，靠 sessionStorage
 * 在本次会话里保持用户的选择（跨会话无法持久化是系统限制） */
const LOOP_SESSION_KEY = "kids-english-song-loop-session";

export interface AudioTransportOptions {
  /** 自然播完（loop=false 时才会触发；循环模式内部回到开头继续播） */
  onEnded?: () => void;
  /** 音频文件打不开（<audio> @error） */
  onMissing?: () => void;
  /** 循环回到开头时（页面借此把歌词滚回顶部） */
  onLoopRestart?: () => void;
}

export function useAudioTransport(
  audioEl: Ref<HTMLAudioElement | null>,
  seekEl: Ref<HTMLElement | null>,
  options: AudioTransportOptions = {}
) {
  const playing = ref(false);
  const duration = ref(0);
  const currentTime = ref(0);
  const buffered = ref(0);
  const seeking = ref(false);

  /* 默认循环：童谣就是反复听才上口，孩子不用去管播放到哪了。
   * 只有"手动关过"（localStorage 里存了 "0"）才保持关闭，尊重用户的选择。 */
  const loop = ref(
    (() => {
      const s = sessionStorage.getItem(LOOP_SESSION_KEY);
      if (s !== null) return s !== "0";
      return localStorage.getItem(LOOP_KEY) !== "0";
    })()
  );

  const playedPct = computed(() => {
    if (!duration.value) return "0%";
    // 两位小数：进度条宽度用，同时避免 33/120 之类的浮点尾数
    return Math.min(100, +((currentTime.value / duration.value) * 100).toFixed(2)) + "%";
  });
  const bufPct = computed(
    () => (duration.value ? Math.min(100, (buffered.value / duration.value) * 100) + "%" : "0%")
  );

  function play() {
    audioEl.value
      ?.play()
      .then(() => {
        playing.value = true;
      })
      .catch(() => {
        /* 播放被拒（自动播放策略 / 被打断）只影响这一次；
         * 文件真打不开时 <audio> 的 @error 事件会负责走 onMissing */
        playing.value = false;
      });
  }

  function pause() {
    audioEl.value?.pause();
    playing.value = false;
  }

  /** 换素材后重置：停播 + 进度清零（循环偏好保留） */
  function reset() {
    pause();
    duration.value = 0;
    currentTime.value = 0;
    buffered.value = 0;
  }

  function handleEnded() {
    if (loop.value) {
      if (seekEl.value) seekEl.value.scrollTo?.({ top: 0 });
      options.onLoopRestart?.();
      const a = audioEl.value;
      if (a) {
        a.currentTime = 0;
        currentTime.value = 0;
        a.play().catch(() => (playing.value = false));
      }
      return;
    }
    playing.value = false;
    options.onEnded?.();
  }

  function handleLoadedMeta() {
    const a = audioEl.value;
    duration.value = a && isFinite(a.duration) ? a.duration : 0;
  }

  function handleTimeUpdate() {
    const a = audioEl.value;
    if (!a) return;
    if (isFinite(a.duration) && a.duration) duration.value = a.duration;
    if (a.buffered.length) buffered.value = a.buffered.end(a.buffered.length - 1);
    if (seeking.value) return; // 拖动中由 applySeek 负责同步，避免被回放进度打断
    currentTime.value = a.currentTime || 0;
  }

  function handleError() {
    playing.value = false;
    options.onMissing?.();
  }

  function toggleLoop() {
    loop.value = !loop.value;
    const v = loop.value ? "1" : "0";
    try {
      localStorage.setItem(LOOP_KEY, v);
    } catch {
      /* 无痕模式写入失败，忽略 */
    }
    try {
      sessionStorage.setItem(LOOP_SESSION_KEY, v);
    } catch {
      /* 会话存储也不可用，忽略 */
    }
    hapticTap();
  }

  /* 拖动进度条：pointer 事件挂在 window 上，手指滑出条外也不丢跟踪 */
  function onSeekDown(e: PointerEvent) {
    if (!duration.value) return;
    seeking.value = true;
    hapticTap();
    applySeek(e);
    window.addEventListener("pointermove", onSeekMove);
    window.addEventListener("pointerup", onSeekUp);
    window.addEventListener("pointercancel", onSeekUp);
    e.preventDefault();
  }
  function onSeekMove(e: PointerEvent) {
    if (seeking.value) applySeek(e);
  }
  function onSeekUp() {
    seeking.value = false;
    window.removeEventListener("pointermove", onSeekMove);
    window.removeEventListener("pointerup", onSeekUp);
    window.removeEventListener("pointercancel", onSeekUp);
  }
  function applySeek(e: PointerEvent) {
    const box = seekEl.value;
    const a = audioEl.value;
    if (!box || !a || !duration.value) return;
    // pointer 事件统一了触摸/鼠标；touches 兜底留给把 touch 事件直通过来的旧调用方
    const p = (e as PointerEvent & { touches?: TouchList }).touches?.[0] ?? e;
    const r = box.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (p.clientX - r.left) / r.width));
    const t = ratio * duration.value;
    a.currentTime = t;
    currentTime.value = t;
  }

  return {
    playing,
    duration,
    currentTime,
    buffered,
    seeking,
    loop,
    playedPct,
    bufPct,
    play,
    pause,
    reset,
    toggleLoop,
    handleEnded,
    handleLoadedMeta,
    handleTimeUpdate,
    handleError,
    onSeekDown,
  };
}

/** 秒 → m:ss（进度条/统计共用） */
export function fmtDuration(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}
