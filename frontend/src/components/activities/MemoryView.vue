<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { speak } from "../../services/speech";
import { sfxCorrect, sfxTap, sfxWrong } from "../../services/effects";
import { useProgressStore } from "../../stores/progress";
import { shuffleWith } from "../../utils/quizSession";
import type { Word } from "../../data/lessons";
import StageHead from "./StageHead.vue";
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

/** 组容量：≥8 词用 4 对/组；否则 3 对封顶、按词数减半。
 *  下限必须为 1：1 个词时 floor(1/2)=0，组数 ceil(1/0)=Infinity →
 *  buildGroups 同步死循环，标签页直接卡死（2026-11-06 审查 P0）。 */
const groupSize = computed(() =>
  props.words.length >= 8 ? 4 : Math.max(1, Math.min(3, Math.floor(props.words.length / 2)))
);

const groups = ref<Group[]>([]);
const groupIdx = ref(0);
const flipped = ref<string[]>([]); // 当前翻开未配对的卡 uid
const matchedUids = ref(new Set<string>()); // 已配对保留正面的卡
const wrongCount = ref(0);
const lockBoard = ref(false); // 翻错后翻回动画期间锁盘
const imgFail = ref<Record<string, boolean>>({});

const buildGroups = (): Group[] => {
  const picked = shuffleWith(props.words);
  const n = picked.length;
  if (!n) return [];
  // 均衡分组：组数 = ceil(词数/组容量)，余数逐组摊一个（9 词 → 3/3/3，
  // 10 词 → 4/3/3）。曾经"整除切片 + 丢弃余数"：9 词的组永远少练最后一个词；
  // 只保留余数又会出现"最后一组只有 1 对"的单薄局——摊开最稳。
  const g = Math.ceil(n / groupSize.value);
  const out: Group[] = [];
  let i = 0;
  for (let gi = 0; gi < g; gi++) {
    const size = Math.floor(n / g) + (gi < n % g ? 1 : 0);
    const slice = picked.slice(i, i + size);
    i += size;
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
/** 当前组的对数：均衡分组下组间最多差 1 对，判定永远用当前组实际对数 */
const curPairs = computed(() => curGroup.value.cards.length / 2);
/** 全局累计已配对数（换组不清零：顶栏进度/计数跨组单调递增，不回退） */
const solvedPairs = ref(0);
/** 头部计数：多组显示组号 + 总进度，单组只显示进度（StageHead 的 rightText） */
const counterText = computed(() =>
  groupCount.value > 1
    ? `第 ${groupIdx.value + 1} / ${groupCount.value} 组 · ${solvedPairs.value}/${totalPairs.value}`
    : `${solvedPairs.value} / ${totalPairs.value}`
);

/** 网格列数：卡数决定（8 卡 4 列、6 卡 3 列、≤4 卡 2 列）。
 *  曾经固定 4 列，6 张卡时变成 4+2 排布、2 张卡时只占左半边，宽屏下尤其失衡。 */
const gridCols = computed(() => {
  const pairs = curGroup.value.cards.length / 2;
  return pairs <= 2 ? 2 : Math.min(4, pairs);
});
/** 宽屏高度系数：卡宽高比 3/4，两行卡总高 ≈ 网宽×2/3（4 列）或 ≈ 网宽×8/9（3 列），
 *  用于按可视高度反推网格最大宽度，保证 iPad/桌面下放大的同时一屏装下不滚动。 */
const gridFit = computed(() => (gridCols.value === 3 ? 1.12 : 1.5));

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

watch(donePairs, async (n) => {  // 顶栏进度条口径是 0-100（LessonProgressHeader.playPct），跨组用累计值
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
  // 翻卡即发音：图卡、词卡都要读（音-图-形三重对应；曾经只有图卡出声）
  speak(card.word.en, { lessonId: card.word.lessonId, wordId: card.word.id });
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
    <StageHead class="memory-head" :right-text="counterText">
      <template #tip>
        <Volume2 class="k-ico tip-ico" />
        翻两张卡片，找到相同单词的图和词
      </template>
    </StageHead>

    <div class="board view-body">
      <div
        class="grid"
        :style="{
          gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
          '--fit': gridFit
        }"
      >
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
                  loading="lazy"
                  decoding="async"
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
.memory-head {
  margin-bottom: var(--gap-s);
}
.tip-ico { color: var(--purple); }

.board {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.grid {
  display: grid;
  /* 列数由脚本按卡数写入（8 卡 4 列 / 6 卡 3 列 / ≤4 卡 2 列），宽屏下排布更整齐。
     （不用 repeat(var(--cols))：CSS 变量在 repeat 计数位置各浏览器支持不稳。
     minmax(0,1fr) 而非 1fr：裸 1fr 有 min-content 地板，窄分屏（507px）下
     长单词卡把轨道顶出 ~1px/张（审计实报 9 张越界 9px）——归零地板让轨道严格等分） */
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
  padding: clamp(8px, 1.2vmin, 16px);
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

/* 宽屏（iPad 竖/横屏、分屏、桌面）：利用空间放大纸牌，而非永远 480px 一小团。
 *  - 网格宽度按可视高度反推封顶：4 列两行卡高 ≈ 网宽×2/3、3 列 ≈ 网宽×8/9，
 *    预留头部（约 170px）后 max-width = (100dvh-250) × --fit（4 列 1.5 / 3 列 1.12）
 *  - 桌面封顶 820px：卡约 190px 宽，孩子指头更容易点中，也不因 #app 1180 而过度拉伸
 *  - 字号/间距/描边随卡片放大：词 20~40px、emoji 36~72px、背面 ? 24~44px
 *  - 只改「值」不改结构，符合 DESIGN_SYSTEM §11.4「改值用 600」；
 *    手机横屏（844×390 也 ≥600）由下方后置的 max-height:480px 档覆盖回原值 */
@media (min-width: 600px) {
  .grid {
    max-width: min(820px, calc((100dvh - 250px) * var(--fit, 1.5)));
    gap: clamp(10px, 1.5vmin, 22px);
  }
  .word-text { font-size: clamp(20px, min(4vh, 3vw), 40px); }
  .face .ph { font-size: clamp(36px, min(9vh, 8vw), 72px); }
  .back { font-size: clamp(24px, min(5vh, 4vw), 44px); }
}

/* 手机矮横屏（≤480px 高）：卡高原由宽度驱动（3/4 比例，卡 110px→高 147px），
 * 两行卡加头部会顶破底边（audit 实测 phone14/SE 横屏越界 21-28px）。
 * 按视口高度封顶网格宽度：卡高 = 网宽×4/3 ÷4列，两行卡高 ≈ 网宽×2/3，
 * 两行 + 头部 ≈ 100vh → 网宽 = (100vh - 头部) × 1.5（SE 横屏 ≈ 385px，
 * 卡 ≈ 92px，比竖屏的 110px 只小一档）。 */
@media (max-height: 480px) {
  .grid {
    /* 系数必须跟着列数走：4 列两行卡高 ≈ 网宽×2/3（→ 1.5），3 列 ≈ 网宽×8/9（→ 1.12）。
     * 这里曾硬编码 1.5，于是 6 卡（3 列）的关卡在 844×390 上算出 408px 网宽，
     * 卡宽 136 → 两行卡高 362，加头部顶破底边（audit 实测内部溢出 43px / 越界 13 个元素）。
     * --fit 由脚本按列数写入（见 gridFit），回退值仍取 4 列的 1.5。 */
    max-width: min(480px, calc((100vh - 118px) * var(--fit, 1.5)));
    /* 覆盖上方 600 档的放大值，手机横屏空间紧 */
    gap: var(--gap-s);
  }
  .word-text { font-size: var(--fs-title); }
  .face .ph { font-size: var(--fs-emoji-l); }
  .back { font-size: var(--fs-title); }
}
</style>
