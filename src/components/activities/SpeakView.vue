<script setup lang="ts">
import { computed, ref } from "vue";
import { speak } from "../../utils/speech";
import { sfxCorrect, sfxWrong } from "../../utils/effects";
import { useProgressStore } from "../../stores/progress";
import { useSpeechSession } from "../../composables/useSpeechSession";
import type { Word } from "../../data/lessons";
import { ChevronRight, Mic, RotateCcw, Square, ThumbsUp, Volume2 } from "@lucide/vue";

const props = defineProps<{ words: Word[] }>();
const emit = defineEmits(["done"]);

const progress = useProgressStore();

/**
 * 跟我读：双模式会话（ASR 自动打分 / 录音回放 + 家长判定）在 useSpeechSession 里，
 * 这里只做音效、掌握度落库与渲染。
 */
const session = useSpeechSession(computed(() => props.words), {
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
});

const {
  mode,
  status,
  grade,
  heard,
  canRecord,
  recordHint,
  recAudio,
  recUrl,
  imgFailed,
  cur,
  progressText,
  stars,
  hearExample,
  startMic,
  stopMic,
  replayRec,
  parentJudge,
  retry,
} = session;

/** 最后一个词 → 上报星级（首次通过率） */
function next() {
  if (session.next()) emit("done", stars.value);
}
</script>

<template>
  <div class="speak view">
    <div class="speak-head">
      <span class="prog">{{ progressText }}</span>
      <span class="mode-tag">
        <Mic class="k-ico" />{{ mode === "asr" ? "自动打分" : "录音回放" }}
      </span>
    </div>

    <div class="word-zone">
      <div class="pic anim-pop" data-haptic @click="hearExample">
        <img
          v-if="!imgFailed && cur.image"
          :src="cur.image || undefined"
          @error="imgFailed = true"
        />
        <span v-else class="fallback-emoji">{{ cur.emoji }}</span>
      </div>
      <div class="word-text">
        <button class="word" @click="hearExample">{{ cur.en }}</button>
        <p class="tip" v-if="mode === 'asr'">点图听一遍，再按住大麦克风跟读给小耳朵听</p>
        <p class="tip" v-else>
          {{
            recordHint || "按住大麦克风说话，松开手自动播放回放，和爸爸妈妈一起听"
          }}
        </p>
      </div>
    </div>

    <!-- 麦克风按钮：按住即说话，松开即停止（录音模式松手自动播放回放） -->
    <div class="mic-zone" v-if="status !== 'feedback' || mode === 'asr'">
      <button
        class="mic"
        :class="{ live: status === 'listening' }"
        aria-label="按住说话"
        title="按住说话"
        @pointerdown.prevent="startMic"
        @pointerup.prevent="stopMic"
        @pointercancel="stopMic"
        @contextmenu.prevent
      >
        <Square v-if="status === 'listening' && mode === 'record'" class="k-ico" />
        <Mic v-else class="k-ico" />
      </button>
      <div v-if="status === 'listening'" class="waves"><i></i><i></i><i></i></div>
      <p class="mic-label">
        {{
          status === "listening"
            ? mode === "asr"
              ? "正在听…松开就打分"
              : "录音中…松开就回放"
            : "按住说话"
        }}
      </p>
    </div>

    <!-- 反馈 -->
    <div v-if="status === 'feedback'" class="feedback anim-fade-up">
      <template v-if="mode === 'record' && grade === ''">
        <!-- 松手后自动播放回放：不展示进度条（小朋友无需看到），读完可直接复读/判定/再试 -->
        <audio ref="recAudio" :src="recUrl" autoplay class="replay"></audio>
        <p class="judge-q">听完啦，读得准不准？</p>
        <div class="btn-row">
          <button class="k-btn gray" @click="replayRec">
            <Volume2 class="k-ico" />再听一遍
          </button>
          <button class="k-btn green" @click="parentJudge(true)">
            <ThumbsUp class="k-ico" />读得棒
          </button>
          <button class="k-btn orange" @click="parentJudge(false)">
            <RotateCcw class="k-ico" />再试一次
          </button>
        </div>
      </template>
      <template v-else-if="mode === 'record'">
        <p class="verdict" :class="grade">
          <span v-if="grade === 'perfect'">太棒了！</span>
          <span v-else class="retry-hint"><RotateCcw class="k-ico" />再试一次吧，先听一遍示范</span>
        </p>
        <div class="btn-row">
          <button class="k-btn gray" @click="hearExample">
            <Volume2 class="k-ico" />再听示范
          </button>
          <button v-if="grade === 'retry'" class="k-btn orange" @click="retry">
            <Mic class="k-ico" />我再试试
          </button>
          <button v-else class="k-btn" @click="next">
            继续<ChevronRight class="k-ico" />
          </button>
        </div>
      </template>
      <template v-else>
        <p class="verdict" :class="grade">
          <span v-if="grade === 'perfect'">太棒了！发音很标准</span>
          <span v-else-if="grade === 'good'">很不错，再响亮一点就更棒啦</span>
          <span v-else class="retry-hint"><RotateCcw class="k-ico" />再试一次吧，先听一遍示范</span>
        </p>
        <p v-if="heard" class="heard">小耳朵听到的是："{{ heard }}"</p>
        <div class="btn-row">
          <button class="k-btn gray" @click="hearExample">
            <Volume2 class="k-ico" />再听示范
          </button>
          <button v-if="grade === 'retry'" class="k-btn orange" @click="retry">
            <Mic class="k-ico" />我再试试
          </button>
          <button v-else class="k-btn" @click="next">
            继续<ChevronRight class="k-ico" />
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.speak {
  align-items: center;
}
.speak-head {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex: none;
  gap: var(--gap-s);
}
.prog {
  font-weight: 800;
  color: var(--ink-soft);
}
.mode-tag {
  background: var(--card-bg);
  border-radius: var(--radius-pill);
  padding: 3px clamp(8px, 1.2vw, 12px);
  font-weight: 800;
  font-size: var(--fs-small);
  box-shadow: var(--shadow-soft);
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
}

