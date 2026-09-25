<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { speak } from "../utils/speech";
import { hapticTap } from "../utils/haptics";
import { sfxCorrect } from "../utils/effects";
import { Check, Star, Volume2 } from "@lucide/vue";

const props = defineProps({ lesson: { type: Object, required: true } });
const emit = defineEmits(["done"]);

const phrases = props.lesson.phrases || [];
/** 本课单词 = 对话的备选词库（孩子可以挑一个"填进"省略号句子） */
const words = props.lesson.words || [];
const activeIdx = ref(-1);

/* ---------- 首次引导：两步操作（先点卡片→再挑词），5 岁孩子需要看一遍 ---------- */
const showGuide = ref(true);
const guideLeaving = ref(false);
let guideTimer = null;
function closeGuide() {
  if (guideLeaving.value) return;
  guideLeaving.value = true;
  clearTimeout(guideTimer);
  // 淡出后移除遮罩（防止误触挡住玩法）
  setTimeout(() => (showGuide.value = false), 280);
}
onMounted(() => {
  guideTimer = setTimeout(closeGuide, 6000); // 不点也会自动淡出
});
onBeforeUnmount(() => clearTimeout(guideTimer));

/** 每条口语句一个 Audio 实例（懒创建）；加载失败置 null，自动回退 TTS */
const audios = new Map();

function playPhrase(p, i) {
  hapticTap();
  activeIdx.value = i;
  // 带填空 "..." 的句子（如 "I see a ..."）：不播预生成音频——
  // 冠词 a 后是省略号（句尾），合成引擎会把 a 读成字母音 /eɪ/。
  // 改为实时合成朗读，把省略号读成 something → "I see a something"，
  // a 后跟名词自然弱读成 /ə/。歌词文本本身不动，音频文件也不动。
  if (p.en.includes("...")) {
    speak(p.en.replace("...", "something"));
    return;
  }
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

/* ---------- 备选单词：先点一张卡片，再挑词填进省略号句子 ---------- */
/** 卡片 index → 当前填入的单词 id */
const filled = ref({});
function pickWord(w) {
  hapticTap();
  const i = activeIdx.value;
  // 还没点过对话卡片：只朗读单词，让孩子先熟悉备选词
  if (i < 0 || !phrases[i]) {
    speak(w.en, { lessonId: w.lessonId, wordId: w.id });
    return;
  }
  const p = phrases[i];
  filled.value = { ...filled.value, [i]: w.id };
  // 句子里有 "..."（如 "I see a ..."）→ 填入并朗读完整句；否则只朗读单词
  if (p.en.includes("...")) {
    speak(p.en.replace("...", w.en));
  } else {
    speak(w.en, { lessonId: w.lessonId, wordId: w.id });
  }
  listened.value.add(i);
  listened.value = new Set(listened.value);
}
/** 填入后的完整句（没填或句子无省略号 → null） */
function filledSentence(p, i) {
  const id = filled.value[i];
  if (!id || !p.en.includes("...")) return null;
  const w = words.find((x) => x.id === id);
  return w ? p.en.replace("...", w.en) : null;
}

function finish() {
  sfxCorrect();
  emit("done", 1);
}
</script>

<template>
  <div class="talk view">
    <!-- 首次引导：两步操作说明（自动淡出，也可点击关闭） -->
    <div v-if="showGuide" class="guide-overlay" @click.self="closeGuide">
      <div class="guide-card anim-pop" :class="{ leave: guideLeaving }" role="dialog" aria-label="亲子对话玩法说明">
        <h3 class="g-title">怎么玩亲子对话？</h3>
        <ol class="g-steps">
          <li><b>1</b> 先点一张对话卡片，听一听怎么说</li>
          <li><b>2</b> 再点下面的单词，把它填进句子里</li>
        </ol>
        <p class="g-note">每句话都听过一遍，就能点亮"我会说啦"</p>
        <button class="k-btn" @click="closeGuide">知道了，开始玩！</button>
      </div>
    </div>

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
        <span class="pen"><Volume2 class="k-ico" />{{ p.en }}</span>
        <!-- 填入后的完整句（选了备选单词后出现） -->
        <span v-if="filledSentence(p, i)" class="pfill anim-pop">{{ filledSentence(p, i) }}</span>
        <span v-if="listened.has(i)" class="heard-mark"><Check class="k-ico" />听过啦</span>
      </button>
    </div>

    <!-- 备选单词：整页只显示一次，点它填进"当前选中的那张卡片" -->
    <div class="word-bank">
      <p class="bank-tip">先点一张对话卡片，再挑一个单词填进去：</p>
      <div class="word-row">
        <button
          v-for="w in words"
          :key="w.id"
          class="wchip"
          :class="{ on: activeIdx >= 0 && filled[activeIdx] === w.id }"
          @click="pickWord(w)"
        >
          {{ w.emoji }} {{ w.en }}
        </button>
      </div>
    </div>

    <button class="k-btn green finish" :disabled="listened.size < phrases.length" @click="finish">
      <template v-if="listened.size < phrases.length">先听一遍所有句子哦</template>
      <template v-else><Star class="k-ico star-fill" />我会说啦</template>
    </button>
  </div>
</template>

<style scoped>
.talk {
  align-items: center;
}

/* ---------- 首次引导遮罩 ---------- */
.guide-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 100);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(40, 30, 20, 0.55);
  padding: var(--gap-l);
}
.guide-card {
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-l);
  max-width: min(88vw, 420px);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-s);
  transition: opacity 0.28s, transform 0.28s;
}
.guide-card.leave {
  opacity: 0;
  transform: scale(0.92);
}
.g-title {
  margin: 0;
  font-size: var(--fs-title);
  color: var(--ink);
}
.g-steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--gap-xs);
  text-align: left;
}
.g-steps li {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  font-weight: 700;
  font-size: var(--fs-body);
  color: var(--ink);
}
.g-steps b {
  flex: none;
  width: clamp(26px, 4.6vh, 34px);
  height: clamp(26px, 4.6vh, 34px);
  border-radius: 50%;
  background: linear-gradient(160deg, var(--yellow), var(--gold));
  color: #6b4e00;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
}
.g-note {
  margin: 0;
  font-size: var(--fs-small);
  color: var(--ink-soft);
  font-weight: 700;
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
  color: var(--blue-dark);
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
}
.heard-mark {
  position: absolute;
  top: var(--gap-xs);
  right: var(--gap-s);
  color: var(--green);
  font-weight: 800;
  font-size: var(--fs-small);
  display: inline-flex;
  align-items: center;
  gap: 0.25em;
}
.heard-mark .k-ico {
  fill: currentColor;
}

