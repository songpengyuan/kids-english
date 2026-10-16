// @vitest-environment jsdom
/**
 * 路由重定向 / 守卫回归测试（直接 import 生产 router，不复制路由表）。
 *
 * 背景（真实事故）：路由 /learn → /course 重构时，两条「旧路径兼容」重定向被
 * 全局替换成 `{ path: "/course", redirect: "/course" }` —— 自己跳自己。
 * 它又声明在真正的 /course 路由之前，匹配永远先命中它 → 导航永不 resolve →
 * 整个应用白屏，连 #/gate 都进不去（门禁放行后正好重定向到 /course）。
 *
 * 这里锁两件事：
 *  1) 结构性：任何 redirect 的目标都不能等于它自己的 path（含函数式 redirect 求值）；
 *  2) 行为性：关键路径能落到正确路由，且导航能在有限时间内 resolve。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { RouteRecordRaw } from "vue-router";
import { router } from "../index";

/** 展开路由树，返回 [{ path, redirect }]（父子路径拼接，去尾斜杠便于比较） */
function flatten(
  routes: readonly RouteRecordRaw[],
  parent = "",
): Array<{ path: string; redirect: unknown }> {
  const out: Array<{ path: string; redirect: unknown }> = [];
  for (const r of routes) {
    if (r.path === undefined) continue;
    const full = (parent + "/" + r.path).replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    out.push({ path: full, redirect: r.redirect });
    if ("children" in r && r.children) out.push(...flatten(r.children, full));
  }
  return out;
}

describe("路由重定向不形成自跳死循环", () => {
  it("没有 redirect 指向自身（/x → /x 会导致导航永不 resolve 而白屏）", () => {
    const selfLoops: string[] = [];
    for (const { path, redirect } of flatten(router.options.routes)) {
      if (typeof redirect === "string") {
        if (redirect.replace(/\/$/, "") === path) selfLoops.push(`${path} → ${redirect}`);
      } else if (typeof redirect === "function") {
        const target = (redirect as (to: { params: Record<string, string> }) => string)({
          params: { rest: "__rest__", id: "__id__" },
        });
        if (typeof target === "string" && target.replace(/\/$/, "") === path) {
          selfLoops.push(`${path} → ${target}`);
        }
      }
    }
    expect(selfLoops).toEqual([]);
  });
});

describe("关键路径能落到正确路由", () => {
  beforeAll(() => {
    // 守卫里会 useAuthStore() / useGateStore()，必须先激活 pinia
    setActivePinia(createPinia());
  });

  it("#/ → #/course", async () => {
    await router.push("/");
    expect(router.currentRoute.value.path).toBe("/course");
  });

  it("#/course 自身可正常 resolve（曾因自跳无限循环白屏）", async () => {
    await router.push("/course");
    expect(router.currentRoute.value.path).toBe("/course");
  });

  it("#/course/l4 课程菜单可达", async () => {
    await router.push("/course/l4");
    expect(router.currentRoute.value.name).toBe("lesson");
  });

  it("#/course/l4/learn 与 #/course/l4/hear 题型子路由可达", async () => {
    await router.push("/course/l4/learn");
    expect(router.currentRoute.value.name).toBe("lesson-learn");
    await router.push("/course/l4/hear");
    expect(router.currentRoute.value.name).toBe("lesson-quiz");
  });

  it("#/gate 放行后落到课程主页，不卡死（本次事故的直接现场）", async () => {
    await router.push("/gate");
    expect(router.currentRoute.value.path).toBe("/course");
  });

  it("未知路径兜底回课程主页", async () => {
    await router.push("/no-such-page");
    expect(router.currentRoute.value.path).toBe("/course");
  });

  it("旧路径 #/learn/** 不再兼容，兜底回课程主页（不挂起）", async () => {
    await router.push("/learn/l4/learn");
    expect(router.currentRoute.value.path).toBe("/course");
  });
});
