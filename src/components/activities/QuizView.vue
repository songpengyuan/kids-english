<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { speak } from "../../utils/speech";
import { sfxCorrect, sfxTap, sfxWrong } from "../../utils/effects";
import { useProgressStore } from "../../stores/progress";
import { useQuizSession } from "../../composables/useQuizSession";
import type { Word } from "../../data/lessons";
import { Volume2 } from "@lucide/vue";
import LessonFooter from "./LessonFooter.vue";

const props = defineProps<{ words: Word[] }>();
const emit = defineEmits(["done", "progress"]);

const progress = useProgressStore();
const imgFail = ref<Record<string, boolean>>({});

const session = useQuizSession<Word>(() => props.words, {
  onProgress: (p) => emit("progress", p),
  onCorrect: (w) => {
    sfxCorrect();
    speak(w.en, { lessonId: w.lessonId, wordId: w.id });
    progress.recordWord(w.lessonId, w.id, { correct: 1 });
  },
  onWrong: (picked) => {
    sfxWrong();
    progress.recordWord(picked.lessonId, picked.id, { wrong: 1 });
  },
  onExplore: (w) => {
    sfxTap();
    speak(w.en, { lessonId: w.lessonId, wordId: w.id });
    progress.recordWord(w.lessonId, w.id, { seen: 1 });
  },
});

const { q, total, picked, wrongPicks, locked, stars, pick, next: gotoNext, cleanup } = session;

const selectedKey = ref<string | null>(null);

function replay() {
  const t = q.value.target;
  speak(t.en, { lessonId: t.lessonId, wordId: t.id });
}

function onPick(opt: Word) {
  if (locked.value) {
    pick(opt);
    return;
  }
  if (wrongPicks.value.has(opt.id)) return;
  // 再次点同一个 = 取消选中，不发音
  if (selectedKey.value === opt.id) {
    selectedKey.value = null;
    return;
  }
  // 选中新选项：蓝色高亮 + 朗读这个单词
  selectedKey.value = opt.id;
  sfxTap();
  speak(opt.en, { lessonId: opt.lessonId, wordId: opt.id });
}

function check() {
  if (!selectedKey.value || locked.value) return;
  const opt = q.value.options.find((o) => o.id === selectedKey.value);
  if (!opt) return;
  const result = pick(opt);
  if (result === "wrong") selectedKey.value = null;
}

function onFooterButton() {
  if (locked.value) {
    selectedKey.value = null;
    const r = gotoNext();
    if (r.done) emit("done", r.stars);
  } else {
    check();
  }
}

watch(
  () => session.idx.value,
  () => {
    selectedKey.value = null;
    const t = q.value?.target;
    if (!t) return;
    setTimeout(() => speak(t.en, { lessonId: t.lessonId, wordId: t.id }), 350);
  },
  { immediate: true }
);

onBeforeUnmount(cleanup);
</script>

<template>
  <div class="quiz view">
    <button class="big-speaker anim-float" @click="replay" aria-label="再听一遍" title="再听一遍">
      <Volume2 class="k-ico" />
    </button>
    <p class="tip">听一听，选一张正确的图片，然后点检查</p>

    <div class="options view-body">
      <div
        v-for="opt in q.options"
        :key="opt.id"
        class="opt anim-pop"
        data-haptic
        :class="{
          right: locked && opt.id === q.target.id,
          wrong: wrongPicks.has(opt.id),
          selected: !locked && selectedKey === opt.id
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
      :feedback="locked ? 'success' : wrongPicks.size ? 'error' : null"
      feedback-text="太棒了！"
      :button-text="locked ? '继续' : '检查'"
      :button-disabled="locked ? false : !selectedKey"
      :show-arrow="locked"
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
}
.big-speaker:active {
  transform: translateY(calc(var(--press) - 1px));
  box-shadow: 0 1px 0 var(--blue-dark);
}
.tip {
  margin: 0;
  font-weight: 700;
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
  font-weight: 800;
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
  border-color: var(--green);
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
