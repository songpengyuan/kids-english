<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { speak } from "../../utils/speech";
import { sfxCorrect, sfxTap, sfxWrong } from "../../utils/effects";
import { useProgressStore } from "../../stores/progress";
import { useQuizSession } from "../../composables/useQuizSession";
import type { Word } from "../../data/lessons";
import { CheckCircle2, ChevronRight, Volume2 } from "@lucide/vue";

const props = defineProps<{ words: Word[] }>();
const emit = defineEmits(["done", "progress"]);

const progress = useProgressStore();
const imgFail = ref<Record<string, boolean>>({}); // 记录加载失败的图

/* 会话逻辑（出题/判题/首次答对率算星）全在 composable 里，见 useQuizSession */
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

/** 当前已选中但还没"检查"的选项 id（选了不立即判，点检查才判对错） */
const selectedKey = ref<string | null>(null);

function replay() {
  const t = q.value.target;
  speak(t.en, { lessonId: t.lessonId, wordId: t.id });
}

/** 点选项：未锁定时只选中/取消选中（蓝色高亮），不判对错；已锁定后交给 explore */
function onPick(opt: Word) {
  if (locked.value) {
    pick(opt); // 已答对，其他选项 = 点读探索
    return;
  }
  if (wrongPicks.value.has(opt.id)) return; // 已标红的错项不可再选
  selectedKey.value = selectedKey.value === opt.id ? null : opt.id;
}

/** 点"检查"按钮：才真正判当前选中的选项 */
function check() {
  if (!selectedKey.value || locked.value) return;
  const opt = q.value.options.find((o) => o.id === selectedKey.value);
  if (!opt) return;
  const result = pick(opt);
  if (result === "wrong") {
    // 选错：清空选中，孩子重新选（错项已在 composable 里标红短暂闪现）
    selectedKey.value = null;
  }
  // correct：composable 已 locked，selectedKey 在 next() 进下一题时清空
}

/** 继续：最后一题 → 上报星级，否则进下一题 */
function next() {
  selectedKey.value = null;
  const r = gotoNext();
  if (r.done) emit("done", r.stars);
}

/** 每题进来先听一遍（首题与每次翻页都读）*/
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

    <!-- 判定反馈区：选答案不判，点检查才给对错反馈 -->
    <div class="judge-zone">
      <p v-if="locked" class="praise anim-pop">
        <CheckCircle2 class="k-ico" />太棒了！
      </p>
      <p v-else-if="wrongPicks.size" class="oh anim-pop">再听一次哦～</p>
      <p v-else class="praise placeholder" aria-hidden="true">占位</p>
      <button
        class="continue-btn anim-pop"
        :disabled="locked ? false : !selectedKey"
        @click="locked ? next() : check()"
      >
        <template v-if="locked">继续<ChevronRight class="k-ico" /></template>
        <template v-else>检查</template>
      </button>
    </div>
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
/* 选中态（未检查）：蓝色边框，让孩子知道"我选了这个" */
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

.praise {
  color: var(--green-dark);
  font-weight: 800;
  font-size: clamp(16px, min(2.6vh, 2.1vw), 22px);
  margin: 0;
  flex: none;
  text-align: center;
}
.oh {
  color: var(--red);
  font-weight: 800;
  font-size: clamp(15px, min(2.4vh, 1.9vw), 20px);
  margin: 0;
  flex: none;
}
.placeholder {
  visibility: hidden;
}
.judge-zone {
  margin-top: auto;
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
  padding: var(--gap-l) var(--gap-m) max(28px, env(safe-area-inset-bottom));
  flex: none;
}
.praise {
  margin: 0;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  align-self: center;
  font-weight: 800;
  font-size: var(--fs-title);
  color: var(--green-dark);
  background: var(--state-ok-bg);
  border: 2px solid var(--green);
  padding: 8px 20px;
  border-radius: var(--radius-pill);
}
.continue-btn {
  width: 100%;
  min-height: calc(var(--tap-min) + 12px);
  font-size: var(--fs-btn);
  font-weight: 800;
  color: var(--on-tone);
  background: var(--green);
  border: none;
  border-radius: var(--radius-pill);
  box-shadow: 0 var(--press) 0 var(--green-dark);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform var(--dur-fast), box-shadow var(--dur-fast);
}
.continue-btn:active:not(:disabled) {
  transform: translateY(calc(var(--press) - 1px)) scale(0.98);
  box-shadow: 0 1px 0 var(--green-dark);
}
.continue-btn:disabled {
  background: var(--ink-faint);
  box-shadow: 0 var(--press) 0 var(--ink-faint);
  cursor: default;
  opacity: 0.85;
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
