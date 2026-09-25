<script setup>
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import CuteBackdrop from "./components/CuteBackdrop.vue";
import { getLesson } from "./data/lessons";
import { initPWA, applyUpdateIfIdle } from "./utils/pwa";

const router = useRouter();

/**
 * 兼容旧深链 ?lesson=l4&stage=talk（业务复杂化前的书签/分享链接）：
 * 挂载时若 URL 是旧 query 形式，转成 hash 路由（#/lesson/l4?stage=talk），
 * 老链接不失效；GH Pages 部署后 history 深链会 404，统一走 hash。
 */
onMounted(() => {
  const q = new URLSearchParams(location.search);
  const id = q.get("lesson");
  if (id && getLesson(id)) {
    router.replace({
      path: `/lesson/${id}`,
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
  // 回首页时若有挂起的版本更新，正好是安全刷新时机
  router.afterEach((to) => {
    if (to.name === "home") applyUpdateIfIdle();
  });
});
</script>

<template>
  <CuteBackdrop />
  <!-- 只缓存首页：游戏模式 KeepAlive 缓存下，返回首页时 onActivated 对比关卡状态触发解锁动效 -->
  <router-view v-slot="{ Component }">
    <KeepAlive include="HomePage">
      <component :is="Component" />
    </KeepAlive>
  </router-view>
</template>
