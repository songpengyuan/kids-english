<script setup lang="ts">
/**
 * 课时页（阶段 2-3：瘦身为流程编排层）。
 *
 * 状态与逻辑已抽取：
 *  - useQuest   —— 闯关身份（模式/关卡序列/当前关/下一关）；
 *  - useLessonFlow —— 阶段机（菜单→玩法→结算）+ 结算/测量/引导。
 * 本组件只保留：课时解析、玩法清单（依赖 phrases）、composable 装配与模板。
 */
import { computed, onMounted, watch } from "vue";
import LearnView from "../components/activities/LearnView.vue";
import QuizView from "../components/activities/QuizView.vue";
import MatchView from "../components/activities/MatchView.vue";
import SongView from "../components/activities/SongView.vue";
import SpeakView from "../components/activities/SpeakView.vue";
import TalkView from "../components/activities/TalkView.vue";
import PathIcon from "../components/PathIcon.vue";
import HeaderBar from "../components/layout/HeaderBar.vue";
import LessonResult from "../components/LessonResult.vue";
import ThemeToggle from "../components/layout/ThemeToggle.vue";
import { getLesson } from "../data/lessons";
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
const { questMode, questDone, questLevel, currentActName, nextLevel } = quest;
</script>


<template>
  <div class="lesson view" v-if="lesson">
    <HeaderBar
      show-back
      :back-label="questMode ? '返回闯关地图' : stage === 'menu' ? '返回课程列表' : '返回本课菜单'"
      @back="back"
    >
      <template #title>{{ lesson.emoji }} {{ lesson.title }}</template>
      <template #right>
        <div class="star-badge" role="img" aria-label="已获得星星"><Star class="k-ico star-fill" />{{ progress.lessonStars(lesson.id) }}</div>
        <ThemeToggle />
      </template>
    </HeaderBar>

    <!-- 课时菜单（闯关模式无菜单，直接开玩） -->
    <div v-if="stage === 'menu' && !questMode" class="menu view-body">
      <div class="lesson-cover anim-pop" :class="'tone-' + lesson.tone">
        <span class="cover-emoji">{{ lesson.emoji }}</span>
        <p>{{ lesson.title }}</p>
      </div>
      <div class="bar"><div class="bar-fill" :style="{ width: lessonProgress + '%' }"></div></div>
      <div class="acts" ref="actsEl" :style="actsStyle">
        <button
          v-for="(a, i) in activities"
          :key="a.key"
          class="act anim-fade-up"
          :class="'tone-' + a.tone"
          :style="{ animationDelay: i * 0.08 + 's' }"
          @click="open(a)"
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
  font-size: var(--fs-emoji-l);
  line-height: 1;
}
.lesson-cover p {
  margin: 0;
  color: var(--on-tone);
  font-weight: 800;
  font-size: clamp(15px, min(2.8vh, 2.2vw), 22px);
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.12);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
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
</style>
