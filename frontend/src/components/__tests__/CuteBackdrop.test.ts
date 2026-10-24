// @vitest-environment jsdom
/**
 * 背景主题路由判定（2026-10-18）。
 *
 * 锁死一个曾经静默发生的错误：`isSky` 用 `startsWith("/game")` 判断，
 * 把 `/game/quest/...` 答题页也染成了天空草地场景，违背"答题页保持安静背景"的约定。
 * 现在主题由路由 meta.sky 决定：`/game`（多课总地图）与 `/course/:id/game`（本课地图）标 true；
 * `/game/quest/…` 等答题页不标，保持默认暖纸底。
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import CuteBackdrop from "../CuteBackdrop.vue";

const ROUTES: { path: string; sky?: boolean }[] = [
  { path: "/course" },
  { path: "/listen" },
  { path: "/me" },
  { path: "/game", sky: true },
  { path: "/course/:id/game", sky: true },
  { path: "/course/:id/game/quest" },
];

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ROUTES.map((r) => ({
      path: r.path,
      component: { template: "<div />" },
      meta: r.sky ? { sky: true } : {},
    })),
  });
  await router.push(path);
  await router.isReady();
  return mount(CuteBackdrop, { global: { plugins: [router] } });
}

describe("CuteBackdrop 主题判定", () => {
  it("地图页（#/game 与 #/course/:id/game）使用天空草地场景", async () => {
    expect((await mountAt("/game")).find(".backdrop").classes()).toContain("sky");
    expect((await mountAt("/course/l10/game")).find(".backdrop").classes()).toContain("sky");
  });

  it("答题页（/course/:id/game/quest）保持默认背景（曾经被误判成天空）", async () => {
    expect((await mountAt("/course/l4/game/quest")).find(".backdrop").classes()).not.toContain("sky");
  });

  it("学习/磨耳朵/我的保持默认背景", async () => {
    for (const p of ["/course", "/listen", "/me"]) {
      expect((await mountAt(p)).find(".backdrop").classes()).not.toContain("sky");
    }
  });
});
