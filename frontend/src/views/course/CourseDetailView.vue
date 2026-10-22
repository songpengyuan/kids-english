<script setup lang="ts">
/**
 * 课程详情页（#/course/:id/detail）——游戏地图 + 卡片目录统一入口。
 *
 * 两个视图共用同一个 header（标题/返回/资源 badges），右上角切换：
 *  - game：本课闯关地图（孩子主入口，默认）
 *  - menu：学习卡片目录（家长陪练视角，按玩法选）
 *
 * 点卡片里的玩法仍跳到独立玩法路由（/course/:id/learn 等），
 * 做完回此页（默认落地图视图）。
 */
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageShell from "../../components/ui/PageShell.vue";
import GamePath from "../../components/game/GamePath.vue";
import LessonMenu from "../../components/lesson/LessonMenu.vue";
import { activityKeys, getLesson as getLocalLesson, type Lesson } from "../../data/lessons";
import type { QuestAct } from "../../composables/useQuest";
import { useContentStore } from "../../stores/content";

const route = useRoute();
const router = useRouter();
const content = useContentStore();

const lessonId = computed(() => route.params.id as string);
const lesson = ref<Lesson | null>(getLocalLesson(lessonId.value));

watch(
  lessonId,
  async (id) => {
    lesson.value = getLocalLesson(id) ?? null;
    const remote = await content.getLesson(id);
    if (remote && lessonId.value === id) lesson.value = remote;
  },
  { immediate: true }
);

/** 视图：game=地图（默认），menu=卡片目录 */
const view = ref<"game" | "menu">(
  route.query.view === "menu" ? "menu" : "game"
);
watch(view, (v) => {
  router.replace({ query: { ...route.query, view: v } });
});

function goBack() {
  void router.push("/course");
}

/** 玩法清单（与 LessonView 同源：activityKeys 是唯一顺序来源） */
const activities = computed<(QuestAct & { stars?: number })[]>(() => {
  if (!lesson.value) return [];
  return activityKeys(lesson.value).map((key) => {
    const meta: Record<string, { name: string; tone: string; icon: any }> = {
      song: { name: "唱童谣", tone: "green", icon: "music" },
      learn: { name: "学单词", tone: "orange", icon: "book" },
      quiz: { name: "听音选图", tone: "blue", icon: "ear" },
      memory: { name: "翻牌记忆", tone: "blue", icon: "cards" },
      match: { name: "连一连", tone: "purple", icon: "link" },
      speak: { name: "跟读", tone: "pink", icon: "mic" },
      order: { name: "拼句子", tone: "teal", icon: "blocks" },
      talk: { name: "亲子对话", tone: "teal", icon: "chat" },
    };
    const m = meta[key] || { name: key, tone: "blue", icon: "star" };
    return { key, name: m.name, tone: m.tone, game: key } as QuestAct & { stars?: number };
  });
});

function openActivity(key: string) {
  void router.push({ path: `/course/${lessonId.value}/${key === "learn" ? "learn" : key === "quiz" ? "hear" : key}` });
}
</script>

<template>
  <PageShell
    fill
    show-badges
    back-label="返回"
    @back="goBack"
  >
    <template #title>
      <span>{{ lesson?.emoji }} {{ lesson?.titleZh || "课程" }}</span>
    </template>
    <!-- 右上角：地图 / 卡片目录 切换 -->
    <template #right>
      <div class="view-switch">
        <button
          class="view-switch__btn"
          :class="{ on: view === 'game' }"
          @click="view = 'game'"
          aria-label="闯关地图"
          title="闯关地图"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h6a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h6"/></svg>
        </button>
        <button
          class="view-switch__btn"
          :class="{ on: view === 'menu' }"
          @click="view = 'menu'"
          aria-label="学习卡片"
          title="学习卡片"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        </button>
      </div>
    </template>

    <!-- 地图视图 -->
    <GamePath v-if="lesson && view === 'game'" :lesson="lesson" />

    <!-- 卡片目录视图 -->
    <div v-else-if="view === 'menu'" class="menu-wrap">
      <LessonMenu
        :activities="activities"
        :progress="0"
        @open-song="openActivity('song')"
        @open-learn="openActivity('learn')"
        @open-activity="(a) => openActivity(a.key)"
      />
    </div>
  </PageShell>
</template>

<style scoped>
.view-switch {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: var(--brand-soft);
}
.view-switch__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--ink-faint);
  cursor: pointer;
  transition: all 0.15s;
}
.view-switch__btn.on {
  background: var(--brand);
  color: var(--on-tone);
}
.menu-wrap {
  padding: var(--gap-m);
  overflow-y: auto;
}
</style>
