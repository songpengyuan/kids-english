/**
 * 闯关（Quest）状态（阶段 2-3：从 LessonView 抽取）。
 *
 * 游戏模式的"一课一关"玩法：独立路由 #/game/quest/:id?step=<玩法>，
 * 玩完直接进关卡完成画面，再走「下一关 / 返回地图」。
 *
 * **作用域 = 当前课**（2026-10-17 收口）：关卡序号取本课内序号（第 1…N 关），
 * 「下一关」只在本课内推进，最后一关返回 null —— 否则从本课地图点进去，
 * 玩完最后一关会被悄悄带到下一门课（旧实现按全站序列推进的真实 bug）。
 *
 * 与 useLessonFlow 的关系：本 composable 只负责"闯关身份"（模式/序列/当前关/
 * 是否完成/下一关），stage 切换、结算等流程编排仍在 useLessonFlow，
 * 通过本模块暴露的 finish() 信号驱动关卡完成大画面。
 */
import { computed, ref, type ComputedRef, type Ref } from "vue";
import type { RouteLocationNormalizedLoadedGeneric } from "vue-router";
import type { Lesson } from "../data/lessons";
import { lessonLevels, nextLevelAfter } from "../data/pathLevels";

export interface QuestAct {
  key: string;
  name: string;
  game: string;
  tone: string;
  desc: string;
  /** 菜单卡片图标（lucide 组件） */
  icon: unknown;
}

export interface UseQuestOptions {
  /** 当前课时（路由 :id 解析；Ref 兼容 computed 与可变引用；远端详情亦可） */
  lesson: Ref<Lesson | null>;
  /** 玩法序列（依赖 lesson.phrases 动态生成） */
  activities: ComputedRef<QuestAct[]>;
  route: RouteLocationNormalizedLoadedGeneric;
}

export interface UseQuest {
  questMode: ComputedRef<boolean>;
  questSeq: ComputedRef<QuestAct[]>;
  questIdx: Ref<number>;
  questDone: Ref<boolean>;
  currentActName: ComputedRef<string>;
  questLevel: ComputedRef<number>;
  nextLevel: ComputedRef<{ lessonId: string; actKey: string; name: string } | null>;
  /** 从路由 query 解析并定位当前关（地图 ?step=）；返回解析到的玩法下标 */
  bootFromQuery: () => number;
  /** 关卡完成（驱动结算大画面） */
  finish: () => void;
  reset: () => void;
}

export function useQuest(options: UseQuestOptions): UseQuest {
  const { lesson, activities, route } = options;

  /** 闯关身份：独立路由 #/game/quest/...（不再 ?mode=quest 参数）；按路由名判定而非 path 前缀 */
  const questMode = computed(() => route.name === "quest");
  const questSeq = computed(() => activities.value);
  const questIdx = ref(0);
  const questDone = ref(false);
  const currentActName = computed(() => questSeq.value[questIdx.value]?.name || "");

  /** 全关卡序列：**本课作用域**（不是全站序列）——序号/下一关都只在本课内 */
  const pathLevels = computed(() => (lesson.value ? lessonLevels(lesson.value) : []));
  /** 当前关卡在本课内的序号（1 起，第 1…N 关） */
  const questLevel = computed(() => {
    const cur = questSeq.value[questIdx.value];
    const lid = lesson.value?.id;
    if (!cur || !lid) return 1;
    return pathLevels.value.find((l) => l.id === `${lid}-${cur.key}`)?.no || 1;
  });
  /** 下一关（单关完成画面"下一关"按钮）：只在本课内推进，本课最后一关为 null */
  const nextLevel = computed(() => {
    const cur = questSeq.value[questIdx.value];
    const lid = lesson.value?.id;
    if (!cur || !lid) return null;
    return nextLevelAfter(`${lid}-${cur.key}`, pathLevels.value);
  });

  function bootFromQuery(): number {
    const step = typeof route.query.step === "string" ? route.query.step : "";
    const idx = questSeq.value.findIndex((a) => a.key === step);
    const i = idx >= 0 ? idx : 0;
    questIdx.value = i;
    questDone.value = false;
    return i;
  }

  function finish() {
    questDone.value = true;
  }
  function reset() {
    questIdx.value = 0;
    questDone.value = false;
  }

  return {
    questMode,
    questSeq,
    questIdx,
    questDone,
    currentActName,
    questLevel,
    nextLevel,
    bootFromQuery,
    finish,
    reset
  };
}
