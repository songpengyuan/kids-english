<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import LearnView from "./LearnView.vue";
import QuizView from "./QuizView.vue";
import MatchView from "./MatchView.vue";
import SongView from "./SongView.vue";
import PathIcon from "./PathIcon.vue";
import ChestReward from "./ChestReward.vue";
import SpeakView from "./SpeakView.vue";
import TalkView from "./TalkView.vue";
import ThemeToggle from "./ThemeToggle.vue";
import { bigCelebrate, celebrate } from "../utils/effects";
import { getLesson, lessons } from "../data/lessons";
import { buildLevels, nextLevelAfter } from "../data/pathLevels";
import { useProgressStore } from "../stores/progress";
import { useStreakStore } from "../stores/streak";
import { useRoute, useRouter } from "vue-router";
import { speak, speakZh } from "../utils/speech";
import { hapticTap } from "../utils/haptics";
import { useViewport } from "../composables/useViewport";
import { pickColumns } from "../utils/layout";
import {
  BookOpen,
  ChevronLeft,
  Headphones,
  Link2,
  MessageCircle,
  Mic,
  Music,
  Star
} from "@lucide/vue";

const progress = useProgressStore();
const streak = useStreakStore();
/** 今日目标刚达成（结算页显示 🔥 横幅） */
const streakJustHit = ref(false);

const route = useRoute();
const router = useRouter();
/** 当前课时（由路由 :id 解析，hash 深链 #/lesson/l4 可直达） */
const lesson = computed(() => getLesson(route.params.id) || null);

const { isNarrow } = useViewport();

const stage = ref("menu"); // menu | questStart | learn | quiz | match | song | talk | result
const lastStars = ref(0);

/** 当前玩法会话的开始时间戳（0 = 未开始），结算时累计进今日学情（家长报告） */
let actStart = 0;

/* ---------- 游戏模式：关卡内闯关（Quest，多邻国式单关） ---------- */
/** 是否闯关模式：游戏模式路径图进入时带 ?mode=quest&step=<玩法> */
const questMode = computed(() => route.query.mode === "quest");
/** 闯关玩法序列（按 activities 顺序，点地图关卡只玩对应那一关） */
const questSeq = computed(() => activities.value);
/** 当前正在玩的玩法在序列中的下标（0 起）——由地图 ?step= 定位 */
const questIdx = ref(0);
/** 关卡完成 → 关卡完成大画面 */
const questDone = ref(false);
/** 当前玩法名（关卡完成画面"xx 完成！"） */
const currentActName = computed(() => questSeq.value[questIdx.value]?.name || "");

/** 调试深链：?lesson=l4&stage=learn，直接进入某个玩法页 */
const STAGES = ["learn", "quiz", "match", "speak", "song", "talk"];
/** 全关卡序列（pathLevels 共享数据：GamePath 地图与这里同一份） */
const pathLevels = buildLevels();
/** 当前关卡在整条路径中的序号（1 起，多邻国式） */
const questLevel = computed(() => {
  const cur = questSeq.value[questIdx.value];
  if (!cur || !lesson.value) return 1;
  return pathLevels.find((l) => l.id === `${lesson.value.id}-${cur.key}`)?.no || 1;
});
/** 下一关（单关完成画面"下一关"按钮）；地图最后一关为 null */
const nextLevel = computed(() => {
  const cur = questSeq.value[questIdx.value];
  if (!cur || !lesson.value) return null;
  return nextLevelAfter(`${lesson.value.id}-${cur.key}`, pathLevels);
});

