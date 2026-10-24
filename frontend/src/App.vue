<script setup>
import { computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import CuteBackdrop from "./components/CuteBackdrop.vue";
import BottomNav from "./components/layout/BottomNav.vue";
import { shouldShowNav } from "./components/layout/nav-visibility";
import { useStreakStore } from "./stores/streak";
import { useAuthStore } from "./stores/auth";
import { useContentStore } from "./stores/content";
import { useProgressStore } from "./stores/progress";
import { usePlayerStore } from "./stores/player";
import { initPWA, applyUpdateIfIdle } from "./services/pwa";
import { flush as flushTelemetry, setSessionContext, track } from "./services/telemetry";

const router = useRouter();
const route = useRoute();
const streak = useStreakStore();
const auth = useAuthStore();
const content = useContentStore();
const progress = useProgressStore();
const player = usePlayerStore();

/** 底部导航只在三个主 tab 显示：课程（/course）/ 磨耳朵（/listen）/ 我的（/me）；
 *  闯关入口在课时菜单的「闯关挑战」/「我的」页（本课地图 #/course/:id/game；
 *  无底部导航、沉浸闯关，顶栏返回可回课程）；宝藏罐/报告/复习/课程详情等子页面都隐藏，沉浸进入。
 *  磨耳朵播放页**也显示底栏**（2026-10-17 改）：播放浮层不再盖满全屏，
 *  下边界抬到底栏之上（见 ListenView.vue 的 .player），于是两个底部不再打架，
 *  不必靠"藏掉底栏"来解。播着歌也能直接切 tab，播放由全局 store 续着不中断。
 *
 *  ⚠️ 隐藏条件只认路径，绝不再掺任何全局状态（规则与历史事故见 nav-visibility.ts）。
 *  曾经的写法是 `三个首页 && !player.nowPlaying`——nowPlaying 是脱离路由的状态，
 *  从歌词页用系统返回手势离开 /listen 时它不会复位，于是 /course 上整条底栏
 *  也一起消失，孩子再也点不进磨耳朵、也去不了任何 tab（无路可退）。 */
const showNav = computed(() => shouldShowNav(route.path));

/** 离开磨耳朵 = 收起播放页（返回手势 / 浏览器后退 / 任何跳转都算）。
 *  回到磨耳朵时落在列表页：想继续看歌词，点当前那一行即可。 */
watch(
  () => route.path,
  (to, from) => {
    if (from === "/listen" && to !== "/listen" && player.nowPlaying) player.closeLyrics();
  },
);

/** 答题页无底部导航：去掉 #app 预留的 nav-h 底部 padding，让 footer 真正贴底 */
watch(showNav, (v) => {
  document.documentElement.classList.toggle("no-bottom-nav", !v);
}, { immediate: true });

onMounted(() => {
  // 「在首页 = 可安全刷新」：有新版本时首页静默刷新，玩法中不打断
  initPWA(() => ["", "#/", "#/course"].includes(location.hash));
  // 云模式初始化：恢复登录 → 拉取课程内容 + 同步学习进度（失败静默，保持本地模式）
  // 同步机制：先 flushReport 把本地未上报数据推上云（上次会话异常退出/关页未及时上报的时长），
  // 再 syncFromServer 拉云端合并（时长取 max，只增不减）
  // 埋点（ADR-004）：会话开始。active =「本会话由孩子自己发起」——
  // 冷启动落在门禁页，说明这次是家长在操作（进门/家长中心），据此区分主动与被动学习。
  const entryHash = location.hash || "#/";
  const sessionActive = !entryHash.startsWith("#/gate");
  auth.restore().then((ok) => {
    setSessionContext({ active: sessionActive, childId: auth.currentChildId ?? null });
    track("session_start", { entry: entryHash, active: sessionActive });
    if (ok) {
      content.loadFromServer();
      progress.flushReport();
      progress.syncFromServer();
    }
    void flushTelemetry();
  });
  // 会话中切换孩子 → 同步埋点上下文（之后的事件带上正确的 child_id）
  watch(() => auth.currentChildId, (id) => setSessionContext({ childId: id ?? null }));
  // 回首页时若有挂起的版本更新，正好是安全刷新时机
  //（路由名是 "learn" —— 路由 /learn → /course 重构后 path 改了、name 没改，
  //  这里若还写 "home" 会永远不命中，PWA 新版本就一直不生效）
  router.afterEach((to) => {
    if (to.name === "learn") applyUpdateIfIdle();
  });
  // 跨天检查：应用放了一夜再打开（或切回前台）时，把"今日目标/连击"翻到新的一天。
  // computed 不会因为日期变化自动失效，必须有这个显式触发点。
  const onVisible = () => {
    if (!document.hidden) streak.refreshDay();
  };
  document.addEventListener("visibilitychange", onVisible);
  onVisible();
  // 离开兜底上报：切后台 / 关标签页时立即把本地未上报数据推上云
  // （3s 防抖的 setTimeout 在关页时会被浏览器终止，最后一次时长必须在这里补上；未登录自动跳过）
  // ⚠️ 先 player.settle() 再 flushReport：播放中的最后一段还没落盘（5s 一结算），
  //    顺序反了就会把"刚听的那几分钟"漏在本地，跨设备自然也看不到。
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      player.settle();
      progress.flushReport();
      void flushTelemetry(); // 切后台时把埋点队列一并推走
    }
  });
  window.addEventListener("pagehide", () => {
    player.settle();
    progress.flushReport();
    void flushTelemetry();
  });
  // 定期心跳同步：每 60s 如有未上报变更即推上云（无变更零请求）。
  // 多设备切换时云端始终接近最新，孩子/家长在不同设备看到的数据更准确。
  window.setInterval(() => {
    void progress.flushIfDirty();
    void flushTelemetry();
  }, 60_000);
});
</script>

<template>
  <CuteBackdrop />
  <!-- 缓存三个页面壳（学习主页 #/course、多课总地图 #/game、课程详情 #/course/:id/detail）：
       回地图时 GamePath 的 onActivated 对比关卡状态触发解锁动效、恢复滚动位置 -->
  <router-view v-slot="{ Component }">
    <KeepAlive include="LearnView,GameView,CourseDetailView">
      <component :is="Component" />
    </KeepAlive>
  </router-view>
  <BottomNav v-if="showNav" />
</template>
