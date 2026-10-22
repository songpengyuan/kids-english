<script setup lang="ts">
/**
 * 课时页（阶段 2-3：瘦身为流程编排层）。
 *
 * 状态与逻辑已抽取：
 *  - useQuest   —— 闯关身份（模式/关卡序列/当前关/下一关）；
 *  - useLessonFlow —— 阶段机（菜单→玩法→结算）+ 结算/测量/引导。
 * 本组件只保留：课时解析、玩法清单（依赖 phrases）、composable 装配与模板。
 */
import { computed, onMounted, ref, watch } from "vue";
import LearnStage from "../../components/activities/LearnStage.vue";
import QuizView from "../../components/activities/QuizView.vue";
import MemoryView from "../../components/activities/MemoryView.vue";
import OrderView from "../../components/activities/OrderView.vue";
import MatchView from "../../components/activities/MatchView.vue";
import SongView from "../../components/activities/SongView.vue";
import SpeakView from "../../components/activities/SpeakView.vue";
import TalkView from "../../components/activities/TalkView.vue";
import HeaderBar from "../../components/layout/HeaderBar.vue";
import LessonResult from "../../components/lesson/LessonResult.vue";
import LessonMenu from "../../components/lesson/LessonMenu.vue";
import LessonProgressHeader from "../../components/lesson/LessonProgressHeader.vue";
import SegmentedTabs from "../../components/ui/SegmentedTabs.vue";
import { activityKeys, getLesson as getLocalLesson, wordGroupsOf, type Lesson } from "../../data/lessons";
import { useContentStore } from "../../stores/content";
import { speak, speakZh } from "../../services/speech";
import { useProgressStore } from "../../stores/progress";
import { useStreakStore } from "../../stores/streak";
import { track } from "../../services/telemetry";
import { useRoute, useRouter } from "vue-router";
import { useViewport } from "../../composables/useViewport";
import { useQuest, type QuestAct } from "../../composables/useQuest";
import { useLessonFlow } from "../../composables/useLessonFlow";
import { BookOpen, Headphones, Layers, Link2, MessageCircle, Mic, Music, PenLine } from "@lucide/vue";

const progress = useProgressStore();
const streak = useStreakStore();
const content = useContentStore();
const route = useRoute();
const router = useRouter();
const { isNarrow } = useViewport();

const lessonId = computed(() => (typeof route.params.id === "string" ? route.params.id : ""));
/**
 * 当前课时（#/course/l4 深链可直达）。
 * 数据源：本地静态同步渲染（秒开兜底），挂载后由后端内容 API 异步覆盖
 * —— 加课不发版后，远端详情（歌词时间轴/词表）为准，离线/后端挂时本地兜底。
 */
const lesson = ref<Lesson | null>(getLocalLesson(lessonId.value));
watch(
  lessonId,
  async (id) => {
    lesson.value = getLocalLesson(id) ?? null;
    // 埋点（ADR-004）：进入某课。带 lesson_id —— 没有它就无法回答
    // "哪一课没人去"这个问题（北极星之外的次关键指标：课程吸引力）。
    if (id) track("lesson_enter", { lesson_id: id });
    const l = await content.getLesson(id);
    // 快速换课时，别让先回来的旧请求覆盖新课（否则 URL 已切到 l5，
    // 页面还按 l4 的远端详情渲染 → 孩子在 l5 路由下操作 l4 内容）。
    if (l && lessonId.value === id) lesson.value = l;
  },
  { immediate: true },
);

/**
 * 玩法元数据（图标/色调/文案）。**顺序不在这里定义**：
 * 关卡/菜单顺序的唯一来源是 data/lessons 的 `activityKeys`（song 打头，
 * 配了 phrases 才有 talk），这里只负责把 key 映射成菜单项。
 * 曾经本文件手写一份顺序、pathLevels 又用 activityKeys 排另一份，
 * 于是地图「从这里开始」指到的玩法与菜单第一项对不上。
 *
 * `tone` 只能取 tokens.css 卡片色调板里的 6 个 hue 之一 —— 加新玩法时从
 * 「还没被占用的 hue」里挑，别再往同一个 hue 上叠（之前"学单词"和"跟我读"
 * 都用橙色，孩子一眼分不清是同一类还是两个东西）。
 */
