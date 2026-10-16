<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { speak } from "../../services/speech";
import { sfxCorrect, sfxTap, sfxWrong } from "../../services/effects";
import { useProgressStore } from "../../stores/progress";
import { useQuizSession } from "../../composables/useQuizSession";
import type { Word } from "../../data/lessons";
import { Volume2 } from "@lucide/vue";
import SpeakWave from "../ui/SpeakWave.vue";
import LessonFooter from "./LessonFooter.vue";

const props = defineProps<{ words: Word[] }>();
const emit = defineEmits(["done", "progress", "total"]);

const progress = useProgressStore();
const imgFail = ref<Record<string, boolean>>({});

const session = useQuizSession<Word>(() => props.words, {
  onProgress: (p) => emit("progress", p),
  onCorrect: async (w) => {
    sfxCorrect();
    progress.recordWord(w.lessonId, w.id, { correct: 1 });
    // 答对先完整播放正确单词读音，再播"太棒了"（串行不互相打断）
    await speak(w.en, { lessonId: w.lessonId, wordId: w.id });
    await speak("太棒了");
  },
  onWrong: async (picked) => {
    sfxWrong();
    progress.recordWord(picked.lessonId, picked.id, { wrong: 1 });
    // 点错也播放所点单词的读音（孩子知道自己点的是什么）
    await speak(picked.en, { lessonId: picked.lessonId, wordId: picked.id });
  },
  onExplore: (w) => {
    sfxTap();
    speak(w.en, { lessonId: w.lessonId, wordId: w.id });
    progress.recordWord(w.lessonId, w.id, { seen: 1 });
  },
});

const { q, total, picked, wrongPicks, locked, stars, pick, next: gotoNext, cleanup } = session;

/** 题目总数上报 → 顶栏显示"x/y"（孩子知道一共要做几题） */
watch(total, () => emit("total", total.value), { immediate: true });

const selectedKey = ref<string | null>(null);

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

function onPick(opt: Word) {
  if (locked.value) return;
  if (wrongPicks.value.has(opt.id)) return;
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
    const t = q.value?.target;
    if (!t) return;
    setTimeout(playTarget, 350);
  },
  { immediate: true }
);

onBeforeUnmount(() => { speaking.value = false; cleanup(); });
</script>

<template>
  <div class="quiz view">
    <button class="big-speaker anim-float" @click="replay" aria-label="再听一遍" title="再听一遍">
      <Volume2 class="k-ico" />
      <SpeakWave v-if="speaking" size="lg" />
    </button>
    <p class="tip">听一听，点正确的图片</p>

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
        @click="onPick(opt)"
      >
        <div class="pic">
          <img
            v-if="!imgFail[opt.id] && opt.image"
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
      button-text="太棒了！"
      :show-arrow="true"
      @button="onFooterButton"
    />
  </div>
</template>

<style scoped>
.quiz {
  align-items: center;
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
}
.pic img {
  width: 78%;
  height: 78%;
  object-fit: contain;
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
