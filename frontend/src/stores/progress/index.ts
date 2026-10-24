/**
 * 学习进度 store —— 门面（Pinia + TS，localStorage 持久化）。
 *
 * 模块布局（四次评审 2026-10-24：单 store 门面 + 领域模块）：
 *   shared.ts    类型 + 存储格式（load 迁移 / 合并口径 / 键名冻结）
 *   course.ts    课程进度：星数读写 / 通关判定 / 关卡解锁
 *   words.ts     单词掌握度：学习事件 + SRS 队列 + 概览
 *   daily.ts     今日学情：_daily / _dailyLog 快照 / 磨耳朵埋点聚合
 *   cloudSync.ts 云同步状态机：防抖上报 / 拉取合并 / 心跳 flushIfDirty
 *
 * 刻意**不拆成多个 Pinia store**：持久化文档是同一份（shared.KEY），
 * daily 依赖 words 的 masterySummary、云同步读写全部域——拆 store 会把
 * 一份文档人为割裂；拆模块则各域可独立演进，公共 API 在这里收口。
 * 消费方导入路径 `../stores/progress` 不变（目录 index 即原 progress.ts）。
 *
 * 说明：从 src/store/progress.js 迁移而来（行为与存储键完全一致），
 * 统一进 Pinia 是为了"游戏模式"上线后进度/奖励/模式状态共用一套响应式基建。
 */
import { defineStore } from "pinia";
import { computed, reactive } from "vue";
import { createCloudSync } from "./cloudSync";
import { createCourseProgress } from "./course";
import { createDailyStats } from "./daily";
import { KEY, load, type ProgressMap } from "./shared";
import { createWordMastery } from "./words";

// 消费方从 "../stores/progress" 导入的类型/工具（含 ReportView 的 isLessonKey）
export * from "./shared";

export const useProgressStore = defineStore("progress", () => {
  /** 必须用 reactive 包装：LessonView/HomePage 里的 computed 依赖它，
   *  普通对象不会建立响应式依赖，进度更新后 computed 缓存永不失效 */
  const progress = reactive<ProgressMap>(load());

  /* ---------- 云同步（P0：进度上云） ---------- */
  const cloud = createCloudSync(progress);

  /** 持久化 + 标记脏 + 起 3s 防抖上报（所有变更动作的统一出口） */
  function save() {
    localStorage.setItem(KEY, JSON.stringify(progress));
    cloud.noteSaved();
  }

  const course = createCourseProgress({ progress, save });
  const words = createWordMastery({ progress, save });
  const daily = createDailyStats({ progress, save, masterySummary: words.masterySummary });

  /* ---------- 最近课程（首页"继续学习"） ---------- */

  function setLastLesson(id: string) {
    progress._last = id;
    save();
  }

  const lastLesson = computed<string | null>(() => progress._last || null);

  function reset() {
    Object.keys(progress).forEach((k) => delete progress[k]);
    localStorage.removeItem(KEY);
  }

  return {
    progress,
    ...course,
    ...words,
    ...daily,
    setLastLesson,
    lastLesson,
    reset,
    // 云同步
    cloudState: cloud.cloudState,
    syncFromServer: cloud.syncFromServer,
    flushReport: cloud.flushReport,
    flushIfDirty: cloud.flushIfDirty,
  };
});
