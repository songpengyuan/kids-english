<script setup lang="ts">
/**
 * 自由练习首页（阶段 2-2：从 HomePage 拆分）。
 * 快捷引导（复习/继续学习）+ 课时卡片网格（自适应列/行/翻页）。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { activityKeys, getLesson, lessons, type Lesson } from "../../data/lessons";
import { useProgressStore } from "../../stores/progress";
import { useRouter } from "vue-router";
import { speak } from "../../utils/speech";
import { useViewport } from "../../composables/useViewport";
import { usePager } from "../../composables/usePager";
import { pickColumns } from "../../utils/layout";
import Pager from "../../components/activities/Pager.vue";
import { BookOpenText, Check } from "@lucide/vue";

const progress = useProgressStore();
const router = useRouter();
const { isNarrow } = useViewport();

const GAP = 14;
const MIN_CARD_W = 170;
const MIN_CARD_H = 120;

/* ---------- 测量课时卡片区 ---------- */
const stageEl = ref<HTMLDivElement | null>(null);
const area = reactive({ w: 0, h: 0 });
let ro: ResizeObserver | null = null;
let raf: number | null = null;

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
const fit = computed<{ cols: number; rows: number }>(() => {
  if (!area.w || !area.h) return { cols: isNarrow.value ? 2 : 3, rows: 2 };
  return pickColumns({
    width: area.w,
    height: area.h,
    count: lessons.length,
    minCardW: MIN_CARD_W,
    minCardH: MIN_CARD_H,
    gap: GAP,
    maxCols: isNarrow.value ? 2 : 4,
    maxRows: area.h < MIN_CARD_H * 2 + GAP ? 1 : 4,
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
} = usePager<Lesson>(lessons, perPage, { resetOn: [() => lessons.length] });

const cardsStyle = computed(() => ({
  "--cols": fit.value.cols,
  "--grid-gap": `${GAP}px`
}));

function enter(l: Lesson) {
  speak(l.words[0].en, { lessonId: l.id, wordId: l.words[0].id });
  router.push(`/lesson/${l.id}`);
}

/* ---------- 快捷引导 ---------- */
const weakCount = computed(() => progress.getWeakWords().length);
const lastLessonObj = computed(() => {
  const id = progress.lastLesson;
  return id ? getLesson(id) : null;
});
</script>

<template>
  <div class="practice">
    <div v-if="weakCount > 0 || lastLessonObj" class="quick-links anim-fade-up">
      <button v-if="weakCount > 0" class="q-link review" @click="router.push('/review')">
        <BookOpenText class="k-ico" />复习 {{ weakCount }} 个词
      </button>
      <button v-if="lastLessonObj" class="q-link" @click="enter(lastLessonObj)">
        ⏩ 继续：{{ lastLessonObj.emoji }} {{ lastLessonObj.titleZh }}
      </button>
    </div>

    <div class="stage view-body" ref="stageEl">
      <div class="cards" :style="cardsStyle">
        <button
          v-for="(l, i) in items"
          :key="l.id"
          class="lesson-card anim-pop"
          :class="'tone-' + l.tone"
          :style="{ animationDelay: Math.min(i, 8) * 0.08 + 's' }"
          @click="enter(l)"
        >
          <span class="big-emoji anim-float">{{ l.emoji }}</span>
          <span class="lt">{{ l.title }}</span>
          <span class="card-done" v-if="progress.isCompleted(l.id, activityKeys(l))">
            <Check class="k-ico" />全部通关
          </span>
          <span class="cnt">{{ l.words.length }} 个单词</span>
        </button>
      </div>
    </div>

    <Pager :page="page" :total="total" @prev="gotoPrev" @next="gotoNext" @go="gotoPage" />
  </div>
</template>

<style scoped>
.practice {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}
.quick-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--gap-s);
  margin-top: var(--gap-s);
}
.q-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: clamp(7px, 1.4vh, 10px) clamp(12px, 1.8vw, 18px);
  border-radius: var(--radius-pill);
  font-weight: 800;
  font-size: var(--fs-small);
  color: var(--ink);
  background: var(--card-bg);
  box-shadow: var(--shadow-hard);
  transition: transform 0.1s, background 0.2s;
}
.q-link.review {
  background: linear-gradient(160deg, #ffd6a5, #ffb26b);
  color: #5c3a00;
}
.q-link:active {
  transform: translateY(calc(var(--press) - 1px));
}
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
.card-done {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--overlay);
  color: var(--green-dark);
  font-size: clamp(10px, min(1.6vh, 1.3vw), 12px);
  font-weight: 800;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
@media (max-height: 480px) {
  .cnt {
    display: none;
  }
}
@media (max-height: 620px) and (max-width: 600px) {
  .lt {
    -webkit-line-clamp: 1;
    font-size: 15px;
  }
}
</style>
