<script setup lang="ts">
/**
 * 自由练习首页（阶段 2-2：从 HomePage 拆分）——课时卡片网格（**上下滚动**）。
 *
 * 2026-09-28：课程列表从"翻页"改为"上下滚动"——后续课程会越加越多，
 * 滚动浏览比翻页轻松，也更贴近 App 首页"往下滑看全部课"的惯用节奏。
 *
 * 2026-10 设计系统统一：
 *  · 删掉三块早已不再渲染的死样式（闯关入口 game-map-entry / 快捷引导 q-link / gme-*），
 *    它们对应的模板此前已移除，只剩 CSS 悬在那里；
 *  · 删掉本页私有的 `.tone-*` 调色板——它和 base.css 的全局同名工具类**撞名**，
 *    而且 scoped 的 `[data-v-*]` 让局部的优先级更高，导致这一页的卡片配色是全站唯一的
 *    （比如 blue 是 #4a90d9，其它页是 #1cb0f6）。删掉后自动落回全站统一色板，
 *    连立体投影/贴纸描边/按下手感也一并统一；
 *  · 色值/字号/圆角/间距全部改回 token；横向 padding 由外层 .view 提供，去掉重复的那一层。
 */
import { computed, ref } from "vue";
import { activityKeys, type Lesson } from "../../../data/lessons";
import { useContentStore } from "../../../stores/content";
import { useProgressStore } from "../../../stores/progress";
import { useRouter } from "vue-router";
import { speak } from "../../../services/speech";
import SegmentedTabs from "../../../components/ui/SegmentedTabs.vue";
import { Check } from "@lucide/vue";

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
/** tab 定义提到 setup 顶层：模板里每次渲染都新建数组会让子组件的 props diff 白白失效 */
const TABS = [
  { value: "official", label: "正式课" },
  { value: "bonus", label: "加餐" },
];
const router = useRouter();

function enter(l: Lesson) {
  speak(l.title, { ttsOnly: true });
  router.push(`/course/${l.id}`);
}
</script>

<template>
  <div class="practice">
    <!-- 课程类型 tab -->
    <div class="type-tabs">
      <SegmentedTabs v-model="typeTab" :items="TABS" />
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
          <span class="card-emoji" aria-hidden="true">{{ l.emoji }}</span>
          <div class="card-text">
            <span class="card-title">{{ l.title }}</span>
            <span class="card-sub">{{ l.titleZh }}</span>
          </div>
          <span v-if="progress.isCompleted(l.id, activityKeys(l))" class="card-done">
            <Check class="k-ico" />
          </span>
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

/* 滚动列表：占满剩余高度，课多了往下滑 */
.type-tabs {
  margin: var(--gap-s) 0 var(--gap-m);
}
.stage {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.stage::-webkit-scrollbar {
  display: none;
}

/* 双列大卡片网格 */
.course-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--gap-s);
}
/* 彩色卡片的背景/投影/文字色由全局 .tone-* 工具类注入，这里只描述"卡片自己的形状" */
.lesson-card {
  position: relative;
  border-radius: var(--radius);
  aspect-ratio: 4 / 5;
  padding: var(--gap-l);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
  text-align: left;
  transition: transform var(--dur-fast) var(--ease-out);
}
/* 大 emoji 作为背景装饰 */
.card-emoji {
  position: absolute;
  right: -8px;
  top: 10%;
  font-size: var(--fs-emoji-xl);
  line-height: 1;
  opacity: 0.9;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.15));
}
.card-text {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--gap-xs);
}
.card-title {
  font-size: var(--fs-body);
  font-weight: var(--fw-strong);
  text-shadow: var(--tone-ink-shadow);
  line-height: 1.2;
}
.card-sub {
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  opacity: 0.85;
  text-shadow: var(--tone-ink-shadow);
}
/* 已完成角标：白底绿勾，取全局覆盖层色与语义成功色 */
.card-done {
  position: absolute;
  top: var(--gap-s);
  right: var(--gap-s);
  font-size: var(--fs-small);
  width: 2em;
  height: 2em;
  border-radius: var(--radius-pill);
  background: var(--overlay);
  color: var(--ok);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

@media (min-width: 768px) {
  .course-grid {
    grid-template-columns: 1fr 1fr 1fr;
    gap: var(--gap-m);
  }
}
</style>
