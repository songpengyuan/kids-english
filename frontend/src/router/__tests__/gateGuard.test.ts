/**
 * 应用入口门禁判定（gateGuard.ts）单元测试。
 */
import { describe, expect, it } from "vitest";
import { appGateDecision } from "../gateGuard";
import type { RouteLocationNormalizedLoadedGeneric } from "vue-router";

function route(path: string): RouteLocationNormalizedLoadedGeneric {
  return { path } as unknown as RouteLocationNormalizedLoadedGeneric;
}

describe("appGateDecision", () => {
  it("未解锁时，非 /gate 路由一律重定向到口令页", () => {
    for (const p of ["/learn", "/learn/l4/learn", "/game", "/me", "/listen"]) {
      const d = appGateDecision(route(p), false);
      expect(d).toEqual({ path: "/gate", replace: true });
    }
  });

  it("未解锁时，/gate 本身放行（口令页可访问）", () => {
    expect(appGateDecision(route("/gate"), false)).toBe(true);
  });

  it("已解锁时，/gate 不再停留，直接进学习主页", () => {
    expect(appGateDecision(route("/gate"), true)).toEqual({ path: "/learn", replace: true });
  });

  it("已解锁时，其余路由全部放行", () => {
    for (const p of ["/learn", "/game", "/me", "/listen", "/me/parent"]) {
      expect(appGateDecision(route(p), true)).toBe(true);
    }
  });
});
