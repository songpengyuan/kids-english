/**
 * 学习进度 store（Pinia + TS，localStorage 持久化）
 * stars: { [lessonId]: { learn: 0-3, quiz: 0-3, match: 0-3, speak: 0-3, song: 0|1, talk: 0|1 } }
 *
 * ⚠️ KEY 里的 kids-english 是**历史存储键名**，不要跟着应用显示名一起改。
 * 改了会读不到已有数据，孩子攒的星星就全没了。
 *
 * 说明：从 src/store/progress.js 迁移而来（行为与存储键完全一致），
 * 统一进 Pinia 是为了"游戏模式"上线后进度/奖励/模式状态共用一套响应式基建。
 */
import { defineStore } from "pinia";
import { computed, reactive } from "vue";

/** 单课进度：各玩法星数 + 玩过的玩法列表 */
export interface LessonProgress {
  learn?: number;
  quiz?: number;
  match?: number;
  speak?: number;
  song?: number;
  talk?: number;
  completed?: string[];
}

const KEY = "kids-english-progress-v1";

function load(): Record<string, LessonProgress> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export const useProgressStore = defineStore("progress", () => {
  /** 必须用 reactive 包装：LessonView/HomePage 里的 computed 依赖它，
   *  普通对象不会建立响应式依赖，进度更新后 computed 缓存永不失效 */
  const progress = reactive<Record<string, LessonProgress>>(load());

  function save() {
    localStorage.setItem(KEY, JSON.stringify(progress));
  }

  const totalStars = computed(() =>
    Object.values(progress).reduce(
      (sum, l) =>
        sum +
        (l.learn || 0) + (l.quiz || 0) + (l.match || 0) + (l.speak || 0) +
        (l.song || 0) + (l.talk || 0),
      0
    )
  );

  /** 一课的总星数（菜单进度条/关卡图用） */
  function lessonStars(id: string): number {
    const l = progress[id];
    if (!l) return 0;
    return (
      (l.learn || 0) + (l.quiz || 0) + (l.match || 0) + (l.speak || 0) +
      (l.song || 0) + (l.talk || 0)
    );
  }

  function setGameStars(id: string, game: string, stars: number) {
    const prev = progress[id] || {};
    // game 只会是玩法名（learn/quiz/...），不会是 completed 数组字段
    const key = game as Exclude<keyof LessonProgress, "completed">;
    if ((prev[key] || 0) < stars) prev[key] = stars;
    prev.completed = prev.completed || [];
    if (!prev.completed.includes(game)) prev.completed.push(game);
    progress[id] = prev;
    save();
  }

  /** 童谣完成：只记 1 分，同时计入"玩过的玩法" */
  function markSong(id: string) {
    const prev = progress[id] || {};
    prev.song = 1;
    prev.completed = prev.completed || [];
    if (!prev.completed.includes("song")) prev.completed.push("song");
    progress[id] = prev;
    save();
  }

  /** "学完"判定：玩过 ≥3 种玩法（历史口径，HomePage 通关徽章沿用） */
  function isCompleted(id: string): boolean {
    const l = progress[id];
    return !!(l && l.completed && l.completed.length >= 3);
  }

  /** 玩过该课（有任一玩法记录）——游戏模式解锁下一关的依据 */
  function isPlayed(id: string): boolean {
    const l = progress[id];
    return !!(l && l.completed && l.completed.length > 0);
  }

  /**
   * 游戏模式关卡解锁：第一课总是解锁；其余需前一课玩过任一玩法。
   * @param lessonIds 按出场顺序的课程 id 列表
   */
  function isUnlocked(id: string, lessonIds: string[]): boolean {
    const idx = lessonIds.indexOf(id);
    if (idx <= 0) return true;
    return isPlayed(lessonIds[idx - 1]);
  }

  function reset() {
    Object.keys(progress).forEach((k) => delete progress[k]);
    localStorage.removeItem(KEY);
  }

  return {
    progress,
    totalStars,
    lessonStars,
    setGameStars,
    markSong,
    isCompleted,
    isPlayed,
    isUnlocked,
    reset
  };
});
