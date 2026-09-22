<script setup>
import { ref } from "vue";
import { speak } from "../utils/speech";
import { sfxTap } from "../utils/effects";

const props = defineProps({
  word: { type: Object, required: true },
  size: { type: String, default: "md" }, // sm | md | lg
  speakZhHint: { type: Boolean, default: false }
});

const imgFailed = ref(false);
const bouncing = ref(false);

/** 点图片：读单词；点单词：也读单词（慢速+中文提示） */
function onImage() {
  sfxTap();
  speak(props.word.en);
  pop();
}
function onWord() {
  sfxTap();
  speak(props.word.en, { rate: 0.7 });
  if (props.speakZhHint) speak(props.word.zh, { lang: "zh-CN", rate: 1 });
  pop();
}
function pop() {
  bouncing.value = false;
  requestAnimationFrame(() => (bouncing.value = true));
  setTimeout(() => (bouncing.value = false), 520);
}
</script>

<template>
  <div class="word-card" :class="[size, { 'anim-bounce': bouncing }]">
    <div class="pic" @click="onImage" :title="'点击听发音：' + word.en">
      <img v-if="!imgFailed" :src="word.image" :alt="word.en" @error="imgFailed = true" />
      <!-- 图片缺失时的 emoji 占位 -->
      <span v-else class="placeholder">{{ word.emoji }}</span>
      <span class="speaker">🔊</span>
    </div>
    <div class="word" @click="onWord">{{ word.en }}</div>
  </div>
</template>

<style scoped>
.word-card {
  background: #fff;
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-height: 0;
  overflow: hidden;
}
.pic {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(160deg, #fff7de, #ffe9c4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.pic img {
  width: 86%;
  height: 86%;
  object-fit: contain;
  pointer-events: none;
}
.placeholder {
  font-size: clamp(36px, 7vh, 64px);
}
.word-card.lg .placeholder { font-size: clamp(56px, 12vh, 110px); }
.word-card.sm .placeholder { font-size: clamp(28px, 5vh, 44px); }
.speaker {
  position: absolute;
  right: 8px;
  bottom: 6px;
  font-size: 20px;
  opacity: 0.85;
  animation: float-y 2.4s ease-in-out infinite;
}
.word {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--ink);
  cursor: pointer;
  padding: 2px 12px;
  border-radius: 10px;
  min-height: 40px;
  line-height: 40px;
}
.word:active { background: #fff3c4; }
.word-card.sm .word { font-size: 20px; }
.word-card.lg .word { font-size: 34px; }
</style>
