<script setup lang="ts">
/**
 * 统一点读组件（组件库 · components/ui/SpeakText.vue）
 *
 * 目的：任何"可点文字"包一层即点读——统一"点到的文字都要发音"。
 * - 单词（lessonId + wordId）→ 预生成 mp3 → 3s 未开始播放 → 原生 TTS
 * - 文案（zh / 纯文本）→ TTS 朗读（或按需走 mp3）
 *
 * 点击即读、再点打断重读；朗读时显示波浪动画；props 配置化渲染形态与朗读参数。
 * 与页面自动朗读的区别：本组件是"用户点读"入口；进页自动朗读（角色介绍等）
 * 仍直接调 speak/speakZh 服务，不组件化。
 */
import { ref } from "vue";
import { speak, speakZh } from "../../services/speech";

const props = withDefaults(
  defineProps<{
    /** 英文文本（朗读内容，通常即显示文字） */
    text: string;
    /** 中文文案：传了则朗读中文（zh 优先于 text） */
    zh?: string;
    /** 单词归属课时 id（提供后按精确键查预生成 mp3） */
    lessonId?: string | null;
    /** 单词 id（与 lessonId 成对） */
    wordId?: string | null;
    /** 跳过预生成 mp3，直接用 TTS（整句/短语/课程名，避免误命中单词音频） */
    ttsOnly?: boolean;
    /** TTS 语速 */
    rate?: number;
    /** 朗读语言（TTS 用，en-US / zh-CN） */
    lang?: string;
    /** 渲染形态：span（内联文字，默认）| button（独立按钮） */
    as?: "span" | "button";
    /** mp3 加载超时（ms），默认 3000：3 秒内未开始出声 → 降级原生 TTS */
    timeoutMs?: number;
    /** 朗读中文时是否绕过音效开关（学习内容=true，提示语=false） */
    bypassMute?: boolean;
  }>(),
  {
    zh: "",
    lessonId: null,
    wordId: null,
    ttsOnly: false,
    rate: 0.85,
    lang: "en-US",
    as: "span",
    timeoutMs: 3000,
    bypassMute: true,
  }
);

/** 本实例是否正在朗读（波浪动画只显示在触发的文字上，不全局闪烁） */
const active = ref(false);

async function play() {
  active.value = true;
  try {
    if (props.zh) {
      await speakZh(props.zh, 1, { bypassMute: props.bypassMute });
      return;
    }
    if (props.lessonId && props.wordId) {
      await speak(props.text, {
        lessonId: props.lessonId,
        wordId: props.wordId,
        rate: props.rate,
        lang: props.lang,
        ttsOnly: props.ttsOnly,
        timeoutMs: props.timeoutMs,
      });
      return;
    }
    await speak(props.text, {
      rate: props.rate,
      lang: props.lang,
      ttsOnly: props.ttsOnly,
      timeoutMs: props.timeoutMs,
    });
  } finally {
    active.value = false;
  }
}

/** span 形态是文字级点读：隔离宿主容器的点击（如课程卡点标题=听发音，不进课） */
function onSpanClick(e: MouseEvent) {
  e.stopPropagation();
  play();
}
</script>

<template>
  <button
    v-if="as === 'button'"
    type="button"
    class="spk"
    :class="{ on: active }"
    :aria-label="zh || text"
    :aria-pressed="active"
    @click="play"
  >
    <slot>{{ text }}</slot>
    <span v-if="active" class="spk-wave" aria-hidden="true"><i></i><i></i><i></i></span>
  </button>
  <span
    v-else
    class="spk spk-inline"
    :class="{ on: active }"
    :aria-label="zh || text"
    role="button"
    tabindex="0"
    @click="onSpanClick"
    @keydown.enter.prevent="play"
  >
    <slot>{{ text }}</slot>
    <span v-if="active" class="spk-wave" aria-hidden="true"><i></i><i></i><i></i></span>
  </span>
</template>

<style scoped>
/* 默认透明：继承宿主文字外观，仅扩大点按区 + 激活反馈 */
.spk {
  background: none;
  border: none;
  padding: 2px 4px;
  margin: -2px -4px;
  font: inherit;
  color: inherit;
  letter-spacing: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 6px;
  -webkit-tap-highlight-color: transparent;
  line-height: inherit;
}
.spk:focus-visible {
  outline: 2px solid var(--blue, #1cb0f6);
  outline-offset: 2px;
}
.spk.on {
  background: rgba(28, 176, 246, 0.14);
}
/* 朗读波浪：三根跳动小竖条（与玩法页一致的语言） */
.spk-wave {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 0.9em;
  flex: none;
}
.spk-wave i {
  width: 3px;
  border-radius: 2px;
  background: var(--blue, #1cb0f6);
  animation: spk-bounce 0.9s ease-in-out infinite;
}
.spk-wave i:nth-child(2) {
  animation-delay: 0.18s;
}
.spk-wave i:nth-child(3) {
  animation-delay: 0.36s;
}
@keyframes spk-bounce {
  0%,
  100% {
    height: 30%;
  }
  50% {
    height: 100%;
  }
}
</style>
