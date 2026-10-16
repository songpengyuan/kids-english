<script setup lang="ts">
/**
 * 今日任务卡（/learn 默认首页态，P0-1）
 * 孩子打开只做一个对的选择：复习 N + 本课下一关 + 可选磨耳朵 5 分钟。
 * 其他入口（全部课程等）降级为次级入口。
 */
import { computed } from "vue";
import { useRouter } from "vue-router";
import { lessons, getLesson, activityKeys, type Lesson } from "../../data/lessons";
import { useProgressStore } from "../../stores/progress";
import { dueWords } from "../../utils/reviewQueue";
import { speak, speakZh } from "../../services/speech";
import { Check, ChevronRight, BookOpenCheck, Headphones, RotateCcw, Grid3X3, Sparkles } from "@lucide/vue";

const emit = defineEmits<{ allLessons: [] }>();
const router = useRouter();
const progress = useProgressStore();

/** 正式课顺序（培训班实际上课顺序） */
const OFFICIAL_ORDER = ["l5", "l4", "l9"];

/** 今天到期该复习的错词数（间隔重复队列） */
const reviewCount = computed(() =>
  dueWords(progress.getReviewQueue(), lessons.flatMap((l) => l.words)).length,
);
const reviewDone = computed(() => reviewCount.value === 0);

/** 本课下一关：最近学的课优先，否则按正式课顺序第一个未全完成的课 */
const currentLesson = computed<Lesson>(() => {
  const last = progress.lastLesson ? getLesson(progress.lastLesson) : null;
  if (last && !progress.isCompleted(last.id, activityKeys(last))) return last;
  for (const id of OFFICIAL_ORDER) {
    const l = getLesson(id);
    if (l && !progress.isCompleted(l.id, activityKeys(l))) return l;
  }
  return getLesson(OFFICIAL_ORDER[0]) ?? lessons[0];
});
const lessonDone = computed(() =>
  progress.isCompleted(currentLesson.value.id, activityKeys(currentLesson.value)),
);

/** 今日磨耳朵时长（listenSec 累加，5 分钟 = 300s） */
const listenSec = computed(() => progress.todayStats?.listenSec ?? 0);
const listenDone = computed(() => listenSec.value >= 300);

const allDone = computed(() => reviewDone.value && lessonDone.value && listenDone.value);

function fmtMin(sec: number): string {
  return `${Math.floor(sec / 60)}分钟`;
}

function goReview() {
  speakZh("复习错词");
  router.push("/learn/review");
}
function goLesson() {
  const l = currentLesson.value;
  speak(l.title, { ttsOnly: true });
  router.push(`/learn/${l.id}`);
}
function goListen() {
  speakZh("磨耳朵");
  router.push("/listen");
}
function goAllLessons() {
  speakZh("全部课程");
  emit("allLessons");
}
</script>

