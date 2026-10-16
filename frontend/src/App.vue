<script setup>
import { computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import CuteBackdrop from "./components/CuteBackdrop.vue";
import BottomNav from "./components/layout/BottomNav.vue";
import { useStreakStore } from "./stores/streak";
import { useAuthStore } from "./stores/auth";
import { useContentStore } from "./stores/content";
import { useProgressStore } from "./stores/progress";
import { initPWA, applyUpdateIfIdle } from "./services/pwa";

const router = useRouter();
const route = useRoute();
const streak = useStreakStore();
const auth = useAuthStore();
const content = useContentStore();
const progress = useProgressStore();

/** 底部导航只在三个主 tab 显示：课程（/course）/ 磨耳朵（/listen）/ 我的（/me）；
 *  游戏入口在课程页右上角按钮（#/game 无底部导航，沉浸闯关，顶栏返回可回课程）；
 *  宝藏罐/报告/复习/课程详情等子页面都隐藏，沉浸进入 */
const showNav = computed(() =>
  route.path === "/course" || route.path === "/listen" || route.path === "/me"
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
  auth.restore().then((ok) => {
    if (ok) {
      content.loadFromServer();
      progress.flushReport();
      progress.syncFromServer();
    }
  });
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
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) progress.flushReport();
  });
  window.addEventListener("pagehide", () => progress.flushReport());
  // 定期心跳同步：每 60s 如有未上报变更即推上云（无变更零请求）。
  // 多设备切换时云端始终接近最新，孩子/家长在不同设备看到的数据更准确。
  window.setInterval(() => void progress.flushIfDirty(), 60_000);
});
</script>

<template>
  <CuteBackdrop />
  <!-- 缓存两个首页级页面（自由 #/ + 游戏 #/game）：
       返回游戏页时 GamePath 的 onActivated 对比关卡状态触发解锁动效 -->
  <router-view v-slot="{ Component }">
    <KeepAlive include="LearnView,GameView,GameLessonView">
      <component :is="Component" />
    </KeepAlive>
  </router-view>
  <BottomNav v-if="showNav" />
</template>
