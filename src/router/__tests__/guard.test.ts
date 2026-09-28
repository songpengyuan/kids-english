import { describe, it, expect, beforeEach } from "vitest";
import { createRouter, createMemoryHistory } from "vue-router";

const LearnView = { template: "<div>L</div>" };
const GameView = { template: "<div>G</div>" };
const LessonView = { template: "<div>LS</div>" };
const Empty = { template: "<div />" };

const routes = [
  { path: "/", redirect: "/learn" },
  {
    path: "/learn",
    children: [
      { path: "", name: "learn", component: LearnView },
      { path: "lesson/:id/:stage?", name: "lesson", component: LessonView },
      { path: "review", name: "review", component: Empty },
    ],
  },
  {
    path: "/game",
    children: [
      { path: "", name: "game", component: GameView },
      { path: "quest/:id/:stage?", name: "quest", component: LessonView },
    ],
  },
  { path: "/:pathMatch(.*)*", name: "not-found", component: { render: () => null } },
];

const MIGRATE: Array<[string, string]> = [
  ["/me/treasure/hero", "/treasure/hero"],
  ["/me/treasure", "/treasure"],
  ["/me/streak", "/streak"],
  ["/me/report", "/report"],
  ["/learn/review", "/review"],
  ["/game/quest", "/quest"],
  ["/learn", "/learn/lesson"],
  ["/learn", "/lesson"],
];

function makeRouter() {
  const r = createRouter({ history: createMemoryHistory(), routes });
  r.beforeEach((to) => {
    let path = to.path;
    let query = to.query;
    if (to.query.mode === "game") { path = "/game"; query = {}; }
    else if (to.query.mode === "quest") { path = to.path.replace(/^\/lesson/, "/quest"); query = to.query.step ? { step: to.query.step } : {}; }
    for (const [nw, old] of MIGRATE) {
      if (path.startsWith(old)) { path = nw + path.slice(old.length); break; }
    }
    if (path === to.path && query === to.query) return true;
    return { path, query, replace: true };
  });
  return r;
}

describe("旧路径 → 新嵌套路径迁移守卫", () => {
  let router: ReturnType<typeof makeRouter>;
  beforeEach(() => { router = makeRouter(); });
  const go = async (url: string, q?: Record<string, string>) => {
    await router.push(q ? { path: url, query: q } : url).catch(() => {});
  };
  it("旧 /lesson/l4 → /learn/l4（去 lesson 段）", async () => {
    await go("/lesson/l4");
    expect(router.currentRoute.value.path).toBe("/learn/l4");
  });
  it("旧 /lesson/l4/learn → /learn/l4/learn", async () => {
    await go("/lesson/l4/learn");
    expect(router.currentRoute.value.path).toBe("/learn/l4/learn");
  });
  it("上一版嵌套 /learn/lesson/l4 → /learn/l4", async () => {
    await go("/learn/lesson/l4");
    expect(router.currentRoute.value.path).toBe("/learn/l4");
  });
  it("旧 /quest/l4?step=learn → /game/quest/l4?step=learn", async () => {
    await go("/quest/l4", { step: "learn" });
    expect(router.currentRoute.value.path).toBe("/game/quest/l4");
    expect(router.currentRoute.value.query.step).toBe("learn");
  });
  it("旧 /treasure → /me/treasure", async () => {
    await go("/treasure");
    expect(router.currentRoute.value.path).toBe("/me/treasure");
  });
  it("旧 /treasure/hero/tiga → /me/treasure/hero/tiga", async () => {
    await go("/treasure/hero/tiga");
    expect(router.currentRoute.value.path).toBe("/me/treasure/hero/tiga");
  });
  it("旧 /review → /learn/review", async () => {
    await go("/review");
    expect(router.currentRoute.value.path).toBe("/learn/review");
  });
  it("旧 /streak → /me/streak、/report → /me/report", async () => {
    await go("/streak");
    expect(router.currentRoute.value.path).toBe("/me/streak");
    await go("/report");
    expect(router.currentRoute.value.path).toBe("/me/report");
  });
  it("旧 /?mode=game → /game", async () => {
    await go("/", { mode: "game" });
    expect(router.currentRoute.value.path).toBe("/game");
  });
  it("新路径不再被迁移", async () => {
    await go("/learn/l4");
    expect(router.currentRoute.value.path).toBe("/learn/l4");
    await go("/game/quest/l4", { step: "learn" });
    expect(router.currentRoute.value.path).toBe("/game/quest/l4");
  });
});
