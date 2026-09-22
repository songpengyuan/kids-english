<script setup>
import { ref, computed, onBeforeUnmount } from "vue";
import { speak } from "../utils/speech";
import {
  asrSupported,
  createWordRecognizer,
  scorePronunciation,
  gradeScore,
  recorderSupported,
  createRecorder
} from "../utils/speechScore";
import { celebrate, sfxCorrect, sfxWrong, sfxTap } from "../utils/effects";

const props = defineProps({ words: { type: Object, required: true } });
const emit = defineEmits(["done"]);

/*
 * 双模式：
 *  asr     —— 浏览器语音识别自动打分（默认尝试）
 *  record  —— 降级：录音回放 + 家长判定（识别不可用/网络失败时切换）
 */
const mode = ref(asrSupported() ? "asr" : "record");
const idx = ref(0); // 当前单词
const status = ref("idle"); // idle | listening | feedback
const grade = ref(""); // perfect | good | retry
const heard = ref(""); // 识别到的内容
const firstAttemptOk = ref(0); // 一次通过的词数
const attempts = ref(0); // 当前词第几次尝试
const canRecord = recorderSupported();
const recordHint = ref("");
const recUrl = ref("");
const imgFailed = ref(false);

let recognizer = null;
let recorder = null;

const cur = computed(() => props.words[idx.value]);
const progressText = computed(() => `${idx.value + 1} / ${props.words.length}`);

function hearExample() {
  sfxTap();
  speak(cur().en, { slow: false });
}

/* ---------- ASR 主路径 ---------- */
let asrTimer = null;
function startAsr() {
  if (recognizer) {
    recognizer.abort();
    recognizer = null;
  }
  status.value = "listening";
  grade.value = "";
  heard.value = "";
  try {
    recognizer = createWordRecognizer(cur().en);
  } catch {
    fallbackToRecord("语音识别不可用");
    return;
  }
  const my = recognizer;
  my.onFinish((err, alternatives) => {
    if (recognizer !== my) return; // 已被新的尝试取代
    recognizer = null;
    if (err === "not-allowed" || err === "service-not-allowed") {
      fallbackToRecord("麦克风权限被拒绝");
      return;
    }
    if (err === "network") {
      fallbackToRecord("识别服务连不上，已改用录音模式");
      return;
    }
    if (err === "no-speech") {
      attempts.value++;
      status.value = "feedback";
      grade.value = "retry";
      heard.value = "";
      sfxWrong();
      return;
    }
    // 正常结束（err 为 null 或 aborted）
    const { score, heard: h } = scorePronunciation(cur().en, alternatives);
    heard.value = h;
    grade.value = gradeScore(score);
    attempts.value++;
    status.value = "feedback";
    if (grade.value === "retry") {
      sfxWrong();
    } else {
      sfxCorrect();
      celebrate();
      if (attempts.value === 1) firstAttemptOk.value++;
      speak(cur().en);
    }
  });
  my.start();
  // 最长 3.5 秒自动收尾
  clearTimeout(asrTimer);
  asrTimer = setTimeout(() => my.stop(), 3500);
}

function fallbackToRecord(reason) {
  if (recognizer) {
    recognizer.abort();
    recognizer = null;
  }
  mode.value = "record";
  recordHint.value = reason ? `已切换录音模式：${reason}` : "已切换录音模式";
  status.value = "idle";
}

/* ---------- 降级路径：录音回放 + 家长判定 ---------- */
async function startRecord() {
  status.value = "listening";
  try {
    if (!recorder) recorder = createRecorder();
    await recorder.start();
  } catch {
    status.value = "idle";
    recordHint.value = "无法访问麦克风，请检查权限";
  }
}
function stopRecord() {
  if (!recorder) return;
  recorder.stop().then((url) => {
    if (recUrl.value) URL.revokeObjectURL(recUrl.value);
    recUrl.value = url;
    grade.value = ""; // 等家长判定
    status.value = "feedback";
  });
}
function parentJudge(ok) {
  grade.value = ok ? "perfect" : "retry";
  attempts.value++;
  status.value = "feedback";
  if (ok) {
    sfxCorrect();
    celebrate();
    if (attempts.value === 1) firstAttemptOk.value++;
    speak(cur().en);
  } else {
    sfxWrong();
  }
}