const ACT_META: Record<string, Omit<QuestAct, "key">> = {
  song: { name: "唱童谣", icon: Music, tone: "green", game: "song", desc: "听歌看视频" },
  learn: { name: "学单词", icon: BookOpen, tone: "orange", game: "learn", desc: "看图听发音" },
  quiz: { name: "听音选图", icon: Headphones, tone: "blue", game: "quiz", desc: "听声音找图片" },
  memory: { name: "翻牌记忆", icon: Layers, tone: "blue", game: "memory", desc: "翻牌配对图和词" },
  match: { name: "连一连", icon: Link2, tone: "purple", game: "match", desc: "图片连线单词" },
  speak: { name: "跟我读", icon: Mic, tone: "pink", game: "speak", desc: "按住麦克风读单词" },
  order: { name: "拼句子", icon: PenLine, tone: "teal", game: "order", desc: "把单词拼成句子" },
  talk: { name: "亲子对话", icon: MessageCircle, tone: "teal", game: "talk", desc: "和爸爸妈妈练口语" },
};
const activities = computed<QuestAct[]>(() => {
  const l = lesson.value;
  if (!l) return [];
  return activityKeys(l).map((key) => {
    const meta = ACT_META[key];
    // 故意 fail loud：activityKeys 加了新玩法却没补元数据时，宁可开发期报错，
    // 也不要让菜单/关卡静默少一项（本仓库踩过太多次"静默失效"）。
    if (!meta) throw new Error(`玩法「${key}」缺少菜单元数据（LessonView.ACT_META）`);
    return { key, ...meta };
  });
});

/** 闯关身份（模式/关卡序列/当前关/下一关） */
const quest = useQuest({ lesson, activities, route });
/** 流程编排（stage 机 + 结算 + 菜单测量 + 引导） */
const flow = useLessonFlow({
  lesson,
  activities,
  route,
  router,
  progress,
  streak,
  isNarrow,
  quest
});

// 首次进入：解析深链（?stage= / ?mode=quest&step=）
onMounted(flow.boot);
// 同一路由组件变参（换课 / 题型子路由 / 下一关 ?step= / 回退无 stage）不重挂载 → watch 重置
// boot() 幂等：有 stage 直达玩法、无 stage 回菜单并朗读标题
watch(
  () => [route.params.id, route.name, route.path, route.query.step],
  () => flow.boot()
);

// 模板需要解包后的 refs（composable 返回的 ref 在模板自动解包，这里直出）
const {
  stage,
  lastStars,
  streakJustHit,
  lessonProgress,
  nextLesson,
  open,
  showStars,
  back,
  toMenu,
  afterGame,
  afterSong,
  goNextLevel
} = flow;

/** 菜单数据：玩法 + 已获星徽章（星数来自进度，注入后交给 LessonMenu 纯渲染） */
const menuActs = computed(() =>
  activities.value.map((a) => ({ ...a, stars: showStars(a.key) }))
);

/** 点击玩法卡片：读中文玩法名 + 进入玩法 */
function openSound(a: (typeof activities.value)[number]) {
  speakZh(a.name);
  open(a);
}

/** 菜单：学童谣 */
function openSong() {
  const song = activities.value.find((a) => a.key === "song");
  if (song) { speakZh("唱童谣"); open(song); }
}
/** 菜单：学单词 */
function openLearn() {
  const learn = activities.value.find((a) => a.key === "learn");
  if (learn) { speakZh("学单词"); open(learn); }
}

