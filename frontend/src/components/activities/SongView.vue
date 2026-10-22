<script setup>
import { ref, computed, onBeforeUnmount } from "vue";
import { bigCelebrate } from "../../services/effects";
import { hapticTap } from "../../services/haptics";
import { useProgressStore } from "../../stores/progress";
import { Clapperboard, Headphones, Music, Pause, Play, Repeat, Sparkles, SkipBack, SkipForward } from "@lucide/vue";
import SongStage from "./SongStage.vue";
import BaseButton from "../ui/BaseButton.vue";

const progress = useProgressStore();

const props = defineProps({ lesson: { type: Object, required: true } });
const emit = defineEmits(["back", "song-done"]);

const playing = ref(false);
const audioEl = ref(null);
const audioMissing = ref(false);
const videoEl = ref(null);

/** 多段音视频轨道：顶层 audio/video/lyrics 是第一轨，tracks 追加后续轨 */
const tracks = computed(() => {
  const first = {
    title: props.lesson.title,
    audio: props.lesson.song.audio,
    video: props.lesson.song.video,
    lyrics: props.lesson.song.lyrics
  };
  return [first, ...(props.lesson.song.tracks || [])];
});
const trackIdx = ref(0);
const curTrack = computed(() => tracks.value[trackIdx.value] || tracks.value[0]);
const videoMissing = ref(!curTrack.value.video);

/* ---------- 动画 / 视频 / 音乐 Tab ---------- */
/* 没有视频文件 → 第一个 Tab 是内置动画舞台 */
const hasVideo = computed(() => !!curTrack.value.video);
const firstTab = computed(() => (hasVideo.value ? "video" : "stage"));
const mode = ref(firstTab.value);

/** 离开本页（回菜单 / 换课）必须停播：脱离 DOM 的媒体元素在部分浏览器会继续出声 */
onBeforeUnmount(() => {
  audioEl.value?.pause();
  videoEl.value?.pause();
});

/** 完整听过一遍（音频或视频）→ 才有资格领星；与"是否循环"无关 */
const watched = ref(false);
/** 两样素材都没有（还没上传 mp3/mp4）→ 直接放行，别把孩子卡在这一页 */
const canFinish = computed(() => watched.value || (videoMissing.value && audioMissing.value));

/** 切 Tab：互斥播放（切走的一路立刻暂停），避免两个声音叠在一起 */
function setMode(m) {
  if (m === mode.value) return;
  hapticTap();
  if (m !== "video" && videoEl.value) videoEl.value.pause();
  if (m === "video" && playing.value) pause();
  mode.value = m;
}

/** 切轨道：停播、重置进度、换素材 */
function switchTrack(i) {
  if (i < 0 || i >= tracks.value.length || i === trackIdx.value) return;
  hapticTap();
  pause();
  videoEl.value?.pause();
  trackIdx.value = i;
  watched.value = false;
  audioMissing.value = false;
  videoMissing.value = !curTrack.value.video;
  duration.value = 0;
  currentTime.value = 0;
}

function play() {
  if (audioMissing.value) return;
  audioEl.value
    .play()
    .then(() => {
      playing.value = true;
    })
    .catch(() => {
      /* 播放被拒（自动播放策略 / 被打断）只影响这一次；
       * 文件真打不开时 <audio> 的 @error 事件会负责把 audioMissing 置真 */
      playing.value = false;
    });
}
function pause() {
  audioEl.value && audioEl.value.pause();
  playing.value = false;
}
function onAudioError() {
  audioMissing.value = true;
  playing.value = false;
}
function onEnded() {
  // 先落"听过一遍"的标记：循环模式下也要能领星，否则默认循环就永远领不到
  watched.value = true;
  // 循环模式：回到开头继续唱，不结算、不离开本页
  if (loop.value) {
    if (lyricsEl.value) lyricsEl.value.scrollTo({ top: 0 });
    const a = audioEl.value;
    if (a) {
      a.currentTime = 0;
      currentTime.value = 0;
      a.play().catch(() => (playing.value = false));
    }
    return;
  }
  finishSong();
}

