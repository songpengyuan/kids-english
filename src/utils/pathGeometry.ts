/**
 * 游戏闯关地图的纯几何模块：布局计算 + 命中判定。
 * 与 GamePath.vue 绘制共享同一套常量与口径，任何改动必须同步更新
 * __tests__/pathGeometry.test.ts 与 docs（TDD：先测试后实现）。
 */

/** 节点圆半径 */
export const R = 28;
/** 节点纵向步进 */
export const ROW_H = 84;
/** 课程横幅高度 */
export const BAR_H = 56;
/** 横幅底 → 首节点圆心 */
export const BAR_GAP = 26;
/** 课末节点 → 下节横幅中心 */
export const UNIT_BREAK = 46;
/** 顶部留白 */
export const TOP = 16;
/** 底部留白 */
export const BOTTOM = 36;

export interface PathGeoItem {
  type: "unit" | "level";
  x: number;
  y: number;
  lessonId: string;
  activityKey?: string;
}

/**
 * 按课程/关卡序列计算地图纵向布局（不含宽度方向的 x，由调用方按宽度铺列）。
 */
export function buildPathGeometry(
  lessons: { id: string }[],
  levels: { lessonId: string; actKey: string }[]
): PathGeoItem[] {
  const out: PathGeoItem[] = [];
  let y = TOP;
  for (const l of lessons) {
    out.push({ type: "unit", x: 0, y, lessonId: l.id });
    y += BAR_H / 2 + BAR_GAP; // 横幅中心 → 首节点圆心
    const lvArr = levels.filter((lv) => lv.lessonId === l.id);
    for (let i = 0; i < lvArr.length; i++) {
      out.push({ type: "level", x: 0, y, lessonId: l.id, activityKey: lvArr[i].actKey });
      if (i + 1 < lvArr.length) y += ROW_H; // 末节点后不再累加，直接进 UNIT_BREAK
    }
    y += UNIT_BREAK; // 末节点圆心 → 下节横幅中心
  }
  return out;
}

/**
 * 命中判定：关卡节点（圆心 ≤ R+10）优先于课程横幅（居中整宽带）。
 * 返回命中的条目；未命中返回 null。
 */
export function hitTestPath<T extends PathGeoItem>(
  items: T[],
  px: number,
  py: number,
  width: number
): T | null {
  for (const it of items) {
    if (it.type === "level" && Math.hypot(px - it.x, py - it.y) <= R + 10) return it;
  }
  for (const it of items) {
    if (it.type === "unit" && px >= 0 && px <= width && py >= it.y - BAR_H / 2 - 6 && py <= it.y + BAR_H / 2 + 6) {
      return it;
    }
  }
  return null;
}
