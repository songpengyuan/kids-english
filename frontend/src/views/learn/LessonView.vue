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
import MatchView from "../../components/activities/MatchView.vue";
import SongView from "../../components/activities/SongView.vue";
import SpeakView from "../../components/activities/SpeakView.vue";
import TalkView from "../../components/activities/TalkView.vue";
import HeaderBar from "../../components/layout/HeaderBar.vue";
import LessonResult from "../../components/lesson/LessonResult.vue";
import LessonMenu from "../../components/lesson/LessonMenu.vue";
import LessonProgressHeader from "../../components/lesson/LessonProgressHeader.vue";
import { getLesson as getLocalLesson, type Lesson } from "../../data/lessons";
import { useContentStore } from "../../stores/content";
import { speak, speakZh } from "../../services/speech";
import { useProgressStore } from "../../stores/progress";
import { useStreakStore } from "../../stores/streak";
import { useCardsStore, type Card } from "../../stores/cards";
import { useRoute, useRouter } from "vue-router";
import { useViewport } from "../../composables/useViewport";
import { useQuest, type QuestAct } from "../../composables/useQuest";
import { useLessonFlow } from "../../composables/useLessonFlow";
import { BookOpen, Headphones, Link2, MessageCircle, Mic, Music, Star } from "@lucide/vue";

const progress = useProgressStore();
const streak = useStreakStore();
const cards = useCardsStore();
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
    const l = await content.getLesson(id);
    if (l) lesson.value = l;
  },
  { immediate: true },
);

/**
 * 玩法清单。
 *
 * `tone` 只能取 tokens.css 卡片色调板里的 6 个 hue 之一 —— 加新玩法时从
 * 「还没被占用的 hue」里挑，别再往同一个 hue 上叠（之前"学单词"和"跟我读"
 * 都用橙色，孩子一眼分不清是同一类还是两个东西）。
 */
