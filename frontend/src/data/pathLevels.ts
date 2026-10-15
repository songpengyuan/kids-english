/**
 * 游戏模式关卡路径数据（多邻国式）。
 *
 * 把每个课程展开成"多个关卡"：课程的玩法序列（learn/quiz/match/speak/talk/song）
 * 即关卡序列——每个玩法 = 一关，点关卡直接开玩（?mode=quest&step=<玩法>）。
 * 课内线性解锁：每课第一关总是可玩，同课前关完成解锁下一关；课程之间相互独立。
 *
 * 该模块是 GamePath（地图绘制）与 LessonView（单关完成画面/下一关按钮）的共享数据源，
 * 避免两处各维护一份关卡序列（高内聚低耦合）。
 */
import { activityKeys, getLesson, lessons } from "./lessons";
import type { LessonProgress } from "../stores/progress";

export interface PathLevel {
  /** 全局唯一关卡 id：`${lessonId}-${actKey}`（如 "l4-learn"） */
  id: string;
  lessonId: string;
  actKey: string;
  /** 玩法名（学单词 / 听音选图 / …） */
  name: string;
  /** 玩法图标 emoji（地图节点上画） */
  emoji: string;
  /** 关卡在整条路径中的序号（1 起，含全部课程） */
  no: number;
  /** 所属课程 */
  lessonEmoji: string;
  titleZh: string;
  title: string;
  tone: string;
}

/** 玩法 → 地图节点 emoji（地图上直接可读"这一关是什么玩法"） */
export const ACT_EMOJI: Record<string, string> = {
  learn: "📖",
  quiz: "🎧",
  match: "🧩",
  speak: "🎤",
  talk: "💬",
  song: "🎵",
  chest: "🎁",
};

export const ACT_NAMES: Record<string, string> = {
  learn: "学单词",
  quiz: "听音选图",
  match: "连一连",
  speak: "跟我读",
  talk: "亲子对话",
  song: "唱童谣",
  chest: "开宝箱",
};

/** 全部分解为关卡（课程顺序 + 课程内玩法顺序），一次构建缓存 */
let cache: PathLevel[] | null = null;

export function buildLevels(): PathLevel[] {
  if (cache) return cache;
  const out: PathLevel[] = [];
  for (const l of lessons) {
    for (const k of activityKeys(l)) {
      out.push({
        id: `${l.id}-${k}`,
        lessonId: l.id,
        actKey: k,
        name: ACT_NAMES[k] || k,
        emoji: ACT_EMOJI[k] || "⭐",
        no: out.length + 1,
        lessonEmoji: l.emoji,
        titleZh: l.titleZh,
        title: l.title,
        tone: l.tone,
      });
    }
    // 开宝箱独立关卡（课末尾；不参与玩法序列，地图奖励节点）
    out.push({
      id: `${l.id}-chest`,
      lessonId: l.id,
      actKey: "chest",
      name: ACT_NAMES.chest,
      emoji: ACT_EMOJI.chest,
      no: out.length + 1,
      lessonEmoji: l.emoji,
      titleZh: l.titleZh,
      title: l.title,
      tone: l.tone,
    });
  }
  cache = out;
  return out;
}

/** 某关卡是否已完成（该课该玩法有星/分记录 = 玩过并完成） */
export function levelDone(level: PathLevel, progress: Record<string, LessonProgress | undefined>): boolean {
  const l = progress[level.lessonId];
  if (!l) return false;
  // 宝箱关：completed 含 chest = 已领取（无星数）
  if (level.actKey === "chest") {
    return !!l.completed && l.completed.includes("chest");
  }
  const v = (l as unknown as Record<string, unknown>)[level.actKey];
  return typeof v === "number" && v > 0;
}

/** 某课已完成的玩法数（单元卡进度 x/y） */
export function lessonDoneCount(lessonId: string, progress: Record<string, LessonProgress | undefined>): number {
  const l = progress[lessonId];
  const lesson = getLesson(lessonId);
  if (!l || !lesson) return 0;
  const keys = activityKeys(lesson);
  const completed = (l.completed as string[] | undefined) || [];
  return keys.filter((k) => completed.includes(k)).length;
}

export type LevelState = "locked" | "active" | "done";

/**
 * 课内线性状态：每个课程独立解锁（互不影响）——每课第一关总是可玩；
 * 同课前一关完成才解锁下一关；本课未完成的第一个关卡 = active（当前可玩）。
 * 课程之间相互独立，孩子可以自由选择想学的章节（多邻国式一课一链）。
 * @returns { id: LevelState }
 */
export function computeStates(
  levels: PathLevel[],
  progress: Record<string, LessonProgress | undefined>
): Record<string, LevelState> {
  const states: Record<string, LevelState> = {};
  // seen[lessonId]：该课上一关是否已完成（首关视为已解锁）
  const seen: Record<string, boolean> = {};
  for (const lv of levels) {
    if (levelDone(lv, progress)) {
      states[lv.id] = "done";
      seen[lv.lessonId] = true;
      continue;
    }
    // 宝箱关：该课 6 个玩法关全部完成才解锁（不依赖"前一关"链）
    if (lv.actKey === "chest") {
      states[lv.id] = lessonReadyForChest(lv.lessonId, levels, progress) ? "active" : "locked";
      continue;
    }
    const open = seen[lv.lessonId] !== false;
    states[lv.id] = open ? "active" : "locked";
    seen[lv.lessonId] = false;
  }
  return states;
}

/** 宝箱关解锁条件：该课全部玩法关（非 chest）均已完成 */
function lessonReadyForChest(
  lessonId: string,
  levels: PathLevel[],
  progress: Record<string, LessonProgress | undefined>
): boolean {
  const acts = levels.filter((l) => l.lessonId === lessonId && l.actKey !== "chest");
  return acts.length > 0 && acts.every((l) => levelDone(l, progress));
}

/** 当前关卡（第一个 active，默认落在第一课）——供返回地图/单关完成后的入口判断 */
export function currentLevel(
  levels: PathLevel[],
  states: Record<string, LevelState>
): PathLevel | undefined {
  return levels.find((l) => states[l.id] === "active");
}

/** 某关卡的后一关（单关完成画面"下一关"按钮用）；最后一关返回 null */
export function nextLevelAfter(levelId: string, levels: PathLevel[]): PathLevel | null {
  const i = levels.findIndex((l) => l.id === levelId);
  if (i < 0 || i >= levels.length - 1) return null;
  // 宝箱关是地图奖励节点，不参与"玩法→玩法"推进：跳过它找下一个玩法关
  const next = levels[i + 1];
  if (next.actKey === "chest") {
    return i + 1 < levels.length - 1 ? levels[i + 2] : null;
  }
  return next;
}
