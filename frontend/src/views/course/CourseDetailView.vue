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
import { useProgressStore } from "../../stores/progress";
import { BookOpen, Headphones, Layers, Link2, MessageCircle, Mic, Music, PenLine } from "@lucide/vue";

const route = useRoute();
const router = useRouter();
const content = useContentStore();
const progress = useProgressStore();

// KeepAlive include 需要稳定组件名（缓存后回地图才有解锁闪光动画）
defineOptions({ name: "CourseDetailView" });

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
// 本页被 KeepAlive 缓存：从玩法回跳（?view=game 重定向进来）时组件不重建，
// 必须跟着路由 query 同步视图，否则停留在上次离开时的视图上
watch(
  () => route.query.view,
  (v) => {
    if (v === "menu" || v === "game") view.value = v;
  }
);

function goBack() {
  void router.push("/course");
}

/** 玩法清单（与 LessonView 同源：activityKeys 是唯一顺序来源）。
 *  图标用 lucide 组件（曾经传 "ear" 之类字符串，<component :is> 渲染不出 → 瓷片空白）；
 *  星数取进度 store（曾经不传，玩过的玩法也看不到星标）。 */
const ACT_META: Record<string, { name: string; tone: string; icon: unknown }> = {
  song: { name: "唱童谣", tone: "green", icon: Music },
  learn: { name: "学单词", tone: "orange", icon: BookOpen },
  quiz: { name: "听音选图", tone: "blue", icon: Headphones },
  memory: { name: "翻牌记忆", tone: "blue", icon: Layers },
  match: { name: "连一连", tone: "purple", icon: Link2 },
  speak: { name: "跟读", tone: "pink", icon: Mic },
  order: { name: "拼句子", tone: "teal", icon: PenLine },
  talk: { name: "亲子对话", tone: "teal", icon: MessageCircle },
};
const activities = computed<(QuestAct & { stars?: number })[]>(() => {
  const l = lesson.value;
  if (!l) return [];
  const p = progress.progress[l.id];
  return activityKeys(l).map((key) => {
    const m = ACT_META[key] || { name: key, tone: "blue", icon: Music };
    return {
      key,
      name: m.name,
      tone: m.tone,
      icon: m.icon,
      game: key,
      stars: (p?.[key as keyof typeof p] as number) || 0,
    } as QuestAct & { stars?: number };
  });
});

/** 课程完成度（与闯关地图同一口径：玩过的玩法数 / 总玩法数） */
const lessonProgress = computed(() => {
  const l = lesson.value;
  if (!l) return 0;
  const p = progress.progress[l.id];
  const keys = activityKeys(l);
  const completed = (p?.completed as string[] | undefined) || [];
  const done = keys.filter((k) => completed.includes(k)).length;
  return Math.min(100, Math.round((done / keys.length) * 100));
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
        :progress="lessonProgress"
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
