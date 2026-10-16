<script setup lang="ts">
/**
 * 我的（/me）——孩子视角。
 *
 * 设计系统第 ⑤ 层：页面只做**编排**，不写颜色、不写固定尺寸。
 * 所有视觉都来自第 ②③ 层（base.css 工具类 + components/ui 基础组件）。
 *
 * 结构遵循「一屏三问」，按孩子的视线顺序排唯一注意力：
 *   ① 今天怎么样 → 今日卡（全页唯一的品牌蓝实底大卡）
 *   ② 现在干嘛   → 主行动「继续学习」（.entry-row--primary，一页仅一个）
 *   ③ 我攒了什么 → 我的收藏三卡
 * 其余（闯关 / 复习 / 家长中心）降为次要入口，不与主行动抢注意力。
 *
 * 变更记录：原版把身份、星、连击、两个大数字、一句提示全塞进 Hero，
 * 五类信息同权重，孩子抓不到重点；且「今日目标」与「今日数据」是两张各自独立、
 * 内容重复的卡。现在目标收进今日卡的进度条，闯关卡的自定义紫渐变换成色调板。
 */
import { computed, onMounted, ref, watch } from "vue";
import { useProgressStore } from "../../stores/progress";
import { useRewardsStore } from "../../stores/rewards";
import { FORM_TOTAL } from "../../data/heroes";
import { useStreakStore } from "../../stores/streak";
import { useCardsStore } from "../../stores/cards";
import { useAuthStore } from "../../stores/auth";
import { useRoute, useRouter } from "vue-router";
import { lessons } from "../../data/lessons";
import { dueWords } from "../../utils/reviewQueue";
import PageShell from "../../components/ui/PageShell.vue";
import EntryRow from "../../components/ui/EntryRow.vue";
import IconTile from "../../components/ui/IconTile.vue";
import MetricTile from "../../components/ui/MetricTile.vue";
import SectionTitle from "../../components/ui/SectionTitle.vue";
import ShellIcon from "../../components/ShellIcon.vue";
import ParentGate from "../../components/gate/ParentGate.vue";
import {
  Award,
  CalendarDays,
  Flame,
  Gamepad2,
  Layers,
  Play,
  RotateCcw,
  Shield,
  Star,
} from "@lucide/vue";
import { speakZh } from "../../services/speech";

const progress = useProgressStore();
const rewards = useRewardsStore();
const streak = useStreakStore();
const cards = useCardsStore();
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

/** 家长门禁弹层：家长中心需答对算术题才放行 */
const showGate = ref(false);

function openParent() {
  speakZh("家长中心");
  if (auth.parentUnlocked) {
    router.push("/me/parent");
    return;
  }
  showGate.value = true;
}
function onGatePass() {
  auth.unlockParent();
  showGate.value = false;
  router.push("/me/parent");
}
function onGateClose() {
  showGate.value = false;
}

onMounted(() => {
  // 深链/守卫重定向回来：?parentGate=1 → 弹门禁，并清掉 query（避免刷新重复弹）
  if (route.query.parentGate === "1") {
    showGate.value = true;
    router.replace({ query: {} });
  }
  // 进入"我的"页拉一次云端最新进度（今日学习/磨耳朵跨设备可见；失败静默，保留本地）
  progress.syncFromServer();
  rewards.syncFromServer();
});

// 每次切到"我的"tab 都重新拉一次云端（跨设备/刚学完课回来要看到最新数）
watch(
  () => route.path,
  (p) => {
    if (p === "/me") {
      progress.syncFromServer();
      rewards.syncFromServer();
    }
  }
);

/** 身份：云模式登录后显示当前孩子（未登录保持"丞丞"） */
const kidName = computed(() => auth.currentChild?.name ?? "丞丞");
const kidAvatar = computed(() => auth.currentChild?.avatar ?? "🦊");

const allWords = lessons.flatMap((l) => l.words);
const weakCount = computed(() => dueWords(progress.getReviewQueue(), allWords).length);

