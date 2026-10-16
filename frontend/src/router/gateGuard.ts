/**
 * 应用入口门禁判定（纯函数，路由守卫与单测共用）。
 *
 * 规则：备案域名下，进入学习应用前需家长口令解锁。
 *  - 未解锁：任何非 /gate 路径 → 强制回 /gate 口令页；
 *  - 已解锁：访问 /gate 不再停留，直接进学习主页 /learn。
 */
import type { RouteLocationNormalizedLoadedGeneric } from "vue-router";

export interface AppGateRedirect {
  path: string;
  query?: Record<string, string>;
  replace: boolean;
}

export function appGateDecision(
  to: RouteLocationNormalizedLoadedGeneric,
  unlocked: boolean,
): true | AppGateRedirect {
  if (to.path === "/gate") {
    return unlocked ? { path: "/course", replace: true } : true;
  }
  if (!unlocked) return { path: "/gate", replace: true };
  return true;
}
