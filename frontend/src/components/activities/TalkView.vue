<script setup lang="ts">
/**
 * 亲子对话（微信聊天式 · 逐轮对话 + 录音）。
 *
 * 像微信聊天一样对话：家长发一条语音/文字消息 → 孩子按底部输入框说话
 * → 说完就像"发出一条消息"一样出现在对话流（孩子头像 + 大图 + 答句）。
 * 一轮一轮推进，直到本课单词全部对话完 = 本关完成。
 * 星级 = 首次通过率（全部首轮通过 = 3 星）。
 *
 * 录音会话复用 useSpeechSession（与「跟我读」一致）：
 *  - 浏览器支持语音识别 → ASR 自动打分（perfect/good 自动通过，retry 再试）
 *  - 不支持 → 录音回放 + 家长判定（读对了 / 没读准）
 */
import { computed, nextTick, ref, watch, onMounted } from "vue";
import { speak } from "../../services/speech";
import { hapticTap } from "../../services/haptics";
import { sfxCorrect, sfxWrong, bigCelebrate } from "../../services/effects";
import { useSpeechSession } from "../../composables/useSpeechSession";
import type { Lesson, Word, Phrase } from "../../data/lessons";
import { Check, Mic, Square, Volume2 } from "@lucide/vue";
import BaseButton from "../ui/BaseButton.vue";
import SafeBottom from "../layout/SafeBottom.vue";
import LessonFooter from "./LessonFooter.vue";

const props = defineProps<{ lesson: Lesson }>();
const emit = defineEmits(["done", "idx"]);

const words = computed(() => props.lesson.words ?? []);
const phrases = computed<Phrase[]>(() => props.lesson.phrases ?? []);
/** 家长问句（每轮固定，取第一句：What's that?） */
const questionPhrase = computed<Phrase | null>(() => phrases.value[0] ?? null);
/** 孩子答句：优先在 phrases 里精确匹配（有现成答句就用），没有就按问句类型套模板 */
function answerText(w: Word): string {
  const en = w.en.toLowerCase().trim();
  // 1) 先在 phrases 里找包含这个单词的答句（按词边界）
  const p = phrases.value.find((x) => {
    if (x.en.includes("?")) return false;
    return new RegExp(`\\b${en}\\b`).test(x.en.toLowerCase());
  });
  if (p) return p.en;
  // 2) 按问句类型套模板
  const q = phrases.value[0]?.en ?? "";
  if (q.includes("What can you play")) return `I can play the ${w.en}.`;
  if (q.includes("What color")) return `It's ${w.en}.`;
  if (q.includes("What letter")) return `It's letter ${w.en.toUpperCase()}.`;
  if (q.includes("How many")) return `${w.en}.`;
  if (q.includes("Where is your")) return `This is my ${w.en}.`;
  if (q.includes("What do you see")) return `I see the ${w.en}.`;
  if (q.includes("What's that")) return `It's a ${w.en}.`;
  return w.en;
}

/* ---------- 微信聊天式消息流 ---------- */
interface ChatMsg {
  id: number;
  role: "parent" | "kid";
  /** 消息文本（家长问句 / 孩子答句） */
  text?: string;
  /** 消息附带的图片：家长发题图（看图回答） / 孩子回答图 */
  word?: Word;
  /** 孩子说出的内容（识别文本，语音消息展示） */
  heard?: string;
}
const messages = ref<ChatMsg[]>([]);
const msgBox = ref<HTMLDivElement | null>(null);
let msgSeq = 0;
/** 家长发出问句消息（左上角头像 + 左侧气泡，图片作为家长的消息一起发出） */
function pushParent(w: Word, text: string) {
  messages.value.push({ id: ++msgSeq, role: "parent", word: w, text });
  scrollBottom();
}
/** 孩子"发送"消息：大图 + 答句 + 语音文本（右上角头像 + 右侧气泡） */
function pushKid(w: Word, heardText?: string) {
  messages.value.push({ id: ++msgSeq, role: "kid", word: w, text: answerText(w), heard: heardText });
  scrollBottom();
}
/** 新消息后自动滚到底部（微信聊天习惯） */
function scrollBottom() {
  nextTick(() => {
    const box = msgBox.value;
    if (box) box.scrollTop = box.scrollHeight;
  });
}

/** 已通过的词（一轮对话通过 = 记一个） */
const passedIds = ref(new Set<string>());
const passedCount = computed(() => passedIds.value.size);
/** 全部单词对话完 = 完成 */
const allPassed = computed(
  () => words.value.length > 0 && passedIds.value.size >= words.value.length
);

