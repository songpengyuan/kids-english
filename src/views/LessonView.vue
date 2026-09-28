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
import LearnView from "../components/activities/LearnView.vue";
import QuizView from "../components/activities/QuizView.vue";
import MatchView from "../components/activities/MatchView.vue";
import SongView from "../components/activities/SongView.vue";
import SpeakView from "../components/activities/SpeakView.vue";
import TalkView from "../components/activities/TalkView.vue";
import HeaderBar from "../components/layout/HeaderBar.vue";
import LessonResult from "../components/lesson/LessonResult.vue";
import LessonMenu from "../components/lesson/LessonMenu.vue";
import { getLesson } from "../data/lessons";
import { speak, speakZh } from "../services/speech";
import { useProgressStore } from "../stores/progress";
import { useStreakStore } from "../stores/streak";
import { useRoute, useRouter } from "vue-router";
import { useViewport } from "../composables/useViewport";
import { useQuest, type QuestAct } from "../composables/useQuest";
import { useLessonFlow } from "../composables/useLessonFlow";
import { BookOpen, Headphones, Link2, MessageCircle, Mic, Music, Star } from "@lucide/vue";

const progress = useProgressStore();
const streak = useStreakStore();
const route = useRoute();
const router = useRouter();
const { isNarrow } = useViewport();

/** 当前课时（由路由 :id 解析，hash 深链 #/lesson/l4 可直达） */
const lesson = computed(() => getLesson(typeof route.params.id === "string" ? route.params.id : "") || null);

/**
 * 玩法清单。
 *
 * `tone` 只能取 tokens.css 卡片色调板里的 6 个 hue 之一 —— 加新玩法时从
 * 「还没被占用的 hue」里挑，别再往同一个 hue 上叠（之前"学单词"和"跟我读"
 * 都用橙色，孩子一眼分不清是同一类还是两个东西）。
 */
const activities = computed<QuestAct[]>(() => {
  const acts = [
    { key: "learn", name: "学单词", icon: BookOpen, tone: "orange", game: "learn", desc: "看图听发音" },
    { key: "quiz", name: "听音选图", icon: Headphones, tone: "blue", game: "quiz", desc: "听声音找图片" },
    { key: "match", name: "连一连", icon: Link2, tone: "purple", game: "match", desc: "图片连线单词" },
    { key: "speak", name: "跟我读", icon: Mic, tone: "pink", game: "speak", desc: "按住麦克风读单词" },
    { key: "song", name: "唱童谣", icon: Music, tone: "green", game: "song", desc: "听歌看视频" }
  ];
  // 亲子对话是独立玩法，只有配置了 phrases 的课时才显示
  if (lesson.value?.phrases?.length) {
    acts.splice(4, 0, {
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
// 同一路由组件变参（换课 / 下一关 ?step= / 玩法子路径 :stage / 回退无 stage）不重挂载 → watch 重置
// boot() 幂等：有 stage 直达玩法、无 stage 回菜单并朗读标题
watch(
  () => [route.params.id, route.params.stage, route.path, route.query.step],
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
        <!-- 玩法页：不显示课程标题；步骤型玩法（学/辨/连/读）把进度条上移到顶栏（多邻国式）。
             童谣（song）用播放器自身进度、亲子对话（talk）自由探索，不进顶栏进度条。 -->
        <div
          v-if="isPlay && ['learn', 'quiz', 'match', 'speak'].includes(stage)"
          class="hdr-progress"
          role="progressbar"
          :aria-valuenow="playPct"
          aria-label="答题进度"
        >
          <div class="fill" :style="{ width: playPct + '%' }"></div>
        </div>
        <template v-else-if="!isPlay"
          ><span class="hdr-title-tap" role="button" tabindex="0" aria-label="朗读课程名" @click="sayTitle" @keydown.enter.prevent="sayTitle"
            >{{ lesson.emoji }} {{ lesson.title }}</span
          ></template
        >
      </template>
      <template #right>
        <div class="star-badge" role="img" aria-label="已获得星星"><Star class="k-ico star-fill" />{{ progress.lessonStars(lesson.id) }}</div>
      </template>
    </HeaderBar>

    <!-- 课时菜单（闯关模式无菜单，直接开玩；渲染在 LessonMenu） -->
    <LessonMenu
      v-if="stage === 'menu' && !questMode"
      :activities="menuActs"
      :progress="lessonProgress"
      @open="openSound"
    />

    <!-- 各玩法 -->
    <component
      v-else-if="stage === 'learn' || stage === 'quiz' || stage === 'match' || stage === 'speak'"
      :is="stage === 'learn' ? LearnView : stage === 'quiz' ? QuizView : stage === 'match' ? MatchView : SpeakView"
      :words="lesson.words"
      @done="afterGame"
      @progress="playPct = $event"
    />
    <SongView v-else-if="stage === 'song'" :lesson="lesson" @song-done="afterSong" @back="toMenu" />
    <TalkView v-else-if="stage === 'talk'" :lesson="lesson" @done="afterGame" />


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
      @back-to-map="backToMap"
      @go-next-level="goNextLevel"
      @to-menu="toMenu"
      @go-next-lesson="router.push('/lesson/' + (nextLesson?.id ?? ''))"
    />

  </div>
</template>

<style scoped>
.hdr-title-tap {
  cursor: pointer;
  border-radius: 6px;
  padding: 2px 6px;
  margin: -2px -6px;
}
.hdr-title-tap:active {
  background: rgba(127, 127, 127, 0.14);
}
/* 顶栏进度条（听音选词）：细条紧跟 ✕（多邻国式） */
.hdr-progress {
  flex: 1;
  min-width: 0;
  height: 10px;
  border-radius: 999px;
  background: var(--card-bg);
  box-shadow: var(--shadow-hard);
  overflow: hidden;
}
.hdr-progress .fill {
  height: 100%;
  border-radius: 999px;
  background: var(--green);
  transition: width 0.35s ease;
}

</style>
