<script setup>
import { ref, computed, onMounted, onBeforeUnmount, reactive, nextTick, watch } from "vue";
import { speak } from "../../services/speech";
import { sfxMatch, sfxWrong } from "../../services/effects";
import { useProgressStore } from "../../stores/progress";
import { useViewport } from "../../composables/useViewport";
import { useMatchSession } from "../../composables/useMatchSession";
import { BookOpenText, Link2, Volume2 } from "@lucide/vue";
import SpeakWave from "../ui/SpeakWave.vue";
import StageHead from "./StageHead.vue";

const props = defineProps({
  words: { type: Array, required: true },
  /** 颜色配对（l11 Brown Bear）：传了就切到"左列颜色圆 ↔ 右列动物图"模式 */
  colorPairs: { type: Array, default: () => null }
});
const emit = defineEmits(["done", "progress", "total"]);

const progress = useProgressStore();

const { sizeTier, isNarrow } = useViewport();

/* ---------- 会话逻辑：分组/配对判定/记分（useMatchSession，可单测） ---------- */
const {
  colorMode, colorOf, groups, groupIdx, groupCount, curGroup,
  totalPairs, matched, matchFrom, pairMap, doneCount, groupDone,
  counterText, stars, leftImgs, rightImgs, midWords,
  setupGroup: sessionSetupGroup, tryMatch: sessionTryMatch,
} = useMatchSession(
  computed(() => props.words),
  computed(() => props.colorPairs),
  isNarrow,
  sizeTier,
  {
    onMatched: (w) => {
      sfxMatch();
      speak(w.en, { lessonId: w.lessonId, wordId: w.id });
      progress.recordWord(w.lessonId, w.id, { correct: 1 });
    },
    onWrong: (a, b) => {
      sfxWrong();
      // 统一错误反馈（与听音选图一致）：连错只标红，不自动读答案、不揭示；
      // 两个词都记一次错误 → 进入复习池
      const aWord = findWord(a.id) || {};
      const bWord = findWord(b.id) || {};
      if (aWord.lessonId) progress.recordWord(aWord.lessonId, a.id, { wrong: 1 });
      if (bWord.lessonId) progress.recordWord(bWord.lessonId, b.id, { wrong: 1 });
      markWrong(a, b);
    },
  }
);

/**
 * 两种练习方式（用户要求：不显示单词的形式也要有，两种切换着来）：
 *   word  —— 图片 ↔ 单词（默认，认字）
 *   sound —— 图片 ↔ 声音：中间列只显示🔊，点一下先听发音，再连到对应的图（练听力）
 * 选择记在 localStorage，家长选一次就固定下来。
 */
const MODE_KEY = "kids-english-match-mode";
const mode = ref(readMode());
function readMode() {
  try {
    return localStorage.getItem(MODE_KEY) === "sound" ? "sound" : "word";
  } catch {
    return "word";
  }
}
function setMode(m) {
  mode.value = m;
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* 隐私模式忽略 */
  }
}

const board = ref(null);
/** 卡片元素**按 id 存**（图片格 / 单词格各一张表）。
 *  ⚠️ 不能按 v-for 索引存：换组重排时 ref 数组与数据数组会错位，
 *  measure() 会把 B 卡的坐标写进 A 词名下 → 连线从别的卡片中心画出来，
 *  看起来就是"同一个图片连了两个单词"（2026-10-18 实测复现）。 */
const picEls = {};
const wordElsById = {};
function setPicEl(id, el) {
  if (el) picEls[id] = el;
  else delete picEls[id];
}
function setWordEl(id, el) {
  if (el) wordElsById[id] = el;
  else delete wordElsById[id];
}
const imgPos = reactive({}); // 所有图片格中心（board 坐标）
const wordPos = reactive({}); // 单词格中心
const ready = ref(false);

let ro = null;
let raf = null;

