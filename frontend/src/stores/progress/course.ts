/**
 * 课程进度域：星数读写 / 通关判定 / 关卡解锁。
 * 只操作课程 id 为键的条目（元字段见 shared.META_KEYS），不感知单词掌握度与今日学情。
 */
import { computed, type ComputedRef } from "vue";
import { isLessonKey, sumStars, type LessonProgress, type ProgressMap } from "./shared";

export interface CourseProgressDomain {
  totalStars: ComputedRef<number>;
  lessonStars: (id: string) => number;
  setGameStars: (id: string, game: string, stars: number) => void;
  markChest: (id: string) => void;
  markSong: (id: string) => void;
  isCompleted: (id: string, keys: string[]) => boolean;
  isPlayed: (id: string) => boolean;
  isUnlocked: (id: string, lessonIds: string[]) => boolean;
}

export function createCourseProgress(opts: {
  progress: ProgressMap;
  /** 持久化 + 触发云上报（门面 save()，见 index.ts） */
  save: () => void;
}): CourseProgressDomain {
  const { progress, save } = opts;

  const totalStars = computed(() =>
    Object.keys(progress)
      .filter(isLessonKey)
      .reduce((sum, id) => sum + sumStars(progress[id]), 0)
  );

  /** 一课的总星数（菜单进度条/关卡图用） */
  function lessonStars(id: string): number {
    return sumStars(progress[id]);
  }

  function setGameStars(id: string, game: string, stars: number) {
    const prev = progress[id] || {};
    // game 只会是玩法名（learn/quiz/...），不会是 completed 数组字段
    const key = game as Exclude<keyof LessonProgress, "completed" | "words">;
    if ((prev[key] || 0) < stars) prev[key] = stars;
    prev.completed = prev.completed || [];
    if (!prev.completed.includes(game)) prev.completed.push(game);
    progress[id] = prev;
    save();
  }

  /** 宝箱关领取记录：completed 含 chest（地图宝箱关卡一次性奖励） */
  function markChest(id: string) {
    const prev = progress[id] || {};
    prev.completed = prev.completed || [];
    if (!prev.completed.includes("chest")) prev.completed.push("chest");
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

  /**
   * "学完"判定（新口径）：该课全部玩法都玩过 **且星级达标**——
   * song/talk 需 ≥1 分，其余玩法（learn/quiz/memory/match/speak/order）需 ≥2 星
   *（玩法 key/顺序统一由 activityKeys 提供）。
   * 旧的"玩过 ≥3 种玩法"口径会让 1 星的课也显示"全部通关"，语义失真。
   * @param keys 该课的玩法 key 列表（data/lessons 的 activityKeys 提供）
   */
  function isCompleted(id: string, keys: string[]): boolean {
    const l = progress[id];
    if (!l) return false;
    // 提出来再判空：闭包内访问 reactive 属性 TS 不做收窄
    const completed = l.completed;
    if (!completed || keys.length === 0) return false;
    if (keys.some((k) => !completed.includes(k))) return false;
    return keys.every((k) => {
      const stars = (l as unknown as Record<string, number>)[k] || 0;
      return k === "song" || k === "talk" ? stars >= 1 : stars >= 2;
    });
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

  return { totalStars, lessonStars, setGameStars, markChest, markSong, isCompleted, isPlayed, isUnlocked };
}
