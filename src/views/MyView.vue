<script setup lang="ts">
/**
 * 我的（/me）——个人中心，儿童友好的"成就汇总 + 功能入口"页：
 * - 身份/成就：吉祥物 + 总星星 + 连击
 * - 统计：星星 / 连击 / 贝壳 / 贴纸图鉴 / 今日时长 / 今日玩法
 * - 今日目标：复习 N 个到期词 + 新学 1 关（进度条 + 明细）
 * - 入口：宝藏罐 / 家长报告 / 到期复习（子页高亮"我的"tab，见 BottomNav）
 * - 设置：静音开关（音效与提示语）
 * 数据全部来自本地存储，不上传。
 */
import { computed } from "vue";
import { useProgressStore } from "../stores/progress";
import { useRewardsStore } from "../stores/rewards";
import { FORM_TOTAL } from "../data/heroes";
import { useStreakStore } from "../stores/streak";
import { useRouter } from "vue-router";
import SoundToggle from "../components/layout/SoundToggle.vue";
import { soundOn } from "../utils/sound";
import { lessons } from "../data/lessons";
import { dueWords } from "../utils/reviewQueue";
import AppHeader from "../components/layout/AppHeader.vue";
import { ChevronRight, Flame, Star } from "@lucide/vue";
import PathIcon from "../components/PathIcon.vue";
import ShellIcon from "../components/ShellIcon.vue";
import { speakZh } from "../utils/speech";

const progress = useProgressStore();
const rewards = useRewardsStore();
const streak = useStreakStore();
const router = useRouter();

/** 全词库（用于过滤掉课程已删除的残留词） */
const allWords = lessons.flatMap((l) => l.words);

function fmtDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m === 0) return `${rest} 秒`;
  return `${m} 分 ${rest} 秒`;
}

/** 今天到期该复习的词数（有则入口带数量） */
const weakCount = computed(() => dueWords(progress.getReviewQueue(), allWords).length);

/** 今日目标进度（复习到期词 + 新学一关） */
const goalPct = computed(() => {
  const reviewPart = streak.reviewGoal > 0 ? Math.min(1, streak.reviewed / streak.reviewGoal) : 1;
  const levelPart = Math.min(1, streak.newLevels / 1);
  return Math.round(((reviewPart + levelPart) / 2) * 100);
});

/** 英雄图鉴进度：已收集形态 / 总形态（旧版是"贴纸"，奖励经济改版后换成英雄形态） */
const heroDone = computed(() => `${rewards.ownedCount} / ${FORM_TOTAL}`);

const todayWords = computed(() => {
  let n = 0;
  for (const id of Object.keys(progress.progress)) {
    if (id === "_daily" || id === "_last") continue;
    const words = progress.progress[id].words || {};
    for (const wordId of Object.keys(words)) {
      const w = words[wordId];
      const ts = w.lastAt || 0;
      if (ts) {
        const d = new Date(ts);
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const today = `${d.getFullYear()}-${m}-${day}`;
        const now = new Date();
        const nowM = String(now.getMonth() + 1).padStart(2, "0");
        const nowDay = String(now.getDate()).padStart(2, "0");
        if (today === `${now.getFullYear()}-${nowM}-${nowDay}`) n++;
      }
    }
  }
  return n;
});
/** 我的页点击即发音：认字 + 认数（中文朗读，归音效开关） */
function sayProfile() {
  speakZh(`丞丞的学习小屋，${progress.totalStars} 颗星，${streak.streak} 天连击`);
}
function sayGoal() {
  const state = streak.todayDone ? "已达成" : "进行中";
  speakZh(`今日目标，${state}，复习到期词 ${streak.reviewed} 个，新学关卡 ${streak.newLevels} 个`);
}
function sayCell(label: string, text: string) {
  speakZh(`${label}，${text}`);
}
function sayEntry(name: string, path: string) {
  speakZh(name); // 先读名（TTS 全局继续），再进子页
  router.push(path);
}
</script>

