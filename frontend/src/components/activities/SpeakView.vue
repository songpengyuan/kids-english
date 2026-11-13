<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { speak } from "../../services/speech";
import { sfxCorrect, sfxWrong } from "../../services/effects";
import { useProgressStore } from "../../stores/progress";
import { useSpeechSession } from "../../composables/useSpeechSession";
import type { Word } from "../../data/lessons";
import { ChevronRight, Mic, RotateCcw, Square, ThumbsUp, Volume2 } from "@lucide/vue";
import BaseButton from "../ui/BaseButton.vue";
import SafeBottom from "../layout/SafeBottom.vue";
import StageHead from "./StageHead.vue";

const props = defineProps<{ words: Word[] }>();
const emit = defineEmits(["done", "progress", "total"]);

const progress = useProgressStore();

/**
 * 跟我读：双模式会话（ASR 自动打分 / 录音回放 + 家长判定）在 useSpeechSession 里，
 * 这里只做音效、掌握度落库与渲染。
 */
const session = useSpeechSession(
  computed(() => props.words),
  {
    onCorrect: (w) => {
      sfxCorrect();
      // 撒花只在关卡完成时（useLessonFlow）触发，单个词读对只用音效+触感反馈
      speak(w.en, { lessonId: w.lessonId, wordId: w.id });
      progress.recordWord(w.lessonId, w.id, { correct: 1 }); // SRS 进一级
    },
    onWrong: (w) => {
      sfxWrong();
      progress.recordWord(w.lessonId, w.id, { wrong: 1 }); // 打回 stage 0 → 复习队列
    },
    // 完成一次真实张口尝试即计"今日开口"（鼓励向，retry/录音也计；不影响星级）
    onSpeakAttempt: () => progress.addSpeakAttempt(),
  },
  // 跟我读：ASR 自动打分模式也并行录一份本机回放（仅内存、不上传不入库）；
  // TalkView 不传此开关，保持其原有行为
  { captureVoice: true, afterReplay: () => speakCurrent() }
);

// 进入跟读页就预请求麦克风权限（在用户手势链外的 mount 阶段，部分浏览器会拒绝；
// 但至少能提前暴露权限状态，避免孩子点麦克风时才弹窗卡住）
onMounted(async () => {
  try {
    // 预热权限即可：拿到流**立刻停轨释放**——丢弃引用不会自动停轨，浏览器会
    // 持续占用麦克风（系统指示灯常亮），退出本页也不释放，每进一次叠加一条。
    // 权限一旦授予过，后续点麦克风时 getUserMedia 不会再弹窗。
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    // 静默失败，用户点麦克风时再处理
  }
});

const {
  mode,
  status,
  grade,
  heard,
  canRecord,
  micBlocked,
  recordHint,
  recAudio,
  recUrl,
  imgFailed,
  cur,
  idx,
  total,
  progressText,
  stars,
  hearExample,
  startMic,
  stopMic,
  replayRec,
  parentJudge,
  retry,
} = session;

/**
 * 孩子的录音播完之后补一遍标准发音（先听自己、再听老师，自己就能听出差别）。
 * 由 useSpeechSession 的 afterReplay 在回放结束时调用。
 */
function speakCurrent() {
  const w = cur.value;
  if (w) speak(w.en, { lessonId: w.lessonId, wordId: w.id });
}

/**
 * 主卡后方可见的待读卡层数（最多 2 张）：当前这张在最前，后面还有几张就露几层，
 * 直观表达"跟读一个少一个"；最后一张（idx=total-1）时为 0。纯装饰、不响应点击。
 */
const backCount = computed(() => Math.min(2, Math.max(0, total.value - idx.value - 1)));

/** 词进度 → 顶栏进度条（多邻国式：跟读逐词有进度）；词总数同步上报显示 x/y */
watch(
  [idx, total],
  () => {
    emit("total", total.value);
    emit("progress", Math.round(((idx.value + 1) / total.value) * 100));
  },
  { immediate: true }
);

/** 最后一个词 → 上报星级（首次通过率） */
function next() {
  if (session.next()) emit("done", stars.value);
}
</script>

