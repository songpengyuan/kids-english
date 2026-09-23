/**
 * 通用分页
 *
 * 用法：
 *   const pager = usePager(words, perPageRef);
 *   pager.items     // 当前页数据
 *   pager.next() / pager.prev()
 *
 * 两个关键防御：
 *  1. 每页容量变化（旋转屏幕 / iPad 分屏 / 地址栏收放）时，把页码夹回合法范围，
 *     否则会停留在超出范围的空白页。
 *  2. 数据源变化（换一节课、重新分组）时回到第一页。
 */
import { computed, ref, unref, watch } from "vue";

export function usePager(source, perPage, options = {}) {
  const { resetOn = [] } = options;

  const page = ref(0);
  const size = computed(() => Math.max(1, Math.floor(unref(perPage)) || 1));
  const list = computed(() => unref(source) || []);
  const total = computed(() => Math.max(1, Math.ceil(list.value.length / size.value)));

  const items = computed(() => {
    const start = page.value * size.value;
    return list.value.slice(start, start + size.value);
  });

  const isFirst = computed(() => page.value <= 0);
  const isLast = computed(() => page.value >= total.value - 1);
  /** 用于进度条：到最后一页为 100% */
  const percent = computed(() => Math.round(((page.value + 1) / total.value) * 100));
  /** 当前页内条目的序号区间，用于"3-6 / 9"这类文案 */
  const rangeText = computed(() => {
    const n = list.value.length;
    if (!n) return "0 / 0";
    const from = page.value * size.value + 1;
    const to = Math.min(n, (page.value + 1) * size.value);
    return `${from}-${to} / ${n}`;
  });

  function next() {
    if (!isLast.value) page.value++;
  }
  function prev() {
    if (!isFirst.value) page.value--;
  }
  function go(i) {
    page.value = Math.min(Math.max(0, i), total.value - 1);
  }
  function reset() {
    page.value = 0;
  }

  // 容量变大/变小时页码可能越界，夹回去
  watch(total, (t) => {
    if (page.value > t - 1) page.value = t - 1;
  });

  if (resetOn.length) watch(resetOn, reset);

  return {
    page,
    size,
    total,
    items,
    isFirst,
    isLast,
    percent,
    rangeText,
    next,
    prev,
    go,
    reset
  };
}
