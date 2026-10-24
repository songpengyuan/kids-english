<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { speak } from "../../services/speech";
import { sfxCorrect, sfxTap, sfxWrong } from "../../services/effects";
import { useProgressStore } from "../../stores/progress";
import { shuffleWith } from "../../utils/quizSession";
import type { Word } from "../../data/lessons";
import { Volume2 } from "@lucide/vue";

const props = defineProps<{ words: Word[] }>();
const emit = defineEmits(["done", "progress", "total"]);

const progress = useProgressStore();

interface Card {
  uid: string; // 唯一 id（同词图卡/词卡不同）
  wordId: string; // 配对依据
  kind: "img" | "word";
  word: Word;
}

/** 一组翻牌：4 对 = 8 张卡（图+词）。词多就分两组 */
interface Group {
  cards: Card[];
}

const groupSize = computed(() => (props.words.length >= 8 ? 4 : Math.min(3, Math.floor(props.words.length / 2))));

const groups = ref<Group[]>([]);
const groupIdx = ref(0);
const flipped = ref<string[]>([]); // 当前翻开未配对的卡 uid
const matchedUids = ref(new Set<string>()); // 已配对保留正面的卡
const wrongCount = ref(0);
const lockBoard = ref(false); // 翻错后翻回动画期间锁盘
const imgFail = ref<Record<string, boolean>>({});

const buildGroups = (): Group[] => {
  const picked = shuffleWith(props.words);
  const out: Group[] = [];
  for (let i = 0; i < picked.length; i += groupSize.value) {
    const slice = picked.slice(i, i + groupSize.value);
    // 剩 1 个词也要练（1 对 = 2 张卡）：曾经 < 2 直接丢弃，9 词的组永远少练最后一个词
    if (slice.length < 1) break;
    const cards: Card[] = slice.flatMap((w) => [
      { uid: `${w.id}-img`, wordId: w.id, kind: "img" as const, word: w },
      { uid: `${w.id}-word`, wordId: w.id, kind: "word" as const, word: w }
    ]);
    out.push({ cards: shuffleWith(cards) });
  }
  return out;
};

groups.value = buildGroups();

const groupCount = computed(() => groups.value.length);
const curGroup = computed(() => groups.value[groupIdx.value] || { cards: [] });
const totalPairs = computed(() => props.words.length);
const donePairs = computed(() => matchedUids.value.size / 2);
/** 当前组的对数：词数不整除时最后一组比 groupSize 小（10 词 → 4/4/2） */
const curPairs = computed(() => curGroup.value.cards.length / 2);
/** 全局累计已配对数（换组不清零：顶栏进度/计数跨组单调递增，不回退） */
const solvedPairs = ref(0);

watch(groupIdx, async () => {
  flipped.value = [];
  matchedUids.value = new Set();
  lockBoard.value = false;
});

watch(groupCount, () => emit("total", totalPairs.value), { immediate: true });

const stars = computed(() => {
  if (wrongCount.value <= 1) return 3;
  if (wrongCount.value <= 3) return 2;
  return 1;
});

watch(donePairs, async (n) => {
  // 顶栏进度条口径是 0-100（LessonProgressHeader.playPct），跨组用累计值
  emit("progress", Math.round((solvedPairs.value / totalPairs.value) * 100));
  // 完成判定按"当前组实际对数"（曾经误用固定的 groupSize：
  // 10 词课最后一组只有 2 对，2 < 4 永远不结算，关卡卡死在最后一组）
  if (n < curPairs.value) return;
  // 本组配完
  await new Promise((r) => setTimeout(r, 900));
  if (groupIdx.value + 1 >= groupCount.value) {
    emit("done", stars.value);
    return;
  }
  groupIdx.value++;
});

