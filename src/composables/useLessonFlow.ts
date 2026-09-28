/**
 * 课程流程（阶段 2-3：从 LessonView 抽取）。
 *
 * 一门课的完整状态机：
 *   menu（玩法菜单）→ questStart（关卡卡）→ learn/quiz/match/speak/song/talk（玩法）
 *   → result（结算：闯关大画面 / 自由结算）
 *
 * 职责：
 *  - stage 迁移与深链解析（/lesson/:id/:stage / /quest/:id?step=）；
 *  - 结算（星数、今日学情、连击横幅、庆祝）。
 * 玩法菜单的测量/排布已内聚到 lesson/LessonMenu.vue（pickColumns 由菜单组件持有）。
 *
 * 闯关身份（questMode/关卡序号/下一关）在 useQuest 中，本模块通过
 * quest 对象协作：quest.finish() 在结算时被调用，驱动关卡完成大画面。
 */
import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import type { Router, RouteLocationNormalizedLoadedGeneric } from "vue-router";
import { lessons, type Lesson } from "../data/lessons";
import type { QuestAct, UseQuest } from "./useQuest";
import { bigCelebrate, celebrate } from "../services/effects";
import { speak, speakZh } from "../services/speech";
import { hapticTap } from "../services/haptics";

export type LessonStage = "menu" | "learn" | "quiz" | "match" | "speak" | "song" | "talk" | "result";

/** 调试/兼容深链：?lesson=l4&stage=learn 直接进入玩法页 */
const STAGES = ["learn", "quiz", "match", "speak", "song", "talk"];

export interface UseLessonFlowOptions {
  lesson: ComputedRef<Lesson | null>;
  activities: ComputedRef<QuestAct[]>;
  route: RouteLocationNormalizedLoadedGeneric;
  router: Router;
  progress: {
    setLastLesson: (id: string) => void;
    addDailyActivity: (seconds: number) => void;
    setGameStars: (lessonId: string, actKey: string, stars: number) => void;
    progress: Record<string, Record<string, unknown>>;
  };
  streak: {
    /** 完成一个关卡；firstTime = 该关首次通关（重刷不计入"新学 1 关"） */
    markNewLevel: (firstTime?: boolean) => boolean;
    todayDone: boolean;
  };
  isNarrow: ComputedRef<boolean>;
  quest: UseQuest;
}

export interface UseLessonFlow {
  stage: Ref<LessonStage>;
  lastStars: Ref<number>;
  streakJustHit: Ref<boolean>;
  lessonProgress: ComputedRef<number>;
  nextLesson: ComputedRef<Lesson | null>;
  boot: () => void;
  open: (a: QuestAct) => void;
  showStars: (key: string) => number;
  back: () => void;
  toMenu: () => void;
  afterGame: (stars?: number) => void;
  afterSong: () => void;
  backToMap: () => void;
  goNextLevel: () => void;
  settleActivity: () => void;
}

