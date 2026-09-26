<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { activityKeys, getLesson, lessons } from "../data/lessons";
import { useProgressStore } from "../stores/progress";
import { useRewardsStore } from "../stores/rewards";
import { useStreakStore } from "../stores/streak";
import { useRoute, useRouter } from "vue-router";
import { speak } from "../utils/speech";
import { useViewport } from "../composables/useViewport";
import { usePager } from "../composables/usePager";
import { pickColumns } from "../utils/layout";
import Pager from "./Pager.vue";
import GamePath from "./GamePath.vue";
import ThemeToggle from "./ThemeToggle.vue";
import { BookOpenText, Check, Star } from "@lucide/vue";

defineOptions({ name: "HomePage" }); // KeepAlive include 需要稳定组件名

const progress = useProgressStore();
const rewards = useRewardsStore();
const streak = useStreakStore();
const router = useRouter();

/**
 * 首页浏览模式：practice = 自由练习课程网格 / game = 游戏模式关卡路径。
 * 由底部导航驱动：自由 = 无 query，游戏 = ?mode=game（URL 可直达、可分享）。
 */
const route = useRoute();
const mode = computed(() => (route.query.mode === "game" ? "game" : "practice"));

const { isNarrow } = useViewport();

const GAP = 14;
const MIN_CARD_W = 170;
const MIN_CARD_H = 120;

/* ---------- 测量课时卡片区 ---------- */
const stageEl = ref(null);
const area = reactive({ w: 0, h: 0 });
let ro = null;
let raf = null;

function measure() {
  const el = stageEl.value;
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
  if (stageEl.value) ro.observe(stageEl.value);
});
onBeforeUnmount(() => {
  if (ro) ro.disconnect();
  if (raf) cancelAnimationFrame(raf);
});

/* ---------- 每页课时数与列数 ---------- */
const fit = computed(() => {
  if (!area.w || !area.h) return { cols: isNarrow.value ? 2 : 3, rows: 2 };
  return pickColumns({
    width: area.w,
    height: area.h,
    count: lessons.length,
    minCardW: MIN_CARD_W,
    minCardH: MIN_CARD_H,
    gap: GAP,
    maxCols: isNarrow.value ? 2 : 4,
    // 矮屏（手机横屏）两行课时卡放不下会顶破屏幕：强制单行，靠翻页看剩下的课
    maxRows: area.h < MIN_CARD_H * 2 + GAP ? 1 : 4,
    // 课时卡偏方形（emoji + 中文 + 英文 + 词数四行），目标略高于 1
    targetAspect: 1.0
  });
});

const perPage = computed(() => fit.value.cols * fit.value.rows);

const {
  page,
  total,
  items,
  next: gotoNext,
  prev: gotoPrev,
  go: gotoPage
} = usePager(lessons, perPage, {
  resetOn: [() => lessons.length]
});

const cardsStyle = computed(() => ({
  "--cols": fit.value.cols,
  "--grid-gap": `${GAP}px`
}));

function enter(l) {
  speak(l.words[0].en, { lessonId: l.id, wordId: l.words[0].id }); // 进课时先读一个单词，暖场
  router.push(`/lesson/${l.id}`);
}

/* ---------- 快捷引导：复习入口 + 继续上次课程 ---------- */
/** 待复习弱词数（答错过且正确 ≤ 错误）——有则显示"复习"入口 */
const weakCount = computed(() => progress.getWeakWords().length);
/** 最近进入过的课时（继续学习入口） */
const lastLessonObj = computed(() => {
  const id = progress.lastLesson;
  return id ? getLesson(id) : null;
});

/** 游戏模式通关数（顶部 header 进度，与 GamePath 节点口径一致） */
const gameDoneCount = computed(() =>
  lessons.filter((l) => progress.isCompleted(l.id, activityKeys(l))).length
);
</script>

