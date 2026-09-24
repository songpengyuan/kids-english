<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import WordCard from "./WordCard.vue";
import Pager from "./Pager.vue";
import { celebrate, bigCelebrate, sfxCorrect } from "../utils/effects";
import { useViewport } from "../composables/useViewport";
import { usePager } from "../composables/usePager";
import { fitGrid } from "../utils/layout";
import { Check, MousePointerClick } from "@lucide/vue";

/**
 * 看图学词（点读）
 *
 * 之前把一节课的单词一次性铺在一屏，词一多（第 4 课有 9 个）就会挤成一片，
 * 尤其在 iPad 上每张卡片被压得很小。现在改成**按可用空间动态分页**：
 * 实测内容区尺寸后反推一页能放几行几列，超出部分翻页看。
 */
const props = defineProps({ words: { type: Array, required: true } });
const emit = defineEmits(["done"]);

const { isNarrow } = useViewport();

const GAP = 12;
/** 单个词卡低于这个尺寸就看不清了，作为反推每页容量的下限 */
const MIN_CARD_W = 110;
const MIN_CARD_H = 118;

/* ---------- 测量内容区 ---------- */
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

/** 测量会反过来影响布局，用 rAF 把更新推到下一帧，避免 ResizeObserver 循环告警 */
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

/* ---------- 每页容量 ---------- */
const fit = computed(() => {
  // 尺寸还没测出来时给一个保守值，避免首帧把所有词都铺出来再收缩
  if (!area.w || !area.h) return { cols: 2, rows: 2, perPage: 4 };
  return fitGrid({
    width: area.w,
    height: area.h,
    minCardW: MIN_CARD_W,
    minCardH: MIN_CARD_H,
    gap: GAP,
    // 手机最多 2 列，否则卡片太窄；平板最多 4 列，避免一行摊得太散
    maxCols: isNarrow.value ? 2 : 4,
    maxRows: 3
  });
});

const {
  page,
  total,
  items,
  isLast,
  next: gotoNext,
  prev: gotoPrev,
  go: gotoPage
} = usePager(props.words, computed(() => fit.value.perPage), {
  // 换课时/换词表时回到第一页
  resetOn: [() => props.words]
});

/** 行高固定按"满页"算，末页不满时由 align-content 居中，卡片不会被拉得过高 */
const rowHeight = computed(() => {
  const rows = fit.value.rows;
  const h = area.h || 0;
  return Math.max(MIN_CARD_H, (h - (rows - 1) * GAP) / rows);
});

const gridStyle = computed(() => ({
  "--cols": fit.value.cols,
  "--grid-gap": `${GAP}px`,
  gridAutoRows: `${rowHeight.value}px`
}));

function finish() {
  if (!isLast.value) return;
  sfxCorrect();
  bigCelebrate();
  celebrate();
  emit("done");
}
</script>

<template>
  <div class="learn view">
    <p class="hint anim-fade-up">
      <MousePointerClick class="k-ico" />点图片听发音，点单词再听一遍
      <span v-if="total > 1" class="hint-page">（共 {{ total }} 页）</span>
    </p>

    <!-- 内容区：尺寸被实测，用于反推每页容量 -->
    <div class="stage" ref="stageEl">
      <div class="grid" :style="gridStyle">
        <WordCard
          v-for="(w, i) in items"
          :key="w.id"
          :word="w"
          :enter-index="i"
        />
      </div>
    </div>

    <Pager :page="page" :total="total" @prev="gotoPrev" @next="gotoNext" @go="gotoPage" />

    <button class="k-btn next" :disabled="!isLast" @click="finish">
      <template v-if="isLast"><Check class="k-ico" />我都会啦</template>
      <template v-else>看完所有图才能完成哦</template>
    </button>
  </div>
</template>

<style scoped>
.hint {
  margin: 0;
  font-size: var(--fs-small);
  color: var(--ink-soft);
  font-weight: 700;
  flex: none;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35em;
  flex-wrap: wrap;
}
.hint .k-ico {
  color: var(--orange);
}
.hint-page {
  color: var(--green-dark);
}

/* 只负责"占满剩余高度"并可被测量，不随内部网格内容变化 */
.stage {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
}

.grid {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr));
  gap: var(--grid-gap, 12px);
  /* 末页不满时整块居中，而不是把卡片拉满整屏 */
  align-content: center;
}

.next {
  flex: none;
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
}
</style>
