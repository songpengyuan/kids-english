<script setup>
/**
 * 错词复习页（/review）
 *
 * 产品闭环补位：练习中答错/连错的单词由各玩法 recordWord 落库，
 * 本页把它们捞出来做"听音选图"式集中复习——答对一次记一次正确，
 * 当正确次数超过错误次数后，getWeakWords 自动把它移出弱词池。
 *
 * 规则与听音选图一致（统一错误反馈）：答错只标红、不揭示答案、不前进；
 * 点错的选项也记一次错误（说明它同样不熟）。
 */
import { computed, onMounted, ref, watch } from "vue";
import { lessons } from "../data/lessons";
import { useProgressStore } from "../stores/progress";
import { useRouter } from "vue-router";
import { speak } from "../utils/speech";
import { sfxCorrect, sfxWrong, celebrate, sfxTap } from "../utils/effects";
import { useViewport } from "../composables/useViewport";
import { Check, RotateCcw, Volume2 } from "@lucide/vue";
import HeaderBar from "../components/layout/HeaderBar.vue";
import PathIcon from "../components/PathIcon.vue";

const progress = useProgressStore();
const router = useRouter();
const { isNarrow } = useViewport();

/** 全词库（跨课抽干扰项用；同一 en 在不同课算两个词） */
const allWords = lessons.flatMap((l) => l.words);

/** 当前弱词（含词面信息）：答错过、且正确 ≤ 错误 */
const words = computed(() => {
  const weak = progress.getWeakWords();
  return weak
    .map((w) => allWords.find((x) => x.id === w.wordId && x.lessonId === w.lessonId))
    .filter(Boolean);
});

/** 复习一轮结束后仍待练的弱词数 */
const againCount = computed(() => progress.getWeakWords().length);

/* ---------- 出题状态 ---------- */
const seq = ref([]); // 本轮出题序列（word 对象，随机序）
const idx = ref(0);
const opts = ref([]); // 当前题的 4 个选项
const picked = ref(null); // 已正确选中的选项 key（lessonId:id，防跨课同 id 误标）
const wrongPicks = ref(new Set()); // 已点错的选项 key（lessonId:id）
const rightCount = ref(0);
const total = ref(0);
const finished = ref(false);

function shuffle(list) {
  return [...list].sort(() => Math.random() - 0.5);
}

function loadQuestion() {
  const t = seq.value[idx.value];
  if (!t) return;
  picked.value = null;
  wrongPicks.value = new Set();
  const others = allWords.filter((w) => !(w.id === t.id && w.lessonId === t.lessonId));
  opts.value = shuffle([...shuffle(others).slice(0, 3), t]);
  speak(t.en, { lessonId: t.lessonId, wordId: t.id }); // 自动读题
}

function start() {
  seq.value = shuffle(words.value);
  total.value = seq.value.length;
  idx.value = 0;
  rightCount.value = 0;
  finished.value = false;
  if (total.value > 0) loadQuestion();
}

onMounted(() => {
  if (words.value.length > 0) start();
});
// 弱词数据晚到（响应式从 0 → N）时兜底开一轮；避免 seq 为空但 quiz 分支已渲染导致 target.en 报错
watch(words, (w) => {
  if (w.length > 0 && seq.value.length === 0) start();
});

/** 当前题目标词 */
const target = computed(() => seq.value[idx.value] || null);

function replay() {
  const t = target.value;
  if (t) speak(t.en, { lessonId: t.lessonId, wordId: t.id });
}

function pick(opt) {
  const t = target.value;
  if (!t || picked.value || wrongPicks.value.has(`${opt.lessonId}:${opt.id}`)) return;
  if (opt.id === t.id && opt.lessonId === t.lessonId) {
    picked.value = `${t.lessonId}:${t.id}`;
    rightCount.value++;
    sfxCorrect();
    celebrate();
    progress.recordWord(t.lessonId, t.id, { correct: 1 }); // 答对 → 逐步移出弱词池
    setTimeout(next, 1100);
  } else {
    sfxWrong();
    // 统一错误反馈（与听音选图一致）：只标红、不揭示、不前进；点错的词也入复习池
    progress.recordWord(opt.lessonId, opt.id, { wrong: 1 });
    wrongPicks.value = new Set([...wrongPicks.value, `${opt.lessonId}:${opt.id}`]);
  }
}

function next() {
  if (idx.value >= seq.value.length - 1) {
    finished.value = true;
  } else {
    idx.value++;
    loadQuestion();
  }
}
</script>

