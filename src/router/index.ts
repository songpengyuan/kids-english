/**
 * 应用路由（vue-router，hash 模式）。
 *
 * - 用 createWebHashHistory：项目部署在 GitHub Pages 静态托管，
 *   history 模式深链刷新会 404，hash 模式（/#/lesson/l4）刷新不掉链。
 * - 页面级路由：首页 / 我的 / 宝藏罐 / 家长报告 / 错词复习 / 课程页（:id）。
 *   课程内的玩法 stage（menu/learn/quiz/…）仍由 LessonView 组件内部管理，
 *   不逐玩法拆路由——玩法间共享大量状态，拆路由反而增加耦合；
 *   后续若某玩法需要"直达/分享"，再把它提为独立路由即可。
 *
 * - 加载策略（配合 sw 预缓存清单，见 vite.config.js kids-pwa 插件）：
 *   · 学习主链路（首页/课程）**同步加载**——离线首开最稳，装完即有；
 *   · 低频页（我的/宝藏/报告/复习/连击/英雄详情）**路由懒加载**——
 *     在线首屏更小；离线也不降级：懒加载 chunk 会进入 sw 预缓存清单，
 *     首次安装即全部就位。
 */
import { createRouter, createWebHashHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import LessonView from "../views/LessonView.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/me", name: "me", component: () => import("../views/MyView.vue") },
    { path: "/streak", name: "streak", component: () => import("../views/StreakView.vue") },
    { path: "/treasure", name: "treasure", component: () => import("../views/TreasureView.vue") },
    { path: "/treasure/hero/:id", name: "hero-detail", component: () => import("../views/HeroDetailView.vue") },
    { path: "/report", name: "report", component: () => import("../views/ReportView.vue") },
    { path: "/review", name: "review", component: () => import("../views/ReviewView.vue") },
    { path: "/lesson/:id", name: "lesson", component: LessonView },
    // 未知路径回首页（含旧 ?lesson= 深链被 replace 掉之前的空 hash 场景）
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});
