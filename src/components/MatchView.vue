<script setup>
import { ref, computed, onMounted, onBeforeUnmount, reactive, nextTick, watch } from "vue";
import { speak } from "../utils/speech";
import { sfxMatch, sfxWrong, celebrate } from "../utils/effects";
import { useViewport } from "../composables/useViewport";
import { splitBalanced } from "../utils/layout";

const props = defineProps({ words: { type: Array, required: true } });
const emit = defineEmits(["done"]);

const { sizeTier, isNarrow } = useViewport();

function shuffle(a) {
  return [...a].sort(() => Math.random() - 0.5);
}

/**
 * 分组：屏幕越小每组越少，避免中间单词列被挤到看不清。
 * 小屏用 2~4 对，大屏维持 3~6 对。
 */
const groupRange = computed(() =>
  isNarrow.value || sizeTier.value === "tiny"
    ? { min: 2, max: 4 }
    : { min: 3, max: 6 }
);

const groups = computed(() => {
  const { min, max } = groupRange.value;
  return splitBalanced(shuffle(props.words), min, max);
});

const groupIdx = ref(0);
const curGroup = computed(() => groups.value[groupIdx.value] || []);
const groupCount = computed(() => groups.value.length);

const leftImgs = ref([]); // 左列图片（组内前半）
const rightImgs = ref([]); // 右列图片（组内后半）
const midWords = ref([]); // 中间单词列

const board = ref(null);
const leftEls = ref([]);
const rightEls = ref([]);
const wordEls = ref([]);
const imgPos = reactive({}); // 所有图片格中心（board 坐标）
const wordPos = reactive({}); // 单词格中心
const ready = ref(false);

let ro = null;
let raf = null;

function measure() {
  if (!board.value) return;
  const b = board.value.getBoundingClientRect();
  const put = (els, list, map) =>
    els.forEach((el, i) => {
      if (!el || !list[i]) return;
      const r = el.getBoundingClientRect();
      map[list[i].id] = { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top };
    });
  put(leftEls.value, leftImgs.value, imgPos);
  put(rightEls.value, rightImgs.value, imgPos);
  put(wordEls.value, midWords.value, wordPos);
  ready.value = true;
}

/** 尺寸变化频繁（旋转/分屏），用 rAF 合并，避免每帧都重算所有格子的位置 */
function scheduleMeasure() {
  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    raf = null;
    measure();
  });
}

const matched = reactive(new Set()); // 当前组已配对 id
const dragging = ref(false);
const startWord = ref(null);
const line = reactive({ x1: 0, y1: 0, x2: 0, y2: 0 });
const imgWrong = ref(null);
const wordWrong = ref(null);
const wrongCount = ref(0); // 跨组累计，用于评分
const justMatched = ref(null);
const transitioning = ref(false);

let pendingWord = null;

const totalPairs = computed(() => curGroup.value.length);
const doneCount = computed(() => matched.size);
const groupDone = computed(() => totalPairs.value > 0 && doneCount.value >= totalPairs.value);
const stars = computed(() => (wrongCount.value === 0 ? 3 : wrongCount.value <= 2 ? 2 : 1));

function localPoint(e) {
  const rect = board.value.getBoundingClientRect();
  const p = e.touches ? e.touches[0] : e;
  return { x: p.clientX - rect.left, y: p.clientY - rect.top };
}

function onImgDown(word, e) {
  if (matched.has(word.id) || dragging.value || transitioning.value) return;
  // 再点一次已选中的图片 = 取消选择
  if (startWord.value && startWord.value.id === word.id && !dragging.value) {
    startWord.value = null;
    return;
  }
  dragging.value = true;
  startWord.value = word;
  const c = imgPos[word.id] || localPoint(e);
  line.x1 = c.x;
  line.y1 = c.y;
  const p = localPoint(e);
  line.x2 = p.x;
  line.y2 = p.y;
  speak(word.en);
  e.preventDefault();
}

function onMove(e) {
  if (!dragging.value) return;
  const p = localPoint(e);
  line.x2 = p.x;
  line.y2 = p.y;
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  const el = document.elementFromPoint(cx, cy);
  const hit = el && el.closest ? el.closest("[data-word]") : null;
  pendingWord = hit ? hit.getAttribute("data-word") : null;
}

function onUp() {
  if (!dragging.value) return;
  const target = pendingWord ? midWords.value.find((w) => w.id === pendingWord) : null;
  dragging.value = false;
  // 未命中单词时保留选中状态（点选模式：先点图，再点词）
  if (target) tryMatch(target);
}