<template>
  <div class="speak view">
    <!-- 进度位置由 StageHead 统一（亲子对话的进度也在同一处，见 TalkView） -->
    <StageHead
      :text="progressText"
      :tag="mode === 'asr' ? '小耳朵打分' : '亲子跟读'"
      :icon="Mic"
    />

    <div class="word-zone">
      <div class="deck" :key="cur.id">
        <span
          v-for="n in backCount"
          :key="`back-${n}`"
          class="deck-back"
          :class="`layer-${n}`"
          aria-hidden="true"
        ></span>
        <div class="pic anim-pop" data-haptic @click="hearExample">
          <img
            v-if="!imgFailed && cur.image"
            :src="cur.image || undefined"
            @error="imgFailed = true"
          />
          <span v-else class="fallback-emoji">{{ cur.emoji }}</span>
        </div>
      </div>
      <div class="word-text">
        <button class="word" @click="hearExample">{{ cur.en }}</button>
        <p class="tip" v-if="mode === 'asr'">点图听一遍，再点麦克风跟读给小耳朵听</p>
        <p class="tip" v-else>
          {{
            recordHint || "点麦克风开始说话，说完再点一下结束"
          }}
        </p>
      </div>
    </div>

    <!-- 麦克风不可用：不阻塞，显示小提示 + 继续按钮 -->
    <div v-if="micBlocked" class="mic-blocked anim-pop">
      <p class="blocked-tip">🎤 麦克风不可用，听着读出来就好</p>
      <BaseButton variant="green" @click="next">下一个<ChevronRight class="k-ico" /></BaseButton>
    </div>

    <!-- 麦克风按钮：点一下开始，再点一下结束 -->
    <SafeBottom class="mic-zone" :gap="28" v-else-if="status !== 'feedback' || mode === 'asr'">
      <button
        class="mic"
        :class="{ live: status === 'listening' }"
        :aria-label="status === 'listening' ? '结束录音' : '开始说话'"
        @click="status === 'listening' ? stopMic() : startMic()"
      >
        <Square v-if="status === 'listening'" class="k-ico" />
        <Mic v-else class="k-ico" />
      </button>
      <div v-if="status === 'listening'" class="waves"><i></i><i></i><i></i></div>
      <p class="mic-label">
        {{
          status === "listening"
            ? mode === "asr"
              ? "正在听…再点一下结束"
              : "录音中…再点一下结束"
            : "点一下开始说话"
        }}
      </p>
    </SafeBottom>

    <!-- 反馈 -->
    <SafeBottom v-if="status === 'feedback'" class="feedback anim-fade-up" :gap="28">
      <!-- 本机录音回放（ASR / record 通用；无原生控件，仅承载播放，不显示进度条） -->
      <audio v-if="recUrl" ref="recAudio" :src="recUrl" class="replay"></audio>
      <!-- 非 record 待判定态：轻量手动重放；record 待判定态用下方醒目大圆喇叭，避免重复入口 -->
      <button
        v-if="recUrl && !(mode === 'record' && grade === '')"
        class="replay-chip"
        @click="replayRec"
        aria-label="再听一遍自己的发音"
      >
        <Volume2 class="k-ico" />再听一遍
      </button>
      <template v-if="mode === 'record' && grade === ''">
        <!-- 停止录音已自动回放一次；这里只保留一个醒目的二次回放入口 -->
        <!-- 大圆喇叭：想再听一次自己的发音就点它 -->
        <button class="replay-btn anim-pop" @click="replayRec" aria-label="再听一遍">
          <Volume2 class="k-ico" />
          <span class="replay-label">再听一遍</span>
        </button>
        <p class="judge-q">读得准不准？</p>
        <div class="btn-row">
          <BaseButton variant="green" @click="parentJudge(true)">
            <ThumbsUp class="k-ico" />读得棒
          </BaseButton>
          <BaseButton variant="green" @click="parentJudge(false)">
            <RotateCcw class="k-ico" />再试一次
          </BaseButton>
        </div>
      </template>
      <template v-else-if="mode === 'record'">
        <p class="verdict" :class="grade">
          <span v-if="grade === 'perfect'">太棒了！</span>
          <span v-else class="retry-hint"><RotateCcw class="k-ico" />再试一次吧，先点图听一遍</span>
        </p>
        <div class="btn-row">
          <BaseButton v-if="grade === 'retry'" variant="orange" @click="retry">
            <Mic class="k-ico" />我再试试
          </BaseButton>
          <BaseButton v-else @click="next">
            继续<ChevronRight class="k-ico" />
          </BaseButton>
        </div>
      </template>
      <template v-else>
        <p class="verdict" :class="grade">
          <span v-if="grade === 'perfect'">太棒了！发音很标准</span>
          <span v-else-if="grade === 'good'">很不错，再响亮一点就更棒啦</span>
          <span v-else class="retry-hint"><RotateCcw class="k-ico" />再试一次吧，先点图听一遍</span>
        </p>
        <p v-if="heard" class="heard">小耳朵听到的是："{{ heard }}"</p>
        <div class="btn-row">
          <BaseButton v-if="grade === 'retry'" variant="orange" @click="retry">
            <Mic class="k-ico" />我再试试
          </BaseButton>
          <BaseButton v-else @click="next">
            继续<ChevronRight class="k-ico" />
          </BaseButton>
          <!-- ASR 识别不出时家长兜底（曾经只有"再试"，孩子认生不说话就一直卡关） -->
          <BaseButton v-if="grade === 'retry'" variant="gray" @click="parentJudge(true)">
            <ThumbsUp class="k-ico" />读对了 ✓
          </BaseButton>
        </div>
      </template>
    </SafeBottom>
  </div>
