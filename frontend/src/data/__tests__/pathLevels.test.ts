/**
 * pathLevels 关卡路径数据测试（TDD 基线）。
 *
 * 关卡序列口径（与 GamePath 地图 / useQuest 共享）：
 *  - 顺序 = 课程玩法顺序 activityKeys：song → learn → quiz → memory → match → speak → order → [talk] → [spinner]；
 *    order（拼句子）题目为词驱动 2–4 词亲子短句，位于 speak 与 talk 之间；
 *  - 每课 = 玩法关 + 1 个开宝箱关（chest，课末尾）；
 *  - chest 关不参与玩法序列（questSeq），是地图上的独立奖励节点；
 *  - chest 状态：该课全部玩法 done → active（可开箱）；已领取（completed 含 chest）→ done；否则 locked；
 *  - lessonDoneCount 只数玩法（chest 不计入单元进度 x/y）。
 *
 * 两种作用域（2026-10-17）：
 *  - `buildLevels()`：全站序列，序号跨课连续（多课总地图 #/game）；
 *  - `lessonLevels(lesson)`：本课序列，序号本课内 1..N（本课地图 #/course/:id/game，
 *    以及单关「下一关」推进）——必须保证不跨课。
 */
import { describe, expect, it } from "vitest";
import {
  ACT_NAMES,
  buildLevels,
  computeStates,
  currentLevel,
  lessonDoneCount,
  lessonLevels,
  levelDone,
  nextLevelAfter,
} from "../pathLevels";
import { activityKeys, getLesson, lessons, type Lesson } from "../lessons";
import type { LessonProgress } from "../../stores/progress";

const LEVELS = buildLevels();
/** 课程数量会随老师新课增量（l4~l10…），断言按 lessons 动态计算，加课无需改本文件 */
const LAST_LESSON = lessons[lessons.length - 1];
const L4 = getLesson("l4")!;
const L4_LEVELS = lessonLevels(L4);

/** 构造一课进度：给定玩法完成情况与 completed 数组 */
function prog(
  stars: Partial<Record<string, number>>,
  completed: string[] = []
): LessonProgress {
  return { ...(stars as LessonProgress), completed };
}

