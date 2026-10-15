<script setup lang="ts">
import { computed, ref, watch, onMounted } from "vue";
import WordCard from "./WordCard.vue";
import Pager from "./Pager.vue";
import { celebrate, bigCelebrate, sfxCorrect, sfxWrong } from "../../services/effects";
import { useLearnSession } from "../../composables/useLearnSession";
import { useSpeechSession } from "../../composables/useSpeechSession";
import { speak } from "../../services/speech";
import type { Word, Phrase } from "../../data/lessons";
import { Check, Mic, MousePointerClick, Square, Volume2 } from "@lucide/vue";
import BaseButton from "../ui/BaseButton.vue";
import SafeBottom from "../layout/SafeBottom.vue";

/**
 * 看图学词（点读）—— 逻辑在 composables/useLearnSession，这里只做渲染与音效。
 *
 * 两种玩法样式（lesson.stageStyle）：
 *  - cards（默认）：多邻国式网格点读，分页按可用空间动态计算；星级 = 点读覆盖率。
 *  - dialog（l10 亲子口语对话卡·逐轮对话）：家长问「What's that?」→ 孩子看着大图录音回答
 *    「It's a ...」→ 通过自动进入下一轮，全部单词对话完 = 本关完成；星级 = 首次通过率。
 */
const props = defineProps<{
  words: Word[];
  /** dialog 模式：亲子口语对话卡（l10） */
  dialog?: boolean;
  phrases?: Phrase[];
}>();
const emit = defineEmits(["done", "progress", "total"]);

const {
  stageEl,
  gridStyle,
  page,
  total,
  items,
  isLast,
  gotoNext,
  gotoPrev,
  gotoPage,
  markTapped,
  tapped,
  tappedCount,
  stars,
} = useLearnSession(computed(() => props.words));

/** 页进度 → 顶栏进度条（多邻国式：学单词逐页有进度）；页总数同步上报显示 x/y */
watch(
  [page, total],
  () => {
    emit("total", total.value);
    emit("progress", Math.round(((page.value + 1) / total.value) * 100));
  },
  { immediate: true }
);

/** 本课全部词都点过发音（完成前置条件） */
const allTapped = computed(() => props.words.length > 0 && tappedCount.value >= props.words.length);
/** 还差几个词没点（提示用） */
const remaining = computed(() => Math.max(0, props.words.length - tappedCount.value));
function finish() {
  if (!canFinish.value) return;
  sfxCorrect();
  bigCelebrate();
  celebrate();
  // 星级：dialog = 首次通过率；cards = 点读覆盖率，交给 useLessonFlow 记录
  emit("done", props.dialog ? dlgStars.value : stars.value);
}

/* ================= dialog 亲子口语对话卡（逐轮对话 + 录音） ================= */
/** 妈妈问句：What's that?（每轮固定问句） */
const questionPhrase = computed<Phrase | null>(() => props.phrases?.[0] ?? null);
/** 当前动物的答句文本：优先既有 phrase（It's a frog.），兜底 It's a X. */
function answerText(w: Word): string {
  const en = w.en.toLowerCase();
  const p = (props.phrases ?? []).find(
    (x) => !x.en.includes("?") && x.en.toLowerCase().includes(en)
  );
  return p ? p.en : `It's a ${w.en}.`;
}
/** 已通过的词（一轮对话通过 = 记一个） */
const passedIds = ref(new Set<string>());
const passedCount = computed(() => passedIds.value.size);
/** 全部单词对话完 = 完成 */
const allPassed = computed(
  () => props.words.length > 0 && passedIds.value.size >= props.words.length
);
/** dialog 完成按钮 = 全部通过（cards 保持旧规则：末页 && 全点过） */
const canFinish = computed(() =>
  props.dialog ? allPassed.value : isLast.value && allTapped.value
);


/** 亲子对话录音会话：ASR 自动打分 / 录音回放+家长判定（与跟我读同一会话逻辑） */
const session = useSpeechSession(computed(() => props.words), {
  onCorrect: (w) => {
    if (!props.dialog) return;
    passedIds.value = new Set(passedIds.value).add(w.id);
    sfxCorrect();
    emit("total", 1);
    emit("progress", Math.round((passedIds.value.size / props.words.length) * 100));
    if (allPassed.value) {
      bigCelebrate(); // 全部对话完成 → 庆祝
    } else {
      // 通过一轮 → 稍等片刻自动进入下一轮（下轮开始会播问句）
      window.setTimeout(() => {
        if (!allPassed.value) next();
      }, 900);
    }
  },
  onWrong: () => {
    if (props.dialog) sfxWrong();
  },
});
/** 解构会话状态/方法（模板中 ref 自动解包；total/stars 与 cards 冲突用别名） */
const { idx: dlgIdx, cur, status, grade, heard, mode, micBlocked, stars: dlgStars, recAudio, recUrl, startMic, stopMic, parentJudge, retry, next } = session;