/* ---------- 流程 ---------- */
function retry() {
  status.value = "idle";
  grade.value = "";
}
function next() {
  if (idx.value + 1 >= props.words.length) {
    const ratio = firstAttemptOk.value / props.words.length;
    const stars = ratio >= 0.8 ? 3 : ratio >= 0.5 ? 2 : 1;
    emit("done", stars);
    return;
  }
  idx.value++;
  attempts.value = 0;
  status.value = "idle";
  grade.value = "";
  heard.value = "";
  imgFailed.value = false;
  if (recUrl.value) {
    URL.revokeObjectURL(recUrl.value);
    recUrl.value = "";
  }
}

onBeforeUnmount(() => {
  clearTimeout(asrTimer);
  if (recognizer) recognizer.abort();
  if (recUrl.value) URL.revokeObjectURL(recUrl.value);
  if (recorder && recorder.release) recorder.release();
});
</script>

<template>
  <div class="speak">
    <div class="speak-head">
      <span class="prog">{{ progressText }}</span>
      <span class="mode-tag">{{ mode === 'asr' ? '🎤 自动打分' : '🎙️ 录音回放' }}</span>
    </div>

    <div class="word-zone">
      <div class="pic anim-pop" @click="hearExample">
        <img v-if="!imgFailed" :src="cur.image" @error="imgFailed = true" />
        <span v-else class="fallback-emoji">{{ cur.emoji }}</span>
      </div>
      <button class="word" @click="hearExample">{{ cur.en }}</button>
      <p class="tip" v-if="mode === 'asr'">点图听一遍，再按住大麦克风跟读给小耳朵听</p>
      <p class="tip" v-else>{{ recordHint || '按住大麦克风录音，说完点方形按钮结束，和爸爸妈妈一起听回放' }}</p>
    </div>

    <!-- 麦克风按钮：ASR=按住即说；录音=点开始/点结束 -->
    <div class="mic-zone" v-if="status !== 'feedback' || mode === 'asr'">
      <button
        v-if="mode === 'asr'"
        class="mic"
        :class="{ live: status === 'listening' }"
        @pointerdown.prevent="startAsr"
      >
        🎤
      </button>
      <button
        v-else
        class="mic"
        :class="{ live: status === 'listening' }"
        @click="status === 'listening' ? stopRecord() : startRecord()"
      >
        {{ status === 'listening' ? '⏹️' : '🎤' }}
      </button>
      <div v-if="status === 'listening'" class="waves"><i></i><i></i><i></i></div>
      <p class="mic-label">
        {{ status === 'listening' ? (mode === 'asr' ? '正在听…说给麦克风听' : '录音中…点方形结束') : '按住说话' }}
      </p>
      <audio v-if="recUrl && mode === 'record'" :src="recUrl" controls class="replay"></audio>
    </div>

    <!-- 反馈 -->
    <div v-if="status === 'feedback'" class="feedback anim-fade-up">
      <template v-if="mode === 'record' && grade === ''">
        <audio :src="recUrl" controls class="replay big"></audio>
        <p class="judge-q">听一听回放，读得准不准？</p>
        <div class="row">
          <button class="k-btn green" @click="parentJudge(true)">👍 读得棒</button>
          <button class="k-btn orange" @click="parentJudge(false)">🔁 再试一次</button>
        </div>
      </template>
      <template v-else-if="mode === 'record'">
        <p class="verdict" :class="grade">
          <span v-if="grade === 'perfect'">🌟 太棒了！</span>
          <span v-else>🔁 再试一次吧，先听一遍示范</span>
        </p>
        <div class="row">
          <button class="k-btn gray" @click="hearExample">🔈 再听示范</button>
          <button v-if="grade === 'retry'" class="k-btn orange" @click="retry">🎤 我再试试</button>
          <button v-else class="k-btn" @click="next">继续 →</button>
        </div>
      </template>
      <template v-else>
        <p class="verdict" :class="grade">
          <span v-if="grade === 'perfect'">🌟 太棒了！发音很标准</span>
          <span v-else-if="grade === 'good'">😊 很不错，再响亮一点就更棒啦</span>
          <span v-else>🔁 再试一次吧，先听一遍示范</span>
        </p>
        <p v-if="heard" class="heard">小耳朵听到的是："{{ heard }}"</p>
        <div class="row">
          <button class="k-btn gray" @click="hearExample">🔈 再听示范</button>
          <button v-if="grade === 'retry'" class="k-btn orange" @click="retry">🎤 我再试试</button>
          <button v-else class="k-btn" @click="next">继续 →</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.speak { display: flex; flex-direction: column; align-items: center; gap: 10px; flex: 1; min-height: 0; }
