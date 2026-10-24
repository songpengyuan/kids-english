/**
 * 游戏模式关卡路径数据（多邻国式）。
 *
 * 把每个课程展开成"多个关卡"：课程的玩法序列（activityKeys：song/learn/quiz/memory/match/speak/[order/talk]）
 * 即关卡序列——每个玩法 = 一关，点关卡直接开玩（/course/:id/game/quest?step=<玩法>）。
 * 课内线性解锁：每课第一关总是可玩，同课前关完成解锁下一关；课程之间相互独立。
 *
 * **两种作用域，序号语义不同**（2026-10-17 收口，别再把两者混用）：
 *  - `buildLevels()`：多课总地图（#/game）用，序号跨课连续（第 1…N 关）；
 *  - `lessonLevels(lesson)`：本课闯关地图（#/course/:id/game）用，序号本课内 1…？。
 * 本课地图/单关推进必须用 lessonLevels：否则会显示"第 8 关"、下一关跑到别的课。
 *
 * 该模块是 GamePath（地图绘制）与 useQuest（单关完成画面/下一关按钮）的共享数据源，
 * 避免两处各维护一份关卡序列（高内聚低耦合）。
 */
import { activityKeys, getLesson, lessons, type Lesson } from "./lessons";
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
  /** 关卡序号（1 起）：总地图=跨课序号；本课地图=本课内序号（见模块注释） */
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
  memory: "🃏",
  match: "🧩",
  speak: "🎤",
  order: "✏️",
  talk: "💬",
  song: "🎵",
  chest: "🎁",
};

export const ACT_NAMES: Record<string, string> = {
  learn: "学单词",
  quiz: "听音选图",
  memory: "翻牌记忆",
  match: "连一连",
  speak: "跟我读",
  order: "拼句子",
  talk: "亲子对话",
  song: "唱童谣",
  chest: "开宝箱",
};

/** 构造单关（meta 全部取自课时对象，远端课程也能直接构建） */
function makeLevel(l: Lesson, actKey: string, no: number): PathLevel {
  return {
    id: `${l.id}-${actKey}`,
    lessonId: l.id,
    actKey,
    name: ACT_NAMES[actKey] || actKey,
    emoji: ACT_EMOJI[actKey] || "⭐",
    no,
    lessonEmoji: l.emoji,
    titleZh: l.titleZh,
    title: l.title,
    tone: l.tone,
  };
}

/**
 * 单课关卡序列（本课闯关地图 #/course/:id/game 与单关推进用）。
 *
 * - 只含本课：玩法关按 activityKeys 顺序 + 末尾宝箱关；
 * - 序号从 1 起 —— 本课地图上就是「第 1…N 关」，不会出现全站累计的「第 8 关」；
 * - 入参是课时对象本身（远端详情或本地兜底都行），不依赖静态 lessons 全量。
 */
export function lessonLevels(lesson: Lesson): PathLevel[] {
  const out: PathLevel[] = [];
  for (const k of activityKeys(lesson)) out.push(makeLevel(lesson, k, out.length + 1));
  // 开宝箱独立关卡（课末尾；不参与玩法序列，地图奖励节点）
  out.push(makeLevel(lesson, "chest", out.length + 1));
  return out;
}

/** 全部分解为关卡（多课总地图用：序号跨课连续），一次构建缓存 */
let cache: PathLevel[] | null = null;

export function buildLevels(): PathLevel[] {
  if (cache) return cache;
  const out: PathLevel[] = [];
  for (const l of lessons) {
    for (const lv of lessonLevels(l)) {
      out.push({ ...lv, no: out.length + 1 });
    }
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

/** 某课已完成的玩法数（课程横幅/菜单入口的 x/y）。
 *  `lesson` 可传当前课时对象（远端课程详情优先），省略时回退静态 lessons。 */
export function lessonDoneCount(
  lessonId: string,
  progress: Record<string, LessonProgress | undefined>,
  lesson?: Pick<Lesson, "id" | "phrases">
): number {
  const l = progress[lessonId];
  const subject = lesson ?? getLesson(lessonId);
  if (!l || !subject) return 0;
  const keys = activityKeys(subject);
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

/**
 * 某关卡的后一关（单关完成画面"下一关"按钮用）；最后一关返回 null。
 * 传入的序列决定推进范围：传 `buildLevels()`（总地图）会跨课；传 `lessonLevels(课)`
 * （本课地图）就只在本课内推进 —— 本课地图/单关推进必须传后者。
 */
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