<template>
  <div class="me view">
    <AppHeader title="我的" icon="me" />

    <div class="me-body view-body">
      <!-- 身份卡 -->
      <section class="profile card anim-pop" @click="sayProfile">
        <span class="pf-emoji">🦊</span>
        <div class="pf-info">
          <p class="pf-name">丞丞的学习小屋</p>
          <p class="pf-sub">
            <span class="pf-star"><Star class="k-ico star-fill" />{{ progress.totalStars }} 颗星</span>
            <span class="pf-flame"><Flame class="k-ico flame" />{{ streak.streak }} 天连击</span>
          </p>
        </div>
      </section>

      <!-- 今日目标：复习到期词 + 新学一关（家长/孩子都能看懂的两件事） -->
      <section class="goal card anim-fade-up" :class="{ done: streak.todayDone }" @click="sayGoal">
        <div class="goal-head">
          <h3>今日目标</h3>
          <span class="goal-state">{{ streak.todayDone ? "已达成" : "进行中" }}</span>
        </div>
        <div class="goal-bar"><div class="goal-fill" :style="{ width: goalPct + '%' }"></div></div>
        <p class="goal-line">
          复习到期词 <b>{{ streak.reviewed }}/{{ streak.reviewGoal }}</b>
          · 新学关卡 <b>{{ streak.newLevels }}/1</b>
        </p>
        <p class="goal-hint" v-if="weakCount > 0">首页「{{ weakCount }} 个词到期」入口就是复习</p>
        <p class="goal-hint" v-else>今天没有到期的词，直接去闯新关吧</p>
      </section>

      <!-- 成就统计 -->
      <section class="stats anim-fade-up">
        <div class="cell" @click="sayCell('总星星', `${progress.totalStars} 颗`)" role="button" tabindex="0" @keydown.enter="sayCell('总星星', `${progress.totalStars} 颗`)">
          <span class="v gold"><Star class="k-ico star-fill" />{{ progress.totalStars }}</span>
          <span class="k">总星星</span>
        </div>
        <div class="cell" @click="sayCell('连击天数', `${streak.streak} 天`)" role="button" tabindex="0" @keydown.enter="sayCell('连击天数', `${streak.streak} 天`)">
          <span class="v"><Flame class="k-ico flame" />{{ streak.streak }}</span>
          <span class="k">连击天数</span>
        </div>
        <div class="cell" @click="sayCell('贝壳', `${rewards.shells} 个`)" role="button" tabindex="0" @keydown.enter="sayCell('贝壳', `${rewards.shells} 个`)">
          <span class="v"><ShellIcon />{{ rewards.shells }}</span>
          <span class="k">贝壳</span>
        </div>
        <div class="cell" @click="sayCell('英雄图鉴', `${rewards.ownedCount} 个`)" role="button" tabindex="0" @keydown.enter="sayCell('英雄图鉴', `${rewards.ownedCount} 个`)">
          <span class="v"><PathIcon name="sticker" class="st-ico" />{{ heroDone }}</span>
          <span class="k">英雄图鉴</span>
        </div>
        <div class="cell" @click="sayCell('今日时长', fmtDuration(progress.todayStats.durationSec))" role="button" tabindex="0" @keydown.enter="sayCell('今日时长', fmtDuration(progress.todayStats.durationSec))">
          <span class="v"><PathIcon name="clock" class="st-ico" />{{ fmtDuration(progress.todayStats.durationSec) }}</span>
          <span class="k">今日时长</span>
        </div>
        <div class="cell" @click="sayCell('今日玩法', `${progress.todayStats.activities} 次`)" role="button" tabindex="0" @keydown.enter="sayCell('今日玩法', `${progress.todayStats.activities} 次`)">
          <span class="v"><PathIcon name="activity" class="st-ico" />{{ progress.todayStats.activities }} 次</span>
          <span class="k">今日玩法</span>
        </div>
      </section>

      <!-- 功能入口 -->
      <section class="entries anim-fade-up">
        <button class="entry" @click="sayEntry('宝藏罐', '/treasure')">
          <span class="en-ico"><PathIcon name="gift" /></span>
          <span class="en-cap">宝藏罐</span>
          <span class="en-desc">贝壳 · 贴纸图鉴</span>
          <ChevronRight class="k-ico en-arrow" />
        </button>
        <button class="entry" @click="sayEntry('家长报告', '/report')">
          <span class="en-ico"><PathIcon name="chart" /></span>
          <span class="en-cap">家长报告</span>
          <span class="en-desc">掌握度趋势 · 待巩固词</span>
          <ChevronRight class="k-ico en-arrow" />
        </button>
        <button class="entry" @click="sayEntry('到期复习', '/review')">
          <span class="en-ico"><PathIcon name="review" /></span>
          <span class="en-cap">到期复习</span>
          <span class="en-desc" v-if="weakCount">今天有 {{ weakCount }} 个词到期</span>
          <span class="en-desc" v-else>今天没有到期的词</span>
          <ChevronRight class="k-ico en-arrow" />
        </button>
      </section>

      <section class="settings">
        <span class="set-cap" @click="sayCell('静音设置', '只关音效与提示语，单词发音保留')"><PathIcon name="me" class="set-ico" />静音（只关音效与提示语，单词发音保留）</span>
        <SoundToggle />
      </section>

      <p class="foot" @click="sayCell('数据说明', '只保存在这台设备上，不会上传')">数据只保存在这台设备上，不会上传。{{ soundOn ? "" : "（已静音）" }}</p>
    </div>
  </div>
