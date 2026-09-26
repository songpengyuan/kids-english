/**
 * 课程流程（阶段 2-3：从 LessonView 抽取）。
 *
 * 一门课的完整状态机：
 *   menu（玩法菜单）→ questStart（关卡卡）→ learn/quiz/match/speak/song/talk（玩法）
 *   → result（结算：闯关大画面 / 自由结算）
 *
 * 职责：
 *  - stage 迁移与深链解析（?lesson=&stage= / ?mode=quest&step=）；
 *  - 玩法菜单测量与自适应排布（pickColumns）；
 *  - 结算（星数、今日学情、连击横幅、庆祝）。
 *
 * 闯关身份（questMode/关卡序号/下一关）在 useQuest 中，本模块通过
 * quest 对象协作：quest.finish() 在结算时被调用，驱动关卡完成大画面。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type ComputedRef, type Ref } from "vue";
import type { Router, RouteLocationNormalizedLoadedGeneric } from "vue-router";
import { lessons, type Lesson } from "../data/lessons";
import type { QuestAct, UseQuest } from "./useQuest";
import { bigCelebrate, celebrate } from "../utils/effects";
import { speak, speakZh } from "../utils/speech";
import { hapticTap } from "../utils/haptics";
import { pickColumns } from "../utils/layout";

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
    markActivity: () => boolean;
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
  actsEl: Ref<HTMLDivElement | null>;
  actsStyle: ComputedRef<Record<string, string>>;
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

  /* ---------- 玩法卡片排布测量 ---------- */
  const GAP = 12;
  const MIN_W = 130;
  const MIN_H = 96;
  const actsEl = ref<HTMLDivElement | null>(null);
  const area = reactive({ w: 0, h: 0 });
  let ro: ResizeObserver | null = null;
  let raf: number | null = null;

  function measure() {
    const el = actsEl.value;
    if (!el) return;
    const r = el.getBoundingClientRect();
    area.w = r.width;
    area.h = r.height;
  }
  function scheduleMeasure() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = null;
      measure();
    });
  }
  onMounted(() => {
    measure();
    ro = new ResizeObserver(scheduleMeasure);
    if (actsEl.value) ro.observe(actsEl.value);
  });
  onBeforeUnmount(() => {
    if (ro) ro.disconnect();
    if (raf) cancelAnimationFrame(raf);
  });

  const actsStyle = computed(() => {
    const cols = !area.w || !area.h
      ? isNarrow.value ? 2 : 3
      : pickColumns({
          width: area.w,
          height: area.h,
          count: activities.value.length,
          minCardW: MIN_W,
          minCardH: MIN_H,
          gap: GAP,
          maxCols: isNarrow.value ? 2 : 5,
          targetAspect: 1.25
        }).cols;
    return { "--cols": String(cols), "--grid-gap": `${GAP}px` };
  });

  /* ---------- 引导（路由解析） ---------- */
  function boot() {
    if (lesson.value) progress.setLastLesson(lesson.value.id);
    const s = typeof route.query.stage === "string" ? route.query.stage : "";
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
      // 进入课程时报出主题歌名（英文），给孩子"这一课唱什么"的预期
      setTimeout(() => speak(lesson.value?.title || ""), 400);
    }
  }

  function open(a: QuestAct) {
    hapticTap();
    actStart = Date.now();
    stage.value = (a.game === "song" ? "song" : a.key) as LessonStage;
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
    router.push({ path: "/", query: { mode: "game" } });
  }

  /** 进入下一关（单关完成画面按钮） */
  function goNextLevel() {
    if (!quest.nextLevel.value) return;
    hapticTap();
    router.push(`/lesson/${quest.nextLevel.value.lessonId}?mode=quest&step=${quest.nextLevel.value.actKey}`);
  }

  /** 结算一次玩法会话：累计今日时长与玩法数（家长报告数据源） */
  function settleActivity() {
    progress.addDailyActivity(actStart ? (Date.now() - actStart) / 1000 : 0);
    actStart = 0;
  }

  function afterGame(stars?: number) {
    // learn 玩法完成不传星数（emit("done") 无参数），兜底为 1 星：完成即点亮
    const s = stars || 1;
    lastStars.value = s;
    progress.setGameStars(lesson.value?.id ?? "", stage.value, s);
    settleActivity();
    // 完成玩法 → 记今日目标；今天第一次达成时结算页亮横幅
    const first = streak.markActivity();
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
    const first = streak.markActivity();
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
      stage.value = "menu";
      return;
    }
    router.push(quest.questMode.value ? { path: "/", query: { mode: "game" } } : "/");
  }

  function toMenu() {
    stage.value = "menu";
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
    actsEl,
    actsStyle,
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
