<script setup lang="ts">
/**
 * 我的（/me）——孩子视角。
 *
 * 设计系统第 ⑤ 层：页面只做**编排**，不写颜色、不写固定尺寸。
 * 所有视觉都来自第 ②③ 层（base.css 工具类 + components/ui 基础组件）。
 *
 * 2026-11-07 重设计（孩子/家长双受众分工，讨论定稿）：
 *   ① 荣誉头图   → 星星/贝壳/连击三个大数字（孩子的所有权物，全页视觉主角）
 *   ② 家长速览条 → 今天/本周分钟数（只读、免算术门；点进学习报告看细节）
 *      ——「算术门防的是按钮（改设置/删档案），不防看数字」；
 *      家长日常"瞄一眼"从三层+答题降为 0 层。
 *   ③ 主行动     → 继续学习（.entry-row--primary，一页仅一个）
 *   ④ 收藏磁贴   → 宝藏罐 / 学习日历（只做入口，不再复述荣誉条里的数字）
 * 原「今日蓝卡」（今天 X 分钟 + 目标进度条）整体撤下：分钟是家长语言、
 * 孩子读不懂；今日目标/分钟明细在学习报告页（数据同源）。
 *
 * 2026-10-17：下线「我的卡片」收集册（奥特曼卡池）——奖励体系统一到宝藏罐。
 */
import { computed, onMounted, ref, watch } from "vue";
import { useProgressStore } from "../../stores/progress";
import { useRewardsStore } from "../../stores/rewards";
import { useStreakStore } from "../../stores/streak";
import { useAuthStore } from "../../stores/auth";
import { useRoute, useRouter } from "vue-router";
import { lessons } from "../../data/lessons";
import { dueWords } from "../../utils/reviewQueue";
import PageShell from "../../components/ui/PageShell.vue";
import SectionTitle from "../../components/ui/SectionTitle.vue";
import { FORM_TOTAL } from "../../data/heroes";
import EntryRow from "../../components/ui/EntryRow.vue";
import IconTile from "../../components/ui/IconTile.vue";
import SkIcon from "../../components/ui/SkIcon.vue";
import ShellIcon from "../../components/ShellIcon.vue";
import ParentGate from "../../components/gate/ParentGate.vue";
import ThemeToggle from "../../components/layout/ThemeToggle.vue";
import AddToHomeDialog from "../../components/ui/AddToHomeDialog.vue";
import { useAddToHome } from "../../composables/useAddToHome";
import {
  ChevronRight,
  Download,
  Eye,
  Flame,
  Moon,
  Play,
  Shield,
  Star,
} from "@lucide/vue";
import { speakZh } from "../../services/speech";

const progress = useProgressStore();
const rewards = useRewardsStore();
const streak = useStreakStore();
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

/** 家长门禁弹层：家长中心需答对算术题才放行 */
const showGate = ref(false);

/**
 * 添加到桌面：家长从微信链接进来后最缺的一步。
 * Android Chrome 有系统安装框，先调一次（成功就不弹说明）；
 * iOS / 微信 / 桌面浏览器没有可用 API，直接落到分平台指引。
 * 已作为独立应用运行时 installVisible=false，入口自然消失。
 */
const {
  visible: installVisible,
  platform: installPlatform,
  promptInstall,
} = useAddToHome();
const showAddToHome = ref(false);

async function onAddToHome() {
  speakZh("添加到桌面");
  if (await promptInstall()) return;
  showAddToHome.value = true;
}

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
  // 进入"我的"页拉一次云端最新进度（速览条/荣誉跨设备可见；失败静默，保留本地）
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

/**
 * 今日总时长（分钟）：durationSec 本身**已包含磨耳朵**（见 addListenActivity：
 * 同一段秒数同时计入 durationSec 与 listenSec），不能再加一次 listenSec。
 */
const todayMin = computed(() => Math.round((progress.todayStats.durationSec || 0) / 60));
/** 本周学习分钟（家长速览条）：最近 7 个每日快照的时长求和（含今天） */
const weekMin = computed(() =>
  Math.round(progress.recentDays(7).reduce((s, d) => s + (d.durationSec || 0), 0) / 60)
);

