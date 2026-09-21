<script setup>
import { ref, computed, onMounted, onBeforeUnmount, reactive, nextTick } from "vue";
import { speak } from "../utils/speech";
import { sfxMatch, sfxWrong, celebrate } from "../utils/effects";

const props = defineProps({ words: { type: Array, required: true } });
const emit = defineEmits(["done"]);

function shuffle(a) { return [...a].sort(() => Math.random() - 0.5); }

const lefts = ref(shuffle(props.words));   // 图片列
const rights = ref(shuffle(props.words));  // 单词列

const board = ref(null);
const leftEls = ref([]);
const rightEls = ref([]);
// 每列元素中心坐标缓存（board 内部坐标系）
const leftPos = reactive({});
const rightPos = reactive({});
const ready = ref(false);

function measure() {
  if (!board.value) return;
  const b = board.value.getBoundingClientRect();
  leftEls.value.forEach((el, i) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    leftPos[lefts.value[i].id] = {
      x: r.left + r.width / 2 - b.left,
      y: r.top + r.height / 2 - b.top
    };
  });
  rightEls.value.forEach((el, i) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    rightPos[rights.value[i].id] = {
      x: r.left + r.width / 2 - b.left,
      y: r.top + r.height / 2 - b.top
    };
  });
  ready.value = true;
}

const matched = reactive(new Set()); // 已配对 id
const dragging = ref(false);
const startWord = ref(null);
const line = reactive({ x1: 0, y1: 0, x2: 0, y2: 0 });
const leftWrong = ref(null);
const rightWrong = ref(null);
const wrongCount = ref(0);
const justMatched = ref(null); // 用于配对闪光动画

let pendingRight = null;

const totalPairs = computed(() => props.words.length);
const doneCount = computed(() => matched.size);
const allDone = computed(() => totalPairs.value > 0 && doneCount.value >= totalPairs.value);
const stars = computed(() =>
  wrongCount.value === 0 ? 3 : wrongCount.value <= 2 ? 2 : 1
);

function localPoint(e) {
  const rect = board.value.getBoundingClientRect();
  const p = e.touches ? e.touches[0] : e;
  return { x: p.clientX - rect.left, y: p.clientY - rect.top };
}

function onLeftDown(word, e) {
  if (matched.has(word.id) || dragging.value) return;
  dragging.value = true;
  startWord.value = word;
  const c = leftPos[word.id] || localPoint(e);
  line.x1 = c.x; line.y1 = c.y;
  const p = localPoint(e);
  line.x2 = p.x; line.y2 = p.y;
  speak(word.en);
  e.preventDefault();
}

function onMove(e) {
  if (!dragging.value) return;
  const p = localPoint(e);
  line.x2 = p.x; line.y2 = p.y;
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  const el = document.elementFromPoint(cx, cy);
  const hit = el && el.closest ? el.closest("[data-right]") : null;
  pendingRight = hit ? hit.getAttribute("data-right") : null;
}

function onUp() {
  if (!dragging.value) return;
  const target = pendingRight
    ? rights.value.find((w) => w.id === pendingRight)
    : null;
  dragging.value = false;
  if (target) tryMatch(target);
  else startWord.value = null;
}

/** 点击模式：已按住/选中图片时，直接点词也能配对 */
function tapRight(word) {
  if (matched.has(word.id)) return;
  if (startWord.value) {
    tryMatch(word);
  } else {
    speak(word.en);
  }
}

function tryMatch(rightWord) {
  const leftWord = startWord.value;
  startWord.value = null;
  pendingRight = null;
  if (!leftWord) return;
  if (leftWord.id === rightWord.id) {
    matched.add(leftWord.id);
    justMatched.value = leftWord.id;
    sfxMatch();
    speak(rightWord.en);
    celebrate();
    setTimeout(() => (justMatched.value = null), 600);
    if (allDone.value) setTimeout(() => emit("done", stars.value), 1100);
  } else {
    wrongCount.value++;
    sfxWrong();
    leftWrong.value = leftWord.id;
    rightWrong.value = rightWord.id;
    setTimeout(() => speak(leftWord.en, { rate: 0.75 }), 420);
    setTimeout(() => { leftWrong.value = null; rightWrong.value = null; }, 750);
  }
}