/** 视频也计入"看过一遍"（原来视频路径没有任何 @ended，导致看完视频领不到星） */
function onVideoEnded() {
  watched.value = true;
}

/** 收尾：停播、撒花、记进度、离开本页。循环模式下这是本页唯一的出口 */
function finishSong() {
  pause();
  bigCelebrate();
  progress.markSong(props.lesson.id);
  emit("song-done");
}
function onVideoError() {
  videoMissing.value = true;
}

/* ---------- 播放进度条 / 循环播放 ---------- */
const duration = ref(0);
const currentTime = ref(0);
const buffered = ref(0);
const seeking = ref(false);
const seekEl = ref(null);

const LOOP_KEY = "kids-english-song-loop";
/* 会话内兜底：iOS 无痕模式 localStorage 写入会被拒，靠 sessionStorage
 * 在本次会话里保持用户的选择（跨会话无法持久化是系统限制） */
const LOOP_SESSION_KEY = "kids-english-song-loop-session";
/* 默认循环：童谣就是反复听才上口，孩子不用去管播放到哪了。
 * 只有"手动关过"（localStorage 里存了 "0"）才保持关闭，尊重用户的选择。 */
const loop = ref(
  (() => {
    const s = sessionStorage.getItem(LOOP_SESSION_KEY);
    if (s !== null) return s !== "0";
    return localStorage.getItem(LOOP_KEY) !== "0";
  })()
);

const playedPct = computed(() =>
  duration.value ? Math.min(100, (currentTime.value / duration.value) * 100) + "%" : "0%"
);
const bufPct = computed(() =>
  duration.value ? Math.min(100, (buffered.value / duration.value) * 100) + "%" : "0%"
);

