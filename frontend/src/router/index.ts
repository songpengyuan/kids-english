/**
 * 应用路由（vue-router，hash 模式）。
 *
 * - 用 createWebHashHistory：项目部署在 GitHub Pages 静态托管，
 *   history 模式深链刷新会 404，hash 模式（/#/course/l4/learn）刷新不掉链。
 *
 * - **路由分层（子路由承载）**：三个主入口（学习 / 游戏 / 我的）为顶层父路由，
 *   各自的子页面作为**子路由**挂在父级下，不在根路径平铺新 path：
 *
 *   #/course（课程域；历史旧路径 #/learn 已不再兼容，见文件底部说明）
 *     ├─ /course                         课程主页（父容器空 path 子路由，顶层渲染）
 *     ├─ /course/:id                     课程菜单（父路由带组件）
 *     │   └─ /course/:id/learn|hear|...  题型子路由（二级，继承父组件，仅声明 name/meta）
 *     └─ /course/review                  错词复习（学习闭环：学 → 错 → 复习）
 *   #/game（游戏域）
 *     ├─ /game                          游戏闯关地图
 *     └─ /game/quest/:id/:stage?        闯关玩法（地图点关卡直达）
 *   #/me（我的域）
 *     ├─ /me                            我的
 *     ├─ /me/calendar                   学习日历（**已合并原连击日历**，/me/streak 重定向至此）
 *     ├─ /me/treasure                   宝藏罐（图鉴 + 贴纸商店）
 *     │   └─ /me/treasure/hero/:id      英雄图鉴详情
 *     ├─ /me/cards                      我的卡片
 *     ├─ /me/report                     家长学情报告（requiresParent）
 *     └─ /me/parent                     家长中心（requiresParent）
 *
 *   父路由**不带组件**（纯路径容器）：所有页面组件都渲染在 App 顶层 router-view，
 *   行为与平铺一致、各页自带 HeaderBar 全屏，仅 URL 语义分层；
 *   KeepAlive 只缓存两个页面壳（LearnView/GameView）。
 *
 * - 加载策略（配合 sw 预缓存清单，见 vite.config.js kids-pwa 插件）：
 *   · 学习主链路（学习主页/课程/玩法）**同步加载**——离线首开最稳，装完即有；
 *   · 低频页（我的/日历/宝藏/卡片/报告/家长/复习/英雄详情）**路由懒加载**——
 *     在线首屏更小；离线也不降级：懒加载 chunk 会进入 sw 预缓存清单，
 *     首次安装即全部就位。
 *
 * - 未知路径兜底：统一由 beforeEach 送回课程主页（见文件底部）。
 */
