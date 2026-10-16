<script setup lang="ts">
/**
 * 到期词复习页（/review）—— 间隔重复（SRS）队列
 *
 * 队列来源：progress.getReviewQueue()——未掌握且**已到期**的词（1/3/7/14 天制）。
 * 答对 → SRS 进一级（下次间隔拉长）；答错 → 打回第 0 级，明天再来。
 * 答对同时计入今日目标的"复习 N 词"（streak.markReview）。
 *
 * 判题规则与听音选图一致：答错只标红、不揭示答案、不前进；
 * 点错的选项也记一次错误（说明它同样不熟）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { lessons, type Word } from "../../data/lessons";
import { useProgressStore } from "../../stores/progress";
import { useStreakStore } from "../../stores/streak";
import { useRouter } from "vue-router";
import { speak } from "../../services/speech";
import { bigCelebrate, sfxCorrect, sfxWrong, sfxTap } from "../../services/effects";
import { useQuizSession } from "../../composables/useQuizSession";
import { dueWords as dueWordsOf } from "../../utils/reviewQueue";
import { useViewport } from "../../composables/useViewport";
import { Check, RotateCcw, Volume2 } from "@lucide/vue";
import HeaderBar from "../../components/layout/HeaderBar.vue";
import PathIcon from "../../components/PathIcon.vue";
import BaseButton from "../../components/ui/BaseButton.vue";
import EmptyState from "../../components/ui/EmptyState.vue";

const progress = useProgressStore();
const streak = useStreakStore();
const router = useRouter();
const { isNarrow } = useViewport();

/** 全词库（跨课抽干扰项用；同一 en 在不同课算两个词） */
const allWords = lessons.flatMap((l) => l.words);

/** 本轮题目：开一轮时快照下来的到期词（不打乱答题过程中变化的队列） */
const seq = ref<Word[]>([]);
const finished = ref(false);
const rightCount = ref(0);

/** 当前到期队列（含词面信息；词库已删除的孤儿词自动丢弃，见 utils/reviewQueue） */
const dueWords = computed(() => dueWordsOf(progress.getReviewQueue(), allWords));

/** 一轮结束后仍有到期词 / 未掌握词 */
const againCount = computed(() => dueWordsOf(progress.getReviewQueue(), allWords).length);
const unmasteredCount = computed(() => dueWordsOf(progress.getUnmasteredWords(), allWords).length);

/* 出题/判题复用听音选图会话（跨课干扰 + lessonId:id 复合键） */
const session = useQuizSession<Word>(() => seq.value, {
  distractors: () => allWords,
  // 跨课可能有同 id 的词（如 l4/l6 的 blue）→ 用 lessonId:id 做键
  keyOf: (w) => `${w.lessonId}:${w.id}`,
  onCorrect: (w) => {
    sfxCorrect();
    rightCount.value++;
    speak(w.en, { lessonId: w.lessonId, wordId: w.id });
    progress.recordWord(w.lessonId, w.id, { correct: 1 }); // SRS 进一级
    streak.markReview(1); // 今日目标：复习到期词
    setTimeout(next, 1100); // 复习页节奏：答对后自动进下一题
  },
  onWrong: (picked) => {
    sfxWrong();
    progress.recordWord(picked.lessonId, picked.id, { wrong: 1 }); // 打回 stage 0
  },
});

const { q, idx, picked, wrongPicks, pick, cleanup } = session;
const total = computed(() => seq.value.length);
const target = computed(() => q.value?.target ?? null);

function start() {
  seq.value = [...dueWords.value];
  session.reset();
  rightCount.value = 0;
  finished.value = false;
  // 今日目标：复习目标 = min(5, 今天到期的词数)，到期词少了目标自动变小
  streak.syncReviewGoal(dueWords.value.length + streak.reviewed);
  const t = seq.value[0];
  if (t) speak(t.en, { lessonId: t.lessonId, wordId: t.id });
}