/** 点击模式：选中图片后直接点中间单词也能配对 */
function tapWord(word) {
  if (matched.has(word.id) || transitioning.value) return;
  if (startWord.value) {
    tryMatch(word);
  } else {
    speak(word.en);
  }
}

function tryMatch(midWord) {
  const imgWord = startWord.value;
  startWord.value = null;
  pendingWord = null;
  if (!imgWord) return;
  if (imgWord.id === midWord.id) {
    matched.add(imgWord.id);
    justMatched.value = imgWord.id;
    sfxMatch();
    speak(midWord.en);
    celebrate();
    setTimeout(() => (justMatched.value = null), 600);
  } else {
    wrongCount.value++;
    sfxWrong();
    imgWrong.value = imgWord.id;
    wordWrong.value = midWord.id;
    setTimeout(() => speak(imgWord.en, { rate: 0.75 }), 420);
    setTimeout(() => {
      imgWrong.value = null;
      wordWrong.value = null;
    }, 750);
  }
}

/* ===== 组间切换 ===== */
watch(groupDone, async (done) => {
  if (!done) return;
  transitioning.value = true;
  await new Promise((r) => setTimeout(r, 1100));
  if (groupIdx.value + 1 >= groupCount.value) {
    emit("done", stars.value);
    return;
  }
  groupIdx.value++;
});

function setupGroup(g) {
  matched.clear();
  ready.value = false;
  const imgs = shuffle(g);
  const half = Math.ceil(imgs.length / 2);
  leftImgs.value = imgs.slice(0, half);
  rightImgs.value = imgs.slice(half);
  midWords.value = shuffle(g);
  transitioning.value = false;
}

watch(curGroup, async (g) => {
  setupGroup(g);
  await nextTick();
  measure();
});

/** 换课时或屏幕分档变化导致重新分组时，回到第一组 */
watch(groups, () => {
  groupIdx.value = 0;
});

onMounted(async () => {
  setupGroup(curGroup.value);
  await nextTick();
  measure();
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("resize", scheduleMeasure);
  if (board.value) {
    ro = new ResizeObserver(scheduleMeasure);
    ro.observe(board.value);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", onUp);
  window.removeEventListener("resize", scheduleMeasure);
  if (ro) ro.disconnect();
  if (raf) cancelAnimationFrame(raf);
});
</script>

<template>
  <div class="match view">
    <div class="head">
      <p class="tip">🔗 把两边的图片和中间的单词连起来</p>
      <span class="counter" v-if="groupCount > 1">
        第 {{ groupIdx + 1 }} / {{ groupCount }} 组 · {{ doneCount }}/{{ totalPairs }}
      </span>
      <span class="counter" v-else>{{ doneCount }} / {{ totalPairs }}</span>
    </div>

    <div class="board view-body" ref="board">
      <svg class="lines" v-if="ready">
        <template v-for="w in curGroup" :key="'c' + w.id">
          <line
            v-if="matched.has(w.id) && matchedLine(w.id)"
            v-bind="matchedLine(w.id)"
            class="done-line"
            :class="{ flash: justMatched === w.id }"
          />
        </template>
        <line
          v-if="dragging"
          :x1="line.x1"
          :y1="line.y1"
          :x2="line.x2"
          :y2="line.y2"
          class="drag-line"
        />
      </svg>

      <div class="col imgs">
        <div
          v-for="(w, i) in leftImgs"
          :key="w.id"
          :ref="(el) => (leftEls[i] = el)"
          class="cell pic anim-pop"
          :style="{ animationDelay: i * 0.06 + 's' }"
          :class="{
            gone: matched.has(w.id),
            wrong: imgWrong === w.id,
            active: dragging && startWord && startWord.id === w.id
          }"
          @pointerdown="onImgDown(w, $event)"
        >
          <img
            :src="w.image"
            :alt="w.en"
            @error="
              $event.target.style.display = 'none';
              $event.target.nextElementSibling.style.display = 'flex';
            "
          />
          <span class="ph" style="display: none">{{ w.emoji }}</span>
        </div>
      </div>

      <div class="col words">
        <div
          v-for="(w, i) in midWords"
          :key="w.id"
          :ref="(el) => (wordEls[i] = el)"
          class="cell word anim-pop"
          :style="{ animationDelay: i * 0.06 + 's' }"
          :data-word="w.id"
          :class="{ gone: matched.has(w.id), wrong: wordWrong === w.id }"
          @click="tapWord(w)"
        >
          {{ w.en }}
        </div>
      </div>

      <div class="col imgs">
        <div
          v-for="(w, i) in rightImgs"
          :key="w.id"
          :ref="(el) => (rightEls[i] = el)"
          class="cell pic anim-pop"
          :style="{ animationDelay: (i + 2) * 0.06 + 's' }"
          :class="{
            gone: matched.has(w.id),
            wrong: imgWrong === w.id,
            active: dragging && startWord && startWord.id === w.id
          }"
          @pointerdown="onImgDown(w, $event)"
        >
          <img
            :src="w.image"
            :alt="w.en"
            @error="
              $event.target.style.display = 'none';
              $event.target.nextElementSibling.style.display = 'flex';
            "
          />
          <span class="ph" style="display: none">{{ w.emoji }}</span>
        </div>
      </div>

      <!-- 组间过场横幅 -->
      <div v-if="transitioning" class="banner anim-pop">
        <span>{{ groupIdx + 1 >= groupCount ? "全部连完啦 🎉" : "这组连完啦！下一组 →" }}</span>
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
  flex: none;
}
.tip {
  margin: 0;
  font-weight: 700;
  color: var(--ink-soft);
  font-size: var(--fs-small);
  min-width: 0;
}
.counter {
  background: #fff;
  border-radius: var(--radius-s);
  padding: clamp(4px, 1vh, 6px) clamp(8px, 1.4vw, 14px);
  font-weight: 800;
  font-size: var(--fs-small);
  box-shadow: var(--shadow-hard);
  white-space: nowrap;
  flex: none;
}