</template>

<style scoped>
.me {
  align-items: center;
}

/* 今日目标卡片 */
.goal {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
  width: 100%;
}
.goal.done {
  box-shadow: var(--shadow-hard), inset 0 0 0 2px var(--green);
}
.goal-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--gap-s);
}
.goal-head h3 {
  margin: 0;
}
.goal-state {
  font-weight: 800;
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.goal.done .goal-state {
  color: var(--green-dark);
}
.goal-bar {
  height: 10px;
  border-radius: var(--radius-pill);
  background: var(--line);
  overflow: hidden;
}
.goal-fill {
  height: 100%;
  border-radius: var(--radius-pill);
  background: linear-gradient(90deg, var(--green), var(--green-dark));
  transition: width var(--dur-slow) var(--ease-out);
}
.goal-line,
.goal-hint {
  margin: 0;
  font-weight: 700;
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.goal-line b {
  color: var(--ink);
}
.goal-hint {
  color: var(--ink-faint);
}

/* 设置行 */
.settings {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-s);
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-s) var(--gap-m);
}
.set-cap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.set-ico {
  color: var(--ink-faint);
}
.me-body {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
  width: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: var(--pad-y);
}
.card {
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-m);
}
.profile {
  display: flex;
  align-items: center;
  gap: var(--gap-m);
  border-left: 8px solid var(--yellow);
}
.st-ico {
  width: 1em;
  height: 1em;
  vertical-align: -0.12em;
  margin-right: 4px;
}
.en-ico {
  display: inline-flex;
  font-size: 22px;
}
.pf-emoji {
  font-size: var(--fs-emoji-xl);
  line-height: 1;
}
.pf-info {
  min-width: 0;
}
.pf-name {
  margin: 0;
  font-weight: 800;
  font-size: var(--fs-body);
  color: var(--ink);
}
.pf-sub {
  margin: 4px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-s);
  font-weight: 800;
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.pf-star .k-ico,
.stats .gold .k-ico {
  color: var(--gold);
}
.pf-flame .k-ico,
.stats .flame {
  color: #ff6b3d;
}
.flame {
  color: #ff6b3d;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--gap-s);
}
.stats .cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-s) 4px;
}
.stats .v {
  font-weight: 800;
  font-size: var(--fs-body);
  color: var(--ink);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.stats .k {
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-faint);
}

.entries {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
}
.entry {
  display: flex;
  align-items: center;
  gap: var(--gap-m);
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-s) var(--gap-m);
  transition: transform 0.1s;
  text-align: left;
}
.entry:active {
  transform: translateY(calc(var(--press) - 1px));
}
.profile:active,
.goal:active,
.stats .cell:active,
.set-cap:active,
.foot:active {
  transform: translateY(1px);
  transition: transform 0.08s;
}
.en-ico {
  font-size: var(--fs-emoji-l);
  line-height: 1;
}
.en-cap {
  font-weight: 800;
  font-size: var(--fs-body);
  color: var(--ink);
  flex: none;
}
.en-desc {
  flex: 1;
  font-weight: 700;
  font-size: var(--fs-small);
  color: var(--ink-faint);
  text-align: right;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.en-arrow {
  color: var(--ink-faint);
  flex: none;
}
.foot {
  text-align: center;
  color: var(--ink-faint);
  font-size: 12px;
  font-weight: 600;
  margin: 0;
}
</style>
