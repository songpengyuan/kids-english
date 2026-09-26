/**
 * pathGeometry 纯函数测试：游戏闯关地图的几何布局与命中判定。
 * 任何布局常量或命中规则的改动必须过这里（TDD 基线，与 docs 保持一致）。
 *
 * 布局口径（与 GamePath.vue 绘制一一对应）：
 *   TOP=16 → 每课横幅中心（unit.y）→ +BAR_H/2+BAR_GAP(94) → 首节点圆心
 *   → 节点沿 S 曲线等弧长排列（首末关水平居中、相邻直线距离相等）
 *   → 末节点后 +UNIT_BREAK(46) → 下节横幅中心
 * 关卡序列每课固定 6 关（learn/quiz/match/speak/talk/song）。
 */
import { describe, expect, it } from "vitest";
import { buildPathGeometry, hitTestPath, snakeNodes, R } from "../pathGeometry";

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

  it("l4 首节点 = 横幅 + BAR_H/2 + BAR_GAP（16+94=110）", () => {
    const geo = buildPathGeometry(LESSONS, LEVELS);
    expect(levelY(geo, "l4", "learn")).toBe(110);
  });

  it("l4 六关节点等距 +84：110..530", () => {
    const geo = buildPathGeometry(LESSONS, LEVELS);
    expect(KEYS.map((k) => levelY(geo, "l4", k))).toEqual([110, 194, 278, 362, 446, 530]);
  });

  it("l5 横幅 = l4 末节点 + UNIT_BREAK（530+46=576），不得多累加一节 ROW_H", () => {
    const geo = buildPathGeometry(LESSONS, LEVELS);
    expect(unitY(geo, "l5")).toBe(576);
    expect(levelY(geo, "l5", "learn")).toBe(670);
  });

  it("l6/l7/l8 横幅依次 +560（94+5*84+46）：1136/1696/2256", () => {
    const geo = buildPathGeometry(LESSONS, LEVELS);
    expect(unitY(geo, "l6")).toBe(1136);
    expect(unitY(geo, "l7")).toBe(1696);
    expect(unitY(geo, "l8")).toBe(2256);
  });

  it("l8 末节点 song = 2256+94+5*84 = 2770", () => {
    const geo = buildPathGeometry(LESSONS, LEVELS);
    expect(levelY(geo, "l8", "song")).toBe(2770);
  });

  it("item 计数 = 5 横幅 + 30 关", () => {
    const geo = buildPathGeometry(LESSONS, LEVELS);
    expect(geo).toHaveLength(35);
  });
});

describe("snakeNodes", () => {
  const W = 1000;
  const startY = 70;
  const endY = 490; // 6 关：startY + 5*84

  it("首末关水平居中，y 覆盖 startY..endY", () => {
    const nodes = snakeNodes(W, 6, startY, endY);
    expect(nodes).toHaveLength(6);
    expect(Math.round(nodes[0].x)).toBe(500);
    expect(Math.round(nodes[5].x)).toBe(500);
    expect(Math.round(nodes[0].y)).toBe(70);
    expect(Math.round(nodes[5].y)).toBe(490);
  });

  it("相邻节点间距视觉均匀（等弧长；弦长差异 < 20px）", () => {
    const nodes = snakeNodes(W, 6, startY, endY);
    const dists = nodes.slice(1).map((n, i) => Math.hypot(n.x - nodes[i].x, n.y - nodes[i].y));
    const d0 = dists[0];
    expect(d0).toBeGreaterThan(0);
    for (const d of dists) expect(Math.abs(d - d0)).toBeLessThan(20);
  });

  it("S 形确有左右摆动（中间节点离开中线 > 100）", () => {
    const nodes = snakeNodes(W, 6, startY, endY);
    const off = nodes.slice(1, -1).map((n) => Math.abs(n.x - 500));
    expect(Math.max(...off)).toBeGreaterThan(100);
  });

  it("单关：居中单点；零宽：x 居中兜底", () => {
    const one = snakeNodes(1000, 1, startY, startY);
    expect(one).toHaveLength(1);
    expect(one[0].x).toBe(500);
    expect(snakeNodes(0, 6, startY, endY).map((n) => n.x)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe("hitTestPath", () => {
  const W = 1000;
  // 用真实 snakeNodes 铺 x/y（等弧长 S 形，每课 6 关）；横幅居中
  const geo = buildPathGeometry(LESSONS, LEVELS);
  const nodesByLesson = new Map<string, Array<{ x: number; y: number }>>();
  for (const l of LESSONS) {
    const first = geo.find((g) => g.type === "level" && g.lessonId === l.id)!.y;
    nodesByLesson.set(l.id, snakeNodes(W, KEYS.length, first, first + (KEYS.length - 1) * 84));
  }
  const items = geo.map((g) =>
    g.type === "unit"
      ? { ...g, x: W / 2 }
      : { ...g, ...nodesByLesson.get(g.lessonId!)![KEYS.indexOf(g.activityKey!)] }
  );
  const nodeAt = (lessonId: string, actKey: string) => {
    const arr = nodesByLesson.get(lessonId)!;
    return arr[KEYS.indexOf(actKey)];
  };

  it("点击 l5 横幅中心（W/2, 576）命中该课 unit", () => {
    const hit = hitTestPath(items, W / 2, 576, W);
    expect(hit).not.toBeNull();
    expect(hit!.type).toBe("unit");
    expect(hit!.lessonId).toBe("l5");
  });

  it("点击 l5 首节点圆心命中 level learn", () => {
    const p = nodeAt("l5", "learn");
    const hit = hitTestPath(items, p.x, p.y, W);
    expect(hit).not.toBeNull();
    expect(hit!.type).toBe("level");
    expect(hit!.lessonId).toBe("l5");
    expect(hit!.activityKey).toBe("learn");
  });

  it("节点与横幅重叠区（首节点 y 上方 30）优先命中 level 而非 unit", () => {
    const p = nodeAt("l5", "learn");
    const hit = hitTestPath(items, p.x, p.y - 30, W);
    expect(hit).not.toBeNull();
    expect(hit!.type).toBe("level");
  });

  it("横幅上缘附近仍命中（576-34=542，点击点避开相邻节点）", () => {
    expect(hitTestPath(items, W / 2, 570, W)?.lessonId).toBe("l5");
  });

  it("节点圆心 ±(R+10) 边界外不命中", () => {
    const p = nodeAt("l5", "learn");
    const hit = hitTestPath(items, p.x, p.y + R + 10 + 1, W);
    expect(hit).toBeNull();
  });

  it("地图空白处不命中", () => {
    expect(hitTestPath(items, 800, 700, W)).toBeNull();
  });
});