function measure() {
  if (!board.value) return;
  const put = (list, els, map) =>
    list.forEach((w) => {
      const el = els[w.id];
      if (!el) return;
      // 用 offset* 测量（不受 transform 影响）：格子的入场动画 pop-in 带
      // fill-mode:both + 延迟，动画未播完时 getBoundingClientRect 会量到
      // scale(0) 的错误宽高，导致连线端点裁剪失效
      map[w.id] = {
        x: el.offsetLeft + el.offsetWidth / 2,
        y: el.offsetTop + el.offsetHeight / 2,
        w: el.offsetWidth,
        h: el.offsetHeight
      };
    });
  put(leftImgs.value, picEls, imgPos);
  put(rightImgs.value, picEls, imgPos);
  put(midWords.value, wordElsById, wordPos);
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

/** 已配对连线的坐标：起点卡中心 → 终点卡中心（board 坐标系；线在最上层，不遮挡卡片）
 *
 * 「起点」= 孩子实际先按下的那一张，不固定为图片侧：
 *  - 拖拽：按下哪张就从哪张出发
 *  - 点选：第一次点的当起点，第二次点的当终点
 * 端点顺序与操作顺序一致，连线的绘制动画（stroke-dashoffset 从起点reveal）
 * 才会从孩子出手的那张卡流向另一张，而不是反过来"倒着长"。
 */
function matchedLine(wordId) {
  // colorMode：两端都在 picEls，通过 pairMap 互查
  if (colorMode.value) {
    const other = pairMap[wordId];
    if (!other) return null;
    const a = liveCenter(picEls[wordId]);
    const b = liveCenter(picEls[other]);
    if (!a || !b) return null;
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }
  const fromImg = (matchFrom[wordId] || "img") === "img";
  // 端点**实时测量**两张卡：快照坐标会随内容/字体加载漂移（实测 5~10px），
  // 漂移大时看起来就像线连到了别的卡
  const start = liveCenter(fromImg ? picEls[wordId] : wordElsById[wordId]);
  const end = liveCenter(fromImg ? wordElsById[wordId] : picEls[wordId]);
  if (!start || !end) return null;
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

const dragging = ref(false);
const startWord = ref(null);
const startSide = ref("img"); // 起点所在侧：'img'（两侧图片）| 'word'（中间单词）
const line = reactive({ x1: 0, y1: 0, x2: 0, y2: 0 });
const imgWrong = ref(null);
const wordWrong = ref(null);
/** 听音模式：当前正在播放声波动画的卡片 id */
const playingId = ref(null);
let playTimer = 0;
let wrongTimer = 0;

/**
 * 标出"刚连错的这一对"。必须带上「侧」：同一个 id 在两侧各有一张卡
 * （图片列 + 中间单词列），只按 id 标记会误伤另一侧同名的卡——孩子看到的
 * 是两个没碰过的卡片在闪红。a / b 是实际按下的两张卡：{ id, side }。
 * 连错是可以连续触发的，所以用同一个 timer，避免前一次的清理把新标记提前抹掉。
 */
function markWrong(a, b) {
  if (a.side === "img") {
    imgWrong.value = a.id;
    wordWrong.value = b.id;
  } else {
    wordWrong.value = a.id;
    imgWrong.value = b.id;
  }
  clearTimeout(wrongTimer);
  wrongTimer = setTimeout(() => {
    imgWrong.value = null;
    wordWrong.value = null;
  }, 750);
}
const justMatched = ref(null);
const transitioning = ref(false);

let pendingWord = null;
let pendingSide = null; // pendingWord 所在侧，供连错时精确定位要标红的卡

/** 颜色词 id → 色值：以课时数据为单源（颜色词的 word.color 十六进制）。
 *  曾在这里维护过一份组件本地色表，与数据漂移过两处（white/brown 色值不一致）；
 *  引用完整性由 validate-data.mjs 把关：colorPairs.color 必须是带 color 的本课单词。 */
const hexById = computed(() => {
  const m = {};
  for (const w of props.words) if (w.color) m[w.id] = w.color;
  return m;
});

/** 组内配对进度 → 顶栏进度条（多邻国式：连线逐对推进）；对数同步上报显示 x/y */
watch(
  [doneCount, totalPairs],
  () => {
    if (totalPairs.value === 0) return;
    emit("total", groupCount.value);
    emit("progress", Math.round(((groupIdx.value + (groupDone.value ? 1 : 0)) / groupCount.value) * 100));
  },
  { immediate: true }
);

function localPoint(e) {
  const rect = board.value.getBoundingClientRect();
  const p = e.touches ? e.touches[0] : e;
  return { x: p.clientX - rect.left, y: p.clientY - rect.top };
}

let downInfo = null; // 主指针本次按下的意图：drag（拉线）/ pair（点选配对）/ cancel（取消选择）
let dragPointer = null; // 正在拖拽的 pointerId（多指隔离：move/up 只认同一根手指）
let pairIntent = null; // 第二指的配对意图 { word, side, pid }（按住一张 + 点另一张的多指玩法）

/** 卡片中心坐标（board 坐标系），按所在侧取对应位置表 */
function centerOf(id, side) {
  return (side === "img" ? imgPos[id] : wordPos[id]) || null;
}

/** 实时测量卡片中心（board 坐标系）。连线端点必须用它：
 *  imgPos/wordPos 是测量快照，列宽会随内容/字体加载微漂移（实测 5~10px）。
 *  ⚠️ 必须走 offsetLeft/offsetTop（布局位置）而不是 getBoundingClientRect：
 *  后者包含 transform——连错后的 shake-x 抖动进行中连线正好重渲染时，
 *  端点会被量到抖动的半途上并永久定格（偏移可达 ±9px）。 */
function liveCenter(el) {
  if (!el || !board.value) return null;
  if (el.offsetParent === board.value) {
    return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 };
  }
  const r = el.getBoundingClientRect();
  const b = board.value.getBoundingClientRect();
  return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2 };
}

