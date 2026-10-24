<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch } from "vue";
import { bigCelebrate } from "../../services/effects";
import { hapticTap } from "../../services/haptics";
import { useProgressStore } from "../../stores/progress";
import { useAudioTransport, fmtDuration } from "../../composables/useAudioTransport";
import { useLrc, activeLrcIndex, mapLrcToLyrics } from "../../composables/useLrc";
import { Clapperboard, Headphones, Music, Pause, Play, Repeat, Sparkles, SkipBack, SkipForward } from "@lucide/vue";
import SongStage from "./SongStage.vue";
import type { Lesson } from "../../data/lessons";

const progress = useProgressStore();

const props = withDefaults(
  defineProps<{
    lesson: Lesson;
    /** 当前词群（l11：colors/animals）：只放该群对应的那一轨歌曲与单词 */
    group?: string;
  }>(),
  { group: "" }
);
const emit = defineEmits<{ back: []; "song-done": [] }>();

const audioEl = ref<HTMLAudioElement | null>(null);
const audioMissing = ref(false);
const videoEl = ref<HTMLVideoElement | null>(null);

/** 多段音视频轨道：顶层 audio/video/lyrics 是第一轨，tracks 追加后续轨。
 *  配了词群的课（l11）按当前群过滤：Colors 只放颜色歌、Animals 只放 Brown Bear。 */
const allTracks = computed(() => {
  const first = {
    title: props.lesson.song.title || props.lesson.title,
    audio: props.lesson.song.audio,
    video: props.lesson.song.video,
    lyrics: props.lesson.song.lyrics,
    group: props.lesson.song.group
  };
  return [first, ...(props.lesson.song.tracks || [])];
});
const tracks = computed(() => {
  if (!props.group) return allTracks.value;
  const picked = allTracks.value.filter((t) => t.group === props.group);
  // 分组数据没配全时退回全部轨，别把歌曲页变成空白
  return picked.length ? picked : allTracks.value;
});
/** 当前群对应的单词（歌词下方词条条也按颜色/动物分开） */
const stripWords = computed(() =>
  props.group
    ? (props.lesson.words || []).filter((w) => w.group === props.group)
    : (props.lesson.words || [])
);
const trackIdx = ref(0);
const curTrack = computed(() => tracks.value[trackIdx.value] || tracks.value[0]);
const videoMissing = ref(!curTrack.value.video);

/* ---------- 播放机芯：transport composable（进度/缓冲/循环/拖动条） ---------- */
const lyricsEl = ref<HTMLElement | null>(null);
const seekEl = ref<HTMLElement | null>(null);
/** 完整听过一遍（音频或视频）→ 才有资格领星；与"是否循环"无关 */
const watched = ref(false);

const {
  playing, duration, currentTime, loop, playedPct, bufPct,
  play: transportPlay, pause: transportPause, reset: transportReset,
  toggleLoop, handleEnded, handleLoadedMeta, handleTimeUpdate,
  handleError: onAudioError, onSeekDown,
} = useAudioTransport(audioEl, seekEl, {
  onEnded: () => {
    watched.value = true;
    finishSong();
  },
  onMissing: () => {
    audioMissing.value = true;
  },
  // 循环回到开头也要落"听过"的标记，否则默认循环就永远领不到星
  onLoopRestart: () => {
    watched.value = true;
    lyricsEl.value?.scrollTo({ top: 0 });
  },
});

/** 点播放：音频缺失时别去 play（避免无意义的报错） */
function play() {
  if (audioMissing.value) return;
  transportPlay();
}
function pause() {
  transportPause();
}

/** 切词群 = 换歌：停播、回到第一轨、重算素材状态（组件通常由上层 key 重挂载，这里兜底） */
watch(
  () => props.group,
  () => {
    pause();
    videoEl.value?.pause();
    trackIdx.value = 0;
    watched.value = false;
    audioMissing.value = false;
    videoMissing.value = !curTrack.value.video;
    transportReset();
    resetLyricsFollow();
  }
);

/* ---------- 动画 / 视频 / 音乐 Tab ---------- */
/* 没有视频文件 → 第一个 Tab 是内置动画舞台 */
const hasVideo = computed(() => !!curTrack.value.video);
const firstTab = computed(() => (hasVideo.value ? "video" : "stage"));
const mode = ref(firstTab.value);
/** 视频封面：optimize-videos.mjs 与 mp4 成对产出的同名 jpg（缺失时浏览器无封面，无害） */
function posterOf(src: string | null): string | undefined {
  return src ? src.replace(/\.mp4$/, ".jpg") : undefined;
}

/** 离开本页（回菜单 / 换课）必须停播：脱离 DOM 的媒体元素在部分浏览器会继续出声 */
onBeforeUnmount(() => {
  audioEl.value?.pause();
  videoEl.value?.pause();
});

/** 完整听过一遍（音频或视频）→ 才有资格领星；与"是否循环"无关（watched 在 transport 回调里落） */
const canFinish = computed(() => watched.value || (videoMissing.value && audioMissing.value));

