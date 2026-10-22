<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { speak } from "../../services/speech";
import { sfxCorrect, sfxTap, sfxWrong } from "../../services/effects";
import { useProgressStore } from "../../stores/progress";
import type { Lesson } from "../../data/lessons";

const props = defineProps<{ lesson: Lesson }>();
const emit = defineEmits(["done", "progress", "total"]);

const progress = useProgressStore();

interface Phrase { en: string; zh: string; audio?: string }
const phrases: Phrase[] = props.lesson.phrases || [];

const sentenceIdx = ref(0);
/** 底部待选单词块（打乱后） */
const bank = ref<string[]>([]);
/** 已放入句子槽的单词 */
const slots = ref<string[]>([]);
const lock = ref(false);

const cur = computed(() => phrases[sentenceIdx.value]);
const targetWords = computed(() => (cur.value ? cur.value.en.replace(/[?.!,]/g, "").trim().split(/\s+/) : []));

const total = computed(() => phrases.length);
watch(total, () => emit("total", total.value), { immediate: true });
watch(() => phrases.length, buildSentence, { immediate: true });

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildSentence() {
  if (!cur.value) return;
  // 打乱，避免和正确顺序一样（至少换一次位）
  let shuffled = shuffle(targetWords.value);
  if (shuffled.join(" ") === targetWords.value.join(" ") && targetWords.value.length > 1) {
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }
  bank.value = shuffled;
  slots.value = [];
  lock.value = false;
}

function pick(word: string) {
  if (lock.value || !cur.value) return;
  // 点底部单词 → 放到槽里
  bank.value = bank.value.filter((w) => w !== word);
  slots.value.push(word);
  sfxTap();
  checkComplete();
}

function takeBack(i: number) {
  if (lock.value) return;
  const w = slots.value[i];
  slots.value = slots.value.filter((_, idx) => idx !== i);
  bank.value.push(w);
}

async function checkComplete() {
  if (slots.value.length !== targetWords.value.length) return;
  if (slots.value.join(" ") !== targetWords.value.join(" ")) {
    // 拼错：整组标红后弹回
    lock.value = true;
    wrongCount.value++;
    sfxWrong();
    await new Promise((r) => setTimeout(r, 800));
    buildSentence();
    return;
  }
  // 拼对
  lock.value = true;
  sfxCorrect();
  await speak(cur.value!.en, { lessonId: props.lesson.id });
  await new Promise((r) => setTimeout(r, 600));
  if (sentenceIdx.value + 1 >= phrases.length) {
    emit("done", 3);
    return;
  }
  emit("progress", (sentenceIdx.value + 1) / total.value);
  sentenceIdx.value++;
}

const wrongCount = ref(0);
const stars = computed(() => (wrongCount.value === 0 ? 3 : wrongCount.value <= 2 ? 2 : 1));

onBeforeUnmount(() => {
  slots.value = [];
  bank.value = [];
});
</script>

<template>
  <div class="order view">
    <div class="head">
      <p class="tip">
        <span class="tip-ico">✏️</span>
        按正确顺序点单词，拼出句子
      </p>
      <span class="counter">{{ sentenceIdx + 1 }} / {{ total }}</span>
    </div>

    <div v-if="cur" class="board view-body">
      <!-- 中文提示 -->
      <p class="zh-hint">{{ cur.zh }}</p>

      <!-- 句子槽 -->
      <div class="slots">
        <span v-for="(w, i) in slots" :key="i" class="slot-word" @click="takeBack(i)">
          {{ w }}
        </span>
        <span v-if="slots.length < targetWords.length" class="slot-empty">？</span>
      </div>

      <!-- 待选单词块 -->
      <div class="bank">
        <button
          v-for="(w, i) in bank"
          :key="i + w"
          class="word-chip"
          data-haptic
          @click="pick(w)"
        >
          {{ w }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-s);
  margin-bottom: var(--gap-s);
}
.tip {
  margin: 0;
  font-weight: var(--fw-mid);
  color: var(--ink-soft);
  display: flex;
  align-items: center;
  gap: 6px;
}
.tip-ico { font-size: var(--fs-title); }
.counter { font-weight: var(--fw-mid); color: var(--ink-soft); }

.board {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--gap-l, 24px);
  padding: var(--gap-s);
}
.zh-hint {
  margin: 0;
  font-size: var(--fs-title);
  color: var(--ink);
  font-weight: var(--fw-mid);
}
.slots {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  min-height: 56px;
  padding: 12px 16px;
  background: var(--card-bg);
  border: 2px dashed var(--line);
  border-radius: var(--radius);
  max-width: 100%;
}
.slot-word {
  padding: 6px 14px;
  background: var(--ok);
  color: var(--white);
  border-radius: var(--radius-s);
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
  cursor: pointer;
}
.slot-empty {
  color: var(--ink-faint);
  font-size: var(--fs-title);
  align-self: center;
}
.bank {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  max-width: 100%;
}
.word-chip {
  padding: 10px 18px;
  background: var(--card-bg);
  border: 2px solid var(--line);
  border-radius: var(--radius);
  font-size: var(--fs-body);
  font-weight: var(--fw-mid);
  color: var(--ink);
  cursor: pointer;
  transition: transform 0.1s;
}
.word-chip:active { transform: scale(0.95); }
</style>