/** 轮次切换 → 自动播家长问句（孩子先听 What's that? 再回答） */
let questionTimer: ReturnType<typeof setTimeout> | null = null;
watch(dlgIdx, () => {
  if (props.dialog && questionPhrase.value) {
    if (questionTimer) clearTimeout(questionTimer);
    questionTimer = window.setTimeout(() => speak(questionPhrase.value!.en), 260);
  }
});
onMounted(() => {
  if (props.dialog && questionPhrase.value) {
    if (questionTimer) clearTimeout(questionTimer);
    questionTimer = window.setTimeout(() => speak(questionPhrase.value!.en), 320);
  }
});

/** 播放家长问句（点问句气泡重听） */
function playQuestion() {
  if (questionPhrase.value) speak(questionPhrase.value.en);
}
/** 播放当前单词发音（点大图提示孩子怎么说） */
function playWord(w: Word) {
  speak(w.en, { lessonId: w.lessonId, wordId: w.id });
}
/** 点麦克风：开始 / 停止录音 */
function toggleMic() {
  if (status.value === "listening") stopMic();
  else startMic();
}
/** 孩子这一轮读得不错（ASR perfect/good） */
const gradeOk = computed(
  () => grade.value === "perfect" || grade.value === "good"
);
/** 监听中（录音中） */
const listening = computed(() => status.value === "listening");
</script>

