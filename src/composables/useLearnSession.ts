/**
 * 看图学词会话（从 LearnView 抽出的逻辑层）。
 *
 * 职责：
 * - 实测内容区尺寸 → 反推每页容量 → 分页（fitGrid + usePager）
 * - 记录本次会话**点读过发音的词**（星级依据：点读覆盖率）
 * - 结束（"我都会啦"）时给出星级
 *
 * 副作用（音效/朗读/掌握度落库）留在组件里，逻辑层可单测。
 */
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  unref,
  type ComputedRef,
  type MaybeRef,
  type WritableComputedRef,
} from "vue";
import { useViewport } from "./useViewport";
import { usePager } from "./usePager";
import { fitGrid } from "../utils/layout";
import { learnStars } from "../utils/learnSession";
import type { Word } from "../data/lessons";

const GAP = 12;
/** 单个词卡低于这个尺寸就看不清了，作为反推每页容量的下限 */
const MIN_CARD_W = 110;
const MIN_CARD_H = 118;

export function useLearnSession(
  words: MaybeRef<Word[]> | ComputedRef<Word[]> | WritableComputedRef<Word[]>
) {
  const { isNarrow } = useViewport();

  /* ---------- 测量内容区 ---------- */
  const stageEl = ref<HTMLDivElement | null>(null);
  const area = reactive({ w: 0, h: 0 });
  let ro: ResizeObserver | null = null;
  let raf = 0;

  function measure() {
    const el = stageEl.value;
    if (!el) return;
    const r = el.getBoundingClientRect();
    area.w = r.width;
    area.h = r.height;
  }

  /** 测量会反过来影响布局，用 rAF 推到下一帧，避免 ResizeObserver 循环告警 */
  function scheduleMeasure() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = 0;
      measure();
    });
  }

  onMounted(() => {
    measure();
    ro = new ResizeObserver(scheduleMeasure);
    if (stageEl.value) ro.observe(stageEl.value);
  });
  onBeforeUnmount(() => {
    ro?.disconnect();
    ro = null;
    if (raf) cancelAnimationFrame(raf);
  });

  /* ---------- 每页容量 ---------- */
  const fit = computed(() => {
    // 尺寸还没测出来时给保守值，避免首帧把所有词铺出来再收缩
    if (!area.w || !area.h) return { cols: 2, rows: 2, perPage: 4 };
    return fitGrid({
      width: area.w,
      height: area.h,
      minCardW: MIN_CARD_W,
      minCardH: MIN_CARD_H,
      gap: GAP,
      // 手机最多 2 列（再窄卡片看不清）；平板最多 4 列（别一行摊太散）
      maxCols: isNarrow.value ? 2 : 4,
      maxRows: 3,
    });
  });

  const {
    page,
    total,
    items,
    isLast,
    next: gotoNext,
    prev: gotoPrev,
    go: gotoPage,
  } = usePager(words, computed(() => fit.value.perPage), {
    resetOn: [() => unref(words)],
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
    gridAutoRows: `${rowHeight.value}px`,
  }));

  /* ---------- 点读覆盖（星级依据） ---------- */
  const tapped = ref<Set<string>>(new Set());
  function markTapped(word: Word) {
    if (tapped.value.has(word.id)) return;
    tapped.value = new Set([...tapped.value, word.id]);
  }
  const tappedCount = computed(() => tapped.value.size);
  /** 本次会话的星级：点读覆盖率（点过的词 / 总词数） */
  const stars = computed(() => learnStars(tappedCount.value, unref(words).length));

  return {
    stageEl,
    gridStyle,
    page,
    total,
    items,
    isLast,
    gotoNext,
    gotoPrev,
    gotoPage,
    markTapped,
    tappedCount,
    stars,
  };
}