const activities = computed<QuestAct[]>(() => {
  const acts = [
    // 童谣打头（先听歌建立兴趣），再学单词，顺序即菜单与闯关关卡序列
    { key: "song", name: "唱童谣", icon: Music, tone: "green", game: "song", desc: "听歌看视频" },
    { key: "learn", name: "学单词", icon: BookOpen, tone: "orange", game: "learn", desc: "看图听发音" },
    { key: "quiz", name: "听音选图", icon: Headphones, tone: "blue", game: "quiz", desc: "听声音找图片" },
    { key: "match", name: "连一连", icon: Link2, tone: "purple", game: "match", desc: "图片连线单词" },
    { key: "speak", name: "跟我读", icon: Mic, tone: "pink", game: "speak", desc: "按住麦克风读单词" }
  ];
  // 亲子对话是独立玩法，只有配置了 phrases 的课时才显示（排在最后）
  if (lesson.value?.phrases?.length) {
    acts.push({
      key: "talk",
      name: "亲子对话",
      icon: MessageCircle,
      tone: "teal",
      game: "talk",
      desc: "和爸爸妈妈练口语"
    });
  }
  return acts;
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
  backToMap,
  goNextLevel,
  startLessonQuest
} = flow;

// 结算页：课内通关有 lastCard 时展示卡片奖励
watch(stage, (v) => {
  if (v === "result" && cards.lastCard) {
    rewardCard.value = cards.lastCard;
  } else if (v !== "result") {
    rewardCard.value = null;
  }
});

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
/** 菜单：闯关挑战 */
function startQuest() {
  // 当前课游戏地图：只显示这一课的关卡
  const id = route.params.id as string;
  router.push(`/game/lesson/${id}`);
}

/** 闯关包含的玩法（去掉 song/learn） */
const questActs = computed(() =>
  activities.value.filter((a) => !["song", "learn"].includes(a.key))
);
/** 闯关已完成数 */
const questDoneCount = computed(() =>
  questActs.value.filter((a) => showStars(a.key) > 0).length
);
/** 点击顶栏课程名：朗读英文标题 */
function sayTitle() {
  if (lesson.value) speak(lesson.value.title, { ttsOnly: true });
}
const { questMode, questDone, questLevel, currentActName, nextLevel } = quest;
/** 玩法页（答题中）：顶部按钮用"关闭"（✕）而非返回箭头（多邻国式） */
const isPlay = computed(() =>
  ["learn", "quiz", "match", "speak", "song", "talk"].includes(stage.value)
);
/** 玩法进度（0-100），由 Learn/Quiz/Match/Speak 上报到顶栏进度条（多邻国式） */
const playPct = ref(0);
/** 课内通关奖励卡片 */
const rewardCard = ref<Card | null>(null);
/** 本局总量（题数/页数/对数/词数）与已完成量 → 顶栏显示 x/y，孩子知道一共要做多少 */
const playTotal = ref(0);
/** 亲子对话当前轮次 */
const talkIdx = ref(0);
</script>


<template>
  <div class="lesson view" v-if="lesson">
    <HeaderBar
      show-back
      :close="isPlay"
      :back-label="questMode ? '返回闯关地图' : stage === 'menu' ? '返回课程列表' : '返回本课菜单'"
      @back="back"
    >
      <template #title>
        <!-- 亲子对话：中间一条进度条 -->
        <div v-if="stage === 'talk'" class="talk-progress">
          <div class="tp-track">
            <div class="tp-fill" :style="{ width: ((talkIdx + 1) / (lesson.words?.length || 1)) * 100 + '%' }"></div>
          </div>
        </div>
        <LessonProgressHeader
          v-else-if="isPlay"
          :activities="activities"
          :stage="stage"
          :play-pct="playPct"
          :play-total="playTotal"
          :current-key="stage"
          :has-stars="(k) => showStars(k) > 0"
        />
        <template v-else
          ><span class="hdr-title-tap" role="button" tabindex="0" aria-label="朗读课程名" @click="sayTitle" @keydown.enter.prevent="sayTitle"
            >{{ lesson.emoji }} {{ lesson.title }}</span
          ></template
        >
      </template>
      <template #right>
        <span v-if="stage === 'talk'" class="talk-round">第 {{ talkIdx + 1 }}/{{ lesson.words?.length || 0 }} 轮</span>
        <div v-else class="badge star-badge" role="img" aria-label="已获得星星"><Star class="k-ico star-fill" />{{ progress.lessonStars(lesson.id) }}</div>
      </template>
    </HeaderBar>

    <!-- 课时菜单：3 个大入口 -->
    <LessonMenu
      v-if="stage === 'menu' && !questMode"
      :activities="menuActs"
      :progress="lessonProgress"
      :quest-done="questDoneCount"
      :quest-total="questActs.length"
      @open-song="openSong"
      @open-learn="openLearn"
      @open-quest="startQuest"
      @open-activity="openSound"
    />

    <!-- 各玩法 -->
    <LearnStage
      v-else-if="stage === 'learn'"
      :words="lesson.words"
      :dialog="lesson.stageStyle === 'dialog'"
      :phrases="lesson.phrases"
      @done="afterGame"
      @progress="playPct = $event"
      @total="playTotal = $event"
    />
    <component
      v-else-if="stage === 'quiz' || stage === 'match' || stage === 'speak'"
      :is="stage === 'quiz' ? QuizView : stage === 'match' ? MatchView : SpeakView"
      :words="lesson.words"
      @done="afterGame"
      @progress="playPct = $event"
      @total="playTotal = $event"
    />
    <SongView v-else-if="stage === 'song'" :lesson="lesson" @song-done="afterSong" @back="toMenu" />
    <TalkView v-else-if="stage === 'talk'" :lesson="lesson" @idx="talkIdx = $event" @done="afterGame" />


    <!-- 结算（闯关/自由统一组件） -->
    <LessonResult
      v-else-if="stage === 'result'"
      :mode="questMode && questDone ? 'quest' : 'free'"
      :stars="lastStars"
      :reward-card="rewardCard"
      :streak-just-hit="streakJustHit"
      :streak-days="streak.streak"
      :quest-level="questLevel"
      :act-name="currentActName"
      :next-level="questMode && questDone ? (nextLevel || null) : null"
      :next-lesson="!questMode ? (nextLesson || null) : null"
      @back-to-map="backToMap"
      @go-next-level="goNextLevel"
      @to-menu="toMenu"
      @go-next-lesson="router.push('/course/' + (nextLesson?.id ?? ''))"
    />

  </div>
</template>

<style scoped>
.hdr-title-tap {
  cursor: pointer;
  border-radius: var(--radius-s);
  padding: var(--gap-xs) var(--gap-s);
  margin: calc(var(--gap-xs) * -1) calc(var(--gap-s) * -1);
}
.hdr-title-tap:active {
  background: var(--btn-plain-bg);
}
/* 亲子对话顶部进度条：顶栏里放不下全局 .progress 的高度，这里用细条变体 */
.talk-progress {
  flex: 1;
  max-width: 200px;
  margin: 0 var(--gap-s);
}
.tp-track {
  height: var(--gap-xs);
  border-radius: var(--radius-pill);
  background: var(--line);
  overflow: hidden;
}
.tp-fill {
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--brand-grad);
  transition: width var(--dur-base) var(--ease-out);
}
.talk-round {
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
  color: var(--ink-soft);
  white-space: nowrap;
}
</style>