/** 秒 → m:ss */
function fmt(sec) {
  if (!isFinite(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}

function onLoadedMeta() {
  const a = audioEl.value;
  duration.value = a && isFinite(a.duration) ? a.duration : 0;
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
function onSeekDown(e) {
  if (audioMissing.value || !duration.value) return;
  seeking.value = true;
  hapticTap();
  applySeek(e);
  window.addEventListener("pointermove", onSeekMove);
  window.addEventListener("pointerup", onSeekUp);
  window.addEventListener("pointercancel", onSeekUp);
  e.preventDefault();
}
function onSeekMove(e) {
  if (seeking.value) applySeek(e);
}
function onSeekUp() {
  seeking.value = false;
  window.removeEventListener("pointermove", onSeekMove);
  window.removeEventListener("pointerup", onSeekUp);
  window.removeEventListener("pointercancel", onSeekUp);
}
function applySeek(e) {
  const box = seekEl.value;
  const a = audioEl.value;
  if (!box || !a || !duration.value) return;
  const p = e.touches ? e.touches[0] : e;
  const r = box.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (p.clientX - r.left) / r.width));
  const t = ratio * duration.value;
  a.currentTime = t;
  currentTime.value = t;
}

/* ---------- 歌词：纯展示，手动滚动，不自动跟随播放 ---------- */
const lyricsEl = ref(null);

function onTimeUpdate() {
  const a = audioEl.value;
  if (!a) return;
  if (isFinite(a.duration) && a.duration) duration.value = a.duration;
  if (a.buffered.length) buffered.value = a.buffered.end(a.buffered.length - 1);
  if (seeking.value) return; // 拖动中由 applySeek 负责同步，避免被回放进度打断
  currentTime.value = a.currentTime || 0;
}

</script>

<template>
  <div class="song view">
    <audio
      ref="audioEl"
      :src="curTrack.audio"
      preload="metadata"
      @error="onAudioError"
      @ended="onEnded"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onLoadedMeta"
    />

    <!-- 动画 / 视频 / 音乐切换 -->
    <div class="tabs" role="tablist">
      <button
        class="tab"
        :class="{ on: mode === firstTab }"
        role="tab"
        :aria-selected="mode === firstTab"
        data-haptic
        @click="setMode(firstTab)"
      >
        <Clapperboard class="k-ico" />{{ hasVideo ? "视频" : "动画" }}
      </button>
      <button
        class="tab"
        :class="{ on: mode === 'audio' }"
        role="tab"
        :aria-selected="mode === 'audio'"
        data-haptic
        @click="setMode('audio')"
      >
        <Music class="k-ico" />音乐
      </button>
    </div>

    <!-- ===== 视频模式（课时放了 song.mp4 时才有） ===== -->
    <div v-if="mode === 'video' && hasVideo" class="video-zone view-body">
      <video
        ref="videoEl"
        :src="curTrack.video"
        controls
        playsinline
        class="video"
        @error="onVideoError"
        @ended="onVideoEnded"
      ></video>
    </div>

    <!-- ===== 动画舞台：随节拍弹跳的角色 + 卡拉OK字幕 ===== -->
    <div v-else-if="mode === 'stage'" class="video-zone view-body">
      <SongStage
        :lesson="lesson"
        :audio="audioEl"
        :playing="playing"
        :line="-1"
        :idle="audioMissing ? '童谣音频还没上传哦' : '点我开始唱吧'"
        @tap="playing ? pause() : play()"
      />
    </div>

    <!-- ===== 音频模式：播放器 + 完整歌词 ===== -->
    <template v-else>
      <div class="audio-bar" data-haptic @click="playing ? pause() : play()">
        <button v-if="!audioMissing" class="play-btn anim-pop" :aria-label="playing ? '暂停' : '播放'">
          <Play v-if="!playing" class="k-ico" />
          <Pause v-else class="k-ico" />
        </button>
        <div class="audio-text">
          <template v-if="!audioMissing">
            <p class="audio-title">{{ lesson.emoji }} {{ curTrack.title }}</p>
            <p class="audio-sub">{{ playing ? "正在播放，看着歌词一起唱吧～" : "点我播放童谣音乐" }}</p>
          </template>
          <p v-else class="miss">
            童谣视频/音频还没有上传<br />（把 mp3/mp4 放进对应课时目录就能响）
          </p>
        </div>
      </div>

      <!-- 多轨切换 -->
      <div v-if="tracks.length > 1" class="track-switch">
        <button class="track-btn" :disabled="trackIdx === 0" data-haptic aria-label="上一首" @click="switchTrack(trackIdx - 1)">
          <SkipBack class="k-ico" />
        </button>
        <span class="track-pos">{{ trackIdx + 1 }} / {{ tracks.length }}</span>
        <button class="track-btn" :disabled="trackIdx === tracks.length - 1" data-haptic aria-label="下一首" @click="switchTrack(trackIdx + 1)">
          <SkipForward class="k-ico" />
        </button>
      </div>

      <!-- 播放进度条 + 循环播放（不能挂 data-haptic：透明开关的 touch-action:none 会吃掉拖动） -->
      <div v-if="!audioMissing" class="transport">
        <span class="t-time">{{ fmt(currentTime) }}</span>
        <div
          class="seek"
          ref="seekEl"
          role="slider"
          tabindex="0"
          aria-label="播放进度"
          :aria-valuemin="0"
          :aria-valuemax="Math.round(duration)"
          :aria-valuenow="Math.round(currentTime)"
          @pointerdown="onSeekDown"
        >
          <div class="seek-track">
            <div class="seek-buf" :style="{ width: bufPct }"></div>
            <div class="seek-fill" :style="{ width: playedPct }"></div>
          </div>
          <span class="seek-knob" :style="{ left: playedPct }"></span>
        </div>
        <span class="t-time">{{ fmt(duration) }}</span>
        <button
          class="loop-btn"
          :class="{ on: loop }"
          :aria-pressed="loop"
          :aria-label="'循环播放：' + (loop ? '已开启' : '已关闭')"
          :title="loop ? '循环播放：开' : '循环播放：关'"
          @click="toggleLoop"
        >
          <Repeat class="k-ico" />
        </button>
      </div>

      <div
        class="lyrics view-body"
        :class="{ empty: !curTrack.lyrics || !curTrack.lyrics.length }"
        ref="lyricsEl"
      >
        <template v-if="curTrack.lyrics && curTrack.lyrics.length">
          <p
            v-for="(line, i) in curTrack.lyrics"
            :key="i"
            class="line"
            :class="{ blank: !line }"
          >
            {{ line }}
          </p>
        </template>
        <p v-else class="miss">这一段还没录入歌词</p>
      </div>
    </template>

    <div v-if="mode !== 'audio'" class="words-strip">
      <span v-for="w in lesson.words" :key="w.id" class="chip anim-pop">
        {{ w.emoji }} {{ w.en }}
      </span>
    </div>
    <p v-if="mode !== 'audio'" class="under-tip">跟着唱完一遍，就能领小星星啦</p>

    <!-- 收尾：完整听过一遍才可领星（循环模式下这是本页唯一出口） -->
    <BaseButton v-if="canFinish" class="finish" @click="finishSong">
      <Sparkles class="k-ico" />领到小星星
    </BaseButton>
    <BaseButton v-else class="finish" disabled>
      <Headphones class="k-ico" />听完一遍就能领星星
    </BaseButton>
  </div>
</template>

<style scoped>
.song {
  align-items: center;
}

/* ---------- Tab ---------- */
.tabs {
  display: flex;
  gap: var(--gap-xs);
  background: var(--card-bg);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-soft);
  padding: 4px;
  flex: none;
}
.tab {
  border-radius: var(--radius-pill);
  padding: clamp(5px, 1.1vh, 9px) clamp(14px, 2.4vw, 26px);
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
  color: var(--ink-soft);
  background: transparent;
  transition: background 0.15s, color 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
}
.tab.on {
  background: var(--blue);
  color: var(--on-tone);
  box-shadow: 0 2px 0 var(--blue-dark);
}