</template>

<style scoped>
.speak {
  align-items: center;
}
.word-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-xs);
  flex: none;
  min-height: 0;
}
/* 牌垛容器：主卡在最前，后方叠 1–2 张纯装饰待读卡，表达"跟读一个少一个" */
.deck {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.deck-back {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-soft);
  pointer-events: none;
}
.deck-back.layer-1 {
  transform: translate(-4px, calc(var(--gap-xs) * -0.6));
  opacity: 0.9;
}
.deck-back.layer-2 {
  transform: translate(4px, calc(var(--gap-xs) * -1.2));
  opacity: 0.75;
}
.pic {
  /* 同时受高和宽约束：iPad/桌面按可视高度放大到 ~380px（原先上限 300px，
     768×1024 上只有 230px，页面中段大片空白）；手机由 42vw 主导仍紧凑。
     高度不超 40vh：iPad 横屏（768 高）保持原 307px，避免把底部元素挤出视口。
     手机横屏由后置 max-height:480px 档固定回 76px。 */
  position: relative;
  z-index: 1;
  width: clamp(110px, min(40vh, 42vw), 380px);
  height: clamp(110px, min(40vh, 42vw), 380px);
  flex: none;
  background: var(--card-bg);
  border-radius: var(--radius);
  /* 贴纸描边 + 实心厚度阴影，多邻国式"厚卡" */
  box-shadow: var(--sticker), var(--shadow-hard);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-emoji-xl);
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  overflow: hidden;
}
/* 按压下沉：立体厚度随按下"变薄"，给孩子实体按钮的手感 */
.pic:active {
  transform: translateY(var(--press)) scale(0.98);
  box-shadow: var(--sticker), var(--shadow-soft);
}
.pic img {
  width: 80%;
  height: 80%;
  object-fit: contain;
}
.fallback-emoji {
  line-height: 1;
}
.word-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
}
.word {
  font-size: clamp(30px, min(6vh, 5.4vw), 52px);
  background: none;
  font-weight: var(--fw-strong);
  color: var(--ink);
  padding: 0 var(--gap-s);
  border-radius: var(--radius-s);
}
.word:active {
  background: var(--tint-yellow);
}
.tip {
  margin: 0;
  color: var(--ink-soft);
  font-weight: var(--fw-mid);
  font-size: var(--fs-small);
  text-align: center;
  max-width: 460px;
}

.mic-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-xs);
  flex: none;
  /* 推底与底部安全间距（Home 指示条防遮挡）由 SafeBottom 容器统一提供 */
}
.mic {
  width: clamp(72px, min(17vh, 12vw), 124px);
  height: clamp(72px, min(17vh, 12vw), 124px);
  flex: none;
  border-radius: 50%;
  font-size: clamp(26px, min(6vh, 4.6vw), 46px);
  border: none;
  cursor: pointer;
  /* 高光用半透明白叠加而不是写死的浅黄，深色主题下同样是"打光"而不是发白 */
  background: radial-gradient(
      circle at 35% 30%,
      rgba(255, 255, 255, 0.42),
      rgba(255, 255, 255, 0) 62%
    ),
    var(--orange);
  color: var(--on-tone);
  box-shadow: 0 8px 0 var(--orange-dark), 0 12px 22px rgba(0, 0, 0, 0.18);
  transition: transform 0.1s, box-shadow 0.1s;
  touch-action: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mic:active,
.mic.live {
  transform: translateY(6px);
  box-shadow: 0 2px 0 var(--orange-dark);
}
.mic.live {
  animation: mic-start 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), pulse 1s 0.35s infinite;
}
/* 录音开始：按钮弹一下 */
@keyframes mic-start {
  0% { transform: scale(1); }
  50% { transform: scale(1.15); }
  100% { transform: translateY(6px) scale(1); }
}
@keyframes pulse {
  0%,
  100% {
    outline: 6px solid rgba(255, 159, 67, 0.35);
  }
  50% {
    outline: 14px solid rgba(255, 159, 67, 0.15);
  }
}
.waves {
  display: flex;
  gap: 5px;
  height: 22px;
  align-items: flex-end;
  animation: waves-in 0.25s ease-out;
}
@keyframes waves-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.waves i {
  width: 6px;
  background: var(--orange);
  border-radius: 3px;
  animation: bounce 0.7s infinite ease-in-out;
}
.waves i:nth-child(2) {
  animation-delay: 0.15s;
}
.waves i:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes bounce {
  0%,
  100% {
    height: 8px;
  }
  50% {
    height: 22px;
  }
}
.mic-blocked {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-s);
  padding: var(--gap-m);
}
.blocked-tip {
  text-align: center;
  font-weight: var(--fw-mid);
  color: var(--ink-soft);
  line-height: 1.5;
  margin: 0;
}
.mic-label {
  margin: 0;
  font-weight: var(--fw-strong);
  color: var(--ink-soft);
  font-size: var(--fs-small);
}
.replay {
  height: 36px;
}
/* 醒目回放按钮：大圆橙色喇叭，孩子一眼看到"点这里听自己读的" */
.replay-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--gap-s) var(--gap-m);
  border: none;
  border-radius: var(--radius);
  background: var(--grad-gold);
  color: var(--on-gold);
  box-shadow: 0 var(--press) 0 rgba(0, 0, 0, 0.18);
  cursor: pointer;
}
.replay-btn .k-ico {
  width: 36px;
  height: 36px;
}
.replay-btn:active {
  transform: translateY(calc(var(--press) - 1px));
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.18);
}
.replay-label {
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
}
/* 轻量手动重放胶囊：ASR 反馈 / record 判定后，想再听自己发音时点这里 */
.replay-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--tap-min);
  padding: 4px 16px;
  border: 1.5px solid var(--line);
  background: var(--card-bg);
  border-radius: var(--radius-pill);
  color: var(--ink-soft);
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
  box-shadow: var(--shadow-soft);
  cursor: pointer;
  touch-action: manipulation;
  transition: transform 0.1s, box-shadow 0.1s;
}
.replay-chip .k-ico {
  width: 20px;
  height: 20px;
}
.replay-chip:active {
  transform: translateY(1px);
}

