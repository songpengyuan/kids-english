<script setup>
import { ref, computed } from "vue";
import { bigCelebrate } from "../utils/effects";
import { hapticTap } from "../utils/haptics";
import progress from "../store/progress";

const props = defineProps({ lesson: { type: Object, required: true } });
const emit = defineEmits(["back", "song-done"]);

/* ---------- 视频 / 音频 Tab ---------- */
const mode = ref(props.lesson.song.video ? "video" : "audio");

const playing = ref(false);
const audioEl = ref(null);
const audioMissing = ref(false);
const videoEl = ref(null);
const videoMissing = ref(!props.lesson.song.video);

/** 切 Tab：互斥播放（切走的一路立刻暂停），避免两个声音叠在一起 */
function setMode(m) {
  if (m === mode.value) return;
  hapticTap();
  if (m === "audio" && videoEl.value) videoEl.value.pause();
  if (m === "video" && playing.value) pause();
  mode.value = m;
}

function play() {
  if (audioMissing.value) return;
  audioEl.value
    .play()
    .then(() => {
      playing.value = true;
    })
    .catch(() => {
      audioMissing.value = true;
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
  playing.value = false;
  bigCelebrate();
  progress.markSong(props.lesson.id);
  emit("song-done");
}
function onVideoError() {
  videoMissing.value = true;
}

const noteAnim = computed(() => (playing.value ? "anim-wiggle" : ""));
</script>

<template>
  <div class="song view">
    <audio
      ref="audioEl"
      :src="lesson.song.audio"
      preload="none"
      @error="onAudioError"
      @ended="onEnded"
    />

    <!-- 视频 / 音频切换 -->
    <div class="tabs" role="tablist">
      <button
        class="tab"
        :class="{ on: mode === 'video' }"
        role="tab"
        :aria-selected="mode === 'video'"
        data-haptic
        @click="setMode('video')"
      >
        🎬 视频
      </button>
      <button
        class="tab"
        :class="{ on: mode === 'audio' }"
        role="tab"
        :aria-selected="mode === 'audio'"
        data-haptic
        @click="setMode('audio')"
      >
        🎵 音乐
      </button>
    </div>

    <!-- ===== 视频模式 ===== -->
    <div v-if="mode === 'video'" class="video-zone view-body">
      <video
        v-if="!videoMissing"
        ref="videoEl"
        :src="lesson.song.video"
        controls
        playsinline
        class="video"
        @error="onVideoError"
      ></video>
      <div v-else class="video-ph" data-haptic @click="play">
        <span class="note anim-float" :class="noteAnim">🎵</span>
        <p v-if="!audioMissing">{{ playing ? "正在播放，跟着唱吧～" : "点我播放童谣音乐" }}</p>
        <p v-else class="miss">
          🎬 童谣视频/音频还没有上传<br />（把 mp3/mp4 放进对应课时目录就能响）
        </p>
        <button v-if="!playing && !audioMissing" class="play-btn anim-pop">▶</button>
        <button v-else-if="playing && !audioMissing" class="play-btn anim-pop" @click.stop="pause">
          ⏸
        </button>
      </div>
    </div>

    <!-- ===== 音频模式：播放器 + 完整歌词 ===== -->
    <template v-else>
      <div class="audio-bar" data-haptic @click="playing ? pause() : play()">
        <button v-if="!audioMissing" class="play-btn anim-pop">
          {{ playing ? "⏸" : "▶" }}
        </button>
        <div class="audio-text">
          <template v-if="!audioMissing">
            <p class="audio-title">{{ lesson.emoji }} {{ lesson.title }}</p>
            <p class="audio-sub">{{ playing ? "正在播放，看着歌词一起唱吧～" : "点我播放童谣音乐" }}</p>
          </template>
          <p v-else class="miss">
            🎬 童谣视频/音频还没有上传<br />（把 mp3/mp4 放进对应课时目录就能响）
          </p>
        </div>
      </div>

      <div class="lyrics view-body" :class="{ empty: !lesson.song.lyrics.length }">
        <template v-if="lesson.song.lyrics.length">
          <p
            v-for="(line, i) in lesson.song.lyrics"
            :key="i"
            class="line"
            :class="{ blank: !line }"
          >
            {{ line }}
          </p>
        </template>
        <p v-else class="miss">歌词还没录入（在 lessons.js 的 song.lyrics 里补充）</p>
      </div>
    </template>

    <div v-if="mode === 'video'" class="words-strip">
      <span v-for="w in lesson.words" :key="w.id" class="chip anim-pop">
        {{ w.emoji }} {{ w.en }}
      </span>
    </div>

    <p v-if="mode === 'video' && !videoMissing" class="under-tip">看完视频记得点下方按钮领取小星星哦</p>
    <button v-if="videoMissing && audioMissing" class="k-btn blue finish" @click="onEnded">
      看完啦，领星星 ⭐
    </button>
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
  font-weight: 800;
  font-size: var(--fs-body);
  color: var(--ink-soft);
  background: transparent;
  transition: background 0.15s, color 0.15s;
}
.tab.on {
  background: var(--blue);
  color: #fff;
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
  background: #000;
  object-fit: contain;
}
.video-ph {
  width: 100%;
  height: 100%;
  border-radius: var(--radius);
  background: linear-gradient(160deg, #bde8ff, #e6f7ff);
  box-shadow: var(--shadow-hard);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--gap-s);
  cursor: pointer;
  position: relative;
  font-weight: 800;
  color: #4a7ba6;
  text-align: center;
  padding: var(--gap-s);
  min-height: 0;
}
.note {
  font-size: var(--fs-emoji-xl);
  line-height: 1;
}

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
  font-weight: 800;
  font-size: var(--fs-title);
  color: var(--ink);
}
.audio-sub {
  font-size: var(--fs-small);
  color: var(--ink-soft);
  font-weight: 700;
  margin-top: 2px;
}

/* 歌词：占满剩余高度，内部滚动 */
.lyrics {
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-soft);
  padding: var(--gap-m) var(--gap-l);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  text-align: center;
}
.line {
  margin: 0;
  font-size: clamp(15px, min(2.8vh, 2.2vw), 22px);
  font-weight: 700;
  color: var(--ink);
  line-height: 1.5;
}
.line.blank {
  height: var(--gap-m);
}

.play-btn {
  width: clamp(48px, min(11vh, 9vw), 76px);
  height: clamp(48px, min(11vh, 9vw), 76px);
  border-radius: 50%;
  background: var(--green);
  color: #fff;
  font-size: clamp(20px, min(4.4vh, 3.6vw), 30px);
  box-shadow: 0 var(--press) 0 var(--green-dark);
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.play-btn:active {
  transform: translateY(calc(var(--press) - 1px));
  box-shadow: 0 1px 0 var(--green-dark);
}
.miss {
  font-size: var(--fs-small);
  color: #8aa8c2;
  font-weight: 700;
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
  font-weight: 800;
  box-shadow: var(--shadow-hard);
  font-size: var(--fs-small);
  white-space: nowrap;
  color: var(--ink);
}

.under-tip {
  margin: 0;
  color: var(--ink-soft);
  font-weight: 700;
  font-size: var(--fs-small);
  flex: none;
  text-align: center;
}
.finish {
  flex: none;
  width: 100%;
  max-width: 460px;
}

/**
 * 手机横屏：高度是硬约束（约 300~400px）。
 */
@media (max-height: 480px) {
  .under-tip {
    display: none;
  }
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
  .line {
    font-size: 13px;
  }
}
</style>