<template>
  <div class="review view">
    <HeaderBar show-back back-label="返回首页" @back="router.push('/')">
      <template #title><PathIcon name="learn" class="title-ico" /> 错词复习</template>
      <template #right><span class="cnt-badge">{{ words.length }} 个待练</span></template>
    </HeaderBar>

    <!-- 空态：没有弱词 -->
    <div v-if="words.length === 0" class="empty view-body view-center">
      <div class="empty-emoji anim-float"><PathIcon name="learn" class="empty-ico" /></div>
      <h2>没有要复习的词</h2>
      <p>答错的单词会自动出现在这里，先回首页学一课吧！</p>
      <button class="k-btn" @click="router.push('/')">回首页</button>
    </div>

    <!-- 出题 -->
    <div v-else-if="!finished" class="quiz view-body">
      <div class="progress" aria-label="复习进度">
        <div class="p-bar"><div class="p-fill" :style="{ width: ((idx + 1) / total) * 100 + '%' }"></div></div>
        <span>第 {{ idx + 1 }}/{{ total }} 题</span>
      </div>

      <div class="prompt anim-pop">
        <p>听一听，选出对的图片</p>
        <button class="replay" :aria-label="'再听一遍' + (target?.en ?? '')" @click="replay">
          <Volume2 class="k-ico" />
        </button>
      </div>

      <div class="opts" :class="{ narrow: isNarrow }">
        <button
          v-for="opt in opts"
          :key="opt.lessonId + ':' + opt.id"
          class="opt anim-pop"
          :class="{
            hit: picked === opt.lessonId + ':' + opt.id,
            miss: wrongPicks.has(opt.lessonId + ':' + opt.id)
          }"
          :disabled="picked !== null"
          @click="pick(opt)"
        >
          <img :src="opt.image" :alt="opt.en" />
          <span v-if="picked === opt.lessonId + ':' + opt.id" class="mark hit-mark"><Check class="k-ico" /></span>
          <span v-if="wrongPicks.has(opt.lessonId + ':' + opt.id)" class="mark miss-mark">✗</span>
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
        <button v-if="againCount > 0" class="k-btn" @click="start">
          <RotateCcw class="k-ico" />再练一次
        </button>
        <button class="k-btn gray" @click="router.push('/')">回首页</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.review {
  gap: var(--gap-s);
}
.cnt-badge {
  font-weight: 800;
  font-size: var(--fs-small);
  color: var(--ink-soft);
  background: var(--card-bg);
  border-radius: var(--radius-pill);
  padding: 4px var(--gap-m);
  box-shadow: var(--shadow-hard);
  flex: none;
}

.quiz {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-s);
}
.progress {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  width: min(340px, 92%);
  font-weight: 800;
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.p-bar {
  flex: 1;
  height: 10px;
  background: var(--line);
  border-radius: var(--radius-pill);
  overflow: hidden;
}
.p-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--gold), var(--yellow));
  border-radius: var(--radius-pill);
  transition: width 0.4s;
}
.prompt {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  font-weight: 800;
  font-size: var(--fs-body);
  color: var(--ink);
}
.replay {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: clamp(46px, 8vh, 56px);
  height: clamp(46px, 8vh, 56px);
  border-radius: 50%;
  background: linear-gradient(160deg, var(--yellow), var(--gold));
  color: #6b4e00;
  box-shadow: 0 var(--press) 0 rgba(0, 0, 0, 0.16);
  transition: transform 0.1s;
}
.replay:active {
  transform: translateY(2px);
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
  transition: transform 0.1s;
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
.opt.hit {
  box-shadow: 0 0 0 4px var(--green), var(--shadow-hard);
}
.opt.miss {
  filter: grayscale(1);
  opacity: 0.55;
}
.mark {
  position: absolute;
  top: 6px;
  right: 6px;
  width: clamp(26px, 5vh, 34px);
  height: clamp(26px, 5vh, 34px);
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: var(--fs-body);
  color: #fff;
  animation: pop-in 0.25s ease-out;
}
.hit-mark {
  background: var(--green);
}
.miss-mark {
  background: #ff6b5e;
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
  gap: 4px;
  background: var(--card-bg);
  border-radius: var(--radius);
  padding: var(--gap-m) var(--gap-l);
  box-shadow: var(--shadow-hard);
}
.big {
  font-weight: 900;
  font-size: clamp(22px, 4vh, 32px);
  color: var(--ink);
}
.of {
  font-weight: 800;
  color: var(--ink-soft);
  font-size: var(--fs-body);
}
.again {
  margin: 0;
  color: var(--ink-soft);
  font-weight: 700;
  font-size: var(--fs-body);
  line-height: 1.6;
}
.again b {
  color: var(--ink);
}
.again.ok {
  color: var(--green-dark);
  font-weight: 800;
}
.btn-row {
  display: flex;
  gap: var(--gap-s);
  flex-wrap: wrap;
  justify-content: center;
}
.btn-row .k-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.empty {
  text-align: center;
  gap: var(--gap-m);
}
.empty-emoji {
  font-size: clamp(40px, 10vh, 64px);
}
.empty h2 {
  margin: 0;
  font-size: var(--fs-title);
}
.empty p {
  margin: 0;
  color: var(--ink-soft);
  font-weight: 700;
  font-size: var(--fs-body);
}
</style>
