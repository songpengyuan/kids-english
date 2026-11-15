<script setup lang="ts">
import { nextTick, onBeforeUnmount, computed, ref, watch } from "vue";
import { speak } from "../../services/speech";
import { sfxCorrect, sfxTap, sfxWrong } from "../../services/effects";
import { useProgressStore } from "../../stores/progress";
import { useQuizSession } from "../../composables/useQuizSession";
import { useMascot } from "../../composables/useMascot";
import { useFlyToEl } from "../../composables/useFlyToEl";
import type { Word } from "../../data/lessons";
import { Headphones, Volume2 } from "@lucide/vue";
import SpeakWave from "../ui/SpeakWave.vue";
import LessonFooter from "./LessonFooter.vue";
import StageHead from "./StageHead.vue";
import QuizFeedBird from "./QuizFeedBird.vue";

const props = defineProps<{ words: Word[] }>();
const emit = defineEmits(["done", "progress", "total"]);

const progress = useProgressStore();
const mascot = useMascot();
const imgFail = ref<Record<string, boolean>>({});

/* ---------- 喂乐乐鸟（2026-11-15 杠杆③ 皮肤首例，逻辑不动换皮） ----------
 * 舞台右上有实体鸟：答对 → 所点图卡抛物线飞入鸟嘴 → 鸟嚼两下；答错 → 鸟垂头。
 * 全局吉祥物浮层在 quiz 内退位（oopsVoice 纯语音），避免两只鸟同框。 */
const birdMood = ref<"idle" | "yum" | "oops">("idle");
const bird = ref<InstanceType<typeof QuizFeedBird> | null>(null);
const flyWord = ref<Word | null>(null);
const flyEl = ref<HTMLElement | null>(null);
const flyOne = useFlyToEl(flyEl);
let moodTimer: number | null = null;
let pressedEl: HTMLElement | null = null;

function birdCenter(): { x: number; y: number } | null {
  const el = bird.value?.root;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height * 0.45 }; // 鸟嘴偏上
}

async function feedBird(w: Word) {
  const from = pressedEl?.getBoundingClientRect();
  const to = birdCenter();
  if (from && to) {
    flyWord.value = w;
    await nextTick(); // fly-food 渲染出来才有元素可飞
    await flyOne(
      { x: from.left + from.width / 2, y: from.top + from.height / 2 },
      to,
      90
    );
    flyWord.value = null;
  }
  birdMood.value = "yum";
  if (moodTimer !== null) clearTimeout(moodTimer);
  moodTimer = window.setTimeout(() => (birdMood.value = "idle"), 1200);
}

const session = useQuizSession<Word>(() => props.words, {
  onProgress: (p) => emit("progress", p),
  onCorrect: async (w) => {
    sfxCorrect();
    progress.recordWord(w.lessonId, w.id, { correct: 1 });
    // 图卡飞入鸟嘴 → 鸟嚼 → 播单词音 → "太棒了"（串行不互相打断）
    await feedBird(w);
    await speak(w.en, { lessonId: w.lessonId, wordId: w.id });
    await speak("太棒了");
  },
  onWrong: async (picked) => {
    sfxWrong();
    progress.recordWord(picked.lessonId, picked.id, { wrong: 1 });
    // 鸟垂头；点错也播放所点单词的读音（孩子知道自己点的是什么）
    birdMood.value = "oops";
    if (moodTimer !== null) clearTimeout(moodTimer);
    moodTimer = window.setTimeout(() => (birdMood.value = "idle"), 800);
    await speak(picked.en, { lessonId: picked.lessonId, wordId: picked.id });
    // 教育语音先行，打气殿后（纯语音：舞台鸟已做视觉反应，浮层鸟退位）
    mascot.oopsVoice();
  },
  onExplore: (w) => {
    sfxTap();
    speak(w.en, { lessonId: w.lessonId, wordId: w.id });
    progress.recordWord(w.lessonId, w.id, { seen: 1 });
  },
});

const { q, total, picked, wrongPicks, locked, stars, pick, next: gotoNext, cleanup, inCatchUp } = session;