/** 按当前路由初始化进入状态（挂载 + 路由参数变化共用） */
function bootQuest() {
  // 记录最近进入的课时 → 首页「继续学习」入口
  if (lesson.value) progress.setLastLesson(lesson.value.id);
  const s = typeof route.query.stage === "string" ? route.query.stage : "";
  if (questMode.value) {
    // 单关模式：地图点关卡直接开玩对应玩法（跳过菜单/关卡卡）
    const step = typeof route.query.step === "string" ? route.query.step : "";
    const idx = questSeq.value.findIndex((a) => a.key === step);
    questIdx.value = idx >= 0 ? idx : 0;
    questDone.value = false;
    const a = questSeq.value[questIdx.value];
    if (a) {
      stage.value = a.game === "song" ? "song" : a.key;
      actStart = Date.now();
    } else {
      stage.value = "menu";
    }
  } else if (STAGES.includes(s)) {
    stage.value = s;
    actStart = Date.now();
  } else {
    // 进入课程时报出主题歌名（英文），给孩子一个"这一课唱什么"的预期
    setTimeout(() => speak(lesson.value?.title || ""), 400);
  }
}

onMounted(bootQuest);
// 「下一关」是同一路由组件变参（/lesson/:id?step=），组件复用不重挂载 → watch 重置
watch(
  () => [route.params.id, route.query.mode, route.query.step],
  () => {
    if (route.query.mode !== "quest" && route.query.step === undefined) return;
    bootQuest();
  }
);

/**
 * 玩法清单。
 *
 * `tone` 只能取 tokens.css 卡片色调板里的 6 个 hue 之一 —— 加新玩法时从
 * 「还没被占用的 hue」里挑，别再往同一个 hue 上叠（之前"学单词"和"跟我读"
 * 都用橙色，孩子一眼分不清是同一类还是两个东西）。
 */
