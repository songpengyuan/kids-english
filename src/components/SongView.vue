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
  <div class="song">
    <audio ref="audioEl" :src="lesson.song.audio" preload="none" @error="onAudioError" @ended="onEnded" />

    <div class="video-zone">
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
        <p v-else class="miss">🎬 童谣视频/音频还没有上传<br />（把 mp3/mp4 放进对应课时目录就能响）</p>
        <button v-if="!playing && !audioMissing" class="play-btn anim-pop">▶</button>
        <button v-else-if="playing && !audioMissing" class="play-btn anim-pop" @click.stop="pause">⏸</button>
      </div>
    </div>

    <div class="words-strip">
      <span v-for="w in lesson.words" :key="w.id" class="chip anim-pop">{{ w.emoji }} {{ w.en }}</span>
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
    <button v-if="videoMissing && audioMissing" class="k-btn blue finish" @click="onEnded">看完啦，领星星 ⭐</button>
  </div>
</template>

<style scoped>
.song { display: flex; flex-direction: column; align-items: center; gap: 10px; flex: 1; min-height: 0; }
.video-zone { width: 100%; flex: 1; min-height: 0; display: flex; }
.video { width: 100%; max-height: 100%; border-radius: var(--radius); box-shadow: var(--shadow-hard); background: #000; object-fit: contain; }
.video-ph {
  width: 100%; flex: 1; min-height: 0; border-radius: var(--radius);
  background: linear-gradient(160deg, #bde8ff, #e6f7ff);
  box-shadow: var(--shadow-hard);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; cursor: pointer; position: relative;
  font-weight: 800; color: #4a7ba6; text-align: center; padding: 12px;
}
.note { font-size: clamp(40px, 8vh, 60px); }
.play-btn {
  width: clamp(56px, 10vh, 76px); height: clamp(56px, 10vh, 76px); border-radius: 50%;
  background: var(--green); color: #fff; font-size: clamp(22px, 4vh, 30px);
  box-shadow: 0 5px 0 var(--green-dark);
}
.play-btn:active { transform: translateY(4px); box-shadow: 0 1px 0 var(--green-dark); }
.miss { font-size: 14px; color: #8aa8c2; font-weight: 700; line-height: 1.6; }
.words-strip { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; flex: none; max-height: 18vh; overflow: hidden; }
.chip {
  background: #fff; border-radius: 14px; padding: 6px 12px;
  font-weight: 800; box-shadow: var(--shadow-hard); font-size: 15px;
}
.under-tip { margin: 0; color: #8a7f6f; font-weight: 700; flex: none; }
.finish { flex: none; width: 100%; max-width: 420px; }
.phrases {
  width: 100%; max-width: 560px; flex: none;
  background: #fff7e6; border: 3px dashed #ffc800; border-radius: var(--radius);
  padding: 10px 14px; display: flex; flex-direction: column; gap: 8px;
}
.ph-title { margin: 0; font-size: 15px; color: #a07800; }
.phrase {
  display: flex; flex-direction: column; align-items: flex-start; gap: 0;
  background: #fff; border-radius: 14px; padding: 8px 12px;
  box-shadow: 0 3px 0 #e8d9a8; font-weight: 800; text-align: left;
}
.phrase:active { transform: translateY(2px); box-shadow: none; }
.pen { font-size: 16px; color: var(--ink); }
.pzh { font-size: 12px; color: #a09a8f; }
</style>
