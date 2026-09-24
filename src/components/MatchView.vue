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
  const put = (els, list, map) =>
    els.forEach((el, i) => {
      if (!el || !list[i]) return;
      // 用 offset* 测量（不受 transform 影响）：格子的入场动画 pop-in 带
      // fill-mode:both + 延迟，动画未播完时 getBoundingClientRect 会量到
      // scale(0) 的错误宽高，导致连线端点裁剪失效
      map[list[i].id] = {
        x: el.offsetLeft + el.offsetWidth / 2,
        y: el.offsetTop + el.offsetHeight / 2,
        w: el.offsetWidth,
        h: el.offsetHeight
      };
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

/** 已配对连线的坐标：图片卡中心 → 单词卡中心（board 坐标系；线在最上层，不会遮挡卡片） */
function matchedLine(wordId) {
  const a = imgPos[wordId];
  const b = wordPos[wordId];
  if (!a || !b) return null;
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

const matched = reactive(new Set()); // 当前组已配对 id
const dragging = ref(false);
const startWord = ref(null);
const startSide = ref("img"); // 起点所在侧：'img'（两侧图片）| 'word'（中间单词）
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

let downInfo = null; // 本次按下的意图：drag（拉线）/ pair（点选配对）/ cancel（取消选择）

/** 卡片中心坐标（board 坐标系），按所在侧取对应位置表 */
function centerOf(id, side) {
  return (side === "img" ? imgPos[id] : wordPos[id]) || null;
}

/** id → 单词数据（同一 id 只出现在"一侧图片 + 中间单词"） */
function findWord(id) {
  return (
    leftImgs.value.find((w) => w.id === id) ||
    rightImgs.value.find((w) => w.id === id) ||
    midWords.value.find((w) => w.id === id) ||
    null
  );
}

/**
 * 按下任意卡片（图片或单词都可以当起点）：立即选中并拉起连线。三种意图：
 *  - 已有选中且按的是另一侧 → 抬指时直接配对（点选模式）
 *  - 已选中的就是这张 → 抬指时取消选择
 *  - 其它 → 正常拖拽
 */
function onCardDown(word, side, e) {
  if (matched.has(word.id) || transitioning.value) return;
  const sel = startWord.value;
  if (sel && startSide.value !== side) {
    downInfo = { word, side, act: "pair" };
    return;
  }
  if (sel && startSide.value === side && sel.id === word.id) {
    downInfo = { word, side, act: "cancel" };
    return;
  }
  dragging.value = true;
  startWord.value = word;
  startSide.value = side;
  const c = centerOf(word.id, side) || localPoint(e);
  line.x1 = c.x;
  line.y1 = c.y;
  const p = localPoint(e);
  line.x2 = p.x;
  line.y2 = p.y;
  downInfo = { word, side, act: "drag" };
  speak(word.en);
  e.preventDefault();
}

function onMove(e) {
  if (!dragging.value || !downInfo) return;
  const p = localPoint(e);
  line.x2 = p.x;
  line.y2 = p.y;
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  const el = document.elementFromPoint(cx, cy);
  const hit = el && el.closest ? el.closest("[data-word]") : null;
  // 只有落在"另一侧"且尚未配对的卡片上才算命中
  pendingWord =
    hit && hit.getAttribute("data-side") !== startSide.value && !hit.classList.contains("gone")
      ? hit.getAttribute("data-word")
      : null;
}

function onUp() {
  const info = downInfo;
  downInfo = null;
  if (!info) return;
  if (info.act === "pair") {
    tryMatch(info.word);
    return;
  }
  if (info.act === "cancel") {
    startWord.value = null;
    return;
  }
  // 拖拽结束：压在对面卡片上就配对，否则保留选中（点选模式接着点另一侧）
  dragging.value = false;
  const target = pendingWord ? findWord(pendingWord) : null;
  pendingWord = null;
  if (target) tryMatch(target);
}

/** 手势被系统抢占（来电 / 切后台）→ 只清拖拽态，保留选中 */
function onCancel() {
  downInfo = null;
  dragging.value = false;
  pendingWord = null;
}

function tryMatch(other) {
  const first = startWord.value;
  startWord.value = null;
  pendingWord = null;
  if (!first) return;
  if (first.id === other.id) {
    matched.add(first.id);
    justMatched.value = first.id;
    sfxMatch();
    speak(other.en);
    celebrate();
    setTimeout(() => (justMatched.value = null), 600);
  } else {
    wrongCount.value++;
    sfxWrong();
    imgWrong.value = first.id;
    wordWrong.value = other.id;
    setTimeout(() => speak(first.en, { rate: 0.75 }), 420);
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
  window.addEventListener("pointercancel", onCancel);
  window.addEventListener("resize", scheduleMeasure);
  if (board.value) {
    ro = new ResizeObserver(scheduleMeasure);
    ro.observe(board.value);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", onUp);
  window.removeEventListener("pointercancel", onCancel);
  window.removeEventListener("resize", scheduleMeasure);
  if (ro) ro.disconnect();
  if (raf) cancelAnimationFrame(raf);
});
</script>

<template>
  <div class="match view">
    <div class="head">
      <p class="tip">🔗 图片和单词连起来，从哪边开始都行</p>
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
            pathLength="100"
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
          data-haptic
          data-side="img"
          :data-word="w.id"
          :style="{ animationDelay: i * 0.06 + 's' }"
          :class="{
            gone: matched.has(w.id),
            wrong: imgWrong === w.id,
            active: startWord && startSide === 'img' && startWord.id === w.id
          }"
          @pointerdown="onCardDown(w, 'img', $event)"
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
          data-haptic
          data-side="word"
          :style="{ animationDelay: i * 0.06 + 's' }"
          :data-word="w.id"
          :class="{
            gone: matched.has(w.id),
            wrong: wordWrong === w.id,
            active: startWord && startSide === 'word' && startWord.id === w.id
          }"
          @pointerdown="onCardDown(w, 'word', $event)"
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
          data-haptic
          data-side="img"
          :data-word="w.id"
          :style="{ animationDelay: (i + 2) * 0.06 + 's' }"
          :class="{
            gone: matched.has(w.id),
            wrong: imgWrong === w.id,
            active: startWord && startSide === 'img' && startWord.id === w.id
          }"
          @pointerdown="onCardDown(w, 'img', $event)"
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
  background: var(--card-bg);
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
  /* pathLength=100 把任意长度的线归一化，避免长线出现 dasharray 断口 */
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
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
  cursor: grab;
  padding: 0 4px;
  text-align: center;
  word-break: break-word;
  line-height: 1.1;
}
.cell.word:active {
  cursor: grabbing;
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
  background: var(--overlay-strong);
  border-radius: var(--radius);
}
.banner span {
  font-size: clamp(18px, min(4vh, 3.2vw), 34px);
  font-weight: 800;
  color: var(--green-dark);
  background: var(--card-bg);
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