.board {
  position: relative;
  display: flex;
  justify-content: space-between;
  gap: var(--gap-m);
}
.lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: var(--z-lines);
}
.done-line {
  stroke: var(--green);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 400;
  stroke-dashoffset: 400;
  animation: draw-line 0.45s ease forwards;
}
.done-line.flash {
  filter: drop-shadow(0 0 8px #ffd97a);
}
@keyframes draw-line {
  to {
    stroke-dashoffset: 0;
  }
}
.drag-line {
  stroke: var(--yellow);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 1 14;
}

/* 两侧图片列窄一些，中间单词列最宽（单词最长，最容易挤） */
.col {
  display: grid;
  gap: var(--gap-s);
  z-index: 2;
  grid-auto-rows: minmax(0, 1fr);
  min-height: 0;
  min-width: 0;
  align-content: stretch;
}
.col.imgs {
  flex: 1;
}
.col.words {
  flex: 1.2;
}

.cell {
  background: var(--card-bg);
  border-radius: var(--radius-s);
  box-shadow: var(--shadow-hard);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 4px solid transparent;
  touch-action: none;
  transition: opacity 0.25s, transform 0.2s, border-color 0.2s;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.cell.pic {
  cursor: grab;
}
.cell.pic:active {
  cursor: grabbing;
}
/* 图片缩小：占格子 62% */
.cell.pic img {
  width: 62%;
  height: 62%;
  object-fit: contain;
  pointer-events: none;
}
.cell.pic .ph {
  font-size: var(--fs-emoji-l);
  align-items: center;
}
.cell.word {
  font-size: clamp(13px, min(2.6vh, 2.1vw), 23px);
  font-weight: 800;
  cursor: pointer;
  padding: 0 4px;
  text-align: center;
  word-break: break-word;
  line-height: 1.1;
}
.cell.active {
  border-color: var(--yellow);
  transform: scale(1.04);
}
.cell.wrong {
  border-color: var(--red);
  animation: shake-x 0.45s ease;
}
.cell.gone {
  opacity: 0.3;
  pointer-events: none;
  transform: scale(0.93);
}

.banner {
  position: absolute;
  inset: 0;
  z-index: var(--z-banner);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(253, 246, 227, 0.85);
  border-radius: var(--radius);
}
.banner span {
  font-size: clamp(18px, min(4vh, 3.2vw), 34px);
  font-weight: 800;
  color: var(--green-dark);
  background: #fff;
  padding: clamp(10px, 1.8vh, 14px) clamp(18px, 3vw, 28px);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  text-align: center;
}

/* 手机窄屏：中间单词列再加宽，图片列收窄，优先保证单词可读 */
@media (max-width: 600px) {
  .col.imgs {
    flex: 0.85;
  }
  .col.words {
    flex: 1.3;
  }
  .cell.pic img {
    width: 74%;
    height: 74%;
  }
}

/* 手机横屏：格子很扁，隐藏提示语把高度让给棋盘 */
@media (max-height: 480px) {
  .tip {
    display: none;
  }
}
</style>
