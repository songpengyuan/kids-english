<script setup>
/**
 * 家长学情页（/report）
 *
 * 面向家长（付费/决策角色）的"作业完成情况"视图，儿童界面不承载这些信息：
 * - 今日概览：学习时长 / 完成玩法数 / 今日目标 / 连击 / 总星星
 * - 今日单词明细：今天点读/答对/答错的每个单词（对错次数）
 * - 错词清单：尚未掌握的弱词（答错过且正确 ≤ 错误），按课分组
 * - 宝藏概览：贝壳 / 贴纸图鉴 / 开箱次数
 *
 * 数据全部来自本地存储，无任何网络上报。
 */
import { computed } from "vue";
import { lessons } from "../data/lessons";
import { useProgressStore } from "../stores/progress";
import { useRewardsStore } from "../stores/rewards";
import { useStreakStore } from "../stores/streak";
import { useRouter } from "vue-router";
import { ChevronLeft, Flame, Star } from "@lucide/vue";

const progress = useProgressStore();
const rewards = useRewardsStore();
const streak = useStreakStore();
const router = useRouter();

/** 全词库（词 id → 词面信息） */
const allWords = lessons.flatMap((l) => l.words);

function fmtDuration(sec) {
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
function isToday(ts) {
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
    if (id === "_daily" || id === "_last") continue;
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
        wrong: w.wrong || 0
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

/** 错词清单（按课分组） */
const weakByLesson = computed(() => {
  const map = new Map();
  for (const w of progress.getWeakWords()) {
    const meta = allWords.find((x) => x.id === w.wordId && x.lessonId === w.lessonId);
    if (!map.has(w.lessonId)) map.set(w.lessonId, []);
    map.get(w.lessonId).push({
      id: w.wordId,
      en: meta?.en || w.wordId,
      zh: meta?.zh || "",
      emoji: meta?.emoji || "🔤",
      correct: w.correct,
      wrong: w.wrong
    });
  }
  return [...map.entries()].map(([lessonId, list]) => {
    const l = lessons.find((x) => x.id === lessonId);
    return { lessonId, title: l ? `${l.emoji} ${l.titleZh}` : lessonId, list };
  });
});

const stickerDone = computed(() => `${rewards.stickers.length} / ${rewards.stickerTotal}`);
</script>

<template>
  <div class="report view">
    <div class="topbar">
      <button class="back" aria-label="返回首页" title="返回首页" @click="router.push('/')">
        <ChevronLeft class="k-ico" />
      </button>
      <div class="title">📊 家长报告</div>
      <div class="hint">{{ todayStr() }}</div>
    </div>

    <div class="body">
      <!-- 今日概览 -->
      <section class="card today">
        <h3>今日概览</h3>
        <div class="kv">
          <div class="item">
            <span class="k">学习时长</span>
            <span class="v">{{ fmtDuration(progress.todayStats.durationSec) }}</span>
          </div>
          <div class="item">
            <span class="k">完成玩法</span>
            <span class="v">{{ progress.todayStats.activities }} 次</span>
          </div>
          <div class="item">
            <span class="k">今日目标</span>
            <span class="v" :class="{ ok: streak.todayDone }">
              {{ streak.todayDone ? "已达成 🔥" : "未达成" }}
            </span>
          </div>
          <div class="item">
            <span class="k">连续学习</span>
            <span class="v"><Flame class="k-ico flame" />{{ streak.streak }} 天</span>
          </div>
          <div class="item">
            <span class="k">总星星</span>
            <span class="v"><Star class="k-ico star" />{{ progress.totalStars }}</span>
          </div>
          <div class="item">
            <span class="k">学习单词</span>
            <span class="v">{{ todayWords.length }} 个</span>
          </div>
        </div>
      </section>

      <!-- 今日单词明细 -->
      <section class="card">
        <h3>今天学了哪些词（{{ todayWords.length }}）</h3>
        <div v-if="todayWords.length" class="word-table">
          <div class="row head">
            <span>单词</span><span>中文</span><span>点读</span><span>答对</span><span>答错</span>
          </div>
          <div v-for="w in todayWords" :key="w.lessonId + ':' + w.id" class="row">
            <span class="en">{{ w.emoji }} {{ w.en }}</span>
            <span>{{ w.zh }}</span>
            <span>{{ w.seen }}</span>
            <span :class="{ bad: w.correct === 0 && w.wrong > 0 }">{{ w.correct }}</span>
            <span :class="{ bad: w.wrong > 0 }">{{ w.wrong }}</span>
          </div>
        </div>
        <p v-else class="empty-line">今天还没有学习记录，学一课就会出现这里。</p>
      </section>

      <!-- 错词清单 -->
      <section class="card">
        <h3>还不熟的词（{{ weakByLesson.reduce((s, g) => s + g.list.length, 0) }}）</h3>
        <p class="sub-line">答错次数 ≥ 答对次数的词，会出现在首页的"复习"里</p>
        <div v-if="weakByLesson.length" v-for="g in weakByLesson" :key="g.lessonId" class="weak-group">
          <div class="g-title">{{ g.title }}</div>
          <div class="chips">
            <span v-for="w in g.list" :key="w.id" class="chip">
              {{ w.emoji }} {{ w.en }} <i>{{ w.zh }}</i>
              <b class="wrong">错 {{ w.wrong }}</b><b class="right">对 {{ w.correct }}</b>
            </span>
          </div>
        </div>
        <p v-else class="empty-line ok">没有弱词，掌握得很好！</p>
      </section>

      <!-- 宝藏概览 -->
      <section class="card">
        <h3>宝藏罐</h3>
        <div class="kv">
          <div class="item">
            <span class="k">贝壳</span>
            <span class="v">🐚 {{ rewards.shells }}</span>
          </div>
          <div class="item">
            <span class="k">贴纸图鉴</span>
            <span class="v">🎨 {{ stickerDone }}</span>
          </div>
          <div class="item">
            <span class="k">开箱次数</span>
            <span class="v">📦 {{ rewards.chestsOpened }}</span>
          </div>
        </div>
      </section>

      <p class="foot">数据只保存在这台设备上，不会上传。</p>
    </div>
  </div>
</template>

<style scoped>
.report {
  gap: var(--gap-s);
}
.topbar {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  flex: none;
}
.back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: clamp(44px, 7vh, 52px);
  height: clamp(44px, 7vh, 52px);
  border-radius: var(--radius-pill);
  background: var(--card-bg);
  box-shadow: var(--shadow-hard);
  flex: none;
}
.topbar .title {
  font-weight: 800;
  font-size: var(--fs-title);
  color: var(--ink);
  flex: 1;
  min-width: 0;
}
.hint {
  font-weight: 700;
  font-size: var(--fs-small);
  color: var(--ink-faint);
  background: var(--card-bg);
  border-radius: var(--radius-pill);
  padding: 4px var(--gap-m);
  box-shadow: var(--shadow-hard);
  flex: none;
}

/* 家长页允许滚动（成人操作，不担心误触），内容可超一屏 */
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  gap: var(--gap-m);
  padding: 0 2px var(--gap-l);
}

