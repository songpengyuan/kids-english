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
 *
 * 2026-10-17 两处调整（用户反馈）：
 *  ① 进度位置对齐「跟我读」：页内顶部一行 `3 / 7` + 玩法标签（StageHead），
 *    顶栏改回与其他玩法同一根分段/圆点进度（LessonProgressHeader），
 *    不再自造一条"顶栏细进度条 + 第 N/M 轮"。
 *  ② 读对了**不留展示态**：过去读对后停在"太棒了，妈妈要问下一个啦！"上，
 *    底部还是上一轮的句子，孩子不知道该说什么。现在读对即推进下一轮
 *    （ADVANCE_MS 后切索引），底部立刻换成新的一句"宝宝要说的话"。
 *
 * 2026-10-17 ③ 对话区整体放大一档：面板占屏 70%，里面却是 15px 小字 + 140px 小图，
 *    "大框里装小内容"。气泡字号/配图/头像/内边距统一走 --talk-* 尺寸 token
 *    （锚 vh，窄屏不会像 --fs-body / --gap-* 那样被压到最小值）；
 *    顺带把「宝宝要说的话」补到 --tap-min（原来只有 42px，不够孩子点）。
 *
 * 2026-10-18 ④ 放大之后露出的三处层级问题（都是"量出来"的，不是看出来的）：
 *   · 主行动键最小：气泡已 18.7px，录音键却写死 15px / 54px 高 —— 孩子每轮都要点的
 *     那颗键，字是全屏最小、高度只够 --tap-min 的下沿。新增 --talk-bar-fs / --talk-bar-h，
 *     主行动必须是这屏最大最亮的可点目标。
 *   · 单词标签比句子还大：孩子气泡里 `.msg-pic-en`（21px）比答句本身（18.7px）还大，
 *     主次颠倒。降到 0.85× 并转 --talk-ink-soft —— 句子才是主信息。
 *   · "宝宝"小标签用 --ink-faint 画在固定浅绿底板上：又是"插画面上用主题态文字色"，
 *     实测亮色 2.19:1 / 暗色 3.47:1 都不达标，改用 --talk-ink-soft（4.98:1）。
 *   另外把"🎤 按住说话"改成"点一下说话"——实现是点击切换，键面必须等于行为。
 *
 * 2026-10-25 ⑤ 按词选问答：过去 phrases[0] 当全课固定问句、答句按问句类型套模板，
 *   词性多样的课会产出错误英文——l11 动物轮问"什么颜色"、答句缺冠词（"It's duck."）；
 *   l9 的 nose 命中祈使句 "Put it on your nose."。问答选择下沉到 utils/talkQa
 *   （精确匹配 → 填空 → 同组替换 → 模板兜底），问句里的示例词（"Where is your
 *   finger?"）也按轮替换成当前词。配合 LessonView：talk 加入词群（l11 颜色/动物
 *   各一段，不再一口气 19 轮）。顺带三处小修：完成庆祝只在「我都会啦」放一次
 *   （过去最后一轮通过 + 点按钮各放一次）；卸载时清问句定时器（过去退出页面
 *   ~180ms 后问句还会响一声）；开录音前先停 TTS（过去 ASR 可能录进问句人声）。
 */
import { computed, nextTick, ref, watch, onMounted, onBeforeUnmount } from "vue";
import { speak, speakText, stopSpeaking } from "../../services/speech";
import { hapticTap } from "../../services/haptics";
import { sfxCorrect, sfxWrong, bigCelebrate } from "../../services/effects";
import { useSpeechSession } from "../../composables/useSpeechSession";
import { talkQa } from "../../utils/talkQa";
import type { Lesson, Word, Phrase } from "../../data/lessons";
import { Check, MessageCircle, Mic, Square, Volume2 } from "@lucide/vue";
import BaseButton from "../ui/BaseButton.vue";
import SafeBottom from "../layout/SafeBottom.vue";
import StageHead from "./StageHead.vue";
import LessonFooter from "./LessonFooter.vue";

