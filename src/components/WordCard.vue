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
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-xs);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-xs);
  /* 高度由父级网格行高决定，这里必须可收缩，否则会顶破容器 */
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.pic {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  border-radius: var(--radius-s);
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
  font-size: var(--fs-emoji-l);
  line-height: 1;
}
.word-card.lg .placeholder {
  font-size: var(--fs-emoji-xl);
}
.word-card.sm .placeholder {
  font-size: clamp(20px, min(4.4vh, 3.6vw), 34px);
}
.speaker {
  position: absolute;
  right: 6px;
  bottom: 4px;
  font-size: clamp(12px, 2vh, 20px);
  opacity: 0.85;
  animation: float-y 2.4s ease-in-out infinite;
}
.word {
  font-size: clamp(15px, min(2.9vh, 2.3vw), 27px);
  font-weight: 800;
  letter-spacing: 0.5px;
  color: var(--ink);
  cursor: pointer;
  padding: 0 var(--gap-s);
  border-radius: var(--radius-s);
  flex: none;
  min-height: clamp(24px, 4.6vh, 44px);
  line-height: clamp(24px, 4.6vh, 44px);
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.word:active {
  background: #fff3c4;
}
.word-card.sm .word {
  font-size: clamp(13px, min(2.2vh, 1.8vw), 20px);
}
.word-card.lg .word {
  font-size: clamp(19px, min(3.8vh, 3vw), 34px);
}

/* 极窄或极矮时把"点读"图标藏掉，避免遮挡图片 */
@media (max-height: 420px), (max-width: 340px) {
  .speaker {
    display: none;
  }
}
</style>