.word-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-xs);
  flex: none;
  min-height: 0;
}
.pic {
  /* 同时受高和宽约束：iPad 横屏不至于过大，手机竖屏也不会占满整屏 */
  width: clamp(88px, min(32vh, 24vw), 240px);
  height: clamp(88px, min(32vh, 24vw), 240px);
  flex: none;
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-emoji-xl);
  cursor: pointer;
  transition: transform 0.15s;
  overflow: hidden;
}
.pic:active {
  transform: scale(0.94);
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
  font-size: clamp(24px, min(5vh, 4.2vw), 42px);
  background: none;
  font-weight: 800;
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
  font-weight: 700;
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
  /* 录音按钮靠下：贴近屏幕底部，孩子拇指好按（图片/单词在上部可更大） */
  margin-top: auto;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
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
  animation: pulse 1s infinite;
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
.mic-label {
  margin: 0;
  font-weight: 800;
  color: var(--ink-soft);
  font-size: var(--fs-small);
}
.replay {
  height: 36px;
}
.replay.big {
  height: 44px;
}

.feedback {
  margin-top: auto;
  width: 100%;
  max-width: 500px;
  flex: none;
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: clamp(8px, 1.4vh, 14px) clamp(10px, 1.6vw, 16px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-xs);
}
.verdict {
  margin: 0;
  font-size: clamp(15px, min(2.6vh, 2.1vw), 20px);
  font-weight: 800;
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
  color: var(--green-dark);
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
  font-weight: 700;
  font-size: var(--fs-small);
  text-align: center;
}
.judge-q {
  margin: 0;
  font-weight: 800;
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
  .mic {
    width: 58px;
    height: 58px;
    font-size: 24px;
  }
  .waves {
    height: 16px;
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
