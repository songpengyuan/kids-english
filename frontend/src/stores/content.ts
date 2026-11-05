/**
 * 内容 store（P0）：课程列表/详情。
 *
 * 数据源（2026-11-05 起纯前端）：课程内容是公开静态数据，直接使用本地
 * src/data/lessons（lessons.ts 是唯一人工书写源），不再请求后端
 * /api/v1/content——该路由已随「课程内容改纯前端」下线（后端 content.py
 * 删除、lessons 表不再导入）。内容更新随前端构建发布，不再有
 * 「后端旧内容盖掉前端新内容」的种子漂移问题。
 *
 * loadFromServer() 保留为空操作以兼容既有调用方（App.vue / GateView.vue）。
 */
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { lessons as localLessons, getLesson as getLocalLesson } from "../data/lessons";
import type { Lesson } from "../data/lessons";
import type { LessonSummary } from "../types";

export const useContentStore = defineStore("content", () => {
  /** 兼容字段：内容纯前端后不再有远端概要，恒为空列表 */
  const summaries = ref<LessonSummary[]>([]);
  /** 兼容字段：详情缓存；getLesson 直接回本地静态，此缓存不再写入 */
  const detailCache = ref<Record<string, Lesson>>({});
  /** 数据源标记：恒为 "local"（内容随构建发布，没有远端分支） */
  const source = ref<"local" | "remote">("local");

  /** 当前可用的课程全量（本地静态，按课程数字序 l4,l5,…,l10） */
  const lessons = computed<Lesson[]>(() => localLessons);

  /** 课程概要列表（由本地静态数据推导） */
  const lessonList = computed<LessonSummary[]>(() =>
    localLessons.map((l) => ({
      id: l.id,
      order_no: Number(l.id.replace(/\D/g, "")),
      title: l.title,
      title_zh: l.titleZh,
      emoji: l.emoji,
      tone: l.tone,
      type: l.type,
      date: l.date ?? null,
    })),
  );

  /** 兼容空操作：历史上登录后从 /api/v1/content 拉取概要；内容纯前端后无事可做 */
  async function loadFromServer(): Promise<void> {}

  /** 取课程详情：本地静态数据（未知 id 返回 null，与旧远端 404 兜底语义一致） */
  async function getLesson(id: string): Promise<Lesson | null> {
    return getLocalLesson(id);
  }

  return { summaries, detailCache, source, lessons, lessonList, loadFromServer, getLesson };
});