function matchedLine(id) {
  const a = leftPos[id];
  const b = rightPos[id];
  if (!a || !b) return null;
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

onMounted(async () => {
  await nextTick();
  measure();
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("resize", measure);
});
onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", onUp);
  window.removeEventListener("resize", measure);
});
</script>

<template>
  <div class="match">
    <div class="head">
      <p class="tip">🔗 从图片拖一条线到会读的单词</p>
      <span class="counter">{{ doneCount }} / {{ totalPairs }}</span>
    </div>

    <div class="board" ref="board">
      <svg class="lines" v-if="ready">
        <!-- 已完成连线（生长动画） -->
        <template v-for="w in lefts" :key="'c' + w.id">
          <g v-if="matched.has(w.id) && matchedLine(w.id)">
            <line
              v-bind="matchedLine(w.id)"
              class="done-line"
              :class="{ flash: justMatched === w.id }"
            />
          </g>
        </template>
        <!-- 拖拽中的线 -->
        <line
          v-if="dragging"
          :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2"
          class="drag-line"
        />
      </svg>

      <div class="col left">
        <div
          v-for="(w, i) in lefts"
          :key="w.id"
          :ref="(el) => (leftEls[i] = el)"
          class="cell pic"
          :class="{
            gone: matched.has(w.id),
            wrong: leftWrong === w.id,
            active: dragging && startWord && startWord.id === w.id
          }"
          @pointerdown="onLeftDown(w, $event)"
        >
          <img
            :src="w.image" :alt="w.en"
            @error="$event.target.style.display = 'none'; $event.target.nextElementSibling.style.display = 'flex'"
          />
          <span class="ph" style="display: none">{{ w.emoji }}</span>
        </div>
      </div>

      <div class="col right">
        <div
          v-for="(w, i) in rights"
          :key="w.id"
          :ref="(el) => (rightEls[i] = el)"
          class="cell word"
          :data-right="w.id"
          :class="{ gone: matched.has(w.id), wrong: rightWrong === w.id }"
          @click="tapRight(w)"
        >
          {{ w.en }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.match { display: flex; flex-direction: column; gap: 10px; flex: 1; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.tip { margin: 0; font-weight: 700; color: #8a7f6f; }
.counter {
  background: #fff; border-radius: 12px; padding: 6px 14px;
  font-weight: 800; box-shadow: var(--shadow-hard);
}
.board {
  position: relative; width: 100%; flex: 1;
  display: flex; justify-content: space-between; gap: 46px;
}
.lines { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; }
.done-line {
  stroke: var(--green); stroke-width: 6; stroke-linecap: round;
  stroke-dasharray: 400; stroke-dashoffset: 400;
  animation: draw-line 0.45s ease forwards;
}
.done-line.flash { filter: drop-shadow(0 0 8px #ffd97a); }
@keyframes draw-line { to { stroke-dashoffset: 0; } }
.drag-line {
  stroke: var(--yellow); stroke-width: 6; stroke-linecap: round;
  stroke-dasharray: 1 14;
}
.col { display: flex; flex-direction: column; gap: 14px; flex: 1; z-index: 2; }
.cell {
  background: #fff; border-radius: 16px; box-shadow: var(--shadow-hard);
  display: flex; align-items: center; justify-content: center;
  border: 4px solid transparent; touch-action: none;
  transition: opacity 0.25s, transform 0.2s, border-color 0.2s;
}
.cell.pic { aspect-ratio: 1.5; cursor: grab; overflow: hidden; }
.cell.pic:active { cursor: grabbing; }
.cell.pic img { width: 76%; height: 76%; object-fit: contain; pointer-events: none; }
.cell.pic .ph { font-size: 44px; align-items: center; }
.cell.word { min-height: 64px; font-size: 25px; font-weight: 800; cursor: pointer; }
.cell.active { border-color: var(--yellow); transform: scale(1.04); }
.cell.wrong { border-color: var(--red); animation: shake-x 0.45s ease; }
.cell.gone { opacity: 0.3; pointer-events: none; transform: scale(0.93); }
</style>
