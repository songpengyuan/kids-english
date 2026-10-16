<script setup>
import { computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import CuteBackdrop from "./components/CuteBackdrop.vue";
import BottomNav from "./components/layout/BottomNav.vue";
import { getLesson } from "./data/lessons";
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

/** 底部导航只在三个主 tab 显示：学习（/learn）/ 磨耳朵（/listen）/ 我的（/me）；
 *  游戏入口在学习页右上角按钮（#/game 无底部导航，沉浸闯关，顶栏返回可回学习）；
 *  宝藏罐/报告/复习/课程等子页面都隐藏，沉浸进入 */
const showNav = computed(() =>
  route.path === "/learn" || route.path === "/listen" || route.path === "/me"
);

/** 答题页无底部导航：去掉 #app 预留的 nav-h 底部 padding，让 footer 真正贴底 */
watch(showNav, (v) => {
  document.documentElement.classList.toggle("no-bottom-nav", !v);
}, { immediate: true });

/**
 * 兼容旧深链 ?lesson=l4&stage=talk（业务复杂化前的书签/分享链接）：
 * 挂载时若 URL 是旧 query 形式，转成 hash 路由（#/learn/l4?stage=talk），
 * 老链接不失效；GH Pages 部署后 history 深链会 404，统一走 hash。
 */
onMounted(() => {
  const q = new URLSearchParams(location.search);
  const id = q.get("lesson");
  if (id && getLesson(id)) {
    router.replace({
      path: `/learn/${id}`,
      query: q.get("stage") ? { stage: q.get("stage") } : {},
    }).then(() => {
      // 清掉旧 query 深链（保留 hash）：否则 PWA 版本更新 reload 时会被再次拉回课程
      if (location.search) {
        history.replaceState(null, "", location.pathname + location.hash);
      }
    });
  }
  // 「在首页 = 可安全刷新」：有新版本时首页静默刷新，玩法中不打断
  initPWA(() => location.hash === "" || location.hash === "#/");
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
  router.afterEach((to) => {
    if (to.name === "home") applyUpdateIfIdle();
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