/** 答对后自动进下一题；最后一题 → 结算 */
function next() {
  const r = session.next();
  if (r.done) {
    finished.value = true;
    bigCelebrate(); // 整轮复习完成 = 一次"关卡完成"，此时才撒花
  } else {
    const t = seq.value[idx.value];
    if (t) speak(t.en, { lessonId: t.lessonId, wordId: t.id });
  }
}

onMounted(() => {
  if (dueWords.value.length > 0) start();
  else streak.syncReviewGoal(0);
});
// 队列数据晚到（响应式从 0 → N）时兜底开一轮
watch(dueWords, (w) => {
  if (w.length > 0 && seq.value.length === 0) start();
});
onBeforeUnmount(cleanup);

function replay() {
  const t = target.value;
  if (t) speak(t.en, { lessonId: t.lessonId, wordId: t.id });
}

/** 空态说明文案：还有排队中的词就提示一句，否则引导去学新课 */
const emptyDesc = computed(() =>
  unmasteredCount.value > 0
    ? `答错或刚学会的单词会按 1 / 3 / 7 天的节奏回到这里。还有 ${unmasteredCount.value} 个词在排队，明天见～`
    : "答错或刚学会的单词会按 1 / 3 / 7 天的节奏回到这里。先回首页学一课吧！"
);
</script>

<template>
  <div class="review view">
    <HeaderBar show-back back-label="返回" @back="router.push('/course')">
      <template #title><PathIcon name="learn" class="title-ico" /> 到期复习</template>
      <template #right><span class="cnt-badge">{{ dueWords.length }} 个到期</span></template>
    </HeaderBar>

    <!-- 空态：今天没有到期的词（用全局 EmptyState，和"没有卡片/没有宝藏"长得一样） -->
    <div v-if="dueWords.length === 0" class="view-body view-center">
      <EmptyState title="今天没有要复习的词" :desc="emptyDesc">
        <template #icon>
          <div class="empty-emoji anim-float"><PathIcon name="learn" /></div>
        </template>
        <BaseButton variant="green" @click="router.push('/course')">回学习</BaseButton>
      </EmptyState>
    </div>

    <!-- 出题 -->
    <div v-else-if="!finished" class="quiz view-body">
      <div class="quiz-head">
        <div class="progress" aria-label="复习进度">
          <div class="fill" :style="{ width: ((idx + 1) / total) * 100 + '%' }"></div>
        </div>
        <span>第 {{ idx + 1 }}/{{ total }} 题</span>
      </div>

      <div class="prompt anim-pop">
        <p>听一听，选出对的图片</p>
        <button class="replay tone-gold round" :aria-label="'再听一遍' + (target?.en ?? '')" @click="replay">
          <Volume2 class="k-ico" />
        </button>
      </div>

      <div class="opts" :class="{ narrow: isNarrow }">
        <button
          v-for="opt in q?.options ?? []"
          :key="opt.lessonId + ':' + opt.id"
          class="opt anim-pop"
          :class="{
            hit: picked === opt.lessonId + ':' + opt.id,
            miss: wrongPicks.has(opt.lessonId + ':' + opt.id)
          }"
          :disabled="picked !== null"
          @click="pick(opt)"
        >
          <img v-if="opt.image" :src="opt.image || undefined" :alt="opt.en" />
          <span v-else class="ph">{{ opt.emoji }}</span>
          <span v-if="picked === opt.lessonId + ':' + opt.id" class="mark hit-mark round-sm"><Check class="k-ico" /></span>
          <span v-if="wrongPicks.has(opt.lessonId + ':' + opt.id)" class="mark miss-mark round-sm">✗</span>
        </button>
      </div>
    </div>

    <!-- 结算 -->
    <div v-else class="result view-body view-center">
      <h2>复习完成！</h2>
      <div class="score anim-pop">
        <span class="big">答对 {{ rightCount }}</span>
        <span class="of">/ {{ total }} 题</span>
      </div>
      <p class="again" v-if="againCount > 0">
        还有 <b>{{ againCount }}</b> 个词要继续练<br />（再答对几次就会从列表里消失）
      </p>
      <p class="again ok" v-else>全部掌握啦，真棒！</p>
      <div class="btn-row">
        <BaseButton v-if="againCount > 0" @click="start">
          <RotateCcw class="k-ico" />再练一次
        </BaseButton>
        <BaseButton variant="green" @click="router.push('/course')">回学习</BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cnt-badge {
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
  color: var(--ink-soft);
  background: var(--card-bg);
  border-radius: var(--radius-pill);
  padding: var(--gap-xs) var(--gap-m);
  box-shadow: var(--shadow-hard);
  flex: none;
}

