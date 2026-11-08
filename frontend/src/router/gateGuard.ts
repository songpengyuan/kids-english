/**
 * 应用入口门禁判定（纯函数，路由守卫与单测共用）。
 *
 * 规则：备案域名下，进入学习应用前需家长口令解锁。
 *  - 未解锁：任何非豁免路径 → 强制回 /gate 口令页；
 *  - 已解锁：访问 /gate 不再停留，直接进课程主页 /course。
 *  - 豁免：法律文档页（/terms /privacy /children-privacy）必须公开可访问——
 *    注册时勾选的协议要能被任何人打开，不能被门禁拦住。
 */
import type { RouteLocationNormalizedLoadedGeneric } from "vue-router";

export interface AppGateRedirect {
  path: string;
  query?: Record<string, string>;
  replace: boolean;
}

/** 门禁豁免的公开路径（前缀匹配）：法律文档页 */
export const PUBLIC_PATHS = ["/terms", "/privacy", "/children-privacy"];

export function appGateDecision(
  to: RouteLocationNormalizedLoadedGeneric,
  unlocked: boolean,
): true | AppGateRedirect {
  if (PUBLIC_PATHS.some((p) => to.path === p || to.path.startsWith(p + "/"))) {
    return true;
  }
  if (to.path === "/gate") {
    return unlocked ? { path: "/course", replace: true } : true;
  }
  if (!unlocked) return { path: "/gate", replace: true };
  return true;
}
