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
import LessonResult from "../components/LessonResult.vue";
import ThemeToggle from "../components/layout/ThemeToggle.vue";
import { getLesson } from "../data/lessons";
import { speak, speakZh } from "../utils/speech";
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
// 「下一关」是同一路由组件变参（/lesson/:id?step=），组件复用不重挂载 → watch 重置
watch(
  () => [route.params.id, route.query.mode, route.query.step],
  () => {
    if (route.query.mode !== "quest" && route.query.step === undefined) return;
    flow.boot();
  }
);

// 模板需要解包后的 refs（composable 返回的 ref 在模板自动解包，这里直出）
const {
  stage,
  lastStars,
  streakJustHit,
  lessonProgress,
  nextLesson,
  actsEl,
  actsStyle,
  open,
  showStars,
  back,
  toMenu,
  afterGame,
  afterSong,
  backToMap,
  goNextLevel
} = flow;

/** 点击玩法卡片：读中文玩法名 + 进入玩法 */
function openSound(a: (typeof activities.value)[number]) {
  speakZh(a.name);
  open(a);
}
/** 点击顶栏课程名：朗读英文标题 */
function sayTitle() {
  if (lesson.value) speak(lesson.value.title);
}
const { questMode, questDone, questLevel, currentActName, nextLevel } = quest;
/** 玩法页（答题中）：顶部按钮用"关闭"（✕）而非返回箭头（多邻国式） */
const isPlay = computed(() =>
  ["learn", "quiz", "match", "speak", "song", "talk"].includes(stage.value)
);
/** 听音选词每题进度（0-100），由 QuizView 上报到顶栏进度条 */
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
        <!-- 玩法页：不显示课程标题；听音选词把进度条上移到顶栏（多邻国式） -->
        <div
          v-if="isPlay && stage === 'quiz'"
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
        <ThemeToggle v-if="!isPlay" />
      </template>
    </HeaderBar>

    <!-- 课时菜单（闯关模式无菜单，直接开玩） -->
    <div v-if="stage === 'menu' && !questMode" class="menu view-body">
      <div class="lesson-cover anim-pop" :class="'tone-' + lesson.tone">
        <!-- 课程名只在顶栏显示一次；封面只留大 emoji，避免同一个名字出现两遍 -->
        <span class="cover-emoji">{{ lesson.emoji }}</span>
      </div>
      <div class="bar"><div class="bar-fill" :style="{ width: lessonProgress + '%' }"></div></div>
      <div class="acts" ref="actsEl" :style="actsStyle">
        <button
          v-for="(a, i) in activities"
          :key="a.key"
          class="act anim-fade-up"
          :class="'tone-' + a.tone"
          :style="{ animationDelay: i * 0.08 + 's' }"
          @click="openSound(a)"
        >
          <component :is="a.icon" class="k-ico ico" />
          <span class="nm">{{ a.name }}</span>
          <span class="ds">{{ a.desc }}</span>
          <span v-if="showStars(a.key)" class="mini-stars">
            <Star class="k-ico star-fill" />{{ showStars(a.key) }}
          </span>
        </button>
      </div>
    </div>

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
.menu {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-s);
}

.lesson-cover {
  width: 100%;
  border-radius: var(--radius);
  padding: var(--gap-xs) var(--gap-s);
  flex: none;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: var(--gap-s);
  position: relative;
}
.cover-emoji {
  /* 封面只剩 emoji，当"课程徽章"用（比正文图标大，但不占太多高度） */
  font-size: var(--fs-emoji-l);
  line-height: 1;
  filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.14));
}

.bar {
  width: 100%;
  height: clamp(6px, 1.2vh, 14px);
  background: var(--line);
  border-radius: var(--radius-pill);
  overflow: hidden;
  flex: none;
}
.bar-fill {
  height: 100%;
  background: var(--green);
  transition: width 0.5s;
}

