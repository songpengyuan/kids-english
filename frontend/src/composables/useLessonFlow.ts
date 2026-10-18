/**
 * 课程流程（阶段 2-3：从 LessonView 抽取）。
 *
 * 一门课的完整状态机：
 *   menu（玩法菜单）→ song/learn/quiz/match/speak/talk（玩法）
 *   → result（结算：闯关大画面 / 自由结算）
 *
 * 职责：
 *  - stage 迁移与深链解析（/course/:id/:stage / /quest/:id?step=）；
 *  - 结算（星数、今日学情、连击横幅、庆祝）。
 * 玩法菜单的测量/排布已内聚到 lesson/LessonMenu.vue（pickColumns 由菜单组件持有）。
 *
 * 闯关身份（questMode/关卡序号/下一关）在 useQuest 中，本模块通过
 * quest 对象协作：quest.finish() 在结算时被调用，驱动关卡完成大画面。
 */
import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import type { Router, RouteLocationNormalizedLoadedGeneric } from "vue-router";
import type { Lesson } from "../data/lessons";
import { useContentStore } from "../stores/content";
import type { QuestAct, UseQuest } from "./useQuest";
import { bigCelebrate, celebrate } from "../services/effects";
import { speak, speakZh } from "../services/speech";
import { hapticTap } from "../services/haptics";
import { track } from "../services/telemetry";

/**
 * 课时流程阶段。
 * 曾经还有一个 `questMap`（课内闯关地图）——现在闯关是独立的 `/course/:id/game`，
 * 课内不再画地图，这个阶段已下线（LessonView 里的分支与 LessonQuestMap 组件一并删除）。
 */
export type LessonStage = "menu" | "learn" | "quiz" | "match" | "speak" | "song" | "talk" | "result";

/** 调试/兼容深链：?lesson=l4&stage=learn 直接进入玩法页 */
const STAGES = ["learn", "quiz", "match", "speak", "song", "talk"];

export interface UseLessonFlowOptions {
  /** 当前课时（本地兜底 + 远端异步覆盖；Ref 兼容 computed 与可变引用） */
  lesson: Ref<Lesson | null>;
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
  /** 当前玩法名（与 actStart 同步设置）。结算时 stage 可能已被改成 result，
   *  所以不能就地读 stage —— 那样埋点里的 activity 会全变成 "result"。 */
  let actKey = "";

  /* ---------- 引导（路由解析） ---------- */
  function boot() {
    if (lesson.value) progress.setLastLesson(lesson.value.id);
    // stage 来源：路由名（lesson-quiz → quiz）> params.stage > query.stage
    const nameStage = typeof route.name === "string" && route.name.startsWith("lesson-")
      ? route.name.slice("lesson-".length)
      : "";
    const ps = typeof route.params.stage === "string" ? route.params.stage : "";
    const s = nameStage || ps || (typeof route.query.stage === "string" ? route.query.stage : "");
    if (quest.questMode.value) {
      // 单关模式：地图点关卡直接开玩对应玩法（跳过菜单/关卡卡）
      const idx = quest.bootFromQuery();
      const a = quest.questSeq.value[idx];
      if (a) {
        stage.value = (a.game === "song" ? "song" : a.key) as LessonStage;
        actStart = Date.now();
        actKey = stage.value;
      } else {
        stage.value = "menu";
      }
    } else if (STAGES.includes(s)) {
      stage.value = s as LessonStage;
      actStart = Date.now();
      actKey = stage.value;
    } else {
      // 无直达 stage（含 URL 从玩法回退到 /course/:id）：回菜单，
      // 并报出主题歌名（英文），给孩子"这一课唱什么"的预期
      stage.value = "menu";
      setTimeout(() => speak(lesson.value?.title || ""), 400);
    }
  }

  /** 进入玩法：同步 stage 并把 URL 更新为独立子路径（题目详情标记：课 id + 题型）。
   *  · 自由：#/course/l4/quiz；闯关：#/quest/l4?step=quiz
   *  · replace 不堆历史（孩子误触返回键不至于层层回退） */
  function open(a: QuestAct) {
    hapticTap();
    const key = (a.game === "song" ? "song" : a.key) as LessonStage;
    actStart = Date.now();
    actKey = key;
    stage.value = key;
    const lid = lesson.value?.id;
    if (!lid) return;
    router.replace(quest.questMode.value ? `/game/quest/${lid}?step=${a.key}` : `/course/${lid}/${key === "quiz" ? "hear" : key}`);
  }

  /** 菜单卡片右上角的星星徽章：该玩法已获得的星数 */
  function showStars(key: string) {
    return (progress.progress[lesson.value?.id ?? ""]?.[key] as number) || 0;
  }

  /** 通过一关（闯关模式）：埋点。视觉反馈由调用方按场景决定（大画面 / 直接下一关） */
  function markLevelPass() {
    track("level_pass", {
      lesson_id: lesson.value?.id ?? "",
      level: quest.questLevel.value,
    });
  }

  /** 单关完成：直接进关卡完成大画面（多邻国：一课一节，完成即点亮 + 开宝箱） */
  function finishQuestStep() {
    quest.finish();
    markLevelPass();
    bigCelebrate();
    speakZh("关卡完成，太棒了");
    stage.value = "result";
  }

  /** 返回闯关地图：回到当前课的地图（#/course/:id/game，只服务本课） */
  function backToMap() {
    router.push(`/course/${lesson.value?.id ?? ""}/game`);
  }

  /** 进入下一关（单关完成画面按钮） */
  function goNextLevel() {
    if (!quest.nextLevel.value) return;
    hapticTap();
    router.push(`/game/quest/${quest.nextLevel.value.lessonId}?step=${quest.nextLevel.value.actKey}`);
  }

  /** 结算一次玩法会话：累计今日时长与玩法数（家长报告数据源），并上报埋点 */
  function settleActivity() {
    const sec = actStart ? (Date.now() - actStart) / 1000 : 0;
    const key = actKey;
    progress.addDailyActivity(sec);
    actStart = 0;
    actKey = "";
    // 埋点（ADR-004）：把这次玩法会话记为一条 activity_done。
    // 与 addDailyActivity **同源但不同口径**：这条进 events → daily_stats，
    // 供北极星「每周主动学习分钟数」用；addDailyActivity 是家长报告的展示口径。
    // 两者数字不一致是正常的，不要互相读（见 docs/PROGRESS-DATA.md §7）。
    // <1s 视为误触，不上报 —— 否则菜单来回点会刷出大量 0 秒事件。
    if (sec >= 1) {
      track("activity_done", {
        lesson_id: lesson.value?.id ?? "",
        activity: key,
        seconds: Math.round(sec),
      });
    }
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
      // 玩法中：回本课菜单，URL 同步去掉题型段（/course/l4）
      stage.value = "menu";
      const lid = lesson.value?.id;
      if (lid) router.replace(`/course/${lid}`);
      return;
    }
    router.push(quest.questMode.value ? `/course/${lesson.value?.id ?? ""}/game` : "/course");
  }

  function toMenu() {
    stage.value = "menu";
    // 结算页"再选玩法"：URL 同步回菜单（/course/l4）
    const lid = lesson.value?.id;
    if (lid && !quest.questMode.value) router.replace(`/course/${lid}`);
  }

  /** 下一课（与课程列表同源：远端详情优先、本地兜底；最后一课为 null） */
  const nextLesson = computed<Lesson | null>(() => {
    const all = useContentStore().lessons;
    const i = all.findIndex((l) => l.id === lesson.value?.id);
    return i >= 0 ? all[i + 1] || null : null;
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
