<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { lessons } from "../data/lessons";
import progress from "../store/progress";
import { speak } from "../utils/speech";
import { useViewport } from "../composables/useViewport";
import { usePager } from "../composables/usePager";
import { pickColumns } from "../utils/layout";
import Pager from "./Pager.vue";

const emit = defineEmits(["open"]);

const { isNarrow } = useViewport();

const GAP = 14;
const MIN_CARD_W = 170;
const MIN_CARD_H = 120;

/* ---------- 测量课时卡片区 ---------- */
const stageEl = ref(null);
const area = reactive({ w: 0, h: 0 });
let ro = null;
let raf = null;

function measure() {
  const el = stageEl.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  area.w = r.width;
  area.h = r.height;
}
function scheduleMeasure() {
  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    raf = null;
    measure();
  });
}
onMounted(() => {
  measure();
  ro = new ResizeObserver(scheduleMeasure);
  if (stageEl.value) ro.observe(stageEl.value);
});
onBeforeUnmount(() => {
  if (ro) ro.disconnect();
  if (raf) cancelAnimationFrame(raf);
});

/* ---------- 每页课时数与列数 ---------- */
const fit = computed(() => {
  if (!area.w || !area.h) return { cols: isNarrow.value ? 2 : 3, rows: 2 };
  return pickColumns({
    width: area.w,
    height: area.h,
    count: lessons.length,
    minCardW: MIN_CARD_W,
    minCardH: MIN_CARD_H,
    gap: GAP,
    maxCols: isNarrow.value ? 2 : 4,
    // 课时卡偏方形（emoji + 中文 + 英文 + 词数四行），目标略高于 1
    targetAspect: 1.0
  });
});

const perPage = computed(() => fit.value.cols * fit.value.rows);

const {
  page,
  total,
  items,
  next: gotoNext,
  prev: gotoPrev,
  go: gotoPage
} = usePager(lessons, perPage, {
  resetOn: [() => lessons.length]
});

const cardsStyle = computed(() => ({
  "--cols": fit.value.cols,
  "--grid-gap": `${GAP}px`
}));

function enter(l) {
  speak(l.words[0].en); // 进课时先读一个单词，暖场
  emit("open", l.id);
}
</script>

<template>
  <div class="home view">
    <header class="hero anim-fade-up">
      <h1>🌈 丞丞英语乐园</h1>
      <p class="sub">点一课，学童谣里的单词吧！</p>
      <div class="star-badge">⭐ 我的星星：{{ progress.totalStars }}</div>
    </header>

    <div class="stage view-body" ref="stageEl">
      <div class="cards" :style="cardsStyle">
        <button
          v-for="(l, i) in items"
          :key="l.id"
          class="lesson-card anim-pop"
          :style="{ background: l.color, animationDelay: Math.min(i, 8) * 0.08 + 's' }"
          @click="enter(l)"
        >
          <span class="big-emoji anim-float">{{ l.emoji }}</span>
          <span class="lt">{{ l.title }}</span>
          <span class="done" v-if="progress.isCompleted(l.id)">全部通关 ✓</span>
          <span class="cnt">{{ l.words.length }} 个单词</span>
        </button>
      </div>
    </div>

    <Pager :page="page" :total="total" @prev="gotoPrev" @next="gotoNext" @go="gotoPage" />

    <p class="foot">👨‍👩‍👧 建议家长陪同，每次 10~15 分钟</p>
  </div>
</template>

<style scoped>
.hero {
  text-align: center;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.hero h1 {
  margin: 0;
  font-size: var(--fs-hero);
  color: var(--ink);
  line-height: 1.15;
}
.sub {
  margin: 0;
  color: var(--ink-soft);
  font-weight: 700;
  font-size: var(--fs-small);
}

/* 卡片区只负责"占满剩余高度"并可被测量 */
.stage {
  display: flex;
}
.cards {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr));
  grid-auto-rows: minmax(0, 1fr);
  gap: var(--grid-gap, 14px);
}
.lesson-card {
  border-radius: var(--radius);
  padding: var(--gap-s);
  color: #fff;
  box-shadow: 0 var(--press) 0 rgba(0, 0, 0, 0.16);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  position: relative;
  transition: transform 0.1s;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.lesson-card:active {
  transform: translateY(calc(var(--press) - 1px)) scale(0.98);
}
.big-emoji {
  font-size: var(--fs-emoji-xl);
  line-height: 1;
}
.lt {
  font-size: clamp(16px, min(3vh, 2.4vw), 24px);
  font-weight: 800;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.12);
  /* 英文标题较长，允许最多换两行，避免省略号截断 */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  line-height: 1.2;
  max-width: 100%;
}
.cnt {
  font-size: clamp(10px, min(1.6vh, 1.3vw), 13px);
  opacity: 0.85;
  font-weight: 700;
  white-space: nowrap;
}
.done {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--green-dark);
  font-size: clamp(10px, min(1.6vh, 1.3vw), 12px);
  font-weight: 800;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
}
.foot {
  text-align: center;
  color: var(--ink-faint);
  font-weight: 700;
  font-size: var(--fs-small);
  margin: 0;
  flex: none;
}

/* 手机横屏：标题和页脚都让位，把高度留给卡片 */
@media (max-height: 480px) {
  .hero h1 {
    font-size: 22px;
  }
  .sub,
  .foot {
    display: none;
  }
  .cnt {
    display: none;
  }
}

/* 卡片很矮时收紧行高，避免长英文标题换行溢出 */
@media (max-height: 620px) and (max-width: 600px) {
  .lt {
    -webkit-line-clamp: 1;
    font-size: 15px;
  }
}
</style>
