<script setup>
import { ref, computed } from "vue";
import { bigCelebrate } from "../utils/effects";
import { speak } from "../utils/speech";
import progress from "../store/progress";

const props = defineProps({ lesson: { type: Object, required: true } });
const emit = defineEmits(["back", "song-done"]);

const playing = ref(false);
const audioEl = ref(null);
const audioMissing = ref(false);
const videoMissing = ref(!props.lesson.song.video);

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

    <div class="video-zone view-body">
      <video
        v-if="!videoMissing"
        :src="lesson.song.video"
        controls
        playsinline
        class="video"
        @error="onVideoError"
      ></video>
      <div v-else class="video-ph" @click="play">
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

    <div class="words-strip">
      <span v-for="w in lesson.words" :key="w.id" class="chip anim-pop">
        {{ w.emoji }} {{ w.en }}
      </span>
    </div>

    <div v-if="lesson.phrases && lesson.phrases.length" class="phrases">
      <h3 class="ph-title">👨‍👩‍👧 亲子口语 · 点一读</h3>
      <button
        v-for="p in lesson.phrases"
        :key="p.en"
        class="phrase anim-pop"
        @click="speak(p.en)"
      >
        <span class="pen">🔊 {{ p.en }}</span>
        <span class="pzh">{{ p.zh }}</span>
      </button>
    </div>

    <p v-if="!videoMissing" class="under-tip">看完视频记得点下方按钮领取小星星哦</p>
    <button v-if="videoMissing && audioMissing" class="k-btn blue finish" @click="onEnded">
      看完啦，领星星 ⭐
    </button>
  </div>
</template>

<style scoped>
.song {
  align-items: center;
}
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
.play-btn {
  width: clamp(48px, min(11vh, 9vw), 76px);
  height: clamp(48px, min(11vh, 9vw), 76px);
  border-radius: 50%;
  background: var(--green);
  color: #fff;
  font-size: clamp(20px, min(4.4vh, 3.6vw), 30px);
  box-shadow: 0 var(--press) 0 var(--green-dark);
  flex: none;
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
  background: #fff;
  border-radius: var(--radius-s);
  padding: clamp(3px, 0.8vh, 6px) clamp(8px, 1.2vw, 12px);
  font-weight: 800;
  box-shadow: var(--shadow-hard);
  font-size: var(--fs-small);
  white-space: nowrap;
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

.phrases {
  width: 100%;
  max-width: 620px;
  flex: none;
  background: #fff7e6;
  border: 3px dashed var(--yellow);
  border-radius: var(--radius);
  padding: clamp(6px, 1.2vh, 10px) clamp(10px, 1.6vw, 14px);
  display: flex;
  flex-direction: column;
  gap: var(--gap-xs);
}
.ph-title {
  margin: 0;
  font-size: var(--fs-small);
  color: #a07800;
}
.phrase {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  background: #fff;
  border-radius: var(--radius-s);
  padding: clamp(5px, 1vh, 8px) clamp(8px, 1.2vw, 12px);
  box-shadow: 0 3px 0 #e8d9a8;
  font-weight: 800;
  text-align: left;
}
.phrase:active {
  transform: translateY(2px);
  box-shadow: none;
}
.pen {
  font-size: clamp(13px, min(2.2vh, 1.8vw), 17px);
  color: var(--ink);
}
.pzh {
  font-size: clamp(10px, min(1.6vh, 1.3vw), 13px);
  color: var(--ink-faint);
}

/**
 * 手机横屏：高度是硬约束（约 300~400px）。
 * 亲子口语块改成横向排布，一行放两条，省下整整一行高度。
 */
@media (max-height: 480px) {
  .phrases {
    flex-direction: row;
    align-items: stretch;
    flex-wrap: wrap;
    gap: 6px;
    border-width: 2px;
    padding: 6px 10px;
  }
  .ph-title {
    display: none;
  }
  .phrase {
    flex: 1 1 40%;
    min-width: 0;
  }
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
}

/* 手机竖屏：单词条容易堆很多行，收成一行可横向滑动 */
@media (max-width: 600px) {
  .phrases {
    max-width: 100%;
  }
}
</style>
