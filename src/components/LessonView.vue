<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import LearnView from "./LearnView.vue";
import QuizView from "./QuizView.vue";
import MatchView from "./MatchView.vue";
import SongView from "./SongView.vue";
import ChestReward from "./ChestReward.vue";
import SpeakView from "./SpeakView.vue";
import TalkView from "./TalkView.vue";
import ThemeToggle from "./ThemeToggle.vue";
import { bigCelebrate } from "../utils/effects";
import { lessons } from "../data/lessons";
import { useProgressStore } from "../stores/progress";
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

const props = defineProps({ lesson: { type: Object, required: true } });
const emit = defineEmits(["back", "next-lesson"]);

const { isNarrow } = useViewport();

const stage = ref("menu"); // menu | learn | quiz | match | song | talk | result
const lastStars = ref(0);

/** 调试深链：?lesson=l4&stage=learn，直接进入某个玩法页 */
const STAGES = ["learn", "quiz", "match", "speak", "song", "talk"];
onMounted(() => {
  const s = new URLSearchParams(location.search).get("stage");
  if (STAGES.includes(s)) {
    stage.value = s;
  } else {
    // 进入课程时报出主题歌名（英文），给孩子一个"这一课唱什么"的预期
    setTimeout(() => speak(props.lesson.title), 400);
  }
});

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
  if (props.lesson.phrases?.length) {
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
  stage.value = a.game === "song" ? "song" : a.key;
}

/** 菜单卡片右上角的星星徽章：该玩法已获得的星数 */
function showStars(key) {
  return progress.progress[props.lesson.id]?.[key] || 0;
}

function afterGame(stars) {
  lastStars.value = stars;
  progress.setGameStars(props.lesson.id, stage.value, stars);
  bigCelebrate();
  speakZh(stars >= 3 ? "太厉害了，满分三颗星" : "做得好，继续加油");
  stage.value = "result";
}

function afterSong() {
  stage.value = "result";
  lastStars.value = 1;
}

const lessonProgress = computed(() => {
  const done = progress.progress[props.lesson.id]?.completed?.length || 0;
  return Math.min(100, Math.round((done / activities.value.length) * 100));
});

/** 左上角 ←：玩法中先回本课菜单，菜单里再点才回课程列表（两步退出，防止误触跳走） */
function back() {
  if (stage.value !== "menu") {
    stage.value = "menu";
    return;
  }
  emit("back");
}

function toMenu() {
  stage.value = "menu";
}

/** 下一课（当前课是最后一课则为 null，结算页隐藏该按钮） */
const nextLesson = computed(() => {
  const i = lessons.findIndex((l) => l.id === props.lesson.id);
  return i >= 0 ? lessons[i + 1] || null : null;
});

</script>

<template>
  <div class="lesson view">
    <div class="topbar">
      <button
        class="back"
        @click="back"
        :aria-label="stage === 'menu' ? '返回课程列表' : '返回本课菜单'"
        :title="stage === 'menu' ? '返回课程列表' : '返回本课菜单'"
      >
        <ChevronLeft class="k-ico" />
      </button>
      <div class="title">{{ lesson.emoji }} {{ lesson.title }}</div>
      <div class="star-badge">
        <Star class="k-ico star-fill" />{{ progress.lessonStars(lesson.id) }}
      </div>
      <ThemeToggle />
    </div>

    <!-- 课时菜单 -->
    <div v-if="stage === 'menu'" class="menu view-body">
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
      <!-- 完成玩法 → 开宝箱拿奖励（每完成一次开一次） -->
      <ChestReward />
      <div class="btn-row">
        <button class="k-btn" @click="toMenu">再选一个玩法</button>
        <button v-if="nextLesson" class="k-btn gray" @click="emit('next-lesson', nextLesson.id)">
          下一课：{{ nextLesson.emoji }}{{ nextLesson.title }}
        </button>
      </div>
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
</style>
