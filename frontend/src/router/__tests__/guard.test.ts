import { describe, it, expect } from "vitest";
import type { RouteLocationNormalizedLoadedGeneric } from "vue-router";
import { parentGateDecision } from "../parentGuard";

/**
 * 说明：本文件原先还测过一份«旧平铺路径 → 新嵌套路径»的迁移守卫，
 * 但那是把路由表和 MIGRATE 表**复制**到测试里再测副本 —— 真实的 index.ts
 * 在 /learn → /course 重构中把重定向写成自跳死循环时，这里照样全绿。
 * 迁移逻辑已随「不再兼容旧路径」一并删除，测试也一并移除。
 * 真实路由表的行为断言见 ./redirect.test.ts（直接 import 生产 router）。
 */

describe("家长门禁守卫（parentGateDecision 纯函数）", () => {
  const to = (meta: Record<string, unknown>) => ({ meta } as RouteLocationNormalizedLoadedGeneric);

  it("未解锁 + requiresParent → 重定向 /me?parentGate=1", () => {
    const r = parentGateDecision(to({ requiresParent: true }), false);
    expect(r).toEqual({ path: "/me", query: { parentGate: "1" }, replace: true });
  });
  it("已解锁 → 放行", () => {
    expect(parentGateDecision(to({ requiresParent: true }), true)).toBe(true);
  });
  it("非家长区路由 → 放行（与解锁状态无关）", () => {
    expect(parentGateDecision(to({}), false)).toBe(true);
    expect(parentGateDecision(to({ requiresParent: false }), false)).toBe(true);
  });
});