.card {
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-m);
}
.card h3 {
  margin: 0 0 var(--gap-s);
  font-size: var(--fs-body);
  color: var(--ink);
}
.sub-line {
  margin: -4px 0 var(--gap-s);
  font-size: 12px;
  color: var(--ink-faint);
  font-weight: 600;
}

/* 键值概览 */
.kv {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-s);
}
.item {
  flex: 1 1 30%;
  min-width: 96px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--bg);
  border-radius: var(--radius-s);
  padding: var(--gap-s);
}
.item .k {
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-faint);
}
.item .v {
  font-weight: 800;
  font-size: var(--fs-body);
  color: var(--ink);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.item .v.ok {
  color: var(--green-dark);
}
.flame {
  color: #ff6b3d;
}
.star {
  color: var(--gold);
}

/* 单词明细表 */
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
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
  padding: 5px var(--gap-s);
  border-radius: var(--radius-s);
}
.row:nth-child(2n) {
  background: var(--bg);
}
.row.head {
  font-size: 12px;
  color: var(--ink-faint);
  font-weight: 700;
  background: transparent;
}
.row .en {
  font-weight: 800;
}
.row .bad {
  color: #e05b4e;
  font-weight: 800;
}

/* 错词分组 */
.weak-group {
  margin-bottom: var(--gap-s);
}
.g-title {
  font-weight: 800;
  font-size: 13px;
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
  font-weight: 800;
  font-size: 13px;
  color: var(--ink);
}
.chip i {
  font-style: normal;
  color: var(--ink-soft);
  font-weight: 600;
}
.chip .wrong {
  color: #e05b4e;
  font-size: 11px;
}
.chip .right {
  color: var(--green-dark);
  font-size: 11px;
}

.empty-line {
  margin: 0;
  color: var(--ink-faint);
  font-weight: 600;
  font-size: 13px;
}
.empty-line.ok {
  color: var(--green-dark);
  font-weight: 800;
}
.foot {
  text-align: center;
  color: var(--ink-faint);
  font-size: 12px;
  font-weight: 600;
  margin: 0;
}
</style>