function pidOf(e) {
  return e.pointerId ?? 0;
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
  const pid = pidOf(e);
  // 多指隔离：一根手指正在拖拽时，其余手指只允许"按到另一侧 = 配对意图"，
  // 其它按下全部忽略（否则 downInfo 被第二指覆盖、抬指顺序一乱，
  // dragging 收不回来，屏幕上会留下一根"从一张图连到另一个词"的幽灵虚线）
  if (dragPointer !== null) {
    if (pairIntent === null && startWord.value && startSide.value !== side) {
      pairIntent = { word, side, pid };
    }
    return;
  }
  if (pairIntent !== null) return;
  // 听音模式：点声音卡只做"播放 + 选中"，不直接判定配对
  // （孩子想"逐个听一遍再连"，不能把听一下当成连错）
  if (mode.value === "sound" && side === "word") {
    speak(word.en, { lessonId: word.lessonId, wordId: word.id });
    // 触发声波动画
    playingId.value = word.id;
    clearTimeout(playTimer);
    playTimer = setTimeout(() => (playingId.value = null), 900);
    if (startWord.value && startSide.value === "word" && startWord.value.id === word.id) {
      downInfo = { word, side, act: "cancel" };
      return;
    }
    dragging.value = true;
    dragPointer = pid;
    startWord.value = word;
    startSide.value = "word";
    const c = liveCenter(e.currentTarget) || centerOf(word.id, side) || localPoint(e);
    line.x1 = c.x;
    line.y1 = c.y;
    const p = localPoint(e);
    line.x2 = p.x;
    line.y2 = p.y;
    downInfo = { word, side, act: "drag" };
    e.preventDefault();
    return;
  }
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
  dragPointer = pid;
  startWord.value = word;
  startSide.value = side;
  const c = liveCenter(e.currentTarget) || centerOf(word.id, side) || localPoint(e);
  line.x1 = c.x;
  line.y1 = c.y;
  const p = localPoint(e);
  line.x2 = p.x;
  line.y2 = p.y;
  downInfo = { word, side, act: "drag" };
  speak(word.en, { lessonId: word.lessonId, wordId: word.id });
  e.preventDefault();
}