/** 题目总数上报 → 顶栏显示"x/y"（孩子知道一共要做几题） */
watch(total, () => emit("total", total.value), { immediate: true });

const selectedKey = ref<string | null>(null);

/** 头部行进度文本：与其它玩法的 StageHead 同构（左「N / M」右玩法标签） */
const progressText = computed(() => `${Math.min(session.idx.value + 1, total.value)} / ${total.value}`);

/** 顶部大喇叭正在发音：朗读期间显示声波动效（样式参考宝藏详情页） */
const speaking = ref(false);

/** 统一读题发音入口：置 speaking 状态 → speak → 结束清除（被打断也走 finally） */
async function playTarget() {
  const t = q.value?.target;
  if (!t) return;
  speaking.value = true;
  try {
    await speak(t.en, { lessonId: t.lessonId, wordId: t.id });
  } finally {
    speaking.value = false;
  }
}

function replay() {
  playTarget();
}

function onPick(e: Event, opt: Word) {
  if (locked.value) return;
  if (wrongPicks.value.has(opt.id)) return;
  // 记住所点图卡：答对时它要飞进鸟嘴
  pressedEl = (e.currentTarget as HTMLElement) ?? null;
  // 发音统一交给 pick 回调（答对：先单词音再"太棒了"；答错：单词音）——避免互相打断
  pick(opt);
}

function onFooterButton() {
  if (!locked.value) return;
  selectedKey.value = null;
  const r = gotoNext();
  if (r.done) emit("done", r.stars);
}

watch(
  () => session.idx.value,
  () => {
    selectedKey.value = null;
    birdMood.value = "idle"; // 新题：鸟回到待喂
    const t = q.value?.target;
    if (!t) return;
    setTimeout(playTarget, 350);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  speaking.value = false;
  cleanup();
  if (moodTimer !== null) clearTimeout(moodTimer);
});
</script>

<template>
  <div class="quiz view">
    <StageHead class="quiz-head" :text="progressText" tag="听音选图" :icon="Headphones" />
    <div class="feeder-row">
      <button class="big-speaker anim-float" @click="replay" aria-label="再听一遍" title="再听一遍">
        <Volume2 class="k-ico" />
        <SpeakWave v-if="speaking" size="lg" />
      </button>
      <!-- 喂乐乐鸟：答对的图卡飞进鸟嘴（2026-11-15 杠杆③ 皮肤首例） -->
      <QuizFeedBird ref="bird" :mood="birdMood" />
    </div>
    <p class="tip">{{ inCatchUp ? "刚才卡住的词，再来挑战一次！" : "听一听，点正确的图片" }}</p>

    <!-- 飞行食物：所点图卡的迷你克隆，抛物线飞进鸟嘴（useFlyToEl 驱动） -->
    <div v-if="flyWord" ref="flyEl" class="fly-food" aria-hidden="true">
      <img v-if="flyWord.image && !imgFail[flyWord.id]" :src="flyWord.image" :alt="flyWord.en" />
      <span v-else>{{ flyWord.emoji }}</span>
    </div>

    <div class="options view-body">
      <div
        v-for="opt in q.options"
        :key="opt.id"
        class="opt anim-pop"
        data-haptic
        :class="{
          right: locked && opt.id === q.target.id,
          wrong: wrongPicks.has(opt.id)
        }"
        @click="onPick($event, opt)"
      >
        <div class="pic">
          <!-- 颜色词（l11 听音选图等）：统一显示颜色圆圈，不用 emoji/图片
               （2026-10-26：颜色词的 emoji 有的是水果🍊不是圆，孩子易误解成"看图选水果"） -->
          <span v-if="opt.color" class="quiz-color-dot" :style="{ background: opt.color }"></span>
          <img
            v-else-if="!imgFail[opt.id] && opt.image"
            loading="lazy"
            decoding="async"
            :src="opt.image || undefined"
            :alt="opt.en"
            @error="imgFail[opt.id] = true"
          />
          <span v-else class="ph">{{ opt.emoji }}</span>
        </div>
        <div class="w">{{ opt.en }}</div>
      </div>
    </div>

    <LessonFooter
      v-if="locked"
      :feedback="null"
      button-text="Next!"
      :show-arrow="true"
      @button="onFooterButton"
    />
  </div>