.quiz {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-s);
}
/* 进度行：进度条本身用全局 .progress（与全站同一根条），这里只负责"条 + 题号"的排布 */
.quiz-head {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  width: min(340px, 92%);
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
/* 全局 .progress 是 flex:none，放进横向排布要允许它撑满剩余宽度 */
.quiz-head .progress {
  flex: 1;
}
.prompt {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
  color: var(--ink);
}
.prompt p {
  margin: 0;
}
/* 再听一遍：直接用 .tone-gold 的"金色贴纸按钮"，按下手感与全站彩色按钮一致 */
.replay {
  width: var(--tap-min);
  height: var(--tap-min);
  font-size: var(--fs-title);
}

/* 选项：2×2（窄屏）或 4 列（宽屏），方块卡片 */
.opts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--gap-s);
  width: 100%;
  max-width: 560px;
}
.opts.narrow {
  max-width: 360px;
}
.opt {
  position: relative;
  width: min(44vw, 150px);
  aspect-ratio: 1;
  border-radius: var(--radius);
  background: var(--card-bg);
  box-shadow: var(--shadow-hard);
  overflow: hidden;
  transition: transform var(--dur-fast) var(--ease-out);
}
.opts.narrow .opt {
  width: min(40vw, 150px);
}
.opt img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  padding: 8%;
  box-sizing: border-box;
}
.opt:active {
  transform: translateY(2px);
}
/* 对/错用语义色（绿=对、红=错），与课内的"听音选图"保持一致 */
.opt.hit {
  box-shadow: 0 0 0 var(--gap-xs) var(--ok), var(--shadow-hard);
}
.opt.miss {
  filter: grayscale(1);
  opacity: 0.55;
}
.mark {
  position: absolute;
  top: var(--gap-xs);
  right: var(--gap-xs);
  font-size: var(--fs-body);
  font-weight: var(--fw-strong);
  color: var(--on-tone);
  animation: pop-in var(--dur-base) var(--ease-pop);
}
.hit-mark {
  background: var(--ok);
}
.miss-mark {
  background: var(--red);
}

/* 结算 */
.result {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-m);
  text-align: center;
}
.result h2 {
  margin: 0;
  font-size: var(--fs-title);
}
.score {
  display: flex;
  align-items: baseline;
  gap: var(--gap-xs);
  background: var(--card-bg);
  border-radius: var(--radius);
  padding: var(--gap-m) var(--gap-l);
  box-shadow: var(--shadow-hard);
}
.big {
  font-weight: var(--fw-strong);
  font-size: var(--fs-hero);
  color: var(--ink);
}
.of {
  font-weight: var(--fw-strong);
  color: var(--ink-soft);
  font-size: var(--fs-body);
}
.again {
  margin: 0;
  color: var(--ink-soft);
  font-weight: var(--fw-mid);
  font-size: var(--fs-body);
  line-height: 1.6;
}
.again b {
  color: var(--ink);
}
.again.ok {
  color: var(--ok-dark);
  font-weight: var(--fw-strong);
}

.empty-emoji {
  font-size: var(--fs-emoji-xl);
  line-height: 1;
  color: var(--brand);
}
</style>
