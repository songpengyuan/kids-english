<script setup lang="ts">
/**
 * 家长学情页（/me/report）
 *
 * 面向家长（付费/决策角色）的"作业完成情况"视图，儿童界面不承载这些信息：
 * - 今日概览：学习时长 / 完成玩法数 / 今日目标 / 连击 / 总星星
 * - 掌握度趋势：已掌握 / 学习中 / 今天到期 + 最近 7 天曲线
 * - 今日单词明细：今天点读/答对/答错的每个单词（对错次数）
 * - 待巩固清单：尚未掌握的弱词（答错过且正确 ≤ 错误），按课分组
 * - 宝藏概览：贝壳 / 英雄图鉴进度 / 开箱次数
 *
 * 数据全部来自本地存储，无任何网络上报。
 *
 * 设计（2026-10 统一）：骨架 PageShell、卡片用全局 .card、卡片内标题用 .card-title。
 * 本页是**成人界面**，信息密度高于儿童页，因此字号统一走 --fs-small/--fs-body
 * 两档，不再各写 11/12/13/14px——在 iPad 上整表会随流体字号一起放大，家长更好读。
 */
import { computed } from "vue";
import { lessons } from "../../data/lessons";
import { isLessonKey, useProgressStore } from "../../stores/progress";
import { useRewardsStore } from "../../stores/rewards";
import { FORM_TOTAL } from "../../data/heroes";
import { useStreakStore } from "../../stores/streak";
import { useRouter } from "vue-router";
import { Flame, Star } from "@lucide/vue";
import PageShell from "../../components/ui/PageShell.vue";
import MasteryTrend from "../../components/report/MasteryTrend.vue";
import { dueWords } from "../../utils/reviewQueue";
import PathIcon from "../../components/PathIcon.vue";
import ShellIcon from "../../components/ShellIcon.vue";

const progress = useProgressStore();
const rewards = useRewardsStore();
const streak = useStreakStore();
const router = useRouter();

/** 全词库（词 id → 词面信息） */
const allWords = lessons.flatMap((l) => l.words);

function fmtDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m === 0) return `${rest} 秒`;
  return `${m} 分 ${rest} 秒`;
}