/** 收藏磁贴：图鉴进度（rewards.ownedCount 已按星级>0 计数） */
const ownedForms = computed(() => rewards.ownedCount);

/** 主行动：接着上次没学完的那课继续 */
const continueLesson = computed(
  () => lessons.find((l) => l.id === progress.lastLesson) ?? lessons[0]
);

function goCalendar() {
  speakZh("学习日历");
  router.push("/me/calendar");
}
function goReport() {
  // 只读数据，不设算术门（门禁保护的是家长中心里的操作按钮）
  router.push("/me/report");
}
function goContinue() {
  speakZh("继续学习");
  const id = continueLesson.value?.id;
  if (id) router.push(`/course/${id}`);
}
function goTreasure() {
  speakZh("宝藏罐");
  router.push("/me/treasure");
}
</script>

<template>
  <PageShell bare scroll>
    <!-- ① 身份条 -->
    <header class="me-id">
      <span class="me-avatar" aria-hidden="true">{{ kidAvatar }}</span>
      <span class="me-id-info">
        <span class="me-name">{{ kidName }}</span>
        <span class="me-sub">第 {{ streak.streak }} 天连击</span>
      </span>
    </header>

    <!-- ② 荣誉头图：孩子的三个大数字（全页视觉主角）。贝壳/连击可点进对应页 -->
    <section class="honor" aria-label="我的荣誉">
      <div class="honor-stat">
        <span class="honor-num"><Star class="k-ico star-fill" />{{ progress.totalStars }}</span>
        <span class="honor-label">星星</span>
      </div>
      <button class="honor-stat" @click="goTreasure">
        <span class="honor-num"><ShellIcon />{{ rewards.shells }}</span>
        <span class="honor-label">贝壳</span>
      </button>
      <button class="honor-stat" @click="goCalendar">
        <span class="honor-num"><Flame class="k-ico flame-fill" />{{ streak.streak }}</span>
        <span class="honor-label">连击天</span>
      </button>
    </section>

    <!-- ③ 家长速览条（只读免门禁）：点进学习报告看今日目标/趋势/单词明细 -->
    <button class="glance" @click="goReport">
      <Eye class="k-ico" aria-hidden="true" />
      <span class="glance-text">今天 {{ todayMin }} 分 · 本周 {{ weekMin }} 分</span>
      <span class="glance-more">学习报告 <ChevronRight class="k-ico" /></span>
    </button>

    <!-- ④ 主行动：一页只有一个 -->
    <EntryRow
      primary
      title="继续学习"
      :desc="continueLesson?.title ?? '挑一课开始吧'"
      @click="goContinue"
    >
      <template #icon><IconTile><Play class="k-ico" /></IconTile></template>
    </EntryRow>

    <!-- 到期复习：有才出现 -->
    <EntryRow
      v-if="weakCount > 0"
      title="复习一下"
      :extra="`${weakCount} 个词`"
      @click="speakZh('复习一下'), router.push('/course/review')"
    >
      <template #icon>
        <SkIcon name="review" size="md" />
      </template>
    </EntryRow>

    <!-- ⑤ 收藏磁贴：只做入口（数字已在荣誉条，不在这里复述） -->
    <section class="collection">
      <SectionTitle>我的收藏</SectionTitle>
      <div class="collection-grid">
        <button class="coll-card tone-gold" @click="goTreasure">
          <span class="coll-ico" aria-hidden="true"><SkIcon name="jar" size="lg" /></span>
          <span class="coll-label">宝藏罐</span>
          <span class="coll-desc">英雄 {{ ownedForms }}/{{ FORM_TOTAL }}</span>
        </button>
        <button class="coll-card tone-blue" @click="goCalendar">
          <span class="coll-ico" aria-hidden="true"><SkIcon name="calendar" size="lg" /></span>
          <span class="coll-label">学习日历</span>
          <span class="coll-desc">看看你的打卡贴纸</span>
        </button>
      </div>
    </section>

    <!-- 夜间模式：孩子自己切换白天/夜晚（从家长中心挪出——这是孩子也能玩的开关） -->
    <div class="mode-row">
      <span class="mode-label"><Moon class="k-ico" /> 夜间模式</span>
      <ThemeToggle />
    </div>

    <!-- 添加到桌面：让 PWA 变成桌面上一个独立图标（家长最需要的"少一步"）。
         已安装时整行隐藏；不给自动弹窗，避免打断孩子 -->
    <EntryRow
      v-if="installVisible"
      title="添加到桌面"
      desc="一点就开，像 App 一样"
      @click="onAddToHome"
    >
      <template #icon>
        <IconTile tone="green"><Download class="k-ico" /></IconTile>
      </template>
    </EntryRow>

    <!-- 家长中心：低调的文字入口，避免孩子误点（进去才有算术门） -->
    <button class="parent-entry" @click="openParent">
      <Shield class="k-ico" />
      <span>家长中心</span>
    </button>
  </PageShell>

  <!-- 家长门禁弹层：答对算术题解锁（防孩子误入家长区） -->
  <ParentGate v-if="showGate" @pass="onGatePass" @close="onGateClose" />

  <!-- 添加到桌面：分平台步骤（iOS 无法程序化安装，只能讲清楚点哪里） -->
  <AddToHomeDialog
    v-if="showAddToHome"
    :platform="installPlatform"
    @close="showAddToHome = false"
  />
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