const props = defineProps<{ lesson: Lesson; words?: Word[] }>();
const emit = defineEmits(["done", "progress", "total"]);

/** 本轮词表：LessonView 按词群传入（l11 颜色/动物各一段）；无分组课时等于全课词表 */
const words = computed(() => (props.words?.length ? props.words : props.lesson.words ?? []));
const phrases = computed<Phrase[]>(() => props.lesson.phrases ?? []);
/** 本轮问答：按词选问句与答句（动物轮换 "What animal is it?"，答句不缺冠词） */
const curQa = computed(() => (cur.value ? talkQa(cur.value, props.lesson) : null));

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
  messages.value.push({ id: ++msgSeq, role: "kid", word: w, text: talkQa(w, props.lesson).a, heard: heardText });
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
/** 读对后推进下一轮的间隔：够孩子看见自己那条消息落地，又不至于干等 */
const ADVANCE_MS = 420;
/** 正在推进（挡住"读对了/没读准"的重复点击，避免同一轮推两条孩子消息） */
const advancing = ref(false);

const session = useSpeechSession(words, {
  onCorrect: (w) => {
    passedIds.value = new Set(passedIds.value).add(w.id);
    sfxCorrect();
    // 孩子"发消息"：大图 + 答句 + 识别文本
    pushKid(w, heard.value || undefined);
    if (!allPassed.value) {
      advance(); // 通过一轮 → 立刻进入下一轮（不留"太棒了"的展示态）
    }
    // 最后一轮的庆祝交给 finish()（「我都会啦」），这里不再放一次
  },
  onWrong: () => sfxWrong(),
});
/** 解构会话状态/方法（模板中 ref 自动解包） */
const { idx: dlgIdx, cur, status, grade, heard, mode, micBlocked, stars, progressText, total, recAudio, recUrl, startMic, stopMic, parentJudge, retry, next } = session;

/**
 * 推进到下一轮：切索引 → status/grade 归位（下一轮回到"等你说"）。
 * 底部"宝宝要说的话"由 cur 驱动，索引一变就换成新的一句。
 */
function advance() {
  if (advancing.value || allPassed.value) return;
  advancing.value = true;
  window.setTimeout(() => {
    advancing.value = false;
    if (allPassed.value) return;
    next();
  }, ADVANCE_MS);
}

/** 轮次（与「跟我读」同一根进度：顶栏圆点 + 页内 `3 / 7`） */
watch(
  [dlgIdx, total],
  () => {
    emit("total", total.value);
    emit("progress", Math.round(((dlgIdx.value + 1) / total.value) * 100));
  },
  { immediate: true }
);

/** 轮次切换 → 家长发出问句消息 + 自动朗读（孩子先听再回答） */
let questionTimer: ReturnType<typeof setTimeout> | null = null;
/** 延迟发出本轮家长问句（问句文本随词走：talkQa 按当前词选） */
function queueParentQuestion(delayMs: number) {
  if (!curQa.value?.q) return;
  if (questionTimer) clearTimeout(questionTimer);
  questionTimer = window.setTimeout(() => {
    const qa = curQa.value;
    if (!qa?.q || !cur.value) return;
    pushParent(cur.value, qa.q);
    speak(qa.q);
  }, delayMs);
}
watch(dlgIdx, () => {
  // 260 → 180ms：上一轮"孩子消息"刚落到底，新问句紧跟着出现才像对话
  queueParentQuestion(180);
});
onMounted(() => queueParentQuestion(320));
// 离开玩法页时清掉：过去 ~180ms 后问句还会在新页面上响一声
onBeforeUnmount(() => {
  if (questionTimer) clearTimeout(questionTimer);
});