/** 今日累计（学习 + 磨耳朵），单位分钟 */
const todayMin = computed(() =>
  Math.round(((progress.todayStats.durationSec || 0) + (progress.todayStats.listenSec || 0)) / 60)
);
const learnMin = computed(() => Math.round((progress.todayStats.durationSec || 0) / 60));
const listenMin = computed(() => Math.round((progress.todayStats.listenSec || 0) / 60));

/** 今日目标完成度：复习完成率与新学一关，各占一半 */
const goalPct = computed(() => {
  const r = streak.reviewGoal > 0 ? Math.min(1, streak.reviewed / streak.reviewGoal) : 1;
  const l = Math.min(1, streak.newLevels / 1);
  return Math.round(((r + l) / 2) * 100);
});

/** 主行动：接着上次没学完的那课继续 */
const continueLesson = computed(
  () => lessons.find((l) => l.id === progress.lastLesson) ?? lessons[0]
);

function goCalendar() {
  speakZh("学习日历");
  router.push("/me/calendar");
}
function goContinue() {
  speakZh("继续学习");
  const id = continueLesson.value?.id;
  if (id) router.push(`/course/${id}`);
}
function goGame() {
  speakZh("游戏闯关");
  const id = progress.lastLesson || lessons[0]?.id || "l4";
  router.push(`/game/lesson/${id}`);
}
/** 带语音的跳转（收藏卡用） */
function sayEntry(name: string, path: string) {
  speakZh(name);
  router.push(path);
}
</script>

<template>
  <PageShell bare scroll>
    <!-- ① 身份条：紧凑一行，不再占用主卡的视觉重量 -->
    <header class="me-id">
      <span class="me-avatar" aria-hidden="true">{{ kidAvatar }}</span>
      <span class="me-id-info">
        <span class="me-name">{{ kidName }}</span>
        <span class="me-sub">第 {{ streak.streak }} 天连击</span>
      </span>
      <span class="me-pill" :title="`共 ${progress.totalStars} 颗星`">
        <Star class="k-ico star-fill" />{{ progress.totalStars }}
      </span>
      <span class="me-pill me-pill--flame" :title="`已连击 ${streak.streak} 天`">
        <Flame class="k-ico" />{{ streak.streak }}
      </span>
    </header>

    <!-- ② 今日卡：全页唯一的品牌蓝实底大卡，点击进学习日历 -->
    <section class="today" @click="goCalendar">
      <span class="today-head">
        <span class="today-label">今天</span>
        <span v-if="streak.todayDone" class="today-ok">已达标</span>
      </span>
      <span class="today-cal" aria-label="学习日历">
        <CalendarDays class="k-ico" /> 日历
      </span>

      <span class="today-main">
        <span class="today-num">{{ todayMin }}</span>
        <span class="today-unit">分钟</span>
      </span>
      <span class="today-goal">
        目标：复习 {{ streak.reviewed }}/{{ streak.reviewGoal }} 词 · 新学 {{ streak.newLevels }}/1 关
      </span>

      <span class="today-bar">
        <span class="today-fill" :style="{ width: goalPct + '%' }" />
      </span>
      <span class="today-sub">学习 {{ learnMin }} 分 · 磨耳朵 {{ listenMin }} 分</span>
    </section>

    <!-- ③ 主行动：一页只有一个 -->
    <EntryRow
      primary
      title="继续学习"
      :desc="continueLesson?.title ?? '挑一课开始吧'"
      @click="goContinue"
    >
      <template #icon><IconTile><Play class="k-ico" /></IconTile></template>
    </EntryRow>

    <!-- 次行动：白底卡，不与主行动抢注意力 -->
    <EntryRow title="闯关挑战" desc="打完单词，赢英雄卡" @click="goGame">
      <template #icon>
        <IconTile tone="purple"><Gamepad2 class="k-ico" /></IconTile>
      </template>
    </EntryRow>

    <!-- ④ 我的收藏 -->
    <SectionTitle>我的收藏</SectionTitle>
    <section class="stat-row">
      <button class="card stat-card" @click="sayEntry('宝藏罐', '/me/treasure')">
        <IconTile tone="gold"><ShellIcon /></IconTile>
        <MetricTile :value="rewards.shells" label="贝壳" />
      </button>
      <button class="card stat-card" @click="sayEntry('我的卡片', '/me/cards')">
        <IconTile tone="pink"><Layers class="k-ico" /></IconTile>
        <MetricTile :value="cards.uniqueCount" :total="cards.allCards.length" label="卡片" />
      </button>
      <button class="card stat-card" @click="sayEntry('英雄图鉴', '/me/treasure')">
        <IconTile tone="teal"><Award class="k-ico" /></IconTile>
        <MetricTile :value="rewards.ownedCount" :total="FORM_TOTAL" label="英雄" />
      </button>
    </section>

    <!-- 到期复习：有才出现 -->
    <EntryRow
      v-if="weakCount > 0"
      title="复习一下"
      :extra="`${weakCount} 个词`"
      @click="sayEntry('复习一下', '/course/review')"
    >
      <template #icon>
        <IconTile tone="orange"><RotateCcw class="k-ico" /></IconTile>
      </template>
    </EntryRow>

    <!-- 家长中心：低调的文字入口，避免孩子误点 -->
    <button class="parent-entry" @click="openParent">
      <Shield class="k-ico" />
      <span>家长中心</span>
    </button>
  </PageShell>

  <!-- 家长门禁弹层：答对算术题解锁（防孩子误入家长区） -->
  <ParentGate v-if="showGate" @pass="onGatePass" @close="onGateClose" />
