<script setup lang="ts">
/**
 * 自由练习首页（阶段 2-2：从 HomePage 拆分）。
 * 快捷引导（复习/继续学习）+ 课时卡片网格（**上下滚动**）。
 *
 * 2026-09-28：课程列表从"翻页"改为"上下滚动"——后续课程会越加越多，
 * 滚动浏览比翻页轻松，也更贴近 App 首页"往下滑看全部课"的惯用节奏。
 */
import { computed } from "vue";
import { activityKeys, getLesson, lessons, type Lesson } from "../../data/lessons";
import { useProgressStore } from "../../stores/progress";
import { useRouter } from "vue-router";
import { speak } from "../../services/speech";
import { useViewport } from "../../composables/useViewport";
import { dueWords } from "../../utils/reviewQueue";
import { BookOpenText, Check } from "@lucide/vue";

const progress = useProgressStore();
const router = useRouter();
const { isNarrow, width } = useViewport();

/** 卡片列数：手机 2 列，平板 3 列，超宽屏 4 列（别一行摊太散） */
const cols = computed(() => (isNarrow.value ? 2 : width.value >= 1080 ? 4 : 3));

const cardsStyle = computed(() => ({
  "--cols": cols.value,
  "--grid-gap": "14px"
}));

function enter(l: Lesson) {
  // 点击卡片文字（课程英文标题）→ 朗读标题；进课程后由 LearnView 逐词发音
  speak(l.title, { ttsOnly: true });
  router.push(`/lesson/${l.id}`);
}

/* ---------- 快捷引导 ---------- */
/** 全词库（过滤课程已删除的残留词） */
const allWords = lessons.flatMap((l) => l.words);
/** 今天到期该复习的词数（间隔重复队列；词库已删除的残留词自动丢弃） */
const weakCount = computed(() => dueWords(progress.getReviewQueue(), allWords).length);
const lastLessonObj = computed(() => {
  const id = progress.lastLesson;
  return id ? getLesson(id) : null;
});
</script>

<template>
  <div class="practice">
    <div v-if="weakCount > 0 || lastLessonObj" class="quick-links anim-fade-up">
      <button v-if="weakCount > 0" class="q-link review" @click="router.push('/review')">
        <BookOpenText class="k-ico" />今天该复习 {{ weakCount }} 个词
      </button>
      <button v-if="lastLessonObj" class="q-link" @click="enter(lastLessonObj)">
        ⏩ 继续：{{ lastLessonObj.emoji }} {{ lastLessonObj.titleZh }}
      </button>
    </div>

    <!-- 课程列表：上下滚动，课多了往下滑即可；不再翻页 -->
    <div class="stage view-body">
      <div class="cards" :style="cardsStyle">
        <button
          v-for="(l, i) in lessons"
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
/* 滚动列表：占满剩余高度，课多了往下滑 */
.stage {
  display: flex;
  min-height: 0;
  width: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding-bottom: var(--gap-s);
}
.cards {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr));
  /* 行高 ≈ 之前翻页版"每屏两行"的卡片高度：按视口高换算，课多了整体往下滚 */
  grid-auto-rows: clamp(150px, calc((100dvh - 170px) / 2), 420px);
  align-content: start;
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
