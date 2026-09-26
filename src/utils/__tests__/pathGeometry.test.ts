/**
 * pathGeometry 纯函数测试：游戏闯关地图的几何布局与命中判定。
 * 任何布局常量或命中规则的改动必须过这里（TDD 基线，与 docs 保持一致）。
 *
 * 布局口径（与 GamePath.vue 绘制一一对应）：
 *   TOP=16 → 每课横幅中心（unit.y）→ +BAR_H/2+BAR_GAP(54) → 首节点圆心
 *   → 节点每关 +ROW_H(84) → 末节点后 +UNIT_BREAK(46) → 下节横幅中心
 * 关卡序列每课固定 6 关（learn/quiz/match/speak/talk/song）。
 */
import { describe, expect, it } from "vitest";
import { buildPathGeometry, hitTestPath, R } from "../pathGeometry";

const LESSONS = ["l4", "l5", "l6", "l7", "l8"].map((id) => ({ id }));
const KEYS = ["learn", "quiz", "match", "speak", "talk", "song"];
const LEVELS = LESSONS.flatMap((l) => KEYS.map((actKey) => ({ lessonId: l.id, actKey, id: `${l.id}-${actKey}` })));

/** 取某课横幅中心 y */
function unitY(geo: ReturnType<typeof buildPathGeometry>, lessonId: string) {
  return geo.find((g) => g.type === "unit" && g.lessonId === lessonId)!.y;
}

/** 取某课某关节点 y */
function levelY(geo: ReturnType<typeof buildPathGeometry>, lessonId: string, actKey: string) {
  return geo.find((g) => g.type === "level" && g.lessonId === lessonId && g.activityKey === actKey)!.y;
}

describe("buildPathGeometry", () => {
  it("第 1 课横幅从 TOP=16 开始", () => {
    const geo = buildPathGeometry(LESSONS, LEVELS);
    expect(unitY(geo, "l4")).toBe(16);
  });

  it("l4 首节点 = 横幅 + BAR_H/2 + BAR_GAP（16+54=70）", () => {
    const geo = buildPathGeometry(LESSONS, LEVELS);
    expect(levelY(geo, "l4", "learn")).toBe(70);
  });

  it("l4 六关节点等距 +84：70..490", () => {
    const geo = buildPathGeometry(LESSONS, LEVELS);
    expect(KEYS.map((k) => levelY(geo, "l4", k))).toEqual([70, 154, 238, 322, 406, 490]);
  });

  it("l5 横幅 = l4 末节点 + UNIT_BREAK（490+46=536），不得多累加一节 ROW_H", () => {
    const geo = buildPathGeometry(LESSONS, LEVELS);
    expect(unitY(geo, "l5")).toBe(536);
    expect(levelY(geo, "l5", "learn")).toBe(590);
  });

  it("l6/l7/l8 横幅依次 +520（54+5*84+46）：1056/1576/2096", () => {
    const geo = buildPathGeometry(LESSONS, LEVELS);
    expect(unitY(geo, "l6")).toBe(1056);
    expect(unitY(geo, "l7")).toBe(1576);
    expect(unitY(geo, "l8")).toBe(2096);
  });

  it("l8 末节点 song = 2096+54+5*84 = 2570", () => {
    const geo = buildPathGeometry(LESSONS, LEVELS);
    expect(levelY(geo, "l8", "song")).toBe(2570);
  });

  it("item 计数 = 5 横幅 + 30 关", () => {
    const geo = buildPathGeometry(LESSONS, LEVELS);
    expect(geo).toHaveLength(35);
  });
});

describe("hitTestPath", () => {
  const W = 1000;
  // 用真实 altIndex 规则铺 x：全图关卡序号偶数 → 0.24W，奇数 → 0.76W；横幅居中
  let lessonIdx = -1;
  let keyIdx = 0;
  const items = buildPathGeometry(LESSONS, LEVELS).map((g) => {
    if (g.type === "unit") {
      lessonIdx += 1;
      keyIdx = 0;
      return { ...g, x: W / 2 };
    }
    const x = ((lessonIdx * 6 + keyIdx) % 2 === 0 ? 0.24 : 0.76) * W;
    keyIdx += 1;
    return { ...g, x };
  });
  const colFor = (lessonIdx: number, keyIdx: number) =>
    ((lessonIdx * 6 + keyIdx) % 2 === 0 ? 0.24 : 0.76) * W;

  it("点击 l5 横幅中心（W/2, 536）命中该课 unit", () => {
    const hit = hitTestPath(items, W / 2, 536, W);
    expect(hit).not.toBeNull();
    expect(hit!.type).toBe("unit");
    expect(hit!.lessonId).toBe("l5");
  });

  it("点击 l5 首节点圆心（0.24W, 590）命中 level learn", () => {
    const hit = hitTestPath(items, colFor(1, 0), 590, W);
    expect(hit).not.toBeNull();
    expect(hit!.type).toBe("level");
    expect(hit!.lessonId).toBe("l5");
    expect(hit!.activityKey).toBe("learn");
  });

  it("节点与横幅重叠区（y=560）优先命中 level 而非 unit", () => {
    const hit = hitTestPath(items, colFor(1, 0), 560, W);
    expect(hit).not.toBeNull();
    expect(hit!.type).toBe("level");
  });

  it("横幅上缘 -6 内仍命中（536-28-6=502）", () => {
    expect(hitTestPath(items, W / 2, 502, W)?.lessonId).toBe("l5");
  });

  it("节点圆心 ±(R+10) 边界外不命中（590+R+10+1=629）", () => {
    const hit = hitTestPath(items, colFor(1, 0), 590 + R + 10 + 1, W);
    expect(hit).toBeNull();
  });

  it("地图空白处不命中", () => {
    expect(hitTestPath(items, 500, 700, W)).toBeNull();
  });
});