/* ---------- 视频模式 ---------- */
.video-zone {
  width: 100%;
  display: flex;
}
.video {
  width: 100%;
  height: 100%;
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  background: var(--black);
  object-fit: contain;
}

/* ---------- 动画舞台 ---------- */

/* ---------- 音频模式 ---------- */
.audio-bar {
  flex: none;
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--gap-m);
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-s) var(--gap-m);
  cursor: pointer;
  min-height: clamp(64px, 12vh, 96px);
}
.audio-text {
  min-width: 0;
  text-align: left;
}
.audio-text p {
  margin: 0;
}
.audio-title {
  font-weight: var(--fw-strong);
  font-size: var(--fs-title);
  color: var(--ink);
}
.audio-sub {
  font-size: var(--fs-small);
  color: var(--ink-soft);
  font-weight: var(--fw-mid);
  margin-top: 2px;
}

/* ---------- 播放进度条 + 循环 ---------- */
.transport {
  flex: none;
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  padding: 0 2px;
}
.t-time {
  flex: none;
  min-width: 40px;
  text-align: center;
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}
/* 触摸热区靠外层撑高，视觉细条交给内部 track */
.seek {
  position: relative;
  flex: 1;
  min-width: 0;
  height: clamp(30px, 5.4vh, 40px);
  display: flex;
  align-items: center;
  cursor: pointer;
  touch-action: none; /* 拖进度条时不要连带滚动歌词 */
}
.seek-track {
  position: relative;
  width: 100%;
  height: clamp(8px, 1.7vh, 13px);
  background: var(--line);
  border-radius: var(--radius-pill);
  overflow: hidden;
}
.seek-buf {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--tint-yellow);
  border-radius: var(--radius-pill);
}
.seek-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: linear-gradient(90deg, var(--blue), var(--brand));
  border-radius: var(--radius-pill);
}
.seek-knob {
  position: absolute;
  top: 50%;
  width: clamp(18px, 3.2vh, 24px);
  height: clamp(18px, 3.2vh, 24px);
  background: var(--card-bg);
  border: 3px solid var(--blue);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: var(--shadow-soft);
  pointer-events: none;
}
.loop-btn {
  flex: none;
  width: clamp(36px, 6.2vh, 46px);
  height: clamp(36px, 6.2vh, 46px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(15px, 2.6vh, 21px);
  background: var(--card-bg);
  box-shadow: var(--shadow-hard);
  opacity: 0.5; /* 关闭态压暗，开启态亮起 */
  transition: opacity 0.15s, background 0.15s, box-shadow 0.15s, transform 0.12s;
}
.loop-btn.on {
  opacity: 1;
  background: var(--brand);
  box-shadow: 0 var(--press) 0 var(--brand-dark);
}
.loop-btn:active {
  transform: translateY(calc(var(--press) - 1px));
}

/* 歌词：固定高度窗口，始终可滚（KTV 式跟随 + 手动滑动均可） */
.lyrics {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  text-align: center;
  padding: var(--gap-m) var(--pad-x);
  mask-image: linear-gradient(180deg, transparent, var(--black) 15%, var(--black) 85%, transparent);
  -webkit-mask-image: linear-gradient(180deg, transparent, var(--black) 15%, var(--black) 85%, transparent);
}
.lyrics::-webkit-scrollbar { display: none; }
.lyrics { scrollbar-width: none; }
.line {
  margin: 0;
  font-size: clamp(18px, min(3.5vh, 3vw), 26px);
  font-weight: var(--fw-strong);
  color: var(--ink-faint);
  line-height: 1.8;
  transition: color 0.2s, transform 0.2s;
}
.line.blank { height: var(--gap-m); }
.line.on {
  color: var(--ink);
  transform: scale(1.05);
}

.play-btn {
  width: clamp(48px, min(11vh, 9vw), 76px);
  height: clamp(48px, min(11vh, 9vw), 76px);
  border-radius: 50%;
  background: var(--brand);
  color: var(--on-tone);
  font-size: clamp(20px, min(4.4vh, 3.6vw), 30px);
  box-shadow: 0 var(--press) 0 var(--brand-dark);
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 播放三角/暂停双条填实，比描边更像"按键" */
.play-btn .k-ico {
  fill: currentColor;
}
.play-btn:active {
  transform: translateY(calc(var(--press) - 1px));
  box-shadow: 0 1px 0 var(--brand-dark);
}
.miss {
  font-size: var(--fs-small);
  color: var(--panel-ink-soft);
  font-weight: var(--fw-mid);
  line-height: 1.6;
  margin: 0;
}

/* 单词条：最多两行高度，超出裁掉，避免和视频抢空间 */
.words-strip {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-xs);
  justify-content: center;
  flex: none;
  max-height: min(18vh, 96px);
  overflow: hidden;
  width: 100%;
}
.chip {
  background: var(--card-bg);
  border-radius: var(--radius-s);
  padding: clamp(3px, 0.8vh, 6px) clamp(8px, 1.2vw, 12px);
  font-weight: var(--fw-strong);
  box-shadow: var(--shadow-hard);
  font-size: var(--fs-small);
  white-space: nowrap;
  color: var(--ink);
}

.finish {
  flex: none;
  width: 100%;
  max-width: 460px;
}

.track-switch {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--gap-m);
}
.track-btn {
  width: clamp(40px, 7vh, 52px);
  height: clamp(40px, 7vh, 52px);
  border-radius: 50%;
  background: var(--card-bg);
  box-shadow: var(--shadow-hard);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink);
}
.track-btn:disabled { opacity: 0.4; }
.track-pos {
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
  color: var(--ink-soft);
  min-width: 40px;
  text-align: center;
}

/**
 * 手机横屏：高度是硬约束（约 300~400px）。
 */
@media (max-height: 480px) {
  .words-strip {
    max-height: 40px;
    overflow: hidden;
  }
  .chip {
    font-size: 11px;
    padding: 2px 7px;
  }
  .audio-bar {
    min-height: 52px;
  }
  /* 横屏高度紧张：进度条收窄、时间隐藏，留空间给歌词 */
  .transport {
    gap: var(--gap-xs);
  }
  .seek {
    height: 26px;
  }
  .t-time {
    display: none;
  }
  .loop-btn {
    width: 30px;
    height: 30px;
    font-size: 13px;
  }
  .lyrics {
    max-height: 34vh;
    min-height: 72px;
  }
  .line {
    font-size: 13px;
  }
}
</style>