/** 点家长消息气泡重听那句问句（气泡里存的就是当时发出的文本） */
function playParentMsg(m: ChatMsg) {
  if (m.text) speak(m.text);
}
/**
 * 播放孩子的答句（整句，非单词）：底部「宝宝要说的话」和孩子消息气泡点读都用它。
 * 曾经点「It's a frog.」只读 "frog"——键面是句子、读的却是单词。
 */
function playAnswer(w: Word) {
  speakText(talkQa(w, props.lesson).a);
}
/** 点孩子消息气泡：重听那句已发出的答句 */
function playSentence(text?: string) {
  if (text) speakText(text);
}
/** 点底部输入框：开始 / 停止录音（说完 = 发消息）。
 *  开始前先停掉正在播的 TTS——过去问句还没播完孩子就点麦克风，ASR 会录进人声。 */
function toggleMic() {
  hapticTap();
  if (status.value === "listening") stopMic();
  else {
    stopSpeaking();
    startMic();
  }
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
    <!-- 进度位置与「跟我读」完全一致：页内顶部一行「3 / 7」+ 玩法标签 -->
    <StageHead :text="progressText" tag="亲子对话" :icon="MessageCircle" />

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
          <div class="msg-bubble" :class="m.role" @click="m.role === 'parent' ? playParentMsg(m) : m.word && playSentence(m.text)">
            <template v-if="m.role === 'parent'">
              <!-- 家长发题：文字在上、图片在下（孩子看图回答，不显示英文答案） -->
              <span class="msg-text">{{ m.text }}</span>
              <div v-if="m.word" class="msg-pic parent-pic">
                <img v-if="m.word.image" :src="m.word.image" :alt="m.word.en" loading="lazy" decoding="async" class="msg-pic-img" />
                <span v-else class="msg-pic-emoji">{{ m.word.emoji }}</span>
              </div>
            </template>
            <template v-else>
              <!-- 孩子消息：答句在上、语音文本、大图在下（孩子回答的图片） -->
              <span class="msg-text">{{ m.text }}</span>
              <span v-if="m.heard" class="msg-heard">🎤 {{ m.heard }}</span>
              <div v-if="m.word" class="msg-pic">
                <img v-if="m.word.image" :src="m.word.image" :alt="m.word.en" loading="lazy" decoding="async" class="msg-pic-img" />
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
      <!-- 孩子这一轮要说的句子：**始终显示**（点喇叭听发音）。
           麦克风不可用时更要显示——对话流里只有"上一轮"的答句，孩子根本不知道该说什么。 -->
      <button class="ci-say" aria-label="宝宝要说的句子，点一下听整句发音" @click="playAnswer(cur)">
        <span class="ci-say-text">{{ curQa?.a }}</span>
        <Volume2 class="ci-say-vol k-ico" />
      </button>

      <template v-if="micBlocked && !recUrl">
        <p class="ci-hint">麦克风不可用，点大图听发音后完成这一轮吧</p>
        <BaseButton
          class="ci-pass"
          variant="green"
          :disabled="passedIds.has(cur.id) || advancing"
          @click="parentJudge(true)"
        >
          读对了 ✓
        </BaseButton>
      </template>

      <template v-else-if="status !== 'feedback'">
        <button
          class="input-bar"
          :class="{ talking: listening }"
          aria-label="点一下开始说话，再点一下结束"
          @click="toggleMic"
        >
          <Mic v-if="!listening" class="ib-ico" />
          <Square v-else class="ib-ico" />
          <!-- 键面上不再放 🎤 emoji：左侧已有 Mic 线性图标，双图标并排显得重复 -->
          <span class="ib-text">{{ listening ? "点一下结束 · 我在听…" : "点一下说话" }}</span>
        </button>
      </template>

      <template v-else>
        <!-- ASR 自动打分：读到 perfect/good → 直接进入下一轮（只闪一下"读对了"，不占着屏） -->
        <template v-if="mode === 'asr'">
          <p class="ci-hint" aria-live="polite">
            {{ heard ? `你说的是：${heard}` : "我没听清，再试一次吧" }}
          </p>
          <div class="ci-judge">
            <BaseButton v-if="grade === 'retry'" variant="green" @click="retry()">
              再试一次
            </BaseButton>
            <!-- ASR 识别不出时家长兜底（曾经只有"再试"，孩子不说话就一直卡在这轮） -->
            <BaseButton v-if="grade === 'retry'" variant="gray" :disabled="advancing" @click="parentJudge(true)">
              读对了 ✓
            </BaseButton>
            <span v-else class="ci-auto">✓ 读对了</span>
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
              <BaseButton variant="green" :disabled="advancing" @click="parentJudge(true)">
                读对了 ✓
              </BaseButton>
              <BaseButton variant="orange" :disabled="advancing" @click="parentJudge(false)">
                没读准
              </BaseButton>
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

/* ===== 对话流 ===== */
.chat-msgs {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: var(--talk-w);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  /* 消息沉底 —— 但**不能**用 justify-content: flex-end。
   * flex 容器 + overflow:auto + flex-end 是经典陷阱：内容一超出，多出来的部分被顶到
   * 起始边**之上**，scrollHeight 仍等于 clientHeight、scrollTop 恒为 0 —— 滚不回去。
   * 实测 5 条消息时首条落在 -766px，家长问句永远看不见了。
   * 正确写法：justify 保持 flex-start，靠首条的 margin-top:auto 把短对话压到底；
   * 内容超出时 auto 余量归零，溢出方向变成向下，滚动正常。 */
  justify-content: flex-start;
  gap: var(--talk-gap);
  padding: var(--talk-pad) var(--talk-gap);
  scrollbar-width: none;
  background:
    radial-gradient(circle at 20% 15%, rgba(255, 255, 255, 0.5) 0, transparent 40%),
    var(--talk-field);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
}
.chat-msgs::-webkit-scrollbar { display: none; }
.msg-row {
  display: flex;
  align-items: flex-end;
  gap: var(--gap-m);
  animation: anim-pop 0.25s;
}
/* 对话少时沉底（auto 余量把首条推到底部）；对话超出面板时余量归零，改为向下溢出可滚 */
.chat-msgs > .msg-row:first-child {
  margin-top: auto;
}
.msg-row.parent { justify-content: flex-start; }
.msg-row.kid { justify-content: flex-end; }
.msg-av {
  flex: none;
  width: var(--talk-av);
  height: var(--talk-av);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: calc(var(--talk-av) * 0.56);
  box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.06);
}
.msg-av.mom { background: var(--talk-warm); }
.msg-av.kid { background: var(--talk-cool); }
.msg-col {
  display: flex;
  flex-direction: column;
  gap: var(--gap-xs);
  max-width: 82%;
}
.msg-row.parent .msg-col { align-items: flex-start; }
.msg-row.kid .msg-col { align-items: flex-end; }
.msg-bubble {
  padding: var(--talk-pad) calc(var(--talk-pad) * 1.35);
  border-radius: var(--radius-s);
  font-weight: var(--fw-strong);
  font-size: var(--talk-bubble-fs);
  line-height: 1.35;
  /* 气泡是"插画"：两套主题下都是浅底，所以文字用固定的 --talk-ink。
   * 用 --ink 会在暗色主题变成浅色 → 白底白字（实测对比度 1.05:1）。 */
  color: var(--talk-ink);
  box-shadow: var(--shadow-soft);
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
  max-width: 100%;
}
.msg-bubble.parent {
  background: var(--white);
  border-top-left-radius: 4px;
}
.msg-bubble.kid {
  background: var(--talk-kid-bg);
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
  font-size: calc(var(--talk-bubble-fs) * 0.74);
  font-weight: var(--fw-strong);
  color: var(--talk-ink-soft);
}
.msg-time {
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  /* 这行小字画在 .chat-msgs 的固定浅绿底板上（插画面，不随主题变），
   * 所以同样不能用 --ink-faint：亮色实测 2.19:1、暗色 3.47:1，都不达标。 */
  color: var(--talk-ink-soft);
}
.msg-pic {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-xs);
  padding: var(--gap-s) var(--talk-pad);
  background: var(--white);
  border-radius: var(--radius-s);
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.06);
}
.msg-pic.parent-pic {
  padding: var(--gap-m) calc(var(--talk-pad) * 1.3);
  border-radius: var(--radius-s);
}
.msg-pic.parent-pic .msg-pic-emoji {
  font-size: calc(var(--talk-pic) * 0.5);
}
.msg-pic-emoji {
  font-size: calc(var(--talk-pic) * 0.42);
  line-height: 1;
}
.msg-pic-img {
  width: var(--talk-pic);
  height: var(--talk-pic);
  object-fit: contain;
  border-radius: var(--radius-s);
}
/* 图下的单词标签：答句本身已经含这个词，标签是"图→词"的对照，属次要信息。
 * 以前 1.12× 气泡字号（21px）比答句（18.7px）还大，主次颠倒 → 降到 0.85× 并转软色。 */
