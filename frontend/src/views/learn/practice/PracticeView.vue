<script setup lang="ts">
/**
 * 课程首页（DeepSeek 风格极简设计）：
 * 顶部居中 logo + 大标题，下面是干净的课程列表
 */
import { computed, ref } from "vue";
import { activityKeys, getLesson, type Lesson } from "../../../data/lessons";
import { useContentStore } from "../../../stores/content";
import { useProgressStore } from "../../../stores/progress";
import { useRouter } from "vue-router";
import { speak } from "../../../services/speech";
import SegmentedTabs from "../../../components/ui/SegmentedTabs.vue";
import { dueWords } from "../../../utils/reviewQueue";
import { Check, ChevronRight } from "@lucide/vue";

const content = useContentStore();
const progress = useProgressStore();
const lessons = content.lessons;
const typeTab = ref<"official" | "bonus">("official");
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

const allWords = lessons.flatMap((l) => l.words);
const weakCount = computed(() => dueWords(progress.getReviewQueue(), allWords).length);
</script>

<template>
  <div class="home">
    <!-- 顶部：居中标题 -->
    <header class="hero">
      <h1 class="hero-title">丞丞学英语</h1>
      <p class="hero-sub">每天 10 分钟，开心学英语</p>
    </header>

    <!-- Tab -->
    <div class="type-tabs">
      <SegmentedTabs
        v-model="typeTab"
        :items="[
          { value: 'official', label: '正式课' },
          { value: 'bonus', label: '加餐' },
        ]"
      />
    </div>

    <!-- 课程列表：极简行式 -->
    <div class="list">
      <button
        v-for="l in filteredLessons"
        :key="l.id"
        class="row"
        @click="enter(l)"
      >
        <span class="row-emoji">{{ l.emoji }}</span>
        <div class="row-body">
          <span class="row-title">{{ l.title }}</span>
          <span class="row-sub">{{ l.titleZh }}</span>
        </div>
        <Check v-if="progress.isCompleted(l.id, activityKeys(l))" class="row-check" />
        <ChevronRight class="row-arrow" />
      </button>

      <!-- 复习入口 -->
      <button v-if="weakCount > 0" class="row row-review" @click="router.push('/course/review')">
        <span class="row-emoji">📖</span>
        <div class="row-body">
          <span class="row-title">复习一下</span>
          <span class="row-sub">{{ weakCount }} 个词需要复习</span>
        </div>
        <ChevronRight class="row-arrow" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  padding: 0 var(--pad-x);
}

/* 顶部居中 */
.hero {
  text-align: center;
  padding: 24px 0 20px;
}
.hero-title {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: var(--ink);
  letter-spacing: 0.5px;
}
.hero-sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--ink-faint);
  font-weight: 500;
}

.type-tabs {
  margin-bottom: 16px;
}

/* 列表 */
.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: var(--pad-y);
  scrollbar-width: none;
}
.list::-webkit-scrollbar { display: none; }

.row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 16px;
  margin-bottom: 10px;
  background: var(--card-bg);
  border-radius: 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  text-align: left;
  transition: transform 0.1s;
}
.row:active { transform: scale(0.98); }
.row-emoji {
  font-size: 28px;
  flex: none;
}
.row-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.row-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--ink);
}
.row-sub {
  font-size: 12px;
  color: var(--ink-faint);
}
.row-check {
  width: 18px;
  height: 18px;
  color: #22c55e;
  flex: none;
}
.row-arrow {
  width: 18px;
  height: 18px;
  color: var(--ink-faint);
  flex: none;
}
.row-review {
  background: linear-gradient(135deg, #fff7ed, #ffedd5);
}
</style>