/* 剩余空间全部给卡片网格，列数由 JS 按可用尺寸算出 */
.acts {
  display: grid;
  grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr));
  gap: var(--grid-gap, 12px);
  width: 100%;
  flex: 1;
  min-height: 0;
}
/* 底色 / 立体投影 / 文字色由 .tone-* 统一注入（见 base.css），这里只管排布 */
.act {
  position: relative;
  border-radius: var(--radius);
  padding: var(--gap-xs) 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  transition: transform 0.08s;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.act .ico {
  font-size: var(--fs-emoji-l);
}
.act .nm {
  font-size: clamp(14px, min(2.5vh, 2vw), 22px);
  font-weight: 800;
  white-space: nowrap;
}
.act .ds {
  font-size: clamp(10px, min(1.6vh, 1.3vw), 14px);
  opacity: 0.92;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.mini-stars {
  position: absolute;
  top: 6px;
  right: 8px;
  background: var(--overlay);
  color: var(--gold);
  border-radius: var(--radius-pill);
  padding: 2px 8px;
  font-size: clamp(10px, 1.7vh, 14px);
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

/* 桌面鼠标 hover：玩法卡轻微上浮 */
@media (hover: hover) and (pointer: fine) {
  .act:hover {
    transform: translateY(-2px) scale(1.02);
    filter: brightness(1.04);
  }
}

/* 卡片太矮时，副标题会成为负担，藏掉换取主标题和图标的空间 */
@media (max-height: 620px) {
  .act .ds {
    display: none;
  }
}

.result {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--gap-m);
  overflow-y: auto; /* 加入宝箱后内容变多：矮屏/横屏时可滚动，不压破布局 */
  -webkit-overflow-scrolling: touch;
}
.result h2 {
  margin: 0;
  font-size: var(--fs-title);
  text-align: center;
}

/* ---------- 闯关模式 ---------- */
/* 关卡卡（多邻国式开始仪式） */
.quest-start {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.qs-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-s);
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-l) var(--gap-m);
  max-width: min(420px, 100%);
  border-top: 6px solid var(--gold);
}
/* 宽屏档：闯关开始卡更宽 */
@media (min-width: 768px) {
  .qs-card {
    max-width: min(560px, 100%);
  }
}
.qs-level {
  font-weight: 800;
  font-size: var(--fs-small);
  color: var(--gold);
  background: #fff3cd;
  border-radius: var(--radius-pill);
  padding: 4px var(--gap-m);
}
.qs-emoji {
  font-size: var(--fs-emoji-xl);
  line-height: 1;
}
.qs-title {
  margin: 0;
  font-weight: 800;
  font-size: var(--fs-title);
  color: var(--ink);
}
.qs-sub {
  margin: 0;
  font-weight: 700;
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.qs-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 6px;
  width: 100%;
  margin: var(--gap-s) 0;
}
.qs-step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 800;
  font-size: 13px;
  color: var(--ink);
  background: var(--bg);
  border-radius: var(--radius-pill);
  padding: 5px 10px;
}
.qs-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
}
.qs-goal {
  margin: 0;
  font-weight: 800;
  font-size: var(--fs-small);
  color: var(--green-dark);
}
.qs-card .k-btn.big {
  padding: clamp(10px, 2vh, 14px) clamp(28px, 4vw, 44px);
  font-size: var(--fs-body);
  border-radius: var(--radius-pill);
}

/* 单步结算：步数徽章 + 本关累计星 */
.quest-step-badge {
  font-weight: 800;
  font-size: var(--fs-small);
  color: var(--gold);
  background: var(--card-bg);
  border-radius: var(--radius-pill);
  padding: 4px var(--gap-m);
  box-shadow: var(--shadow-hard);
}
.result h2 .total-stars {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--gold);
  vertical-align: baseline;
}
.quest-progress {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  width: min(300px, 80%);
  font-weight: 800;
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.qp-bar {
  flex: 1;
  height: 10px;
  background: var(--line);
  border-radius: var(--radius-pill);
  overflow: hidden;
}
.qp-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--gold), var(--yellow));
  border-radius: var(--radius-pill);
  transition: width 0.5s;
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