.msg-pic-en {
  font-weight: var(--fw-mid);
  font-size: calc(var(--talk-bubble-fs) * 0.85);
  color: var(--talk-ink-soft);
}

/* ===== 底部输入条 / 判定区 ===== */
.chat-input {
  flex: none;
  width: 100%;
  max-width: var(--talk-w);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--talk-gap);
  padding: var(--gap-s) 0 0;
}
.ci-say {
  width: 100%;
  /* 「宝宝要说的话」是要点的（听发音），触控目标得够 --tap-min（原来只有 42px） */
  min-height: var(--tap-min);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--gap-m);
  padding: calc(var(--talk-pad) * 0.5) var(--talk-pad);
  border-radius: var(--radius-pill);
  background: var(--card-bg);
  box-shadow: var(--shadow-soft);
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.ci-say-text {
  font-weight: var(--fw-strong);
  font-size: calc(var(--talk-bubble-fs) * 1.05);
  color: var(--brand-dark);
  letter-spacing: 0.02em;
}
.ci-say-vol {
  width: calc(var(--talk-bubble-fs) * 1.05);
  height: calc(var(--talk-bubble-fs) * 1.05);
  color: var(--orange);
  flex: none;
}
.input-bar {
  width: 100%;
  /* 每轮都要点的主行动：高度走 --talk-bar-h（> --tap-min），不再写死 54px */
  min-height: var(--talk-bar-h);
  border: none;
  border-radius: var(--radius);
  background: var(--mic-face);
  color: var(--on-tone);
  box-shadow: 0 4px 0 var(--mic-base), var(--shadow-hard);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--gap-m);
  padding: 0 var(--talk-pad);
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.1s, box-shadow 0.1s;
}
.input-bar:active { transform: translateY(2px); box-shadow: 0 2px 0 var(--mic-base); }
.input-bar.talking {
  background: var(--mic-rec-face);
  box-shadow: 0 4px 0 var(--mic-rec-base);
  animation: mic-pulse 1s ease-in-out infinite;
}
@keyframes mic-pulse {
  0%, 100% { box-shadow: 0 4px 0 var(--mic-rec-base), 0 0 0 8px rgba(230, 57, 57, 0.16); }
  50% { box-shadow: 0 4px 0 var(--mic-rec-base), 0 0 0 16px rgba(230, 57, 57, 0.3); }
}
.ib-ico {
  width: calc(var(--talk-bar-fs) * 1.15);
  height: calc(var(--talk-bar-fs) * 1.15);
  flex: none;
}
.ib-text {
  font-weight: var(--fw-strong);
  /* 以前写死 15px：气泡已经 18.7px，主行动的字反而是全屏最小 */
  font-size: var(--talk-bar-fs);
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
  gap: var(--gap-m);
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
  min-width: min(60%, 220px);
}
.ci-audio {
  display: none;
}
</style>