/** 亲子对话录音会话（与「跟我读」同一会话逻辑） */
const session = useSpeechSession(words, {
  onCorrect: (w) => {
    passedIds.value = new Set(passedIds.value).add(w.id);
    sfxCorrect();
    // 孩子"发消息"：大图 + 答句 + 识别文本
    pushKid(w, heard.value || undefined);
    if (allPassed.value) {
      bigCelebrate(); // 全部对话完成 → 庆祝
    } else {
      // 通过一轮 → 稍等片刻家长自动发出下一轮问句
      window.setTimeout(() => {
        if (!allPassed.value) next();
      }, 900);
    }
  },
  onWrong: () => sfxWrong(),
});
/** 解构会话状态/方法（模板中 ref 自动解包） */
const { idx: dlgIdx, cur, status, grade, heard, mode, micBlocked, stars, recAudio, recUrl, startMic, stopMic, parentJudge, retry, next } = session;

/** 轮次切换 → 家长发出问句消息 + 自动朗读（孩子先听再回答） */
let questionTimer: ReturnType<typeof setTimeout> | null = null;
watch(dlgIdx, (v) => {
  emit("idx", v);
  if (questionPhrase.value) {
    if (questionTimer) clearTimeout(questionTimer);
    questionTimer = window.setTimeout(() => {
      pushParent(cur.value, questionPhrase.value!.en);
      speak(questionPhrase.value!.en);
    }, 260);
  }
});
onMounted(() => {
  if (questionPhrase.value) {
    if (questionTimer) clearTimeout(questionTimer);
    questionTimer = window.setTimeout(() => {
      pushParent(cur.value, questionPhrase.value!.en);
      speak(questionPhrase.value!.en);
    }, 320);
  }
});

/** 播放家长问句（点家长消息气泡重听） */
function playQuestion() {
  if (questionPhrase.value) speak(questionPhrase.value.en);
}
/** 播放单词发音（点孩子消息里的大图提示孩子怎么说） */
function playWord(w: Word) {
  speak(w.en, { lessonId: w.lessonId, wordId: w.id });
}
/** 点底部输入框：开始 / 停止录音（说完 = 发消息） */
function toggleMic() {
  hapticTap();
  if (status.value === "listening") stopMic();
  else startMic();
}
/** 孩子这一轮读得不错（ASR perfect/good） */
const gradeOk = computed(
  () => grade.value === "perfect" || grade.value === "good"
);
/** 监听中（录音中） */
const listening = computed(() => status.value === "listening");

function finish() {
  if (!allPassed.value) return;
  sfxCorrect();
  bigCelebrate();
  emit("done", stars.value);
}
</script>

