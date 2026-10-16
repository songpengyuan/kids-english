<script setup lang="ts">
/**
 * 自由练习首页（阶段 2-2：从 HomePage 拆分）。
 * 快捷引导（复习/继续学习）+ 课时卡片网格（**上下滚动**）。
 *
 * 2026-09-28：课程列表从"翻页"改为"上下滚动"——后续课程会越加越多，
 * 滚动浏览比翻页轻松，也更贴近 App 首页"往下滑看全部课"的惯用节奏。
 */
import { computed, ref } from "vue";
import { activityKeys, getLesson, type Lesson } from "../../../data/lessons";
import { useContentStore } from "../../../stores/content";
import { useProgressStore } from "../../../stores/progress";
import { useRouter } from "vue-router";
import { speak } from "../../../services/speech";
import SpeakText from "../../../components/ui/SpeakText.vue";
import SegmentedTabs from "../../../components/ui/SegmentedTabs.vue";
import { dueWords } from "../../../utils/reviewQueue";
import { BookOpenText, Check } from "@lucide/vue";

const content = useContentStore();
const progress = useProgressStore();
/** 课程数据源：后端内容 API 优先（远端详情为准、本地补缺口），离线自动回退本地静态 */
const lessons = content.lessons;
/** 课程类型筛选：official=培训班课程，bonus=自定义加餐 */
const typeTab = ref<"official" | "bonus">("official");
/** 正式课显示顺序：音乐 → 水手 → 手指（培训班实际上课顺序） */
const OFFICIAL_ORDER = ["l5", "l4", "l9"];
const filteredLessons = computed(() => {
  const list = lessons.filter((l) => l.type === typeTab.value);
  if (typeTab.value === "official") {
    return [...list].sort((a, b) => OFFICIAL_ORDER.indexOf(a.id) - OFFICIAL_ORDER.indexOf(b.id));
  }
  return list;
});
const router = useRouter();

function enter(l: Lesson) {
  speak(l.title, { ttsOnly: true });
  router.push(`/course/${l.id}`);
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
    <!-- 课程类型 tab -->
    <div class="type-tabs">
      <SegmentedTabs
        v-model="typeTab"
        :items="[
          { value: 'official', label: '正式课' },
          { value: 'bonus', label: '加餐' },
        ]"
      />
    </div>

    <!-- 课程列表：竖滑双列大卡片（汽水音乐风） -->
    <div class="stage">
      <div class="course-grid">
        <button
          v-for="(l, i) in filteredLessons"
          :key="l.id"
          class="lesson-card anim-pop"
          :class="'tone-' + l.tone"
          :style="{ animationDelay: i * 0.04 + 's' }"
          @click="enter(l)"
        >
          <span class="card-emoji">{{ l.emoji }}</span>
          <div class="card-text">
            <span class="card-title">{{ l.title }}</span>
            <span class="card-sub">{{ l.titleZh }}</span>
          </div>
          <span class="card-done" v-if="progress.isCompleted(l.id, activityKeys(l))">
            <Check class="k-ico" />
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-map-entry {
  display: flex; align-items: center; gap: var(--gap-m);
  width: 100%; margin: 0 var(--pad-x);
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-m);
  text-align: left;
}
.gme-ico { font-size: 36px; }
.gme-body { flex: 1; }
.gme-title { display: block; font-weight: 900; font-size: var(--fs-body); color: #92400e; }
.gme-desc { display: block; font-size: 12px; font-weight: 700; color: #b45309; }
.gme-arrow { font-size: 28px; font-weight: 900; color: #b45309; }
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
.type-tabs {
  padding: 0 var(--pad-x);
  margin: var(--gap-s) 0 var(--gap-m);
}
.stage {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 var(--pad-x) var(--gap-m);
  scrollbar-width: none;
}
.stage::-webkit-scrollbar { display: none; }

/* 双列大卡片网格 */
.course-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.lesson-card {
  position: relative;
  border-radius: 18px;
  aspect-ratio: 4 / 5;
  padding: 14px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
  transition: transform 0.1s;
  text-align: left;
}
.lesson-card:active {
  transform: scale(0.97);
}
/* 大 emoji 作为背景装饰 */
.card-emoji {
  position: absolute;
  right: -8px;
  top: 10%;
  font-size: 88px;
  line-height: 1;
  opacity: 0.9;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.15));
}
.card-text {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.card-title {
  font-size: 17px;
  font-weight: 900;
  color: #fff;
  text-shadow: 0 2px 6px rgba(0,0,0,0.35);
  line-height: 1.2;
}
.card-sub {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255,255,255,0.85);
  text-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
.card-done {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(255,255,255,0.9);
  color: #22c55e;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}
.card-done .k-ico { width: 14px; height: 14px; }

/* 课程色调背景（渐变） */
.tone-blue   { background: linear-gradient(135deg, #4a90d9, #2b6cb0); }
.tone-orange { background: linear-gradient(135deg, #f6993f, #ed8936); }
.tone-pink   { background: linear-gradient(135deg, #ed64a6, #d53f8c); }
.tone-green  { background: linear-gradient(135deg, #48bb78, #38a169); }
.tone-purple { background: linear-gradient(135deg, #9f7aea, #805ad5); }
.tone-red    { background: linear-gradient(135deg, #f56565, #e53e3e); }
.tone-teal   { background: linear-gradient(135deg, #4fd1c5, #38b2ac); }
.tone-yellow { background: linear-gradient(135deg, #ecc94b, #d69e2e); }

@media (min-width: 768px) {
  .course-grid {
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
  }
  .card-emoji { font-size: 110px; }
  .card-title { font-size: 19px; }
}

</style>