function onMove(e) {
  if (!dragging.value || !downInfo) return;
  if (dragPointer !== null && pidOf(e) !== dragPointer) return; // 别的手指的移动
  const p = localPoint(e);
  line.x2 = p.x;
  line.y2 = p.y;
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  const el = document.elementFromPoint(cx, cy);
  const hit = el && el.closest ? el.closest("[data-word]") : null;
  // 只有落在"另一侧"且尚未配对的卡片上才算命中
  const ok = hit && hit.getAttribute("data-side") !== startSide.value && !hit.classList.contains("gone");
  pendingWord = ok ? hit.getAttribute("data-word") : null;
  pendingSide = ok ? hit.getAttribute("data-side") : null;
}

function onUp(e) {
  const pid = pidOf(e);
  // 第二指抬起 = 执行多指配对（按住一张 + 点另一张）
  if (pairIntent && pid === pairIntent.pid) {
    const info = pairIntent;
    pairIntent = null;
    dragging.value = false;
    tryMatch(info.word, info.side);
    return;
  }
  if (dragPointer !== null && pid !== dragPointer) return; // 别的手指的抬起，与本次手势无关
  dragPointer = null;
  // 所有路径都把 dragging 收干净——它残留时模板里的拖拽虚线会一直挂在屏幕上
  dragging.value = false;
  const info = downInfo;
  downInfo = null;
  if (!info) return;
  if (info.act === "pair") {
    tryMatch(info.word, info.side);
    return;
  }
  if (info.act === "cancel") {
    startWord.value = null;
    return;
  }
  // 拖拽结束：压在对面卡片上就配对，否则保留选中（点选模式接着点另一侧）
  const target = pendingWord ? findWord(pendingWord) : null;
  const targetSide = pendingSide;
  pendingWord = null;
  pendingSide = null;
  if (target) tryMatch(target, targetSide);
}

/** 手势被系统抢占（来电 / 切后台）→ 只清拖拽态，保留选中 */
function onCancel() {
  downInfo = null;
  pairIntent = null;
  dragPointer = null;
  dragging.value = false;
  pendingWord = null;
  pendingSide = null;
}

/** 配对入口：取当前选中的卡与起点侧，交给 session 判定，成功时闪连线 */
function tryMatch(other, otherSide) {
  const first = startWord.value;
  const from = startSide.value; // 先按下的那一侧 = 连线起点
  startWord.value = null;
  pendingWord = null;
  pendingSide = null;
  if (!first) return;
  const wasMatched = matched.size;
  sessionTryMatch(first, from, other, otherSide);
  if (matched.size > wasMatched) {
    justMatched.value = first.id;
    setTimeout(() => (justMatched.value = null), 600);
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

/** 组重置：session 清配对状态与列布局，组件清 DOM 侧的坐标/元素/反馈表 */
function setupGroup(g) {
  sessionSetupGroup(g);
  // 坐标表必须随组清空：id 不跨组复用，但留着旧条目既是泄漏，
  // 也让"测量还没跑完就渲染的线"拿到上一组的错误坐标
  Object.keys(imgPos).forEach((k) => delete imgPos[k]);
  Object.keys(wordPos).forEach((k) => delete wordPos[k]);
  Object.keys(picEls).forEach((k) => delete picEls[k]);
  Object.keys(wordElsById).forEach((k) => delete wordElsById[k]);
  clearTimeout(wrongTimer);
  imgWrong.value = null;
  wordWrong.value = null;
  pendingWord = null;
  pendingSide = null;
  ready.value = false;
  transitioning.value = false;
}

watch(curGroup, async (g) => {
  setupGroup(g);
  await nextTick();
  measure();
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
  // 字体加载完成会改变单词列的内容宽度（列宽重新分配），补一次测量
  document.fonts?.ready?.then(() => scheduleMeasure());
});

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", onUp);
  window.removeEventListener("pointercancel", onCancel);
  window.removeEventListener("resize", scheduleMeasure);
  if (ro) ro.disconnect();
  if (raf) cancelAnimationFrame(raf);
  clearTimeout(wrongTimer);
});
</script>

