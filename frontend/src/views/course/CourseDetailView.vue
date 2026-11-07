<script setup lang="ts">
/**
 * 课程详情页（#/course/:id 课时本位，?view=game|menu 切地图/卡片）——统一入口。
 *
 * 两个视图共用同一个 header（标题/返回/资源 badges），右上角切换：
 *  - game：本课关卡卡片列表（孩子主入口，默认；2026-11 由蛇形地图重设计为大卡列表）
 *  - menu：学习卡片目录（家长陪练视角，按玩法选）
 *
 * 点玩法卡跳闯关玩法页（/course/:id/game/quest?step=），做完回此页（默认落列表视图）。
 */
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageShell from "../../components/ui/PageShell.vue";
import LessonLevelList from "../../components/game/LessonLevelList.vue";
import LessonMenu from "../../components/lesson/LessonMenu.vue";
import { activityKeys, actDisplayName, getLesson as getLocalLesson, splitActKey, type Lesson } from "../../data/lessons";
import type { QuestAct } from "../../composables/useQuest";
import { useContentStore } from "../../stores/content";
import { useProgressStore } from "../../stores/progress";
import { useLessonDownload } from "../../composables/useLessonDownload";
import { BookOpen, Download, CheckCircle2, AlertCircle, Headphones, Layers, Link2, MessageCircle, Mic, Music, PenLine, RotateCw } from "@lucide/vue";

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

/* ---------- 离线包：下载本课媒体（词音/句音/词图/童谣音视频） ----------
 * 放在 menu 视图（家长视角操作）。下载经 SW 的 DOWNLOAD_LESSON 通道：
 * 页面切走不中断；已有缓存的项目秒过，失败单个不打断整批。 */
const dl = useLessonDownload();
const dlState = computed(() => dl.state.value);
const dlLabel = computed(() => {
  if (dlState.value === "downloading") return `离线包下载中 ${dl.loaded.value}/${dl.total.value}`;
  if (dlState.value === "done") return "已可离线播放 ✓";
  if (dlState.value === "error") return "部分没下完，点我再试";
  return "下载本课离线包";
});
function startDownload() {
  if (lesson.value && dlState.value !== "downloading") void dl.start(lesson.value);
}

/* 进课详情时静默预取该课词音（几 KB 小文件，首次点读零延迟；重复访问时
   SW 缓存命中零网络，无成本） */
watch(lesson, (l) => {
  if (!l) return;
  for (const w of l.words) {
    if (w.audio) fetch(w.audio).catch(() => {});
  }
});

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
  spinner: { name: "转盘", tone: "orange", icon: RotateCw },
};
const activities = computed<(QuestAct & { stars?: number })[]>(() => {
  const l = lesson.value;
  if (!l) return [];
  const p = progress.progress[l.id];
  return activityKeys(l).map((key) => {
    // 词群入口化：key 可能是复合键（learn:colors），图标/色调按裸玩法查，
    // 显示名用 actDisplayName（学单词·颜色）
    const m = ACT_META[splitActKey(key).act] || { name: key, tone: "blue", icon: Music };
    return {
      key,
      name: actDisplayName(key, l),
      tone: m.tone,
      icon: m.icon,
      game: splitActKey(key).act,
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
  // 词群入口化：复合键（learn:colors）跳裸玩法路径 + ?group= 锁群
  const { act, group } = splitActKey(key);
  const path = `/course/${lessonId.value}/${act === "quiz" ? "hear" : act}`;
  void router.push(group ? { path, query: { group } } : { path });
}
</script>

<template>
  <!-- 不显示星/贝壳/连击徽章（2026-10-25 用户口径）：右上角已有地图/卡片切换，
       数据徽章挤在一起抢注意力，孩子看数据去「我的」页 -->
  <PageShell
    fill
    back-label="返回"
    @back="goBack"
  >
    <template #title>
      <span>{{ lesson?.emoji }} {{ lesson?.title || "课程" }}</span>
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

    <!-- 本课关卡卡片列表（game 视图；全站总地图 #/game 仍走 GamePath，不受影响） -->
    <LessonLevelList v-if="lesson && view === 'game'" :lesson="lesson" />

    <!-- 卡片目录视图 -->
    <div v-else-if="view === 'menu'" class="menu-wrap">
      <!-- 离线包：一键下载本课全部音频/词图/视频，供无网环境播放（家长操作） -->
      <button
        v-if="lesson"
        class="dl-bar"
        :class="{ done: dlState === 'done', error: dlState === 'error' }"
        :disabled="dlState === 'downloading'"
        @click="startDownload"
      >
        <CheckCircle2 v-if="dlState === 'done'" class="dl-ico" />
        <AlertCircle v-else-if="dlState === 'error'" class="dl-ico" />
        <Download v-else class="dl-ico" :class="{ spin: dlState === 'downloading' }" />
        <span class="dl-text">{{ dlLabel }}</span>
      </button>
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
/* 离线包下载条：menu 视图顶部的轻量行动条，done 转绿、error 转橙 */
.dl-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: 1.5px dashed var(--line);
  background: var(--card-bg);
  border-radius: var(--radius);
  padding: 10px 16px;
  margin-bottom: var(--gap-s);
  color: var(--ink-soft);
  font-weight: var(--fw-mid);
  transition: border-color 0.2s, color 0.2s;
}
.dl-bar:disabled {
  cursor: default;
}
.dl-bar.done {
  border-color: color-mix(in srgb, var(--ok) 55%, transparent);
  color: var(--ok);
}
.dl-bar.error {
  border-color: color-mix(in srgb, var(--orange) 60%, transparent);
  color: var(--orange);
}
.dl-ico {
  width: 18px;
  height: 18px;
  flex: none;
}
.dl-ico.spin {
  animation: dl-spin 1.1s linear infinite;
}
@keyframes dl-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .dl-ico.spin { animation: none; }
}

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