.speak-head { width: 100%; display: flex; justify-content: space-between; align-items: center; flex: none; }
.prog { font-weight: 800; color: #9a8f80; }
.mode-tag { background: #fff; border-radius: 14px; padding: 4px 12px; font-weight: 800; font-size: 14px; box-shadow: 0 2px 0 rgba(0,0,0,.08); }
.word-zone { display: flex; flex-direction: column; align-items: center; gap: 6px; flex: none; }
.pic {
  width: clamp(110px, 24vh, 170px); height: clamp(110px, 24vh, 170px);
  background: #fff; border-radius: var(--radius);
  box-shadow: var(--shadow-hard); display: flex; align-items: center; justify-content: center;
  font-size: clamp(60px, 12vh, 110px); cursor: pointer; transition: transform 0.15s;
  overflow: hidden;
}
.pic:active { transform: scale(0.94); }
.pic img { width: 80%; height: 80%; object-fit: contain; }
.word { font-size: clamp(24px, 4.5vh, 34px); }
.tip { margin: 0; color: #9a8f80; font-weight: 700; font-size: 13px; text-align: center; max-width: 360px; }
.mic-zone { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: none; }
.mic {
  width: clamp(80px, 15vh, 110px); height: clamp(80px, 15vh, 110px); border-radius: 50%;
  font-size: clamp(32px, 6vh, 46px); border: none; cursor: pointer;
  background: radial-gradient(circle at 35% 30%, #ffd54d, #ff9f43);
  box-shadow: 0 8px 0 #d97b1e, 0 12px 22px rgba(0,0,0,.18);
  transition: transform 0.1s, box-shadow 0.1s;
  touch-action: none;
}
.mic:active, .mic.live { transform: translateY(6px); box-shadow: 0 2px 0 #d97b1e; }
.mic.live { animation: pulse 1s infinite; }
@keyframes pulse {
  0%, 100% { outline: 6px solid rgba(255,159,67,.35); }
  50% { outline: 14px solid rgba(255,159,67,.15); }
}
.waves { display: flex; gap: 5px; height: 22px; align-items: flex-end; }
.waves i { width: 6px; background: var(--orange); border-radius: 3px; animation: bounce 0.7s infinite ease-in-out; }
.waves i:nth-child(2) { animation-delay: 0.15s; }
.waves i:nth-child(3) { animation-delay: 0.3s; }
@keyframes bounce { 0%,100% { height: 8px; } 50% { height: 22px; } }
.mic-label { margin: 0; font-weight: 800; color: #9a8f80; }
.replay { height: 36px; }
.replay.big { height: 44px; }
.feedback { width: 100%; max-width: 460px; flex: none; background: #fff; border-radius: var(--radius); box-shadow: var(--shadow-hard); padding: 10px 14px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.verdict { margin: 0; font-size: 18px; font-weight: 800; text-align: center; }
.verdict.perfect { color: var(--green-dark); }
.verdict.good { color: #1a8ec4; }
.verdict.retry { color: #d97b1e; }
.heard { margin: 0; color: #9a8f80; font-weight: 700; font-size: 14px; }
.judge-q { margin: 0; font-weight: 800; font-size: 18px; }
.row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
.k-btn.orange { background: var(--orange); box-shadow: 0 5px 0 #d97b1e; }
.k-btn.green { background: var(--green); box-shadow: 0 5px 0 var(--green-dark); }
</style>