<template>
  <div class="today">
    <!-- 今日任务 hero：品牌水蓝渐变一体卡 -->
    <div class="today-hero">
      <div class="th-top">
        <span class="th-title">今日任务</span>
        <span class="th-sub">做完这些就收工！</span>
      </div>

      <!-- 任务一：复习 -->
      <button class="task-row" :class="{ done: reviewDone }" @click="goReview">
        <span class="t-ico review"><RotateCcw class="k-ico" /></span>
        <span class="t-body">
          <span class="t-name">{{ reviewDone ? "错词都复习完啦" : `复习 ${reviewCount} 个错词` }}</span>
          <span class="t-desc">{{ reviewDone ? "今天没有要复习的" : "昨天不会的，今天再来一遍" }}</span>
        </span>
        <span class="t-state">
          <Check v-if="reviewDone" class="k-ico t-check" />
          <ChevronRight v-else class="k-ico t-arrow" />
        </span>
      </button>

      <!-- 任务二：本课下一关 -->
      <button class="task-row" :class="{ done: lessonDone }" @click="goLesson">
        <span class="t-ico lesson"><BookOpenCheck class="k-ico" /></span>
        <span class="t-body">
          <span class="t-name">{{ lessonDone ? "本课已通关！" : `下一关：${currentLesson.title}` }}</span>
          <span class="t-desc">{{ lessonDone ? "试试加餐或闯关游戏" : currentLesson.titleZh + " · 继续前进" }}</span>
        </span>
        <span class="t-state">
          <Check v-if="lessonDone" class="k-ico t-check" />
          <ChevronRight v-else class="k-ico t-arrow" />
        </span>
      </button>

      <!-- 任务三：磨耳朵（可选） -->
      <button class="task-row" :class="{ done: listenDone }" @click="goListen">
        <span class="t-ico listen"><Headphones class="k-ico" /></span>
        <span class="t-body">
          <span class="t-name">{{ listenDone ? "磨耳朵完成" : "磨耳朵 5 分钟" }}</span>
          <span class="t-desc">{{ listenDone ? "今天听了 " + fmtMin(listenSec) : "听本课的歌，泡一泡耳朵" }}</span>
        </span>
        <span class="t-state">
          <Check v-if="listenDone" class="k-ico t-check" />
          <ChevronRight v-else class="k-ico t-arrow" />
        </span>
      </button>

      <!-- 全部完成庆祝 -->
      <transition name="pop">
        <div v-if="allDone" class="th-done">
          <Sparkles class="k-ico" />
          今日任务完成啦，你真棒！
        </div>
      </transition>

      <!-- 次级入口：全部课程 -->
      <button class="all-lessons" @click="goAllLessons">
        <Grid3X3 class="k-ico" />
        全部课程
        <ChevronRight class="k-ico" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.today {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: var(--gap-s) var(--pad-x) var(--gap-m);
}
.today-hero {
  position: relative;
  overflow: hidden;
  background: var(--brand-grad, linear-gradient(135deg, #1e7fd0, #38a3e8, #6cc3f5));
  color: #fff;
  border-radius: 24px;
  box-shadow: 0 10px 26px rgba(23, 110, 180, 0.32);
  padding: clamp(14px, 2.6vh, 20px);
  display: flex;
  flex-direction: column;
  gap: clamp(8px, 1.4vh, 12px);
}
.th-top {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.th-title {
  font-weight: 900;
  font-size: clamp(20px, 3.4vh, 26px);
  letter-spacing: 0.02em;
}
.th-sub {
  font-size: 12px;
  font-weight: 800;
  opacity: 0.92;
}
/* 任务行：白底圆角，醒目可点 */
.task-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: rgba(255, 255, 255, 0.96);
  border-radius: 16px;
  padding: clamp(9px, 1.8vh, 13px) clamp(12px, 2vw, 16px);
  text-align: left;
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.12);
  transition: transform 0.1s, opacity 0.25s;
}
.task-row:active {
  transform: translateY(2px) scale(0.985);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.12);
}
.task-row.done {
  opacity: 0.82;
}
.t-ico {
  flex: none;
  width: clamp(34px, 5.4vh, 42px);
  height: clamp(34px, 5.4vh, 42px);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}
.t-ico.review { background: linear-gradient(160deg, #ffd6a5, #ffb26b); color: #7a4a00; }
.t-ico.lesson { background: linear-gradient(160deg, #b7e6ff, #8ad4ff); color: #0b5c96; }
.t-ico.listen { background: linear-gradient(160deg, #dcc7ff, #c3a6ff); color: #5b2f9e; }
.t-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.t-name {
  font-weight: 900;
  font-size: clamp(14px, 2.2vh, 17px);
  color: #26323f;
}
.t-desc {
  font-size: 11px;
  font-weight: 700;
  color: #7c8a99;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.t-state {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.t-check { color: #4daf00; width: 24px; height: 24px; }
.t-arrow { color: #9fb0c0; width: 22px; height: 22px; }

/* 全部完成庆祝 */
.th-done {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.28);
  border: 2px dashed rgba(255, 255, 255, 0.85);
  border-radius: 999px;
  padding: clamp(7px, 1.2vh, 9px) 16px;
  font-weight: 900;
  font-size: clamp(13px, 2vh, 16px);
  color: #fff;
}
.pop-enter-active, .pop-leave-active { transition: all 0.3s ease; }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: scale(0.92); }

/* 次级入口：全部课程 */
.all-lessons {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 2px;
  background: rgba(255, 255, 255, 0.22);
  border: 2px solid rgba(255, 255, 255, 0.55);
  border-radius: 999px;
  padding: clamp(8px, 1.4vh, 10px) 14px;
  color: #fff;
  font-weight: 900;
  font-size: clamp(13px, 2vh, 15px);
}
.all-lessons:active {
  transform: scale(0.97);
  background: rgba(255, 255, 255, 0.32);
}
</style>