</template>

<style scoped>
.quiz {
  align-items: center;
}
.quiz-head {
  margin-bottom: var(--gap-s);
}
/* 喂鸟行：喇叭 + 乐乐鸟并排（鸟答对吃图、答错垂头） */
.feeder-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--gap-m);
  flex: none;
}
.fly-food {
  position: fixed;
  z-index: 45;
  width: 56px;
  height: 56px;
  left: -9999px; /* 首帧藏在屏外，flyOne 接管后再上屏 */
  top: -9999px;
  opacity: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.fly-food img,
.fly-food span {
  width: 100%;
  height: 100%;
  object-fit: contain;
  font-size: 34px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(var(--shadow-chip));
}
.big-speaker {
  width: clamp(64px, min(15vh, 12vw), 120px);
  height: clamp(64px, min(15vh, 12vw), 120px);
  flex: none;
  border-radius: 50%;
  font-size: clamp(28px, min(7vh, 5.5vw), 56px);
  background: var(--blue);
  color: var(--on-tone);
  box-shadow: 0 var(--press) 0 var(--blue-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.big-speaker:active {
  transform: translateY(calc(var(--press) - 1px));
  box-shadow: 0 1px 0 var(--blue-dark);
}
.tip {
  margin: 0;
  font-weight: var(--fw-mid);
  color: var(--ink-soft);
  font-size: var(--fs-small);
  flex: none;
  text-align: center;
}

.options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: minmax(0, 1fr);
  gap: var(--gap-m);
}
.opt {
  border-radius: var(--radius);
  background: var(--card-bg);
  box-shadow: var(--shadow-hard);
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  overflow: hidden;
  border: 5px solid transparent;
  transition: border-color 0.2s, transform 0.12s;
  min-height: 0;
  min-width: 0;
}
.pic {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 图片解码完成前的暖底占位：否则首帧是深色空卡，弱网真机上孩子看到"图片时有时无" */
  background: var(--media-bg);
  border-radius: var(--radius-s);
}
.pic img {
  width: 78%;
  height: 78%;
  object-fit: contain;
  pointer-events: none;
}
/* 颜色词选项：色圆（与 WordCard/连一一连一致，颜色即"图片"） */
.quiz-color-dot {
  width: clamp(44px, 11vh, 84px);
  height: clamp(44px, 11vh, 84px);
  border-radius: 50%;
  border: 3px solid var(--line);
  box-shadow: inset 0 -4px 8px rgba(0, 0, 0, 0.15);
  pointer-events: none;
}
.pic .ph {
  font-size: var(--fs-emoji-xl);
  line-height: 1;
}
.w {
  flex: none;
  width: 100%;
  text-align: center;
  font-weight: var(--fw-strong);
  letter-spacing: 0.5px;
  font-size: clamp(13px, min(2.6vh, 2vw), 22px);
  color: var(--ink);
  background: var(--tint-cream);
  padding: clamp(2px, 0.8vh, 6px) 4px;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.opt.selected {
  border-color: var(--blue);
  background: rgba(28, 176, 246, 0.08);
}
.opt.right {
  border-color: var(--ok);
  background: var(--state-ok-bg);
}
.opt.wrong {
  border-color: var(--red);
  background: var(--state-bad-bg);
  animation: shake-x 0.45s ease;
}
.opt.right .w,
.opt.wrong .w,
.opt.selected .w {
  background: transparent;
}

@media (max-height: 480px) {
  .options {
    grid-template-columns: repeat(4, 1fr);
    grid-auto-rows: minmax(0, 1fr);
    gap: var(--gap-s);
  }
  .big-speaker {
    width: 52px;
    height: 52px;
    font-size: 24px;
  }
  .tip {
    display: none;
  }
  .w {
    font-size: 12px;
    padding: 1px 2px;
  }
}
</style>
