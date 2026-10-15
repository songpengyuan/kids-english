/**
 * 家长区守卫判定（纯函数，真实路由与单测共用单一来源）。
 *
 * 双模式壳层的门禁部分：
 *  - 亲子模式（默认）：孩子直接进学习/游戏/我的，零文字依赖、所见皆可点读；
 *  - 家长模式：/me/parent（家庭账号/报告/设置）等 meta.requiresParent 路由
 *    需要家长门禁。未解锁时重定向回 /me?parentGate=1，MyView 检测该 query
 *    弹出算术题门禁（ParentGate），答对解锁后放行。
 */
import type { RouteLocationNormalizedLoadedGeneric } from "vue-router";

export interface ParentGateRedirect {
  path: string;
  query: Record<string, string>;
  replace: boolean;
}

export function parentGateDecision(
  to: RouteLocationNormalizedLoadedGeneric,
  parentUnlocked: boolean,
): true | ParentGateRedirect {
  if (to.meta.requiresParent && !parentUnlocked) {
    return { path: "/me", query: { parentGate: "1" }, replace: true };
  }
  return true;
}