describe("buildLevels（多课总地图：跨课连续序号）", () => {
  it("N 课 × (玩法关 + 1 宝箱)，顺序 = activityKeys，chest 排在每课末尾", () => {
    // 实际序列由 activityKeys 决定；有 talk/spinner 的课比纯基础课多尾部玩法关
    const expected = lessons.reduce((n, l) => n + activityKeys(l).length + 1, 0);
    expect(LEVELS).toHaveLength(expected);
    const l4 = LEVELS.filter((l) => l.lessonId === "l4");
    expect(l4).toHaveLength(10);
    expect(l4.map((l) => l.actKey)).toEqual(["song", "learn", "quiz", "memory", "match", "speak", "order", "talk", "spinner", "chest"]);
    expect(l4.map((l) => l.actKey).slice(0, -1)).toEqual(activityKeys(L4));
  });

  it("序号跨课连续（第一课 1..10，第二课接着 11..20）", () => {
    const first = LEVELS.filter((l) => l.lessonId === lessons[0].id).map((l) => l.no);
    const second = LEVELS.filter((l) => l.lessonId === lessons[1].id).map((l) => l.no);
    expect(first).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(second).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it("chest 关卡名称为「开宝箱」，其余玩法名不变", () => {
    const chest = LEVELS.find((l) => l.actKey === "chest")!;
    expect(chest.name).toBe("开宝箱");
    expect(ACT_NAMES.chest).toBe("开宝箱");
    expect(LEVELS.find((l) => l.actKey === "learn")!.name).toBe("学单词");
  });

  it("序列启用拼句子（order）：位于 speak 之后、首个 talk 之前，并以转盘收尾", () => {
    for (const id of ["l5", "l4", "l9", "l10", "l11", "l12"]) {
      const keys = activityKeys(getLesson(id)!);
      const orderIdx = keys.indexOf("order");
      const talkIdx = keys.findIndex((k) => k.startsWith("talk"));
      expect(orderIdx).toBeGreaterThanOrEqual(0);
      expect(talkIdx).toBeGreaterThan(orderIdx);
      expect(keys.at(-1)).toBe("spinner");
    }
  });
});

describe("lessonLevels（本课地图：本课内 1..N，不跨课）", () => {
  it("只含本课：l4 共 10 关，序号 1..10，末尾是宝箱", () => {
    expect(L4_LEVELS).toHaveLength(10);
    expect(L4_LEVELS.every((l) => l.lessonId === "l4")).toBe(true);
    expect(L4_LEVELS.map((l) => l.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(L4_LEVELS.map((l) => l.id)).toEqual([
      "l4-song",
      "l4-learn",
      "l4-quiz",
      "l4-memory",
      "l4-match",
      "l4-speak",
      "l4-order",
      "l4-talk",
      "l4-spinner",
      "l4-chest",
    ]);
  });

  it("没配 phrases 的课：只有 6 个基础玩法关（无 talk、也不解锁 order）+ 宝箱 = 7 关", () => {
    const noTalk: Lesson = { ...L4, id: "lnt", phrases: [], spinner: false };
    const lv = lessonLevels(noTalk);
    expect(lv.map((l) => l.actKey)).toEqual(["song", "learn", "quiz", "memory", "match", "speak", "chest"]);
    expect(lv.map((l) => l.no)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("不依赖静态 lessons：传课时对象即可构建（后端新增课也能出地图）", () => {
    const remote: Lesson = { ...L4, id: "lx", title: "New Song", titleZh: "新歌" };
    const lv = lessonLevels(remote);
    expect(lv).toHaveLength(10);
    expect(lv.map((l) => l.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(lv.every((l) => l.lessonId === "lx")).toBe(true);
    expect(lv[0].id).toBe("lx-song");
    expect(lv[0].titleZh).toBe("新歌");
  });

  it("本课内推进：song → learn；speak → order → talk；最后一个玩法（spinner）之后没有下一关（宝箱不参与推进）", () => {
    expect(nextLevelAfter("l4-song", L4_LEVELS)?.id).toBe("l4-learn");
    expect(nextLevelAfter("l4-speak", L4_LEVELS)?.id).toBe("l4-order");
    expect(nextLevelAfter("l4-order", L4_LEVELS)?.id).toBe("l4-talk");
    expect(nextLevelAfter("l4-talk", L4_LEVELS)?.id).toBe("l4-spinner");
    expect(nextLevelAfter("l4-spinner", L4_LEVELS)).toBeNull();
  });

  it("本课最后一关之后不会跨到下一课（对比总地图会跨课）", () => {
    // 课程数组顺序（l5, l4, l9…）决定总地图的跨课走向：l4 之后是 l9
    const nextCourse = lessons[lessons.findIndex((l) => l.id === "l4") + 1].id;
    expect(nextLevelAfter("l4-spinner", L4_LEVELS)).toBeNull();
    expect(nextLevelAfter("l4-spinner", LEVELS)?.lessonId).toBe(nextCourse);
  });
});

describe("levelDone", () => {
  it("玩法关：该玩法有星/分即完成", () => {
    expect(levelDone(LEVELS.find((l) => l.id === "l4-learn")!, { l4: prog({ learn: 2 }) })).toBe(true);
    expect(levelDone(LEVELS.find((l) => l.id === "l4-learn")!, { l4: prog({}) })).toBe(false);
  });

  it("宝箱关：completed 含 chest 即完成（已领取）", () => {
    const chest = LEVELS.find((l) => l.id === "l4-chest")!;
    expect(levelDone(chest, { l4: prog({}, ["chest"]) })).toBe(true);
    expect(levelDone(chest, { l4: prog({ learn: 2 }, []) })).toBe(false);
  });
});

describe("computeStates（chest 解锁逻辑）", () => {
  it("无进度：每课第一关（song）可玩，chest 锁定", () => {
    const st = computeStates(LEVELS, {});
    expect(st["l4-song"]).toBe("active");
    expect(st["l4-learn"]).toBe("locked");
    expect(st["l4-chest"]).toBe("locked");
    expect(st["l5-chest"]).toBe("locked");
  });

  it("一课 9 玩法全完成 → 该课 chest 解锁（active）", () => {
    const p = {
      l4: prog({ learn: 2, quiz: 2, memory: 2, match: 2, speak: 2, order: 2, talk: 1, song: 1, spinner: 1 },
        ["song", "learn", "quiz", "memory", "match", "speak", "order", "talk", "spinner"]),
    };
    const st = computeStates(LEVELS, p);
    expect(st["l4-chest"]).toBe("active");
    expect(st["l5-chest"]).toBe("locked");
    expect(st["l4-song"]).toBe("done");
  });

  it("宝箱已领取 → chest 显示 done，不再可开", () => {
    const p = {
      l4: prog({ learn: 2, quiz: 2, memory: 2, match: 2, speak: 2, talk: 1, song: 1, spinner: 1 },
        ["song", "learn", "quiz", "memory", "match", "speak", "talk", "spinner", "chest"]),
    };
    const st = computeStates(LEVELS, p);
    expect(st["l4-chest"]).toBe("done");
  });

  it("玩法未全完成时 chest 保持锁定（即使中间关卡 done）", () => {
    const p = {
      l4: prog({ learn: 2, quiz: 2 }, ["learn", "quiz"]),
    };
    const st = computeStates(LEVELS, p);
    expect(st["l4-chest"]).toBe("locked");
    expect(st["l4-quiz"]).toBe("done");
    expect(st["l4-memory"]).toBe("active");
  });
});

describe("lessonDoneCount / currentLevel", () => {
  it("lessonDoneCount 只数玩法关，chest 不计入进度", () => {
    const p = {
      l4: prog({ learn: 2, quiz: 2 }, ["learn", "quiz", "chest"]),
    };
    // l4 共 6 玩法：只完成 learn/quiz → 2
    expect(lessonDoneCount("l4", p)).toBe(2);
  });

  it("lessonDoneCount 可传课时对象（远端详情优先，不查静态表）", () => {
    const remote: Lesson = { ...L4, id: "lx" };
    const p = { lx: prog({ song: 1, learn: 2 }, ["song", "learn"]) };
    expect(lessonDoneCount("lx", p, remote)).toBe(2);
  });

  it("currentLevel 返回本课第一个可玩玩法关（忽略 chest）", () => {
    const p = {
      l5: prog({ song: 1, learn: 2 }, ["song", "learn"]),
    };
    const cur = currentLevel(LEVELS, computeStates(LEVELS, p));
    expect(cur?.id).toBe("l5-quiz");
  });
});

describe("nextLevelAfter（总地图：玩法→玩法，跳过宝箱关）", () => {
  it("l4-match 下一关是 l4-speak（同课内正常推进）", () => {
    const n = nextLevelAfter("l4-match", LEVELS);
    expect(n?.id).toBe("l4-speak");
  });

  it("l5-song 下一关是同课的 l5-learn（song 已回到课首）", () => {
    const n = nextLevelAfter("l5-song", LEVELS);
    expect(n?.id).toBe("l5-learn");
  });

  it("l5-talk 后先到同课转盘，再跳过 chest 直达下一课第一关 l4-song", () => {
    const n = nextLevelAfter("l5-talk", LEVELS);
    expect(n?.id).toBe("l5-spinner");
    const afterSpinner = nextLevelAfter("l5-spinner", LEVELS);
    expect(afterSpinner?.id).toBe("l4-song");
  });

  it("l10-talk 后先到同课转盘，再跳过 chest 直达 l11-song（丛林后接棕熊）", () => {
    const n = nextLevelAfter("l10-talk", LEVELS);
    expect(n?.id).toBe("l10-spinner");
    const afterSpinner = nextLevelAfter("l10-spinner", LEVELS);
    expect(afterSpinner?.id).toBe("l11-song");
  });

  it("最后一课最后一个玩法后无下一关", () => {
    // 末课末玩法动态取（不同课收尾玩法可能是 talk / spinner…），不写死 actKey
    const lastPlay = LEVELS.filter(
      (l) => l.lessonId === LAST_LESSON.id && l.actKey !== "chest"
    ).pop()!;
    expect(nextLevelAfter(lastPlay.id, LEVELS)).toBeNull();
  });
});