<template>
  <div class="home view">
    <div class="theme-slot">
      <ThemeToggle />
    </div>
    <!-- 顶部 header bar（一行）：自由 = mascot+徽章 / 游戏 = 标题+通关进度 -->
    <header class="hero anim-fade-up">
      <div class="hdr-row">
        <div class="hdr-left">
          <svg v-if="mode === 'practice'" class="mascot" viewBox="0 0 64 64" aria-hidden="true">
            <path
              d="M32 4l7.6 15.6 17.2 2.4-12.5 12 3 17L32 43.2 16.7 51l3-17-12.5-12 17.2-2.4z"
              fill="var(--yellow)"
              stroke="var(--gold)"
              stroke-width="2.5"
              stroke-linejoin="round"
            />
            <g class="face">
              <circle cx="26" cy="30" r="2.6" fill="#4a3f35" />
              <circle cx="38" cy="30" r="2.6" fill="#4a3f35" />
              <path d="M27 36q5 4.5 10 0" stroke="#4a3f35" stroke-width="2.4" fill="none" stroke-linecap="round" />
              <circle cx="22.5" cy="34.5" r="2.6" fill="#ff9f9f" opacity=".65" />
              <circle cx="41.5" cy="34.5" r="2.6" fill="#ff9f9f" opacity=".65" />
            </g>
          </svg>
          <span v-else class="hdr-title">🎮 游戏闯关</span>
        </div>
        <span v-if="mode === 'game'" class="hdr-prog">{{ gameDoneCount }} / {{ lessons.length }} 关通关</span>
        <div v-else class="badges">
          <div class="star-badge">
            <Star class="k-ico star-fill" />我的星星：{{ progress.totalStars }}
          </div>
          <button class="treasure-badge" aria-label="打开宝藏罐" title="宝藏罐" @click="router.push('/treasure')">
            🐚 {{ rewards.shells }}<span class="tb-cap">宝藏</span>
          </button>
          <div class="streak-badge" :class="{ done: streak.todayDone }" :title="streak.todayDone ? '今天已达成目标' : '完成一个玩法点亮今天的火焰'">
            🔥 {{ streak.streak }}<span class="sb-cap">连击</span>
          </div>
        </div>
      </div>
    </header>

    <!-- 快捷引导：有弱词显示"复习"，有最近课程显示"继续学习"（自由练习模式） -->
    <div v-if="mode === 'practice' && (weakCount > 0 || lastLessonObj)" class="quick-links anim-fade-up">
      <button v-if="weakCount > 0" class="q-link review" @click="router.push('/review')">
        <BookOpenText class="k-ico" />复习 {{ weakCount }} 个词
      </button>
      <button v-if="lastLessonObj" class="q-link" @click="enter(lastLessonObj)">
        ⏩ 继续：{{ lastLessonObj.emoji }} {{ lastLessonObj.titleZh }}
      </button>
    </div>

    <template v-if="mode === 'practice'">
      <div class="stage view-body" ref="stageEl">
        <div class="cards" :style="cardsStyle">
          <button
            v-for="(l, i) in items"
            :key="l.id"
            class="lesson-card anim-pop"
            :class="'tone-' + l.tone"
            :style="{ animationDelay: Math.min(i, 8) * 0.08 + 's' }"
            @click="enter(l)"
          >
            <span class="big-emoji anim-float">{{ l.emoji }}</span>
            <span class="lt">{{ l.title }}</span>
            <span class="done" v-if="progress.isCompleted(l.id, activityKeys(l))">
              <Check class="k-ico" />全部通关
            </span>
            <span class="cnt">{{ l.words.length }} 个单词</span>
          </button>
        </div>
      </div>

      <Pager :page="page" :total="total" @prev="gotoPrev" @next="gotoNext" @go="gotoPage" />
    </template>

    <GamePath v-else class="gp-slot" @open="(id) => router.push(`/lesson/${id}?mode=quest`)" />

    <p class="foot">👨‍👩‍👧 建议家长陪同，每次 10~15 分钟</p>
  </div>
</template>

<style scoped>
/* 主题切换按钮固定在右上角，不挤占标题排版 */
.theme-slot {
  position: absolute;
  top: calc(var(--pad-y) + env(safe-area-inset-top) + 2px);
  right: calc(var(--pad-x) + env(safe-area-inset-right) + 4px);
  z-index: var(--z-banner);
}
.home {
  position: relative;
}
/* 顶部 header bar：一行，左右分栏（不再占两行的大标题/副标题） */
.hero {
  flex: none;
  width: 100%;
}
.hdr-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-s);
  width: 100%;
}
.hdr-left {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-xs);
  min-width: 0;
}
.hdr-title {
  font-size: var(--fs-title);
  font-weight: 800;
  color: var(--ink);
  white-space: nowrap;
}
.hdr-prog {
  font-weight: 800;
  font-size: var(--fs-small);
  color: var(--ink-soft);
  background: var(--card-bg);
  border-radius: var(--radius-pill);
  padding: 4px var(--gap-m);
  box-shadow: var(--shadow-hard);
  white-space: nowrap;
  flex: none;
}
/* 吉祥物：小 logo，轻轻浮动，偶尔眨眼 */
.mascot {
  width: 1.4em;
  height: 1.4em;
  animation: float-y 2.8s ease-in-out infinite;
  flex: none;
}
.mascot .face {
  transform-origin: 32px 30px;
  animation: blink 4.2s infinite;
}
@keyframes blink {
  0%, 92%, 100% { transform: scaleY(1); }
  95%, 97% { transform: scaleY(0.12); }
}

