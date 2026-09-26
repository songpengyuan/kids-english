/**
 * 闯关（Quest）状态（阶段 2-3：从 LessonView 抽取）。
 *
 * 游戏模式的"一课一关"玩法：从地图点关卡进入（?mode=quest&step=<玩法>），
 * 玩完直接进关卡完成画面，再走「下一关 / 返回地图」。
 *
 * 与 useLessonFlow 的关系：本 composable 只负责"闯关身份"（模式/序列/当前关/
 * 是否完成/下一关），stage 切换、结算等流程编排仍在 useLessonFlow，
 * 通过本模块暴露的 finish() 信号驱动关卡完成大画面。
 */
import { computed, ref, type ComputedRef, type Ref } from "vue";
import type { RouteLocationNormalizedLoadedGeneric } from "vue-router";
import { buildLevels, nextLevelAfter } from "../data/pathLevels";

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
  /** 当前课时（路由 :id 解析） */
  lesson: ComputedRef<{ id: string } | null>;
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

  const questMode = computed(() => route.query.mode === "quest");
  const questSeq = computed(() => activities.value);
  const questIdx = ref(0);
  const questDone = ref(false);
  const currentActName = computed(() => questSeq.value[questIdx.value]?.name || "");

  /** 全关卡序列（pathLevels 共享数据：GamePath 地图与这里同一份） */
  const pathLevels = buildLevels();
  /** 当前关卡在整条路径中的序号（1 起，多邻国式） */
  const questLevel = computed(() => {
    const cur = questSeq.value[questIdx.value];
    if (!cur || !lesson.value) return 1;
    const lid = lesson.value?.id;
    if (!lid) return 1;
    return pathLevels.find((l) => l.id === `${lid}-${cur.key}`)?.no || 1;
  });
  /** 下一关（单关完成画面"下一关"按钮）；地图最后一关为 null */
  const nextLevel = computed(() => {
    const cur = questSeq.value[questIdx.value];
    if (!cur || !lesson.value) return null;
    return nextLevelAfter(`${lesson.value.id}-${cur.key}`, pathLevels);
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