import { createRouter, createWebHashHistory } from "vue-router";
import LearnView from "../views/learn/LearnView.vue";
import GameView from "../views/game/GameView.vue";
import LessonView from "../views/learn/LessonView.vue";
import { useAuthStore } from "../stores/auth";
import { useGateStore } from "../stores/gate";
import { parentGateDecision } from "./parentGuard";
import { appGateDecision } from "./gateGuard";
import GateView from "../views/GateView.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    // #/ → 课程主页
    { path: "/", redirect: "/course" },

    // 应用入口口令页（备案域名门禁）：未解锁时所有路由被守卫拦到这里
    { path: "/gate", name: "gate", component: GateView, meta: { title: "家长口令" } },

    // ---------- 课程域 ----------
    {
      path: "/course",
      children: [
        // 空子路径承载课程主页（父容器无组件 → 顶层渲染，KeepAlive 可缓存）
        { path: "", name: "learn", component: LearnView, meta: { title: "丞丞ABC" } },
        {
          path: ":id",
          name: "lesson",
          component: LessonView,
          meta: { title: "学习" },
          children: [
            { path: "learn", name: "lesson-learn", component: LessonView, meta: { title: "学单词", stage: "learn" } },
            { path: "hear", name: "lesson-quiz", component: LessonView, meta: { title: "听音选图", stage: "quiz" } },
            { path: "match", name: "lesson-match", component: LessonView, meta: { title: "连一连", stage: "match" } },
            { path: "speak", name: "lesson-speak", component: LessonView, meta: { title: "跟读", stage: "speak" } },
            { path: "song", name: "lesson-song", component: LessonView, meta: { title: "唱童谣", stage: "song" } },
            { path: "talk", name: "lesson-talk", component: LessonView, meta: { title: "亲子对话", stage: "talk" } },
          ],
        },
        { path: "review", name: "review", component: () => import("../views/learn/ReviewView.vue"), meta: { title: "错词复习" } },
      ],
    },

    // ---------- 游戏域 ----------
    {
      path: "/game",
      children: [
        { path: "", name: "game", component: GameView, meta: { title: "游戏闯关" } },
        // 闯关玩法（地图点关卡 → /game/quest/:id?step=玩法）
        { path: "quest/:id/:stage?", name: "quest", component: () => import("../views/game/QuestView.vue"), meta: { title: "闯关" } },
        // 当前课游戏地图（只显示这一课的关卡；多课总地图入口暂搁置）
        { path: "lesson/:id", name: "game-lesson", component: () => import("../views/game/GameLessonView.vue"), meta: { title: "游戏闯关" } },
      ],
    },

    // ---------- 磨耳朵域 ----------
    {
      path: "/listen",
      children: [
        // 磨耳朵只有一个页面：童谣列表点了就地展开歌词（ListenView 内联），
        // 不再有独立的歌曲详情页（原 /listen/song/:id 全站无入口，是死页，已删）。
        { path: "", name: "listen", component: () => import("../views/listen/ListenView.vue"), meta: { title: "磨耳朵" } },
      ],
    },

    // ---------- 我的域 ----------
    {
      path: "/me",
      children: [
        { path: "", name: "me", component: () => import("../views/me/MyView.vue"), meta: { title: "我的" } },
        // 连击日历已并入学习日历（两个页面都是同一个月网格，重复维护）。
        // 旧书签 /me/streak 与顶栏火焰徽章重定向到合并后的唯一日历。
        { path: "streak", redirect: "/me/calendar" },
        { path: "calendar", name: "calendar", component: () => import("../views/me/CalendarView.vue"), meta: { title: "学习日历" } },
        {
          path: "treasure",
          children: [
            // 空子路径承载宝藏罐（与学习/游戏域一致：父容器无组件，顶层渲染）
            { path: "", name: "treasure", component: () => import("../views/me/TreasureView.vue"), meta: { title: "宝藏罐" } },
            { path: "hero/:id", name: "hero-detail", component: () => import("../views/me/HeroDetailView.vue"), meta: { title: "英雄图鉴" } },
          ],
        },
        { path: "report", name: "report", component: () => import("../views/me/ReportView.vue"), meta: { title: "家长报告", requiresParent: true } },
        { path: "cards", name: "cards", component: () => import("../views/me/CardsView.vue"), meta: { title: "我的卡片" } },
        { path: "parent", name: "parent", component: () => import("../views/me/ParentView.vue"), meta: { title: "家长中心", requiresParent: true } },
      ],
    },

    // 未知路径兜底：只匹配不 redirect，交由守卫统一送回课程主页
    { path: "/:pathMatch(.*)*", name: "not-found", component: { render: () => null } },
  ],
});

// 守卫只做两件事：未知路径兜底 + 两级门禁。
// （历史版本的旧平铺路径迁移已在 /learn → /course 重构时移除，不再兼容旧书签）
router.beforeEach((to) => {
  // 未知路径 → 课程主页
  if (to.name === "not-found") return { path: "/course", replace: true };
  // 家长门禁：requiresParent 路由未解锁 → 回 /me?parentGate=1（MyView 弹算术题）
  const gate = parentGateDecision(to, useAuthStore().parentUnlocked);
  if (gate !== true) return gate;
  // 应用入口门禁：备案域名下进入学习应用需家长口令（未解锁一律回 #/gate 口令页）
  const appGate = appGateDecision(to, useGateStore().isUnlocked);
  if (appGate !== true) return appGate;
  return true;
});