/* 游戏模式：占满剩余高度，路径图超高时可上下滚动（#app overflow hidden 下必须内部滚） */
.gp-slot {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin-top: var(--gap-s);
  -webkit-overflow-scrolling: touch;
}

/* 星星 + 宝藏 + 连击火焰并排（header 右侧，窄屏自动换行） */
.badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--gap-s);
}
.streak-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--card-bg);
  color: var(--ink-soft);
  border-radius: var(--radius-s);
  padding: clamp(6px, 1.2vh, 10px) clamp(10px, 1.6vw, 16px);
  box-shadow: 0 var(--press) 0 rgba(0, 0, 0, 0.12);
  font-weight: 800;
  font-size: var(--fs-body);
  transition: background 0.3s, color 0.3s;
}
.streak-badge.done {
  background: linear-gradient(160deg, #ff9f43, #ff6b3d);
  color: #fff;
  box-shadow: 0 var(--press) 0 rgba(0, 0, 0, 0.18), 0 0 14px rgba(255, 122, 61, 0.4);
}
.sb-cap {
  font-size: var(--fs-small);
  opacity: 0.9;
}
.treasure-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(160deg, #ffd87a, #f0b429);
  color: #6b4e00;
  border-radius: var(--radius-s);
  padding: clamp(6px, 1.2vh, 10px) clamp(10px, 1.6vw, 16px);
  box-shadow: 0 var(--press) 0 rgba(0, 0, 0, 0.18);
  font-weight: 800;
  font-size: var(--fs-body);
  transition: transform 0.1s;
}
.treasure-badge:active {
  transform: translateY(calc(var(--press) - 1px));
}
.tb-cap {
  font-size: var(--fs-small);
  opacity: 0.85;
}

/* 快捷引导（复习 / 继续学习）：给"练完就走"的孩子一个明确的下一步 */
.quick-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--gap-s);
  margin-top: var(--gap-s);
}
.q-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: clamp(7px, 1.4vh, 10px) clamp(12px, 1.8vw, 18px);
  border-radius: var(--radius-pill);
  font-weight: 800;
  font-size: var(--fs-small);
  color: var(--ink);
  background: var(--card-bg);
  box-shadow: var(--shadow-hard);
  transition: transform 0.1s, background 0.2s;
}
.q-link.review {
  background: linear-gradient(160deg, #ffd6a5, #ffb26b);
  color: #5c3a00;
}
.q-link:active {
  transform: translateY(calc(var(--press) - 1px));
}

/* 卡片区只负责"占满剩余高度"并可被测量 */
.stage {
  display: flex;
}
.cards {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr));
  grid-auto-rows: minmax(0, 1fr);
  gap: var(--grid-gap, 14px);
}
/* 底色 / 立体投影 / 文字色由 .tone-* 统一注入（见 base.css），这里只管排布 */
.lesson-card {
  border-radius: var(--radius);
  padding: var(--gap-s);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  position: relative;
  transition: transform 0.1s;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.lesson-card:active {
  transform: translateY(calc(var(--press) - 1px)) scale(0.98);
}
.big-emoji {
  font-size: var(--fs-emoji-xl);
  line-height: 1;
}
.lt {
  font-size: clamp(16px, min(3vh, 2.4vw), 24px);
  font-weight: 800;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.12);
  /* 英文标题较长，允许最多换两行，避免省略号截断 */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  line-height: 1.2;
  max-width: 100%;
}
.cnt {
  font-size: clamp(10px, min(1.6vh, 1.3vw), 13px);
  opacity: 0.85;
  font-weight: 700;
  white-space: nowrap;
}
.done {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--overlay);
  color: var(--green-dark);
  font-size: clamp(10px, min(1.6vh, 1.3vw), 12px);
  font-weight: 800;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.foot {
  text-align: center;
  color: var(--ink-faint);
  font-weight: 700;
  font-size: var(--fs-small);
  margin: 0;
  flex: none;
}

/* 手机横屏：标题和页脚都让位，把高度留给卡片 */
@media (max-height: 480px) {
  .hero h1 {
    font-size: 22px;
  }
  .sub,
  .foot {
    display: none;
  }
  .cnt {
    display: none;
  }
  /* 横屏时吉祥物离顶边只剩几个像素，浮动动画会瞬间探出屏幕，矮屏下关掉 */
  .mascot {
    animation: none;
  }
}

/* 卡片很矮时收紧行高，避免长英文标题换行溢出 */
@media (max-height: 620px) and (max-width: 600px) {
  .lt {
    -webkit-line-clamp: 1;
    font-size: 15px;
  }
}
</style>
