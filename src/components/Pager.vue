<script setup>
import { computed, onBeforeUnmount, onMounted } from "vue";
import { ChevronLeft, ChevronRight } from "@lucide/vue";

/**
 * 通用翻页控件。
 *
 * 面向 5 岁孩子，所以用「大箭头 + 圆点」而不是滑动：
 * 按钮有明确的可见边界，比手势更容易被发现和使用；
 * 同时圆点给出"还有几页"的空间感知。
 *
 * 键盘左右方向键也支持，方便电脑上开发调试。
 */
const props = defineProps({
  page: { type: Number, required: true }, // 0-based
  total: { type: Number, required: true },
  /** 超过这个页数就不再画圆点，只显示 "x / n" */
  maxDots: { type: Number, default: 10 }
});

const emit = defineEmits(["prev", "next", "go"]);

const canPrev = computed(() => props.page > 0);
const canNext = computed(() => props.page < props.total - 1);
const showDots = computed(() => props.total > 1 && props.total <= props.maxDots);

function onKey(e) {
  if (props.total <= 1) return;
  if (e.key === "ArrowLeft" && canPrev.value) emit("prev");
  if (e.key === "ArrowRight" && canNext.value) emit("next");
}

onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div v-if="total > 1" class="pager">
    <button
      class="arrow"
      :disabled="!canPrev"
      aria-label="上一页"
      @click="emit('prev')"
    >
      <ChevronLeft class="k-ico" />
    </button>

    <div class="mid">
      <div v-if="showDots" class="dots">
        <button
          v-for="n in total"
          :key="n"
          class="dot"
          :class="{ on: n - 1 === page }"
          :aria-label="`第 ${n} 页`"
          @click="emit('go', n - 1)"
        />
      </div>
      <span class="counter">{{ page + 1 }} / {{ total }}</span>
    </div>

    <button
      class="arrow"
      :disabled="!canNext"
      aria-label="下一页"
      @click="emit('next')"
    >
      <ChevronRight class="k-ico" />
    </button>
  </div>
</template>

<style scoped>
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--gap-m);
  flex: none;
  width: 100%;
}
.arrow {
  width: var(--tap-min);
  height: var(--tap-min);
  flex: none;
  border-radius: 50%;
  background: var(--green);
  color: var(--on-tone);
  font-size: var(--fs-btn);
  font-weight: 800;
  line-height: 1;
  box-shadow: 0 var(--press) 0 var(--green-dark);
  transition: transform 0.08s, box-shadow 0.08s, opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.arrow:active:not(:disabled) {
  transform: translateY(calc(var(--press) - 1px));
  box-shadow: 0 1px 0 var(--green-dark);
}
.arrow:disabled {
  opacity: 0.4;
  box-shadow: 0 var(--press) 0 var(--btn-off-deep);
  background: var(--btn-off-bg);
  color: var(--btn-off-ink);
  cursor: default;
}

.mid {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.dots {
  display: flex;
  align-items: center;
  gap: clamp(5px, 1vw, 9px);
  flex-wrap: wrap;
  justify-content: center;
}
.dot {
  width: clamp(9px, 1.6vh, 13px);
  height: clamp(9px, 1.6vh, 13px);
  padding: 0;
  border-radius: 50%;
  background: var(--dot-bg);
  transition: background 0.2s, transform 0.2s;
}
.dot.on {
  background: var(--green);
  transform: scale(1.3);
}
.counter {
  font-size: var(--fs-small);
  font-weight: 800;
  color: var(--ink-soft);
  white-space: nowrap;
}

/* 手机横屏：整体压瘦，别抢内容高度 */
@media (max-height: 480px) {
  .pager {
    gap: var(--gap-s);
  }
  .arrow {
    width: 40px;
    height: 40px;
    font-size: 18px;
  }
  .dots {
    gap: 6px;
  }
  .counter {
    display: none;
  }
}
</style>