export function useLessonFlow(options: UseLessonFlowOptions): UseLessonFlow {
  const { lesson, activities, route, router, progress, streak, isNarrow, quest } = options;

  const stage = ref<LessonStage>("menu");
  const lastStars = ref(0);
  /** 今日目标刚达成（结算页显示连击横幅） */
  const streakJustHit = ref(false);
  /** 当前玩法会话开始时间戳（0 = 未开始），结算时累计进今日学情 */
  let actStart = 0;

  /* ---------- 引导（路由解析） ---------- */
  function boot() {
    if (lesson.value) progress.setLastLesson(lesson.value.id);
    // stage 子路径优先（#/lesson/l4/learn），旧 query 深链（?stage=learn）兼容
    const ps = typeof route.params.stage === "string" ? route.params.stage : "";
    const s = ps || (typeof route.query.stage === "string" ? route.query.stage : "");
    if (quest.questMode.value) {
      // 单关模式：地图点关卡直接开玩对应玩法（跳过菜单/关卡卡）
      const idx = quest.bootFromQuery();
      const a = quest.questSeq.value[idx];
      if (a) {
        stage.value = (a.game === "song" ? "song" : a.key) as LessonStage;
        actStart = Date.now();
      } else {
        stage.value = "menu";
      }
    } else if (STAGES.includes(s)) {
      stage.value = s as LessonStage;
      actStart = Date.now();
    } else {
      // 无直达 stage（含 URL 从玩法回退到 /lesson/:id）：回菜单，
      // 并报出主题歌名（英文），给孩子"这一课唱什么"的预期
      stage.value = "menu";
      setTimeout(() => speak(lesson.value?.title || ""), 400);
    }
  }

  /** 进入玩法：同步 stage 并把 URL 更新为独立子路径（题目详情标记：课 id + 题型）。
   *  · 自由：#/lesson/l4/quiz；闯关：#/quest/l4?step=quiz
   *  · replace 不堆历史（孩子误触返回键不至于层层回退） */
  function open(a: QuestAct) {
    hapticTap();
    actStart = Date.now();
    const key = (a.game === "song" ? "song" : a.key) as LessonStage;
    stage.value = key;
    const lid = lesson.value?.id;
    if (!lid) return;
    router.replace(quest.questMode.value ? `/quest/${lid}?step=${a.key}` : `/lesson/${lid}/${key}`);
  }

  /** 菜单卡片右上角的星星徽章：该玩法已获得的星数 */
  function showStars(key: string) {
    return (progress.progress[lesson.value?.id ?? ""]?.[key] as number) || 0;
  }

  /** 单关完成：直接进关卡完成大画面（多邻国：一课一节，完成即点亮 + 开宝箱） */
  function finishQuestStep() {
    quest.finish();
    bigCelebrate();
    speakZh("关卡完成，太棒了");
    stage.value = "result";
  }

  /** 返回闯关地图（游戏模式首页） */
  function backToMap() {
    router.push("/game");
  }

  /** 进入下一关（单关完成画面按钮） */
  function goNextLevel() {
    if (!quest.nextLevel.value) return;
    hapticTap();
    router.push(`/quest/${quest.nextLevel.value.lessonId}?step=${quest.nextLevel.value.actKey}`);
  }

  /** 结算一次玩法会话：累计今日时长与玩法数（家长报告数据源） */
  function settleActivity() {
    progress.addDailyActivity(actStart ? (Date.now() - actStart) / 1000 : 0);
    actStart = 0;
  }

  function afterGame(stars?: number) {
    // 兜底 1 星：玩法组件没报星数时（老调用/异常路径）至少点亮
    const s = stars || 1;
    lastStars.value = s;
    const lessonId = lesson.value?.id ?? "";
    const actKey = stage.value;
    // 首次通关判定要在写星之前取（写进去就都成"已完成"了）
    const firstTime = !((progress.progress[lessonId]?.[actKey] as number | undefined) ?? 0);
    progress.setGameStars(lessonId, actKey, s);
    settleActivity();
    // 今日目标：新学 1 关（首次通关）+ 复习到期词（复习页记）
    const first = streak.markNewLevel(firstTime);
    streakJustHit.value = first && streak.todayDone;
    if (quest.questMode.value) {
      finishQuestStep();
    } else {
      // 庆祝收敛：满分才双彩带大庆祝，其余用小彩带
      if (s >= 3) bigCelebrate();
      else celebrate();
      speakZh(s >= 3 ? "太厉害了，满分三颗星" : "做得好，继续加油");
      stage.value = "result";
    }
  }

  function afterSong() {
    stage.value = "result";
    lastStars.value = 1;
    // 童谣星数由 SongView 内部记（markSong 幂等），这里只累计今日学情
    settleActivity();
    const first = streak.markNewLevel(true);
    streakJustHit.value = first && streak.todayDone;
    if (quest.questMode.value) finishQuestStep();
  }

  const lessonProgress = computed(() => {
    const done = (progress.progress[lesson.value?.id ?? ""]?.completed as string[])?.length || 0;
    return Math.min(100, Math.round((done / activities.value.length) * 100));
  });

  /** 左上角 ←：玩法中先回本课菜单，菜单里再点才回课程列表（两步退出，防止误触跳走） */
  function back() {
    if (!quest.questMode.value && stage.value !== "menu") {
      // 玩法中：回本课菜单，URL 同步去掉题型段（/lesson/l4）
      stage.value = "menu";
      const lid = lesson.value?.id;
      if (lid) router.replace(`/lesson/${lid}`);
      return;
    }
    router.push(quest.questMode.value ? "/game" : "/learn");
  }

  function toMenu() {
    stage.value = "menu";
    // 结算页"再选玩法"：URL 同步回菜单（/lesson/l4）
    const lid = lesson.value?.id;
    if (lid && !quest.questMode.value) router.replace(`/lesson/${lid}`);
  }

  /** 下一课（当前课是最后一课则为 null，结算页隐藏该按钮） */
  const nextLesson = computed<Lesson | null>(() => {
    const i = lessons.findIndex((l) => l.id === lesson.value?.id);
    return i >= 0 ? lessons[i + 1] || null : null;
  });

  return {
    stage,
    lastStars,
    streakJustHit,
    lessonProgress,
    nextLesson,
    boot,
    open,
    showStars,
    back,
    toMenu,
    afterGame,
    afterSong,
    backToMap,
    goNextLevel,
    settleActivity
  };
}