<template>
  <div class="learn view">
    <!-- ===== dialog：亲子口语对话卡（l10） ===== -->
    <template v-if="dialog">
      <!-- 亲子对话：家长问一句 → 孩子看着大图录音回答一句，通过自动进入下一轮 -->
      <div class="dlg-stage">
        <!-- 轮次进度 -->
        <div class="dlg-head">
          <span class="dlg-round">第 {{ dlgIdx + 1 }} / {{ words.length }} 轮</span>
          <div class="dlg-dots" aria-label="对话轮次进度">
            <span
              v-for="w in words"
              :key="w.id"
              class="dlg-dot"
              :class="{ done: passedIds.has(w.id), cur: w.id === cur.id }"
            >{{ passedIds.has(w.id) ? "✓" : "" }}</span>
          </div>
        </div>

        <!-- 丛林场景：妈妈问 → 孩子回答的大图 → 孩子答 -->
        <div class="dlg-scene">
          <div class="trees left">🌴</div>
          <div class="trees right">🌴</div>

          <button class="dlg-bubble q" aria-label="妈妈问：What's that？" @click="playQuestion">
            <span class="dlg-who">妈妈问</span>
            <span class="dlg-text">What's that?</span>
            <Volume2 class="dlg-vol k-ico" />
          </button>

          <!-- 中间大图 = 孩子回答的图片（点图听单词发音提示） -->
          <button class="dlg-animal" aria-label="点图片听发音" @click="playWord(cur)">
            <span class="dlg-emoji">{{ cur.emoji }}</span>
            <span class="dlg-en">{{ cur.en }}</span>
            <span class="dlg-zh">{{ cur.zh }}</span>
            <span v-if="passedIds.has(cur.id)" class="dlg-done">✓</span>
          </button>

          <!-- 孩子答句气泡：展示孩子要回答的内容 / 正在回答 / 已回答 -->
          <div
            class="dlg-bubble a"
            :class="{ ok: gradeOk, talking: listening }"
            aria-label="孩子回答"
          >
            <span class="dlg-who">孩子答</span>
            <span class="dlg-text">
              {{ listening ? "……" : gradeOk ? answerText(cur) : "It's a ..." }}
            </span>
            <span v-if="gradeOk" class="dlg-praise">太棒了！</span>
          </div>

          <div class="dlg-kid">🧒</div>
        </div>

        <!-- 录音区：点🎤说出答案；录音结束自动回放，通过后自动下一轮 -->
        <div class="dlg-mic">
          <template v-if="micBlocked && !recUrl">
            <p class="dlg-mic-hint">麦克风不可用，点动物听发音后完成这一轮吧</p>
            <BaseButton class="dlg-pass" variant="green" :disabled="passedIds.has(cur.id)" @click="parentJudge(true)">
              读对了 ✓
            </BaseButton>
          </template>

          <template v-else-if="status !== 'feedback'">
            <button
              class="mic-btn"
              :class="{ listening }"
              aria-label="按住说话或点击录音"
              @click="toggleMic"
            >
              <Mic v-if="!listening" class="mic-ico" />
              <Square v-else class="mic-ico" />
            </button>
            <p class="dlg-mic-hint">
              {{ listening ? "我在听… 再点一下停止" : `点🎤说：${answerText(cur)}` }}
            </p>
          </template>

          <template v-else>
            <!-- ASR 自动打分：读到 perfect/good → 自动下一轮；retry → 再试 -->
            <template v-if="mode === 'asr'">
              <p class="dlg-heard" aria-live="polite">
                {{ heard ? `你说的是：${heard}` : "我没听清，再试一次吧" }}
              </p>
              <div class="dlg-judge">
                <BaseButton v-if="grade === 'retry'" variant="green" @click="retry()">
                  再试一次
                </BaseButton>
                <span v-else class="dlg-auto">太棒了，下一轮！</span>
              </div>
            </template>
            <!-- 录音回放 + 家长判定（识别不可用时的降级） -->
            <template v-else>
              <audio ref="recAudio" :src="recUrl ?? undefined" class="dlg-audio" />
              <p class="dlg-heard">听一下孩子说的，判定这轮是否通过</p>
              <div class="dlg-judge">
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
      </div>
    </template>

    <!-- ===== cards：网格点读（默认，其余课） ===== -->
    <template v-else>
      <p class="hint anim-fade-up">
        <MousePointerClick class="k-ico" />点图片听发音，点单词再听一遍
        <span v-if="total > 1" class="hint-page">（共 {{ total }} 页）</span>
      </p>

      <!-- 内容区：尺寸被实测，用于反推每页容量 -->
      <div class="stage" ref="stageEl">
        <div class="grid" :style="gridStyle">
          <WordCard
            v-for="(w, i) in items"
            :key="w.id"
            :word="w"
            :enter-index="i"
            :marked="tapped.has(w.id)"
            @tap="markTapped"
          />
        </div>
      </div>
    </template>

    <!-- 贴底操作区：统一底部安全容器（Home 条防遮挡 + 呼吸间距） -->
    <SafeBottom class="next-zone" :gap="24">
      <Pager v-if="!dialog" :page="page" :total="total" hide-dots @prev="gotoPrev" @next="gotoNext" @go="gotoPage" />
      <BaseButton class="next" variant="green" :disabled="!canFinish" @click="finish">
        <template v-if="canFinish"><Check class="k-ico" />我都会啦</template>
        <template v-else-if="dialog">还有 {{ props.words.length - passedCount }} 个词没对话哦</template>
        <template v-else-if="!isLast">看完所有图才能完成哦</template>
        <template v-else>还有 {{ remaining }} 个词没点过哦</template>
      </BaseButton>
    </SafeBottom>
  </div>
</template>

<style scoped>
.hint {
  margin: 0;
  font-size: var(--fs-small);
  color: var(--ink-soft);
  font-weight: 700;
  flex: none;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35em;
  flex-wrap: wrap;
}
.hint .k-ico {
  color: var(--orange);
}
.hint-page {
  color: var(--green-dark);
}