.feedback {
  width: 100%;
  max-width: 500px;
  flex: none;
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  /* 底部间距交给 SafeBottom（不用 padding 简写，避免覆盖安全区） */
  padding-top: clamp(10px, 1.6vh, 16px);
  padding-left: clamp(10px, 1.6vw, 16px);
  padding-right: clamp(10px, 1.6vw, 16px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-xs);
  /* 推底与底部安全间距由 SafeBottom 容器统一提供 */
}
.verdict {
  margin: 0;
  font-size: clamp(15px, min(2.6vh, 2.1vw), 20px);
  font-weight: var(--fw-strong);
  text-align: center;
}
/* "再试一次"提示：图标与文字同排，图标跟随字号 */
.retry-hint {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  justify-content: center;
}
.verdict.perfect {
  color: var(--ok-dark);
  background: var(--state-ok-bg);
  border: 2px solid var(--ok);
  padding: 8px 20px;
  border-radius: var(--radius-pill);
  font-size: var(--fs-title);
}
.verdict.good {
  color: var(--blue-dark);
}
.verdict.retry {
  color: var(--orange-dark);
}
.heard {
  margin: 0;
  color: var(--ink-soft);
  font-weight: var(--fw-mid);
  font-size: var(--fs-small);
  text-align: center;
}
.judge-q {
  margin: 0;
  font-weight: var(--fw-strong);
  font-size: clamp(15px, min(2.6vh, 2.1vw), 19px);
  text-align: center;
}

/**
 * 手机横屏：把"图片 + 单词"改成左右并排，麦克风也缩到最小，
 * 这样一屏能同时看到示范图、单词、麦克风和反馈按钮。
 */
@media (max-height: 480px) {
  .word-zone {
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: var(--gap-m);
    width: 100%;
  }
  .word-text {
    align-items: flex-start;
    text-align: left;
  }
  .tip {
    text-align: left;
    max-width: 320px;
  }
  .pic {
    width: 76px;
    height: 76px;
  }
  /* 矮屏横屏：空间紧张，隐藏纯装饰牌垛层，优先保证主卡与按钮可达 */
  .deck-back {
    display: none;
  }
  .replay-chip {
    min-height: 36px;
    padding: 4px 12px;
  }
  .mic {
    width: 58px;
    height: 58px;
    font-size: 24px;
  }
  .waves {
    height: 16px;
  }
  .mic-blocked {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-s);
  padding: var(--gap-m);
}
.blocked-tip {
  text-align: center;
  font-weight: var(--fw-mid);
  color: var(--ink-soft);
  line-height: 1.5;
  margin: 0;
}
.mic-label {
    display: none;
  }
  .feedback {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--gap-s);
    padding: 8px 12px;
  }
  .verdict,
  .judge-q,
  .heard {
    flex: 1 1 100%;
  }
}
</style>