async function flipCard(card: Card) {
  if (lockBoard.value) return;
  if (matchedUids.value.has(card.uid)) return;
  if (flipped.value.includes(card.uid)) return;
  sfxTap();
  flipped.value.push(card.uid);
  // 翻图卡顺便发音
  if (card.kind === "img") {
    speak(card.word.en, { lessonId: card.word.lessonId, wordId: card.word.id });
  }
  if (flipped.value.length < 2) return;

  const [a, b] = flipped.value.map((uid) => curGroup.value.cards.find((c) => c.uid === uid)!);
  if (a.wordId === b.wordId && a.kind !== b.kind) {
    // 配对成功：同词图+词
    matchedUids.value.add(a.uid);
    matchedUids.value.add(b.uid);
    solvedPairs.value++;
    flipped.value = [];
    sfxCorrect();
    progress.recordWord(a.word.lessonId, a.word.id, { correct: 1 });
    speak(a.word.en, { lessonId: a.word.lessonId, wordId: a.word.id });
  } else {
    // 配错：锁盘 1 秒后翻回
    lockBoard.value = true;
    wrongCount.value++;
    progress.recordWord(a.word.lessonId, a.word.id, { wrong: 1 });
    progress.recordWord(b.word.lessonId, b.word.id, { wrong: 1 });
    sfxWrong();
    await new Promise((r) => setTimeout(r, 1000));
    flipped.value = [];
    lockBoard.value = false;
  }
}

onBeforeUnmount(() => {
  flipped.value = [];
  matchedUids.value = new Set();
});
</script>

<template>
  <div class="memory view">
    <div class="head">
      <p class="tip">
        <Volume2 class="k-ico tip-ico" />
        翻两张卡片，找到相同单词的图和词
      </p>
      <span class="counter" v-if="groupCount > 1">
        第 {{ groupIdx + 1 }} / {{ groupCount }} 组 · {{ solvedPairs }}/{{ totalPairs }}
      </span>
      <span class="counter" v-else>{{ solvedPairs }} / {{ totalPairs }}</span>
    </div>

    <div class="board view-body">
      <div class="grid">
        <div
          v-for="card in curGroup.cards"
          :key="card.uid"
          class="m-card"
          :class="{
            flipped: flipped.includes(card.uid) || matchedUids.has(card.uid),
            matched: matchedUids.has(card.uid),
            wrong: lockBoard && flipped.includes(card.uid)
          }"
          data-haptic
          @pointerdown="flipCard(card)"
        >
          <div class="inner">
            <div class="back">?</div>
            <div class="face">
              <template v-if="card.kind === 'img'">
                <img
                  v-if="!imgFail[card.word.id] && card.word.image"
                  :src="card.word.image"
                  :alt="card.word.en"
                  @error="imgFail[card.word.id] = true"
                />
                <span v-else class="ph">{{ card.word.emoji }}</span>
              </template>
              <span v-else class="word-text">{{ card.word.en }}</span>
            </div>
          </div>
        </div>
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
  flex-wrap: wrap;
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
.tip-ico { color: var(--purple); }
.counter { font-weight: var(--fw-mid); color: var(--ink-soft); }

.board {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--gap-s);
  width: 100%;
  max-width: 480px;
}
.m-card {
  aspect-ratio: 3 / 4;
  perspective: 800px;
  cursor: pointer;
}
.inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.35s;
}
.m-card.flipped .inner { transform: rotateY(180deg); }
.back, .face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
}
.back {
  background: var(--purple);
  color: var(--white);
  font-size: var(--fs-title);
  font-weight: var(--fw-strong);
}
.face {
  background: var(--card-bg);
  border: 2px solid var(--line);
  transform: rotateY(180deg);
  padding: 8px;
}
.face img, .face .ph {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  font-size: var(--fs-emoji-l);
}
.word-text {
  font-weight: var(--fw-strong);
  font-size: var(--fs-title);
  color: var(--ink);
  text-align: center;
}
.m-card.matched .face {
  border-color: var(--ok);
  background: color-mix(in srgb, var(--ok) 12%, var(--card-bg));
}
.m-card.wrong .inner { transform: rotateY(180deg); }
.m-card.wrong .face { border-color: var(--red); }
</style>