<template>
  <div class="match view">
    <StageHead class="match-head" :right-text="counterText">
      <template #tip>
        <Link2 class="k-ico tip-ico" />
        <!-- 提示语刻意短（右侧还有"看词/听音"切换 + 计数）：390 宽下长提示会被挤成窄条 -->
        <template v-if="colorMode">把颜色和小动物连起来</template>
        <template v-else-if="mode === 'word'">把图片和单词连起来</template>
        <template v-else>听发音，连到对应的图</template>
      </template>
      <!-- 练习方式切换：认字（显示单词）/ 听力（只显示声音）；颜色配对模式隐藏 -->
      <template v-if="!colorMode" #extra>
        <div class="mode-switch" role="group" aria-label="练习方式">
          <button
            class="mode-btn"
            :class="{ on: mode === 'word' }"
            :aria-pressed="mode === 'word'"
            aria-label="看图连线（显示单词）"
            @click="setMode('word')"
          >
            <BookOpenText class="k-ico" />看词
          </button>
          <button
            class="mode-btn"
            :class="{ on: mode === 'sound' }"
            :aria-pressed="mode === 'sound'"
            aria-label="听音连线（只显示声音图标）"
            @click="setMode('sound')"
          >
            <Volume2 class="k-ico" />听音
          </button>
        </div>
      </template>
    </StageHead>

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

      <div class="col words">
        <div
          v-for="(w, i) in midWords"
          :key="w.id"
          :ref="(el) => setWordEl(w.id, el)"
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
          <template v-if="mode === 'word'">{{ w.en }}</template>
          <!-- 听音模式：喇叭 + 单词并排，点喇叭听发音的同时看到词形（音-形对应） -->
          <span v-else class="sound-wrap" :class="{ playing: playingId === w.id }">
            <Volume2 class="sound-ico" :aria-label="w.en" />
            <span class="sound-word">{{ w.en }}</span>
            <span v-if="playingId === w.id" class="wave" aria-hidden="true"><i></i><i></i><i></i></span>
          </span>
        </div>
      </div>

      <div class="col imgs">
        <div
          v-for="(w, i) in leftImgs"
          :key="w.id"
          :ref="(el) => setPicEl(w.id, el)"
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
          <!-- 颜色配对模式：左列渲染纯色圆 -->
          <span
            v-if="w.color"
            class="color-dot"
            :style="{ background: hexById[w.color] || '#ccc' }"
            :aria-label="w.en"
          />
          <template v-else>
            <img
              loading="lazy"
              decoding="async"
              :src="w.image"
              :alt="w.en"
              @error="
                $event.target.style.display = 'none';
                $event.target.nextElementSibling.style.display = 'flex';
              "
            />
            <span class="ph" style="display: none">{{ w.emoji }}</span>
          </template>
        </div>
      </div>

      <!-- 颜色配对模式：右列动物图（colorMode 时右列单独渲染） -->
      <div v-if="colorMode" class="col imgs right">
        <div
          v-for="(w, i) in rightImgs"
          :key="w.id"
          :ref="(el) => setPicEl(w.id, el)"
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
            loading="lazy"
            decoding="async"
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

      <!-- 组间过场横幅：盖住整块棋盘（含连线），用 banner-in 入场 -->
      <div v-if="transitioning" class="banner">
        <span>{{ groupIdx + 1 >= groupCount ? "全部连完啦！" : "这组连完啦！下一组 →" }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.match-head {
  margin-bottom: var(--gap-s);
}
.tip-ico {
  color: var(--purple);
}
/* 计数改走 StageHead 的 .prog（card-bg 胶囊曾让"第 X 组"黑底浮出全站风格外） */

.board {
  position: relative;
  display: flex;
  justify-content: space-between;
  /* 两列中间留足间隔，连线不挤；响应式：小屏 14px → 大屏 44px */
  gap: clamp(14px, 4vw, 44px);
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
  stroke: var(--ok);
  stroke-width: 6;
  stroke-linecap: round;
  /* pathLength=100 把任意长度的线归一化，避免长线出现 dasharray 断口 */
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  animation: draw-line 0.45s ease forwards;
}
.done-line.flash {
  filter: drop-shadow(0 0 8px var(--progress-hi));
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
  flex: 1;
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
/* 颜色配对：纯色圆，带细边框（白色/浅色圆需要描边才能看清） */
.color-dot {
  width: 58%;
  height: 58%;
  border-radius: 50%;
  border: 3px solid var(--line, rgba(0,0,0,0.12));
  box-shadow: inset 0 -4px 8px rgba(0,0,0,0.12);
  pointer-events: none;
}
.cell.pic .ph {
  font-size: var(--fs-emoji-l);
  align-items: center;
}
.cell.word {
  font-size: clamp(15px, min(3.2vh, 2.4vw), 30px);
  font-weight: var(--fw-strong);
  cursor: grab;
  padding: 0 4px;
  text-align: center;
  word-break: break-word;
  line-height: 1.1;
}
/* 听音模式的大喇叭 */
.sound-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(4px, 1vw, 8px);
  padding: 0 4px;
  min-width: 0;
}
.sound-ico {
  width: clamp(24px, 6vh, 52px);
  height: clamp(24px, 6vh, 52px);
  color: var(--blue-dark);
  flex: none;
}
.sound-word {
  font-size: clamp(13px, min(2.9vh, 2.2vw), 26px);
  font-weight: var(--fw-strong);
  color: var(--ink);
  line-height: 1.15;
  overflow-wrap: anywhere;
  min-width: 0;
}
/* 练习方式切换（看词 / 听音） */
.mode-switch {
  display: inline-flex;
  gap: 4px;
  background: var(--card-bg);
  border-radius: var(--radius-pill);
  padding: 3px;
  box-shadow: var(--shadow-hard);
  flex: none;
}
.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--ink-soft);
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
  padding: 6px 12px;
  min-height: clamp(34px, 5.4vh, 44px);
  cursor: pointer;
}
.mode-btn.on {
  background: var(--blue);
  color: var(--on-tone);
}
.mode-btn .k-ico {
  width: 1em;
  height: 1em;
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
  background: var(--state-bad-bg);
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
  /* 必须高于连线层：刚连完的那几条线正穿在棋盘上，层级低了会横穿横幅压住文案 */
  z-index: var(--z-floating);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--overlay-strong);
  border-radius: var(--radius);
  animation: banner-in 0.3s ease-out both;
}
/* 用轻微缩放 + 上浮入场，比 pop-in 更"盖上去"，不会被误读成又来了一张卡片 */
@keyframes banner-in {
  from { opacity: 0; transform: scale(0.94); }
  to { opacity: 1; transform: scale(1); }
}
.banner span {
  font-size: clamp(18px, min(4vh, 3.2vw), 34px);
  font-weight: var(--fw-strong);
  color: var(--ok-dark);
  background: var(--card-bg);
  padding: clamp(10px, 1.8vh, 14px) clamp(18px, 3vw, 28px);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  text-align: center;
}

/* 手机窄屏：中间单词列再加宽，图片列收窄，优先保证单词可读 */
@media (max-width: 600px) {
  .col.imgs {
    flex: 1;
  }
  .col.words {
    flex: 1;
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

/* ===== 平板/桌面（宽且不太矮）：图片卡方形化 + 图片填满 =====
 * 修复 iPad 横屏「图片小」：拉伸布局下图片列和单词列各分一半宽（约 440px），
 * 但行高被对数均摊（5 对 → 每行约 110px），图片 object-fit 后实际只有 ~65px 高，
 * 卡片左右大片白底。这里让图片卡按行高取正方形、图片撑满卡片、列内居中：
 * 行高多少图片就多大，视觉密度立刻回来。手机竖屏（<600px）保持拉伸布局不动。 */
@media (min-width: 600px) and (min-height: 640px) {
  .col.imgs {
    justify-items: center;
  }
  .cell.pic {
    aspect-ratio: 1 / 1;
    height: 100%;
    width: auto;
    padding: 4px;
  }
  .cell.pic img {
    width: 100%;
    height: 100%;
  }
}
</style>