/** 点击顶栏课程名：朗读英文标题 */
function sayTitle() {
  if (lesson.value) speak(lesson.value.title, { ttsOnly: true });
}
/** 卡片目录 → 闯关地图（孩子主入口） */
function openGame() {
  speakZh("闯关地图");
  void router.push({ name: "course-game", params: { id: lessonId.value } });
}
const { questMode, questDone, questLevel, currentActName, nextLevel } = quest;
/** 玩法页（答题中）：顶部按钮用"关闭"（✕）而非返回箭头（多邻国式）。
 *  除 menu/result 外都是玩法页——别再手写玩法 key 列表（新增 memory/order 时漏项，
 *  会把它们误当菜单页：顶栏没有进度、左上角还是返回箭头）。 */
const isPlay = computed(() => stage.value !== "menu" && stage.value !== "result");
/** 玩法进度（0-100），由 Learn/Quiz/Match/Speak 上报到顶栏进度条（多邻国式） */
const playPct = ref(0);
/** 本局总量（题数/页数/对数/词数/轮数）与已完成量 → 顶栏显示 x/y，孩子知道一共要做多少 */
const playTotal = ref(0);

/* ---------- 词群切换（l11 颜色 / 动物） ----------
 * lesson.wordGroups 声明分组（如 l11：颜色 / 动物），词表按 word.group 归组。
 * 只有词类玩法（学单词/听音选图/翻牌记忆/跟我读）显示切换；
 * 连一连按 colorPairs 玩颜色-动物配对、唱童谣/拼句子/亲子对话用不到词表，不显示。 */
const GROUPED_STAGES = new Set(["learn", "quiz", "memory", "speak", "song"]);
/** 分组后的词表（[{key,name,words}]）；无 wordGroups 的课是空数组 */
const wordGroups = computed(() => (lesson.value ? wordGroupsOf(lesson.value) : []));
/** 当前选中的词群 key（空串 = 该课没有分组） */
const activeGroup = ref("");
const groupTabs = computed(() => wordGroups.value.map((g) => ({ value: g.key, label: g.name })));
const showGroupSwitch = computed(
  () => wordGroups.value.length > 1 && GROUPED_STAGES.has(stage.value)
);
/** 当前玩法该用哪些词：分组课只取当前组，其他课/玩法用全部词 */
const playWords = computed(() => {
  if (!showGroupSwitch.value) return lesson.value?.words ?? [];
  return wordGroups.value.find((g) => g.key === activeGroup.value)?.words ?? [];
});
// 换课/远端详情回来导致分组变化时，把选中项挪到第一个有效组
watch(
  wordGroups,
  (groups) => {
    if (!groups.some((g) => g.key === activeGroup.value)) {
      activeGroup.value = groups[0]?.key ?? "";
    }
  },
  { immediate: true }
);
// 切组 = 换一套词，顶部单局进度清零（子玩法会重新上报）
watch(activeGroup, () => {
  playPct.value = 0;
  playTotal.value = 0;
});
</script>


