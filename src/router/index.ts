/**
 * 应用路由（vue-router，hash 模式）。
 *
 * - 用 createWebHashHistory：项目部署在 GitHub Pages 静态托管，
 *   history 模式深链刷新会 404，hash 模式（/#/lesson/l4）刷新不掉链。
 * - 页面级路由：首页 / 宝藏罐 / 家长报告 / 错词复习 / 课程页（:id）。
 *   课程内的玩法 stage（menu/learn/quiz/…）仍由 LessonView 组件内部管理，
 *   不逐玩法拆路由——玩法间共享大量状态，拆路由反而增加耦合；
 *   后续若某玩法需要"直达/分享"，再把它提为独立路由即可。
 */
import { createRouter, createWebHashHistory } from "vue-router";
import HomePage from "../components/HomePage.vue";
import TreasureView from "../components/TreasureView.vue";
import ReportView from "../components/ReportView.vue";
import ReviewView from "../components/ReviewView.vue";
import LessonView from "../components/LessonView.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "home", component: HomePage },
    { path: "/treasure", name: "treasure", component: TreasureView },
    { path: "/report", name: "report", component: ReportView },
    { path: "/review", name: "review", component: ReviewView },
    { path: "/lesson/:id", name: "lesson", component: LessonView },
    // 未知路径回首页（含旧 ?lesson= 深链被 replace 掉之前的空 hash 场景）
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});