<template>
  <div class="talk view">
    <!-- 对话流：家长消息（左） ⇄ 孩子消息（右），微信气泡样式 -->
    <div class="chat-msgs" ref="msgBox">
      <div
        v-for="m in messages"
        :key="m.id"
        class="msg-row"
        :class="m.role"
      >
        <span v-if="m.role === 'parent'" class="msg-av mom" aria-hidden="true">👩</span>
        <div class="msg-col">
          <div class="msg-bubble" :class="m.role" @click="m.role === 'parent' ? playQuestion() : m.word && playWord(m.word)">
            <template v-if="m.role === 'parent'">
              <!-- 家长发题：文字在上、图片在下（孩子看图回答，不显示英文答案） -->
              <span class="msg-text">{{ m.text }}</span>
              <div v-if="m.word" class="msg-pic parent-pic">
                <img v-if="m.word.image" :src="m.word.image" :alt="m.word.en" class="msg-pic-img" />
                <span v-else class="msg-pic-emoji">{{ m.word.emoji }}</span>
              </div>
            </template>
            <template v-else>
              <!-- 孩子消息：答句在上、语音文本、大图在下（孩子回答的图片） -->
              <span class="msg-text">{{ m.text }}</span>
              <span v-if="m.heard" class="msg-heard">🎤 {{ m.heard }}</span>
              <div v-if="m.word" class="msg-pic">
                <img v-if="m.word.image" :src="m.word.image" :alt="m.word.en" class="msg-pic-img" />
                <span v-else class="msg-pic-emoji">{{ m.word.emoji }}</span>
                <span class="msg-pic-en">{{ m.word.en }}</span>
              </div>
            </template>
          </div>
          <span v-if="m.role === 'kid'" class="msg-time">宝宝</span>
        </div>
        <span v-if="m.role === 'kid'" class="msg-av kid" aria-hidden="true">🧒</span>
      </div>

      <!-- 录音中：输入框正在"打字"的占位气泡 -->
      <div v-if="listening" class="msg-row kid">
        <div class="msg-col">
          <div class="msg-bubble kid talking">
            <span class="msg-text">……</span>
          </div>
        </div>
        <span class="msg-av kid" aria-hidden="true">🧒</span>
      </div>
    </div>

    <!-- 底部输入条 / 判定区（微信聊天输入框位）——全部完成时隐藏，只留"我都会啦"按钮 -->
    <div v-if="!allPassed" class="chat-input">
      <!-- 孩子要说的话：显示在输入框上方（点喇叭听发音）——麦克风不可用时不重复显示（答案已在聊天里） -->
      <button v-if="!micBlocked" class="ci-say" aria-label="宝宝要说的话，点一下听发音" @click="playWord(cur)">
        <span class="ci-say-text">{{ answerText(cur) }}</span>
        <Volume2 class="ci-say-vol k-ico" />
      </button>

      <template v-if="micBlocked && !recUrl">
        <p class="ci-hint">麦克风不可用，点大图听发音后完成这一轮吧</p>
        <BaseButton class="ci-pass" variant="green" :disabled="passedIds.has(cur.id)" @click="parentJudge(true)">
          读对了 ✓
        </BaseButton>
      </template>

      <template v-else-if="status !== 'feedback'">
        <button
          class="input-bar"
          :class="{ talking: listening }"
          aria-label="按住说话或点击录音"
          @click="toggleMic"
        >
          <Mic v-if="!listening" class="ib-ico" />
          <Square v-else class="ib-ico" />
          <span class="ib-text">{{ listening ? "松开 结束 · 我在听…" : "🎤 按住说话" }}</span>
        </button>
      </template>

      <template v-else>
        <!-- ASR 自动打分：读到 perfect/good → 自动下一轮；retry → 再试 -->
        <template v-if="mode === 'asr'">
          <p class="ci-hint" aria-live="polite">
            {{ heard ? `你说的是：${heard}` : "我没听清，再试一次吧" }}
          </p>
          <div class="ci-judge">
            <BaseButton v-if="grade === 'retry'" variant="green" @click="retry()">
              再试一次
            </BaseButton>
            <span v-else class="ci-auto">太棒了，妈妈要问下一个啦！</span>
          </div>
        </template>
        <!-- 录音回放 + 家长判定（识别不可用时的降级） -->
        <template v-else>
          <audio ref="recAudio" :src="recUrl ?? undefined" class="ci-audio" />
          <p class="ci-hint">听一下孩子说的，判定这轮是否通过</p>
          <div class="ci-judge">
            <template v-if="grade === 'retry'">
              <BaseButton variant="green" @click="retry()">再试一次</BaseButton>
            </template>
            <template v-else>
              <BaseButton variant="green" @click="parentJudge(true)">读对了 ✓</BaseButton>
              <BaseButton variant="orange" @click="parentJudge(false)">没读准</BaseButton>
            </template>
          </div>
        </template>
      </template>
    </div>

    <!-- 底部：未完成不显示按钮（头部轮次已是进度），全部通过才出现「我都会啦」 -->
    <LessonFooter
      v-if="allPassed"
      button-text="我都会啦"
      :show-arrow="false"
      @button="finish"
    >
      <template #button-content>
        <Check class="k-ico" />我都会啦
      </template>
    </LessonFooter>
    <SafeBottom v-else :gap="24" />
  </div>
</template>

<style scoped>
.talk {
  align-items: center;
}