<template>
  <div class="lesson view" v-if="lesson">
    <HeaderBar
      show-back
      :close="isPlay"
      show-badges
      :back-label="questMode ? '返回闯关地图' : stage === 'menu' ? '返回地图' : '返回本课菜单'"
      @back="back"
    >
      <template #title>
        <LessonProgressHeader
          v-if="isPlay"
          :activities="activities"
          :stage="stage"
          :play-pct="playPct"
          :play-total="playTotal"
          :current-key="stage"
          :has-stars="(k) => showStars(k) > 0"
        />
        <button
          v-else
          class="hdr-title-tap"
          role="button"
          tabindex="0"
          aria-label="朗读课程名"
          @click="sayTitle"
          @keydown.enter.prevent="sayTitle"
        >
          <span class="hdr-zh">{{ lesson.emoji }} {{ lesson.titleZh || lesson.title }}</span>
          <span v-if="lesson.titleZh && lesson.title" class="hdr-en">{{ lesson.title }}</span>
        </button>
      </template>
      <!-- 卡片目录模式：右上角切到闯关地图（孩子主入口） -->
      <template v-if="stage === 'menu' && !questMode" #right>
        <button class="mode-fab" aria-label="闯关地图" title="闯关地图" @click="openGame">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h6a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h6"/></svg>
        </button>
      </template>
    </HeaderBar>

    <!-- 词群切换（l11：颜色 / 动物）：进玩法后按两部分分别练 -->
    <div v-if="showGroupSwitch" class="word-groups anim-fade-up">
      <SegmentedTabs v-model="activeGroup" :items="groupTabs" />
    </div>

    <!-- 课时菜单：玩法瓷片（家长陪练视角；闯关地图是默认落地页，这里不再放闯关入口） -->
    <LessonMenu
      v-if="stage === 'menu' && !questMode"
      :activities="menuActs"
      :progress="lessonProgress"
      @open-song="openSong"
      @open-learn="openLearn"
      @open-activity="openSound"
    />

    <!-- 各玩法 -->
    <LearnStage
      v-else-if="stage === 'learn'"
      :key="'learn:' + activeGroup"
      :words="playWords"
      :dialog="lesson.stageStyle === 'dialog'"
      :phrases="lesson.phrases"
      @done="afterGame"
      @progress="playPct = $event"
      @total="playTotal = $event"
    />
    <MemoryView
      v-else-if="stage === 'memory'"
      :key="'memory:' + activeGroup"
      :words="playWords"
      @done="afterGame"
      @progress="playPct = $event"
      @total="playTotal = $event"
    />
    <component
      v-else-if="stage === 'quiz' || stage === 'match' || stage === 'speak'"
      :is="stage === 'quiz' ? QuizView : stage === 'match' ? MatchView : SpeakView"
      :key="stage + ':' + activeGroup"
      :words="playWords"
      :color-pairs="lesson.colorPairs"
      @done="afterGame"
      @progress="playPct = $event"
      @total="playTotal = $event"
    />
    <OrderView
      v-else-if="stage === 'order'"
      :lesson="lesson"
      @done="afterGame"
      @progress="playPct = $event"
      @total="playTotal = $event"
    />
    <SongView
      v-else-if="stage === 'song'"
      :key="'song:' + activeGroup"
      :lesson="lesson"
      :group="activeGroup"
      @song-done="afterSong"
      @back="toMenu"
    />
    <TalkView v-else-if="stage === 'talk'" :lesson="lesson" @progress="playPct = $event" @total="playTotal = $event" @done="afterGame" />


    <!-- 结算（闯关/自由统一组件） -->
    <LessonResult
      v-else-if="stage === 'result'"
      :mode="questMode && questDone ? 'quest' : 'free'"
      :stars="lastStars"
      :streak-just-hit="streakJustHit"
      :streak-days="streak.streak"
      :quest-level="questLevel"
      :act-name="currentActName"
      :next-level="questMode && questDone ? (nextLevel || null) : null"
      :next-lesson="!questMode ? (nextLesson || null) : null"
      @go-next-level="goNextLevel"
      @to-menu="toMenu"
      @go-next-lesson="router.push('/course/' + (nextLesson?.id ?? ''))"
    />

  </div>
</template>

<style scoped>
.word-groups {
  flex: none;
}

.hdr-title-tap {
  cursor: pointer;
  border-radius: var(--radius-s);
  padding: var(--gap-xs) var(--gap-s);
  margin: calc(var(--gap-xs) * -1) calc(var(--gap-s) * -1);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  line-height: 1.15;
}
.hdr-title-tap:active {
  background: var(--btn-plain-bg);
}
.hdr-zh {
  font-size: var(--fs-title);
  font-weight: var(--fw-strong);
  color: var(--ink);
  white-space: nowrap;
}
.hdr-en {
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  color: var(--ink-faint);
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.mode-fab {
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
.mode-fab:hover, .mode-fab:active {
  background: color-mix(in srgb, var(--ink-soft) 12%, transparent);
  color: var(--brand);
}
</style>