/* ===== dialog：亲子口语对话卡（逐轮对话 + 录音） ===== */
.dlg-stage {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
}
.dlg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 2px;
}
.dlg-round {
  font-weight: 900;
  font-size: var(--fs-body);
  color: var(--green-dark);
  white-space: nowrap;
}
.dlg-dots {
  display: flex;
  gap: 6px;
  align-items: center;
  overflow-x: auto;
  scrollbar-width: none;
}
.dlg-dots::-webkit-scrollbar { display: none; }
.dlg-dot {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--card-bg);
  box-shadow: inset 0 0 0 2px var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 900;
  color: #fff;
  transition: all 0.2s;
}
.dlg-dot.cur {
  box-shadow: inset 0 0 0 2px var(--green);
  transform: scale(1.15);
}
.dlg-dot.done {
  background: var(--green);
  box-shadow: none;
}
.dlg-scene {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: var(--gap-s) var(--gap-m);
  background: linear-gradient(180deg, #e8f7e3 0%, #d3f0c9 70%, #bfe8b4 100%);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  overflow: hidden;
}
.trees {
  position: absolute;
  top: 8px;
  font-size: 30px;
  opacity: 0.55;
  user-select: none;
  pointer-events: none;
}
.trees.left { left: 10px; }
.trees.right { right: 10px; }
.dlg-bubble {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 18px;
  font-weight: 900;
  font-size: var(--fs-body);
  color: var(--ink);
  box-shadow: var(--shadow-soft);
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.dlg-bubble.q {
  background: #fff3c2;
  border: 2px solid #f5d97a;
  align-self: flex-start;
  margin-left: 14px;
}
.dlg-bubble.a {
  background: #d9f6ff;
  border: 2px solid #9fe0f5;
  align-self: flex-end;
  margin-right: 14px;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.dlg-bubble.a.ok {
  background: #e6fbd7;
  border-color: var(--green-light);
}
.dlg-bubble.a.talking {
  animation: dlg-talk 0.6s ease-in-out infinite;
}
@keyframes dlg-talk {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
.dlg-who {
  font-size: 10px;
  font-weight: 800;
  color: var(--ink-faint);
  display: block;
}
.dlg-text {
  font-size: 15px;
  letter-spacing: 0.02em;
}
.dlg-praise {
  font-size: 13px;
  font-weight: 900;
  color: var(--green-dark);
  animation: anim-pop 0.3s;
}
.dlg-vol {
  width: 14px;
  height: 14px;
  color: var(--green-dark);
  flex: none;
}
.dlg-animal {
  position: relative;
  width: 168px;
  height: 168px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 6px 0 rgba(0, 0, 0, 0.08), var(--shadow-hard);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  transition: transform 0.1s;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.dlg-animal:active { transform: scale(0.94); }
.dlg-emoji {
  font-size: 76px;
  line-height: 1;
}
.dlg-en {
  font-weight: 900;
  font-size: 22px;
  color: var(--ink);
}
.dlg-zh {
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-faint);
}
.dlg-done {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--green);
  color: #fff;
  font-weight: 900;
  font-size: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(30, 140, 80, 0.4);
}
.dlg-kid {
  position: absolute;
  bottom: 8px;
  left: 12px;
  font-size: 36px;
  opacity: 0.9;
  user-select: none;
  pointer-events: none;
}
.dlg-mic {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 6px 0 2px;
}
.mic-btn {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(180deg, #ff9d5c, #ff7a3c);
  color: #fff;
  box-shadow: 0 6px 0 #e05f1e, var(--shadow-hard);
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.1s, box-shadow 0.1s;
}
.mic-btn:active { transform: translateY(3px); box-shadow: 0 3px 0 #e05f1e; }
.mic-btn.listening {
  background: linear-gradient(180deg, #ff5c5c, #e63939);
  box-shadow: 0 6px 0 #b02222, 0 0 0 10px rgba(230, 57, 57, 0.18);
  animation: mic-pulse 1s ease-in-out infinite;
}
@keyframes mic-pulse {
  0%, 100% { box-shadow: 0 6px 0 #b02222, 0 0 0 8px rgba(230, 57, 57, 0.16); }
  50% { box-shadow: 0 6px 0 #b02222, 0 0 0 16px rgba(230, 57, 57, 0.3); }
}
.mic-ico {
  width: 30px;
  height: 30px;
}
.dlg-mic-hint {
  margin: 0;
  font-size: var(--fs-small);
  font-weight: 800;
  color: var(--ink-soft);
  text-align: center;
}
.dlg-heard {
  margin: 0;
  font-size: var(--fs-small);
  font-weight: 800;
  color: var(--ink-soft);
  text-align: center;
}
.dlg-judge {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
}
.dlg-auto {
  font-weight: 900;
  font-size: var(--fs-body);
  color: var(--green-dark);
  animation: anim-pop 0.3s;
}
.dlg-pass {
  width: auto;
  min-width: 160px;
}
.dlg-audio {
  display: none;
}

/* ===== cards：网格点读 ===== */
/* 只负责"占满剩余高度"并可被测量，不随内部网格内容变化 */
.stage {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
}
.grid {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr));
  gap: var(--grid-gap, 12px);
  /* 末页不满时整块居中，而不是把卡片拉满整屏 */
  align-content: center;
}
.next {
  flex: none;
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
}
/* 贴底操作区：SafeBottom 内纵向排列（Pager 与完成按钮保持呼吸间距） */
.next-zone {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
}
</style>