/* ===== 轮次条（精简一行） ===== */
.chat-head {
  flex: none;
  width: 100%;
  max-width: 560px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 4px 0;
}
.ch-av {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}
.ch-av.mom { background: #fff3d6; }
.ch-av.kid { background: #d9f6ff; }
.ch-round {
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
  color: var(--brand-dark);
  white-space: nowrap;
}

/* ===== 对话流 ===== */
.chat-msgs {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 560px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 8px;
  scrollbar-width: none;
  background:
    radial-gradient(circle at 20% 15%, rgba(255, 255, 255, 0.5) 0, transparent 40%),
    linear-gradient(180deg, #e8f7e3 0%, #d3f0c9 70%, #bfe8b4 100%);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
}
.chat-msgs::-webkit-scrollbar { display: none; }
.msg-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  animation: anim-pop 0.25s;
}
.msg-row.parent { justify-content: flex-start; }
.msg-row.kid { justify-content: flex-end; }
.msg-av {
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.06);
}
.msg-av.mom { background: #fff3d6; }
.msg-av.kid { background: #d9f6ff; }
.msg-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 72%;
}
.msg-row.parent .msg-col { align-items: flex-start; }
.msg-row.kid .msg-col { align-items: flex-end; }
.msg-bubble {
  padding: 8px 12px;
  border-radius: 14px;
  font-weight: var(--fw-strong);
  font-size: 15px;
  line-height: 1.35;
  color: var(--ink);
  box-shadow: var(--shadow-soft);
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 100%;
}
.msg-bubble.parent {
  background: #fff;
  border-top-left-radius: 4px;
}
.msg-bubble.kid {
  background: #cdebc4;
  border-top-right-radius: 4px;
  align-items: flex-end;
}
.msg-bubble.talking {
  animation: talk-blink 0.7s ease-in-out infinite;
}
@keyframes talk-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
.msg-text {
  white-space: normal;
  word-break: break-word;
}
.msg-heard {
  font-size: 12px;
  font-weight: var(--fw-strong);
  color: var(--ink-soft);
}
.msg-time {
  font-size: 10px;
  font-weight: var(--fw-mid);
  color: var(--ink-faint);
}
.msg-pic {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 14px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.06);
}
.msg-pic.parent-pic {
  padding: 12px 18px;
  border-radius: 14px;
}
.msg-pic.parent-pic .msg-pic-emoji {
  font-size: 72px;
}
.msg-pic.parent-pic .msg-pic-zh {
  font-size: 13px;
  font-weight: var(--fw-strong);
  color: var(--ink);
}
.msg-pic-emoji {
  font-size: 56px;
  line-height: 1;
}
.msg-pic-img {
  width: 140px;
  height: 140px;
  object-fit: contain;
  border-radius: 8px;
}
.msg-pic-en {
  font-weight: var(--fw-strong);
  font-size: 18px;
  color: var(--ink);
}
.msg-pic-zh {
  font-size: 11px;
  font-weight: var(--fw-mid);
  color: var(--ink-faint);
}

/* ===== 底部输入条 / 判定区 ===== */
.chat-input {
  flex: none;
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 6px 0 0;
}
.ci-say {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 7px 16px;
  border-radius: 999px;
  background: var(--card-bg);
  box-shadow: var(--shadow-soft);
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.ci-say-label {
  font-size: 11px;
  font-weight: var(--fw-strong);
  color: var(--ink-faint);
  white-space: nowrap;
}
.ci-say-text {
  font-weight: var(--fw-strong);
  font-size: 18px;
  color: var(--brand-dark);
  letter-spacing: 0.02em;
}
.ci-say-vol {
  width: 18px;
  height: 18px;
  color: var(--orange);
  flex: none;
}
.input-bar {
  width: 100%;
  min-height: 54px;
  border: none;
  border-radius: 22px;
  background: linear-gradient(180deg, #ff9d5c, #ff7a3c);
  color: #fff;
  box-shadow: 0 4px 0 #e05f1e, var(--shadow-hard);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 18px;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.1s, box-shadow 0.1s;
}
.input-bar:active { transform: translateY(2px); box-shadow: 0 2px 0 #e05f1e; }
.input-bar.talking {
  background: linear-gradient(180deg, #ff5c5c, #e63939);
  box-shadow: 0 4px 0 #b02222;
  animation: mic-pulse 1s ease-in-out infinite;
}
@keyframes mic-pulse {
  0%, 100% { box-shadow: 0 4px 0 #b02222, 0 0 0 8px rgba(230, 57, 57, 0.16); }
  50% { box-shadow: 0 4px 0 #b02222, 0 0 0 16px rgba(230, 57, 57, 0.3); }
}
.ib-ico {
  width: 22px;
  height: 22px;
  flex: none;
}
.ib-text {
  font-weight: var(--fw-strong);
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ci-hint {
  margin: 0;
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
  color: var(--ink-soft);
  text-align: center;
}
.ci-judge {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
}
.ci-auto {
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
  color: var(--brand-dark);
  animation: anim-pop 0.3s;
}
.ci-pass {
  width: auto;
  min-width: 160px;
}
.ci-audio {
  display: none;
}
</style>