</template>

<style scoped>
/* ---------- 身份条 ---------- */
.me-id {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  /* 首页无顶栏，刘海安全区由内容区自己补 */
  padding-top: max(var(--gap-m), env(safe-area-inset-top));
}
.me-avatar {
  font-size: var(--fs-emoji-l);
  line-height: 1;
  flex: none;
}
.me-id-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.me-name {
  font-size: var(--fs-title);
  font-weight: var(--fw-strong);
  color: var(--ink);
  line-height: 1.2;
}
.me-sub {
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.me-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
}
.me-pill--flame {
  background: var(--tint-yellow);
  color: var(--orange-dark);
}

/* ---------- 今日卡 ---------- */
.today {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
  padding: var(--gap-m);
  border-radius: var(--radius);
  background: var(--brand-grad);
  color: var(--on-tone);
  box-shadow: var(--sticker), 0 var(--press) 0 var(--brand-deep);
  cursor: pointer;
  transition: transform var(--dur-fast) var(--ease-out);
}
.today:active {
  transform: translateY(calc(var(--press) - 1px)) scale(0.99);
}
.today-head {
  display: flex;
  align-items: center;
  gap: var(--gap-xs);
  padding-right: 70px; /* 让出右上角日历胶囊 */
}
.today-label {
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
  opacity: 0.9;
}
.today-ok {
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  background: var(--ok);
  color: var(--on-tone);
}
.today-cal {
  position: absolute;
  top: var(--gap-m);
  right: var(--gap-m);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.22);
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
}
.today-main {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.today-num {
  font-size: var(--fs-hero);
  font-weight: var(--fw-strong);
  line-height: 1;
}
.today-unit {
  font-size: var(--fs-body);
  opacity: 0.9;
}
.today-goal,
.today-sub {
  font-size: var(--fs-small);
  opacity: 0.9;
}
.today-bar {
  display: block;
  height: 10px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.3);
  overflow: hidden;
}
.today-fill {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--on-tone);
  transition: width var(--dur-slow) var(--ease-pop);
}

/* ---------- 我的收藏 ---------- */
.stat-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--gap-s);
}
.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-xs);
  padding: var(--gap-m) var(--gap-s);
  transition: transform var(--dur-fast) var(--ease-out);
}
.stat-card:active {
  transform: translateY(calc(var(--press) - 1px)) scale(0.97);
}

/* ---------- 家长中心 ---------- */
.parent-entry {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: var(--tap-min);
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  color: var(--ink-faint);
}
</style>