const activities = computed(() => {
  const acts = [
    { key: "learn", name: "学单词", icon: BookOpen, tone: "orange", game: "learn", desc: "看图听发音" },
    { key: "quiz", name: "听音选图", icon: Headphones, tone: "blue", game: "quiz", desc: "听声音找图片" },
    { key: "match", name: "连一连", icon: Link2, tone: "purple", game: "match", desc: "图片连线单词" },
    { key: "speak", name: "跟我读", icon: Mic, tone: "pink", game: "speak", desc: "按住麦克风读单词" },
    { key: "song", name: "唱童谣", icon: Music, tone: "green", game: "song", desc: "听歌看视频" }
  ];
  // 亲子对话是独立玩法，只有配置了 phrases 的课时才显示
  if (lesson.value.phrases?.length) {
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

/* ---------- 玩法卡片排布 ---------- */
/**
 * 5 张卡片要一屏放下。列数不能写死（高了会变单列长条，矮了会挤成一条），
 * 由 pickColumns 按"卡片长宽比最接近目标"挑选，兼顾可读性与观感。
 */
const GAP = 12;
const MIN_W = 130; // 卡片最小可读宽
const MIN_H = 96; // 卡片最小可读高

const actsEl = ref(null);
const area = reactive({ w: 0, h: 0 });
let ro = null;
let raf = null;

function measure() {
  const el = actsEl.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  area.w = r.width;
  area.h = r.height;
}
function scheduleMeasure() {
  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    raf = null;
    measure();
  });
}
onMounted(() => {
  measure();
  ro = new ResizeObserver(scheduleMeasure);
  if (actsEl.value) ro.observe(actsEl.value);
});
onBeforeUnmount(() => {
  if (ro) ro.disconnect();
  if (raf) cancelAnimationFrame(raf);
});

const layout = computed(() => {
  if (!area.w || !area.h) return { cols: isNarrow.value ? 2 : 3, rows: 2 };
  return pickColumns({
    width: area.w,
    height: area.h,
    count: activities.value.length,
    minCardW: MIN_W,
    minCardH: MIN_H,
    gap: GAP,
    maxCols: isNarrow.value ? 2 : 5,
    targetAspect: 1.25
  });
});

const actsStyle = computed(() => ({
  "--cols": layout.value.cols,
  "--grid-gap": `${GAP}px`
}));

function open(a) {
  hapticTap();
  actStart = Date.now(); // 玩法会话计时起点
  stage.value = a.game === "song" ? "song" : a.key;
}

/** 菜单卡片右上角的星星徽章：该玩法已获得的星数 */
function showStars(key) {
  return progress.progress[lesson.value.id]?.[key] || 0;
}

/** 单关完成：直接进关卡完成大画面（多邻国：一课一节，完成即点亮 + 开宝箱） */
function finishQuestStep() {
  questDone.value = true;
  bigCelebrate();
  speakZh("关卡完成，太棒了");
  stage.value = "result";
}

/** 返回闯关地图（游戏模式首页） */
function backToMap() {
  router.push({ path: "/", query: { mode: "game" } });
}

/** 进入下一关（单关完成画面按钮） */
function goNextLevel() {
  if (!nextLevel.value) return;
  hapticTap();
  router.push(`/lesson/${nextLevel.value.lessonId}?mode=quest&step=${nextLevel.value.actKey}`);
}

/** 结算一次玩法会话：累计今日时长与玩法数（家长报告数据源） */
function settleActivity() {
  progress.addDailyActivity(actStart ? (Date.now() - actStart) / 1000 : 0);
  actStart = 0;
}

function afterGame(stars) {
  // learn 玩法完成不传星数（emit("done") 无参数），兜底为 1 星：完成即点亮
  const s = stars || 1;
  lastStars.value = s;
  progress.setGameStars(lesson.value.id, stage.value, s);
  settleActivity();
  // 完成玩法 → 记今日目标；今天第一次达成时结算页亮横幅
  const first = streak.markActivity();
  streakJustHit.value = first && streak.todayDone;
  if (questMode.value) {
    finishQuestStep();
  } else {
    // 庆祝收敛：满分才双彩带大庆祝，其余用小彩带——
    // 避免"每完成一步都全屏庆祝"，庆祝多了孩子就无感了
    if (stars >= 3) bigCelebrate();
    else celebrate();
    speakZh(stars >= 3 ? "太厉害了，满分三颗星" : "做得好，继续加油");
    stage.value = "result";
  }
}

function afterSong() {
  stage.value = "result";
  lastStars.value = 1;
  // 童谣星数由 SongView 内部记（markSong 幂等），这里只累计今日学情
  settleActivity();
  const first = streak.markActivity();
  streakJustHit.value = first && streak.todayDone;
  if (questMode.value) finishQuestStep();
}

const lessonProgress = computed(() => {
  const done = progress.progress[lesson.value.id]?.completed?.length || 0;
  return Math.min(100, Math.round((done / activities.value.length) * 100));
});

/** 左上角 ←：玩法中先回本课菜单，菜单里再点才回课程列表（两步退出，防止误触跳走）；
 * 闯关模式没有菜单，直接回闯关地图 */
function back() {
  if (!questMode.value && stage.value !== "menu") {
    stage.value = "menu";
    return;
  }
  // 闯关模式回闯关地图（游戏模式首页），普通模式回首页自由练习
  router.push(questMode.value ? { path: "/", query: { mode: "game" } } : "/");
}

function toMenu() {
  stage.value = "menu";
}

/** 下一课（当前课是最后一课则为 null，结算页隐藏该按钮） */
const nextLesson = computed(() => {
  const i = lessons.findIndex((l) => l.id === lesson.value.id);
  return i >= 0 ? lessons[i + 1] || null : null;
});

</script>

<template>
  <div class="lesson view">
    <div class="topbar">
      <button
        class="back"
        @click="back"
        :aria-label="questMode ? '返回闯关地图' : stage === 'menu' ? '返回课程列表' : '返回本课菜单'"
        :title="questMode ? '返回闯关地图' : stage === 'menu' ? '返回课程列表' : '返回本课菜单'"
      >
        <ChevronLeft class="k-ico" />
      </button>
      <div class="title">{{ lesson.emoji }} {{ lesson.title }}</div>
      <div class="star-badge">
        <Star class="k-ico star-fill" />{{ progress.lessonStars(lesson.id) }}
      </div>
      <ThemeToggle />
    </div>

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

    <!-- 结算 -->
    <div v-else-if="stage === 'result'" class="result view-body view-center">
      <!-- 闯关：关卡完成大画面（单关完成，多邻国式：点亮 + 开宝箱 + 下一关） -->
      <template v-if="questMode && questDone">
        <div class="quest-done-badge anim-pop">🎉 第 {{ questLevel }} 关完成！</div>
        <div class="stars">
          <span
            v-for="n in 3"
            :key="n"
            class="star anim-pop"
            :class="{ dim: n > lastStars }"
            :style="{ animationDelay: n * 0.2 + 's' }"
          >
            <Star class="k-ico star-fill" />
          </span>
        </div>
        <h2>{{ currentActName }} · 获得 {{ lastStars }} 颗星</h2>
        <p v-if="lastStars < 3" class="quest-total-stars">重玩可拿满 3 星</p>
        <!-- 今日目标首次达成：连击火焰横幅 -->
        <div v-if="streakJustHit" class="streak-banner anim-pop">
          🔥 今日目标达成！已连续 {{ streak.streak }} 天
        </div>
        <ChestReward />
        <div class="btn-row">
          <button class="k-btn gray" @click="backToMap">返回闯关地图</button>
          <button v-if="nextLevel" class="k-btn" @click="goNextLevel">
            下一关：<PathIcon :name="nextLevel.actKey" /> {{ nextLevel.name }} →
          </button>
        </div>
      </template>

      <!-- 自由练习：原结算 -->
      <template v-else>
        <div class="stars">
          <span
            v-for="n in 3"
            :key="n"
            class="star anim-pop"
            :class="{ dim: n > lastStars }"
            :style="{ animationDelay: n * 0.2 + 's' }"
          >
            <Star class="k-ico star-fill" />
          </span>
        </div>
        <h2>真棒！获得 {{ lastStars }} 颗星</h2>
        <!-- 今日目标首次达成：连击火焰横幅 -->
        <div v-if="streakJustHit" class="streak-banner anim-pop">
          🔥 今日目标达成！已连续 {{ streak.streak }} 天
        </div>
        <!-- 完成玩法 → 开宝箱拿奖励（每完成一次开一次） -->
        <ChestReward />
        <div class="btn-row">
          <button class="k-btn" @click="toMenu">再选一个玩法</button>
          <button v-if="nextLesson" class="k-btn gray" @click="router.push('/lesson/' + nextLesson.id)">
            下一课：<PathIcon :name="nextLesson.id" /> {{ nextLesson.title }}
          </button>
        </div>
      </template>
    </div>
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
.streak-banner {
  font-weight: 800;
  font-size: var(--fs-small);
  color: #7a4a00;
  background: linear-gradient(160deg, #ffe9a8, #ffd87a);
  border: 2px solid var(--gold);
  border-radius: var(--radius-pill);
  padding: var(--gap-xs) var(--gap-m);
  box-shadow: 0 var(--press) 0 rgba(0, 0, 0, 0.12);
}
.stars {
  display: flex;
  gap: var(--gap-s);
}
.star {
  font-size: var(--fs-emoji-xl);
  color: var(--yellow);
  display: inline-flex;
}
/* 未拿到的星用空心 + 压灰，拿到与没拿到一眼可辨 */
.star.dim {
  filter: grayscale(1);
  opacity: 0.4;
}
.star.dim .k-ico {
  fill: none;
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
.quest-total-stars {
  margin: 0;
  font-weight: 800;
  font-size: var(--fs-small);
  color: var(--ink-soft);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.quest-total-stars .k-ico {
  color: var(--gold);
}
.result h2 .total-stars {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--gold);
  vertical-align: baseline;
}
.quest-done-badge {
  font-size: var(--fs-emoji-xl);
  font-weight: 800;
  color: var(--gold);
  background: linear-gradient(160deg, #fff3cd, #ffe9a8);
  border: 3px solid var(--gold);
  border-radius: var(--radius-pill);
  padding: var(--gap-s) var(--gap-l);
  box-shadow: 0 var(--press) 0 rgba(0, 0, 0, 0.14), 0 0 20px rgba(255, 214, 110, 0.45);
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