/* ---------- 备选单词：填入省略号句子的词库 ---------- */
/* 词库面板：整页只出现一次，放在对话卡片下方 */
.word-bank {
  width: 100%;
  max-width: 680px;
  flex: none;
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-s) var(--gap-m);
  margin-top: var(--gap-xs);
}
.bank-tip {
  margin: 0 0 var(--gap-xs);
  color: var(--ink-soft);
  font-weight: 700;
  font-size: var(--fs-small);
  text-align: center;
}
/* 填入后的完整句：绿色高亮，一眼看出"这句话现在说全了" */
.pfill {
  font-weight: 800;
  font-size: clamp(15px, min(2.9vh, 2.3vw), 24px);
  color: var(--green-dark);
  background: var(--tint-green);
  border-radius: var(--radius-s);
  padding: 2px clamp(8px, 1.2vw, 12px);
}
.word-row {
  display: flex;
  flex-wrap: wrap;
  gap: clamp(4px, 0.8vh, 8px);
  margin-top: var(--gap-xs);
  max-width: 100%;
}
.wchip {
  background: var(--card-bg);
  border-radius: var(--radius-pill);
  padding: clamp(2px, 0.6vh, 4px) clamp(8px, 1.2vw, 12px);
  font-weight: 800;
  font-size: clamp(12px, min(2vh, 1.7vw), 16px);
  color: var(--ink);
  box-shadow: var(--shadow-soft);
  border: 2px solid transparent;
  transition: border-color 0.15s, transform 0.1s, background 0.15s;
  white-space: nowrap;
  min-height: var(--tap-min);
  display: inline-flex;
  align-items: center;
}
.wchip:active {
  transform: scale(0.95);
}
/* 已填入当前句的单词：品牌色描边 + 浅绿底 */
.wchip.on {
  border-color: var(--green);
  background: var(--tint-green);
  color: var(--green-dark);
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
  /* 横屏高度紧张：备选单词收敛成紧凑小条 */
  .word-row {
    gap: 3px;
    margin-top: 2px;
  }
  .wchip {
    font-size: 11px;
    padding: 1px 6px;
    min-height: 26px;
  }
}
</style>
