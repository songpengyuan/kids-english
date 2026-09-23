<script setup>
import { ref } from "vue";
import { speak } from "../utils/speech";
import { hapticTap } from "../utils/haptics";
import { sfxCorrect } from "../utils/effects";

const props = defineProps({ lesson: { type: Object, required: true } });
const emit = defineEmits(["done"]);

const phrases = props.lesson.phrases || [];
const activeIdx = ref(-1);

/** 每条口语句一个 Audio 实例（懒创建）；加载失败置 null，自动回退 TTS */
const audios = new Map();

function playPhrase(p, i) {
  hapticTap();
  activeIdx.value = i;
  if (!audios.has(p.en)) {
    const a = new Audio(p.audio);
    a.addEventListener("error", () => audios.set(p.en, null), { once: true });
    audios.set(p.en, a);
  }
  const a = audios.get(p.en);
  if (a) {
    a.currentTime = 0;
    a.play().catch(() => {
      audios.set(p.en, null);
      speak(p.en);
    });
  } else {
    speak(p.en);
  }
}

/** 每条都听过至少一遍才亮「我会说啦」 */
const listened = ref(new Set());
function tap(p, i) {
  playPhrase(p, i);
  listened.value.add(i);
  listened.value = new Set(listened.value);
}

function finish() {
  sfxCorrect();
  emit("done", 1);
}
</script>

<template>
  <div class="talk view">
    <div class="talk-head view-body-head">
      <h2 class="talk-title">👨‍👩‍👧 亲子对话</h2>
      <p class="talk-tip">点卡片听发音，然后和爸爸妈妈轮流说一说吧</p>
    </div>

    <div class="phrase-list view-body">
      <button
        v-for="(p, i) in phrases"
        :key="p.en"
        class="phrase anim-pop"
        :class="{ active: activeIdx === i, heard: listened.has(i) }"
        :style="{ animationDelay: i * 0.1 + 's' }"
        @click="tap(p, i)"
      >
        <span class="role">{{ i % 2 === 0 ? "🙋 家长说" : "🧒 宝宝答" }}</span>
        <!-- 中文对话在上，英文单词/句子放在对话下面 -->
        <span class="pzh">{{ p.zh }}</span>
        <span class="pen">🔊 {{ p.en }}</span>
        <span v-if="listened.has(i)" class="heard-mark">✓ 听过啦</span>
      </button>
    </div>

    <button class="k-btn green finish" :disabled="listened.size < phrases.length" @click="finish">
      {{ listened.size < phrases.length ? "先听一遍所有句子哦" : "我会说啦 ⭐" }}
    </button>
  </div>
</template>

<style scoped>
.talk {
  align-items: center;
}
.talk-head {
  width: 100%;
  text-align: center;
  flex: none;
}
.talk-title {
  margin: 0;
  font-size: var(--fs-title);
}
.talk-tip {
  margin: var(--gap-xs) 0 0;
  color: var(--ink-soft);
  font-weight: 700;
  font-size: var(--fs-small);
}

.phrase-list {
  width: 100%;
  max-width: 680px;
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
  justify-content: center;
}

.phrase {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  background: var(--card-bg);
  border-radius: var(--radius);
  padding: var(--gap-s) var(--gap-m);
  box-shadow: var(--shadow-hard);
  border: 4px solid transparent;
  transition: border-color 0.15s;
  text-align: left;
  min-width: 0;
}
.phrase.active {
  border-color: var(--green);
}
.phrase.heard {
  background: var(--tint-green);
}
.role {
  font-size: var(--fs-small);
  font-weight: 800;
  color: var(--ink-faint);
}
/* 中文对话：卡片主文本 */
.pzh {
  font-weight: 800;
  font-size: clamp(16px, min(3.2vh, 2.6vw), 26px);
  color: var(--ink);
}
/* 英文单词/句子：放在对话下面，用主题色突出 */
.pen {
  font-weight: 800;
  font-size: clamp(15px, min(2.9vh, 2.3vw), 24px);
  color: var(--blue-dark, #1899d6);
}
.heard-mark {
  position: absolute;
  top: var(--gap-xs);
  right: var(--gap-s);
  color: var(--green);
  font-weight: 800;
  font-size: var(--fs-small);
}

.finish {
  flex: none;
  width: 100%;
  max-width: 460px;
}
.finish:disabled {
  filter: grayscale(1);
  opacity: 0.55;
}

/* 手机横屏：句子卡片改双列省高度 */
@media (max-height: 480px) {
  .phrase-list {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .phrase {
    flex: 1 1 45%;
    min-width: 0;
    padding: var(--gap-xs) var(--gap-s);
  }
  .talk-tip {
    display: none;
  }
}
</style>
