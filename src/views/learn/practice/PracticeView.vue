<script setup lang="ts">
/**
 * 自由练习首页（阶段 2-2：从 HomePage 拆分）。
 * 快捷引导（复习/继续学习）+ 课时卡片网格（**上下滚动**）。
 *
 * 2026-09-28：课程列表从"翻页"改为"上下滚动"——后续课程会越加越多，
 * 滚动浏览比翻页轻松，也更贴近 App 首页"往下滑看全部课"的惯用节奏。
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { activityKeys, getLesson, lessons, type Lesson } from "../../../data/lessons";
import { useProgressStore } from "../../../stores/progress";
import { useRouter } from "vue-router";
import { speak } from "../../../services/speech";
import { dueWords } from "../../../utils/reviewQueue";
import { BookOpenText, Check } from "@lucide/vue";

const progress = useProgressStore();
const router = useRouter();

/** 课程轮播：每页 3 课（左右滑动 + 底部小点），移动端到超宽屏统一 */
const PAGE_SIZE = 3;
const pages = computed(() => {
  const n = Math.ceil(lessons.length / PAGE_SIZE);
  return Array.from({ length: n }, (_, i) => lessons.slice(i * PAGE_SIZE, (i + 1) * PAGE_SIZE));
});
const carouselEl = ref<HTMLDivElement | null>(null);
const curPage = ref(0);
function recalcPage() {
  const el = carouselEl.value;
  if (!el) return;
  const max = pages.value.length - 1;
  curPage.value = Math.max(0, Math.min(max, Math.round(el.scrollLeft / el.clientWidth)));
}
function goPage(i: number) {
  const el = carouselEl.value;
  if (!el) return;
  el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
}
onMounted(() => {
  const el = carouselEl.value;
  if (el) el.addEventListener("scroll", recalcPage, { passive: true });
  window.addEventListener("resize", recalcPage);
});
onBeforeUnmount(() => {
  const el = carouselEl.value;
  if (el) el.removeEventListener("scroll", recalcPage);
  window.removeEventListener("resize", recalcPage);
});

function enter(l: Lesson) {
  // 点击卡片文字（课程英文标题）→ 朗读标题；进课程后由 LearnView 逐词发音
  speak(l.title, { ttsOnly: true });
  router.push(`/learn/lesson/${l.id}`);
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
      <button v-if="weakCount > 0" class="q-link review" @click="router.push('/learn/review')">
        <BookOpenText class="k-ico" />今天该复习 {{ weakCount }} 个词
      </button>
      <button v-if="lastLessonObj" class="q-link" @click="enter(lastLessonObj)">
        ⏩ 继续：{{ lastLessonObj.emoji }} {{ lastLessonObj.titleZh }}
      </button>
    </div>

    <!-- 课程列表：左右轮播（一页 2 课），底部小点指示器 -->
    <div class="stage">
      <div
        class="course-carousel"
        ref="carouselEl"
        role="region"
        aria-label="课程列表，可左右滑动"
      >
        <div v-for="(page, pi) in pages" :key="pi" class="cc-page">
          <button
            v-for="(l, i) in page"
            :key="l.id"
            class="lesson-card anim-pop"
            :class="'tone-' + l.tone"
            :style="{ animationDelay: (i % 3) * 0.06 + 's' }"
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
      <div v-if="pages.length > 1" class="cc-dots" role="tablist" aria-label="课程页">
        <button
          v-for="(_, i) in pages"
          :key="i"
          class="cc-dot"
          :class="{ on: curPage === i }"
          role="tab"
          :aria-selected="curPage === i"
          :aria-label="`第 ${i + 1} 页`"
          @click="goPage(i)"
        ></button>
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
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
  width: 100%;
  padding-bottom: var(--gap-s);
}
/* 左右轮播：原生 scroll-snap，滑动即换页；滚动条隐藏（小点即指示器） */
.course-carousel {
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}
.course-carousel::-webkit-scrollbar {
  display: none;
}
.cc-page {
  flex: 0 0 100%;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  /* 卡片行高 = 轮播区可用高度（iPad/手机上下撑满），120px 保底防横屏过矮 */
  grid-auto-rows: minmax(120px, 1fr);
  gap: 14px;
  padding: 2px 8px;
  scroll-snap-align: start;
}
.cc-dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 2px 0;
}
.cc-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  border: none;
  padding: 0;
  cursor: pointer;
  background: var(--ink-faint);
  opacity: 0.45;
  transition: width var(--dur-fast) var(--ease-out), background var(--dur-fast), opacity var(--dur-fast);
}
.cc-dot.on {
  width: 22px;
  background: var(--brand, #1cb0f6);
  opacity: 1;
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