/** 切 Tab：互斥播放（切走的一路立刻暂停），避免两个声音叠在一起 */
function setMode(m: "video" | "stage" | "audio") {
  if (m === mode.value) return;
  hapticTap();
  if (m !== "video" && videoEl.value) videoEl.value.pause();
  if (m === "video" && playing.value) pause();
  mode.value = m;
}

/** 切轨道：停播、重置进度、换素材 */
function switchTrack(i: number) {
  if (i < 0 || i >= tracks.value.length || i === trackIdx.value) return;
  hapticTap();
  pause();
  videoEl.value?.pause();
  trackIdx.value = i;
  watched.value = false;
  audioMissing.value = false;
  videoMissing.value = !curTrack.value.video;
  transportReset();
  resetLyricsFollow();
}

/** 视频也计入"看过一遍"（原来视频路径没有任何 @ended，导致看完视频领不到星） */
function onVideoEnded() {
  watched.value = true;
}

/* ---------- 卡拉OK逐行高亮（2026-10-25 接入 LRC 时间轴） ----------
 * public/lessons/<id>/<音频同名>.lrc（gen-lrc.py 产出）拉得到就按秒精确高亮；
 * 拉不到/与当前轨歌词对不上（LRC 过期）→ 不高亮，保持普通歌词列表。 */
const lrcLines = useLrc(computed(() => curTrack.value?.audio || null));
const lrcMap = computed(() => {
  const lrc = lrcLines.value;
  if (!lrc || !curTrack.value?.lyrics?.length) return null;
  return mapLrcToLyrics(lrc, curTrack.value.lyrics);
});
const activeLine = computed(() => {
  const lrc = lrcLines.value;
  const map = lrcMap.value;
  if (lrc && map) {
    const k = activeLrcIndex(lrc, currentTime.value);
    return k < 0 ? -1 : map[k];
  }
  return -1;
});

/* 当前行自动滚到歌词窗口正中（家长手动滚后 3 秒内不抢，逻辑与磨耳朵歌词页一致） */
function followActiveLine() {
  const box = lyricsEl.value;
  if (!box || activeLine.value < 0) return;
  const line = box.querySelector<HTMLElement>(`.line[data-line="${activeLine.value}"]`);
  if (!line) return;
  const target = line.offsetTop - box.clientHeight / 2 + line.offsetHeight / 2;
  if (Math.abs(box.scrollTop - target) < 4) return;
  programmaticScrolls++;
  box.scrollTo({ top: target, behavior: "smooth" });
  setTimeout(() => (programmaticScrolls = Math.max(0, programmaticScrolls - 1)), 700);
}
const userScrolling = ref(false);
let userScrollTimer = 0;
let programmaticScrolls = 0;
function onLyricsScroll() {
  if (programmaticScrolls > 0) return;
  userScrolling.value = true;
  clearTimeout(userScrollTimer);
  userScrollTimer = window.setTimeout(() => (userScrolling.value = false), 3000);
}
watch(activeLine, () => {
  if (!userScrolling.value) followActiveLine();
});
/** 切轨道/词群后跟随状态重来 */
function resetLyricsFollow() {
  userScrolling.value = false;
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

</script>

<template>
  <div class="song view">
    <audio
      ref="audioEl"
      :src="curTrack.audio || undefined"
      preload="metadata"
      @error="onAudioError"
      @ended="handleEnded"
      @timeupdate="handleTimeUpdate"
      @loadedmetadata="handleLoadedMeta"
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
        :src="curTrack.video || undefined"
        :poster="posterOf(curTrack.video ?? null)"
        controls
        playsinline
        preload="metadata"
        class="video"
        @error="onVideoError"
        @ended="onVideoEnded"
      ></video>
    </div>

    <!-- ===== 动画舞台：随节拍弹跳的角色 ===== -->
    <div v-else-if="mode === 'stage'" class="video-zone view-body">
      <!-- 卡拉OK逐行字幕（props.line）随音频对拍的能力已随 transport 下沉删除：
           舞台只做氛围动画，逐行高亮在"音乐"tab 的歌词区 -->
      <SongStage
        :lesson="lesson"
        :audio="audioEl"
        :playing="playing"
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
        <span class="t-time">{{ fmtDuration(currentTime) }}</span>
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
        <span class="t-time">{{ fmtDuration(duration) }}</span>
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
        @scroll.passive="onLyricsScroll"
      >
        <template v-if="curTrack.lyrics && curTrack.lyrics.length">
          <p
            v-for="(line, i) in curTrack.lyrics"
            :key="i"
            class="line"
            :class="{ blank: !line, on: i === activeLine }"
            :data-line="i"
          >
            {{ line }}
          </p>
        </template>
        <p v-else class="miss">这一段还没录入歌词</p>
      </div>
    </template>

    <div v-if="mode !== 'audio'" class="words-strip">
      <span v-for="w in stripWords" :key="w.id" class="chip anim-pop">
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
