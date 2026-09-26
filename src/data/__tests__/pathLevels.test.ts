/**
 * pathLevels 关卡路径数据测试（TDD 基线）。
 *
 * 关卡序列口径（与 GamePath 地图 / useQuest 共享）：
 *  - 每课 = 6 个玩法关（learn/quiz/match/speak/talk/song）+ 1 个开宝箱关（chest，课末尾）；
 *  - chest 关不参与玩法序列（questSeq），是地图上的独立奖励节点；
 *  - chest 状态：该课 6 玩法全 done → active（可开箱）；已领取（completed 含 chest）→ done；否则 locked；
 *  - lessonDoneCount 只数玩法（chest 不计入单元进度 x/y）。
 */
import { describe, expect, it } from "vitest";
import {
  ACT_NAMES,
  buildLevels,
  computeStates,
  currentLevel,
  lessonDoneCount,
  levelDone,
  nextLevelAfter,
} from "../pathLevels";
import type { LessonProgress } from "../../stores/progress";

const LEVELS = buildLevels();

/** 构造一课进度：给定玩法完成情况与 completed 数组 */
function prog(
  stars: Partial<Record<string, number>>,
  completed: string[] = []
): LessonProgress {
  return { ...(stars as LessonProgress), completed };
}

describe("buildLevels", () => {
  it("5 课 × (6 玩法 + 1 宝箱) = 35 关，chest 排在每课末尾", () => {
    expect(LEVELS).toHaveLength(35);
    const l4 = LEVELS.filter((l) => l.lessonId === "l4");
    expect(l4).toHaveLength(7);
    expect(l4.map((l) => l.actKey)).toEqual(["learn", "quiz", "match", "speak", "talk", "song", "chest"]);
  });

  it("chest 关卡名称为「开宝箱」，其余玩法名不变", () => {
    const chest = LEVELS.find((l) => l.actKey === "chest")!;
    expect(chest.name).toBe("开宝箱");
    expect(ACT_NAMES.chest).toBe("开宝箱");
    expect(LEVELS.find((l) => l.actKey === "learn")!.name).toBe("学单词");
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
  it("无进度：每课 learn 可玩，chest 锁定", () => {
    const st = computeStates(LEVELS, {});
    expect(st["l4-learn"]).toBe("active");
    expect(st["l4-chest"]).toBe("locked");
    expect(st["l5-chest"]).toBe("locked");
  });

  it("一课 6 玩法全完成 → 该课 chest 解锁（active）", () => {
    const p = {
      l4: prog({ learn: 2, quiz: 2, match: 2, speak: 2, talk: 1, song: 1 },
        ["learn", "quiz", "match", "speak", "talk", "song"]),
    };
    const st = computeStates(LEVELS, p);
    expect(st["l4-chest"]).toBe("active");
    expect(st["l5-chest"]).toBe("locked");
    expect(st["l4-song"]).toBe("done");
  });

  it("宝箱已领取 → chest 显示 done，不再可开", () => {
    const p = {
      l4: prog({ learn: 2, quiz: 2, match: 2, speak: 2, talk: 1, song: 1 },
        ["learn", "quiz", "match", "speak", "talk", "song", "chest"]),
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
    expect(st["l4-match"]).toBe("active");
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

  it("currentLevel 忽略 chest（返回第一个可玩玩法关）", () => {
    const p = {
      l4: prog({ learn: 2 }, ["learn"]),
    };
    const cur = currentLevel(LEVELS, computeStates(LEVELS, p));
    expect(cur?.id).toBe("l4-quiz");
  });
});

describe("nextLevelAfter（玩法→玩法，跳过宝箱关）", () => {
  it("l4-match 下一关是 l4-speak（同课内正常推进）", () => {
    const n = nextLevelAfter("l4-match", LEVELS);
    expect(n?.id).toBe("l4-speak");
  });

  it("l4-song 后跳过 chest 直达 l5-learn（不把宝箱关当玩法下一关）", () => {
    const n = nextLevelAfter("l4-song", LEVELS);
    expect(n?.id).toBe("l5-learn");
  });

  it("最后一课 song 后无下一关", () => {
    expect(nextLevelAfter("l8-song", LEVELS)).toBeNull();
  });
});
