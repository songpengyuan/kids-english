<script setup lang="ts">
/**
 * 本课闯关地图（#/course/:id/game）——只画这一课的关卡，序号本课内 1..N。
 *
 * 2026-10-17 收口：这里**不是**"把总地图裁一刀"。总地图的数据口径是"全站一条链"
 * （跨课连续序号、下一关跨课），本课地图必须换成 `lessonLevels(lesson)`：
 *  - 关卡序号从本课第 1 关起（曾经 l4 显示「第 8 关」…「第 14 关」）；
 *  - 下一关只在本课内推进（曾经 l4 唱童谣通关后被带到 l9）；
 *  - 滚动容器的 overflow 由 GamePath 自带（曾经这里漏写 → 底部关卡被裁、滚不动）。
 *
 * 课时数据：本地静态同步兜底 + 后端内容 API 异步覆盖（与 LessonView 同源策略），
 * 这样后端新加的课也有地图（不再依赖静态 lessons 里必须存在这一课）。
 */
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageShell from "../../components/ui/PageShell.vue";
import GamePath from "../../components/game/GamePath.vue";
import { getLesson as getLocalLesson, type Lesson } from "../../data/lessons";
import { useContentStore } from "../../stores/content";

const route = useRoute();
const router = useRouter();
const content = useContentStore();
const lessonId = computed(() => route.params.id as string);
/** 当前课时：本地先渲染（秒开），远端详情回来后再覆盖 */
const lesson = ref<Lesson | null>(getLocalLesson(lessonId.value));
watch(
  lessonId,
  async (id) => {
    lesson.value = getLocalLesson(id) ?? null;
    const remote = await content.getLesson(id);
    // 快速换课时，别让先回来的旧请求覆盖新课
    if (remote && lessonId.value === id) lesson.value = remote;
  },
  { immediate: true }
);

function goBack() {
  // 直接回课程列表（/course/:id 现在默认 redirect 到本页，history.back 会兜回来）
  void router.push("/course");
}

/** 切到学习卡片目录（家长陪练视角） */
function openMenu() {
  void router.push({ name: "lesson-menu", params: { id: lessonId.value } });
}
</script>

<template>
  <PageShell
    fill
    :title="lesson?.titleZh || '游戏闯关'"
    icon="game"
    show-badges
    back-label="返回"
    @back="goBack"
  >
    <!-- 右上角：切到学习卡片目录（低调书本图标，主要给家长用） -->
    <template #right>
      <button class="menu-fab" @click="openMenu" aria-label="学习卡片" title="学习卡片">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
      </button>
    </template>
    <!-- 课时未就绪（仅远端新增课的首帧）不渲染地图：不传 lesson 会退化成总地图 -->
    <GamePath v-if="lesson" :lesson="lesson" />
  </PageShell>
</template>

<style scoped>
.menu-fab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--ink-soft);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.menu-fab:hover, .menu-fab:active {
  background: color-mix(in srgb, var(--ink-soft) 12%, transparent);
  color: var(--brand);
}
</style>