/* ---------- 荣誉头图：孩子的三个大数字 ---------- */
.honor {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--gap-s);
  padding: var(--gap-m) var(--gap-s);
  border-radius: var(--radius);
  background: var(--brand-grad);
  color: var(--on-tone);
  box-shadow: var(--sticker), 0 var(--press) 0 var(--brand-deep);
}
.honor-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  padding: 0;
  min-height: var(--tap-min);
  justify-content: center;
}
button.honor-stat:active {
  transform: scale(0.96);
}
.honor-num {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: calc(var(--fs-hero) * 0.9);
  font-weight: var(--fw-strong);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.honor-num .k-ico {
  width: 0.72em;
  height: 0.72em;
}
.honor-label {
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  opacity: 0.9;
}
.flame-fill {
  color: var(--tint-yellow);
}

/* ---------- 家长速览条（只读免门禁，点击进学习报告） ---------- */
.glance {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  min-height: var(--tap-min);
  padding: var(--gap-xs) var(--gap-s);
  border-radius: var(--radius);
  background: var(--card-bg);
  box-shadow: var(--shadow-soft);
  color: var(--ink-soft);
  font-size: var(--fs-small);
  text-align: left;
}
.glance-text {
  flex: 1;
  font-weight: var(--fw-mid);
  font-variant-numeric: tabular-nums;
}
.glance-more {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-weight: var(--fw-mid);
  color: var(--brand);
}

/* ---------- 我的收藏磁贴 ---------- */
.collection {
  display: flex;
  flex-direction: column;
  gap: var(--gap-xs);
}
.collection-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--gap-s);
}
.coll-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-xs);
  padding: var(--gap-m) var(--gap-s);
  border-radius: var(--radius);
  text-align: center;
  /* 按下下沉由 tone-* 注入，这里只补过渡 */
  transition: transform var(--dur-fast) var(--ease-out);
}
.coll-ico {
  /* 拟物图标（SkIcon lg=52px）自带尺寸，这里只负责居中对齐；
   * 不再用 font-size 驱动 —— img 不跟随字号缩放 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.coll-label {
  font-size: var(--fs-body);
  font-weight: var(--fw-strong);
}
.coll-desc {
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  opacity: 0.9;
}

/* ---------- 夜间模式行 ---------- */
.mode-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-s);
  padding: var(--gap-xs) var(--gap-s);
  border-radius: var(--radius);
  background: var(--card-bg);
  box-shadow: var(--shadow-soft);
}
.mode-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-body);
  font-weight: var(--fw-mid);
  color: var(--ink);
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
