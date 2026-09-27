<script setup lang="ts">
import { computed } from "vue";
import WordCard from "./WordCard.vue";
import Pager from "./Pager.vue";
import { celebrate, bigCelebrate, sfxCorrect } from "../../utils/effects";
import { useLearnSession } from "../../composables/useLearnSession";
import type { Word } from "../../data/lessons";
import { Check, MousePointerClick } from "@lucide/vue";

/**
 * 看图学词（点读）—— 逻辑在 composables/useLearnSession，这里只做渲染与音效。
 *
 * 分页按可用空间动态计算（词一多就分页，iPad 上每张卡片不会被压得很小）；
 * 星级 = 点读覆盖率（都点过发音 = 3 星），见 utils/learnSession。
 */
const props = defineProps<{ words: Word[] }>();
const emit = defineEmits(["done"]);

const {
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
  tapped,
  tappedCount,
  stars,
} = useLearnSession(computed(() => props.words));

/** 本课全部词都点过发音（完成前置条件） */
const allTapped = computed(() => props.words.length > 0 && tappedCount.value >= props.words.length);
/** 还差几个词没点（提示用） */
const remaining = computed(() => Math.max(0, props.words.length - tappedCount.value));
/** 完成按钮可点 = 最后一页 && 全部点过 */
const canFinish = computed(() => isLast.value && allTapped.value);

function finish() {
  if (!isLast.value || !allTapped.value) return;
  sfxCorrect();
  bigCelebrate();
  celebrate();
  // 星级 = 点读覆盖率（都点过发音才 3 星），交给 useLessonFlow 记录
  emit("done", stars.value);
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
          :marked="tapped.has(w.id)"
          @tap="markTapped"
        />
      </div>
    </div>

    <Pager :page="page" :total="total" @prev="gotoPrev" @next="gotoNext" @go="gotoPage" />

    <button class="k-btn next" :disabled="!canFinish" @click="finish">
      <template v-if="canFinish"><Check class="k-ico" />我都会啦</template>
      <template v-else-if="!isLast">看完所有图才能完成哦</template>
      <template v-else>还有 {{ remaining }} 个词没点过哦</template>
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
