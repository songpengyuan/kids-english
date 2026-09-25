<script setup>
import { computed, ref } from "vue";
import { speak } from "../utils/speech";
import { sfxTap } from "../utils/effects";
import { useProgressStore } from "../stores/progress";
import { Volume2 } from "@lucide/vue";

const props = defineProps({
  word: { type: Object, required: true },
  size: { type: String, default: "md" }, // sm | md | lg
  speakZhHint: { type: Boolean, default: false },
  /** 在页内的序号，用于入场动画的阶梯延迟；-1 表示不做入场动画 */
  enterIndex: { type: Number, default: -1 }
});

const progress = useProgressStore();

const imgFailed = ref(false);
const popping = ref(false);
const rootEl = ref(null);

/**
 * 入场动画用响应式开关管理，而不是手动摘类名。
 *
 * 之前 LearnView 透传 class="anim-pop" + style="animation-delay"，点击时手动
 * remove 掉——但组件因 popping 变化重渲染时，Vue 会把父组件透传的 class/style
 * **原样补回来**，pop-in（scale(0) 起步 + fill-mode:both）便带着延迟重新播放：
 * 卡片先隐形零点几秒再蹦出来，看起来就像"点了单词页面跳走了"。
 * 改成 ref 控制后，Vue 自己摘类、且不会再补回，点击只播 tada。
 */
const entering = ref(props.enterIndex >= 0);
const enterDelay = computed(
  () => Math.min(Math.max(props.enterIndex, 0), 8) * 0.06 + "s"
);

/** 点击反馈动画：animate.css 的 tada（摇摆放大），全程卡片保持可见 */
function pop() {
  entering.value = false; // 从此入场动画彻底退场（响应式，Vue 负责摘干净）
  popping.value = false;
  requestAnimationFrame(() => (popping.value = true));
}

/** 点图片：读单词；点单词：也读单词（慢速+中文提示） */
function onImage() {
  sfxTap();
  speak(props.word.en, { lessonId: props.word.lessonId, wordId: props.word.id });
  progress.recordWord(props.word.lessonId, props.word.id, { seen: 1 }); // 今日单词明细
  pop();
}
function onWord() {
  sfxTap();
  speak(props.word.en, { rate: 0.7, lessonId: props.word.lessonId, wordId: props.word.id });
  if (props.speakZhHint) speak(props.word.zh, { lang: "zh-CN", rate: 1 });
  progress.recordWord(props.word.lessonId, props.word.id, { seen: 1 });
  pop();
}
</script>

<template>
  <div
    ref="rootEl"
    class="word-card"
    :class="[
      size,
      { 'anim-pop': entering, animate__animated: popping, animate__tada: popping, animate__faster: popping }
    ]"
    :style="entering ? { animationDelay: enterDelay } : null"
    @animationend.self="popping = false"
  >
    <div class="pic" data-haptic @click="onImage" :title="'点击听发音：' + word.en">
      <img v-if="!imgFailed" :src="word.image" :alt="word.en" @error="imgFailed = true" />
      <!-- 图片缺失时的 emoji 占位 -->
      <span v-else class="placeholder">{{ word.emoji }}</span>
      <span class="speaker"><Volume2 class="k-ico" /></span>
    </div>
    <div class="word" data-haptic @click="onWord">{{ word.en }}</div>
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
  background: var(--media-bg);
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
  bottom: 6px;
  font-size: clamp(14px, 2.3vh, 22px);
  color: var(--blue);
  opacity: 0.9;
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
  background: var(--tint-yellow);
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