/** 今天（本地日期字符串） */
function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 时间戳是否属于今天 */
function isToday(ts?: number | null) {
  if (!ts) return false;
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}` === todayStr();
}

/** 今日单词明细：今天有点读/答对/答错记录的词 */
const todayWords = computed(() => {
  const out = [];
  for (const id of Object.keys(progress.progress)) {
    if (!isLessonKey(id)) continue;
    const words = progress.progress[id].words || {};
    for (const wordId of Object.keys(words)) {
      const w = words[wordId];
      if (!isToday(w.lastAt)) continue;
      const meta = allWords.find((x) => x.id === wordId && x.lessonId === id);
      out.push({
        lessonId: id,
        id: wordId,
        en: meta?.en || wordId,
        zh: meta?.zh || "",
        emoji: meta?.emoji || "🔤",
        seen: w.seen || 0,
        correct: w.correct || 0,
        wrong: w.wrong || 0,
      });
    }
  }
  // 最近的在前
  return out.sort((a, b) => {
    const wa = progress.progress[a.lessonId]?.words?.[a.id]?.lastAt || 0;
    const wb = progress.progress[b.lessonId]?.words?.[b.id]?.lastAt || 0;
    return wb - wa;
  });
});

/** 下次到期日文案：今天到期 / 明天 / M 月 D 日 */
function dueText(dueAt: number | null | undefined) {
  if (!dueAt) return "已掌握";
  const d = new Date(dueAt);
  const now = new Date();
  const dayDiff = Math.floor(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86400000
  );
  if (dayDiff <= 0) return "今天到期";
  if (dayDiff === 1) return "明天";
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/** 待巩固清单（按课分组）：未掌握的词 + 记忆阶段 + 下次到期 */
const weakByLesson = computed(() => {
  const map = new Map();
  for (const w of progress.getUnmasteredWords()) {
    const meta = allWords.find((x) => x.id === w.wordId && x.lessonId === w.lessonId);
    if (!map.has(w.lessonId)) map.set(w.lessonId, []);
    map.get(w.lessonId).push({
      id: w.wordId,
      en: meta?.en || w.wordId,
      zh: meta?.zh || "",
      emoji: meta?.emoji || "🔤",
      correct: w.correct,
      wrong: w.wrong,
      stage: w.stage,
      dueText: dueText(w.dueAt),
    });
  }
  return [...map.entries()].map(([lessonId, list]) => {
    const l = lessons.find((x) => x.id === lessonId);
    return { lessonId, title: l ? `${l.emoji} ${l.titleZh}` : lessonId, list };
  });
});

/** 掌握度概览 + 最近 7 天趋势（每日快照） */
const mastery = computed(() => progress.masterySummary());
const trendDays = computed(() => progress.recentDays(7));

/** 今天到期数按"能在词库中出题"的口径算，和复习页显示的数字保持一致 */
const dueCount = computed(() => dueWords(progress.getReviewQueue(), allWords).length);

/** 英雄图鉴进度 */
const heroDone = computed(() => `${rewards.ownedCount} / ${FORM_TOTAL}`);

const weakTotal = computed(() => weakByLesson.value.reduce((s, g) => s + g.list.length, 0));
</script>

<template>
  <PageShell
    scroll
    title="家长报告"
    icon="chart"
    back-label="返回"
    @back="router.push('/course')"
  >
    <template #right>
      <span class="report-date">{{ todayStr() }}</span>
    </template>

    <!-- 今日概览 -->
    <section class="card">
      <h3 class="card-title">今日概览</h3>
      <div class="kv">
        <div class="kv__item">
          <span class="kv__k">学习时长</span>
          <span class="kv__v">{{ fmtDuration(progress.todayStats.durationSec) }}</span>
        </div>
        <div class="kv__item">
          <span class="kv__k">完成玩法</span>
          <span class="kv__v">{{ progress.todayStats.activities }} 次</span>
        </div>
        <div class="kv__item">
          <span class="kv__k">今日目标</span>
          <span class="kv__v" :class="{ 'kv__v--ok': streak.todayDone }">
            {{ streak.todayDone ? "已达成" : "未达成" }}
            <Flame v-if="streak.todayDone" class="k-ico flame" />
          </span>
        </div>
        <div class="kv__item">
          <span class="kv__k">目标明细</span>
          <span class="kv__v">
            复习 {{ streak.reviewed }}/{{ streak.reviewGoal }} 词 · 新学 {{ streak.newLevels }}/1 关
          </span>
        </div>
        <div class="kv__item">
          <span class="kv__k">连续学习</span>
          <span class="kv__v"><Flame class="k-ico flame" />{{ streak.streak }} 天</span>
        </div>
        <div class="kv__item">
          <span class="kv__k">总星星</span>
          <span class="kv__v"><Star class="k-ico star-fill star" />{{ progress.totalStars }}</span>
        </div>
        <div class="kv__item">
          <span class="kv__k">学习单词</span>
          <span class="kv__v">{{ todayWords.length }} 个</span>
        </div>
      </div>
    </section>

    <!-- 掌握度趋势（间隔重复的"学会"口径） -->
    <section class="card">
      <h3 class="card-title">掌握度趋势</h3>
      <p class="sub-line">每个词按 1 / 3 / 7 / 14 天的间隔重复，连续答对 4 次算"已掌握"</p>
      <div class="kv">
        <div class="kv__item">
          <span class="kv__k">已掌握</span>
          <span class="kv__v kv__v--ok">{{ mastery.mastered }} 个</span>
        </div>
        <div class="kv__item">
          <span class="kv__k">学习中</span>
          <span class="kv__v">{{ mastery.learning }} 个</span>
        </div>
        <div class="kv__item">
          <span class="kv__k">今天到期</span>
          <span class="kv__v" :class="{ 'kv__v--bad': dueCount > 0 }">{{ dueCount }} 个</span>
        </div>
      </div>
      <MasteryTrend :days="trendDays" />
    </section>

    <!-- 今日单词明细 -->
    <section class="card">
      <h3 class="card-title">今天学了哪些词（{{ todayWords.length }}）</h3>
      <div v-if="todayWords.length" class="word-table">
        <div class="row row--head">
          <span>单词</span><span>中文</span><span>点读</span><span>答对</span><span>答错</span>
        </div>
        <div v-for="w in todayWords" :key="w.lessonId + ':' + w.id" class="row">
          <span class="row__en">{{ w.emoji }} {{ w.en }}</span>
          <span>{{ w.zh }}</span>
          <span>{{ w.seen }}</span>
          <span :class="{ 'row__bad': w.correct === 0 && w.wrong > 0 }">{{ w.correct }}</span>
          <span :class="{ 'row__bad': w.wrong > 0 }">{{ w.wrong }}</span>
        </div>
      </div>
      <p v-else class="empty-line">今天还没有学习记录，学一课就会出现这里。</p>
    </section>

    <!-- 待巩固清单 -->
    <section class="card">
      <h3 class="card-title">还不熟的词（{{ weakTotal }}）</h3>
      <p class="sub-line">这些词会按到期日自动回到首页的"到期复习"里</p>
      <div v-if="weakByLesson.length" class="weak-groups">
        <div v-for="g in weakByLesson" :key="g.lessonId" class="weak-group">
          <div class="weak-group__title">{{ g.title }}</div>
          <div class="chips">
            <span v-for="w in g.list" :key="w.id" class="chip">
              {{ w.emoji }} {{ w.en }} <i>{{ w.zh }}</i>
              <b class="chip__wrong">错 {{ w.wrong }}</b>
              <b class="chip__right">对 {{ w.correct }}</b>
              <b class="chip__due">{{ w.dueText }}</b>
            </span>
          </div>
        </div>
      </div>
      <p v-else class="empty-line empty-line--ok">全部掌握啦，真棒！</p>
    </section>

    <!-- 宝藏概览 -->
    <section class="card">
      <h3 class="card-title">宝藏罐</h3>
      <div class="kv">
        <div class="kv__item">
          <span class="kv__k">贝壳</span>
          <span class="kv__v"><ShellIcon /> {{ rewards.shells }}</span>
        </div>
        <div class="kv__item">
          <span class="kv__k">英雄图鉴</span>
          <span class="kv__v"><PathIcon name="sticker" class="mini-ico" /> {{ heroDone }}</span>
        </div>
        <div class="kv__item">
          <span class="kv__k">开箱次数</span>
          <span class="kv__v"><PathIcon name="gift" class="mini-ico" /> {{ rewards.chestsOpened }}</span>
        </div>
      </div>
    </section>

    <p class="foot">数据只保存在这台设备上，不会上传。</p>
  </PageShell>
</template>

<style scoped>
.report-date {
  font-weight: var(--fw-mid);
  font-size: var(--fs-small);
  color: var(--ink-faint);
  background: var(--card-bg);
  border-radius: var(--radius-pill);
  padding: 4px var(--gap-m);
  box-shadow: var(--shadow-hard);
  flex: none;
}

.sub-line {
  margin: calc(var(--gap-s) * -1) 0 var(--gap-s);
  font-size: var(--fs-small);
  color: var(--ink-faint);
  font-weight: var(--fw-mid);
}

/* ---------- 键值概览 ---------- */
.kv {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-s);
}
.kv__item {
  flex: 1 1 30%;
  min-width: 96px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--bg);
  border-radius: var(--radius-s);
  padding: var(--gap-s);
}
.kv__k {
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  color: var(--ink-faint);
}
.kv__v {
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
  color: var(--ink);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.kv__v--ok {
  color: var(--ok-dark);
}
.kv__v--bad {
  color: var(--red);
}

.flame {
  color: var(--c-orange);
}
.star {
  color: var(--gold);
}

/* ---------- 单词明细表 ---------- */
.word-table {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row {
  display: grid;
  grid-template-columns: 2.2fr 1.2fr 0.6fr 0.6fr 0.6fr;
  align-items: center;
  gap: var(--gap-xs);
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  color: var(--ink);
  padding: 5px var(--gap-s);
  border-radius: var(--radius-s);
}
/* 斑马纹：长表格里眼睛容易串行 */
.row:nth-child(2n) {
  background: var(--bg);
}
.row--head {
  font-size: var(--fs-small);
  color: var(--ink-faint);
  background: transparent;
}
.row__en {
  font-weight: var(--fw-strong);
}
.row__bad {
  color: var(--red);
  font-weight: var(--fw-strong);
}

/* ---------- 错词分组 ---------- */
.weak-groups {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
}
.weak-group__title {
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
  color: var(--ink-soft);
  margin-bottom: 6px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--bg);
  border-radius: var(--radius-pill);
  padding: 4px 10px;
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
  color: var(--ink);
}
.chip i {
  font-style: normal;
  color: var(--ink-soft);
  font-weight: var(--fw-mid);
}
.chip__wrong {
  color: var(--red);
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
}
.chip__right {
  color: var(--ok-dark);
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
}
.chip__due {
  color: var(--ink-faint);
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
}

.empty-line {
  margin: 0;
  color: var(--ink-faint);
  font-weight: var(--fw-mid);
  font-size: var(--fs-small);
}
.empty-line--ok {
  color: var(--ok-dark);
  font-weight: var(--fw-strong);
}
.foot {
  text-align: center;
  color: var(--ink-faint);
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  margin: 0;
}
</style>
