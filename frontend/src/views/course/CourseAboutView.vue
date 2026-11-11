<script setup lang="ts">
/**
 * 课程详情页 / 课时首页（#/course/:id/about）——课程卡片的落地页。
 *
 * 为什么独立成页（2026-11-11 交互评估）：
 *  - 挂成关卡会污染孩子“9 关 + 宝箱”的通关节奏，页里只有字、点不动，收益为负；
 *  - 塞在课程页折叠卡里，500+ 字展开后把关卡列表整屏推走，想回第 1 关得滑很久。
 * 所以拆成独立页：课程列表卡片先落到这里（介绍 + 进度 + 需加强的词），
 * 底部“开始学习 / 继续学习”再进关卡列表（#/course/:id）。
 *
 * 数据来源：
 *  - lesson.intro（老师给的整段文案，空行分段）；其中“重点词汇：…”那段不重复渲染，
 *    由词卡网格用 words 的图/英/中承担；
 *  - 进度/错词全部复用 useProgressStore（completed / 星级 / words.wrong），
 *    不新造状态，和关卡列表、复习页同一口径。
 */
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageShell from "../../components/ui/PageShell.vue";
import { activityKeys, getLesson as getLocalLesson, type Lesson } from "../../data/lessons";
import { useContentStore } from "../../stores/content";
import { useProgressStore } from "../../stores/progress";
import { Play } from "@lucide/vue";

const route = useRoute();
const router = useRouter();
const content = useContentStore();
const progress = useProgressStore();

defineOptions({ name: "CourseAboutView" });

const lessonId = computed(() => route.params.id as string);
const lesson = ref<Lesson | null>(getLocalLesson(lessonId.value));

watch(
  lessonId,
  async (id) => {
    lesson.value = getLocalLesson(id) ?? null;
    const remote = await content.getLesson(id);
    if (remote && lessonId.value === id) lesson.value = remote;
  },
  { immediate: true }
);

/** intro 按空行分段：第一段是绘本故事，其余是拓展词汇/绘本句子 */
const paragraphs = computed(() =>
  (lesson.value?.intro ?? "")
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
);
const story = computed(() => paragraphs.value[0] ?? "");
/** “重点词汇：…”由下方词卡承担，避免同一份信息在页面上出现两遍 */
const extras = computed(() =>
  paragraphs.value.slice(1).filter((p) => !p.startsWith("重点词汇"))
);

/* ---------- 本课进度（复刻关卡列表口径：已玩过的玩法数 / 总玩法数） ---------- */
const actKeys = computed(() => (lesson.value ? activityKeys(lesson.value) : []));
const doneCount = computed(() => {
  const id = lesson.value?.id;
  if (!id) return 0;
  const completed = progress.progress[id]?.completed || [];
  return actKeys.value.filter((k) => completed.includes(k)).length;
});
const percent = computed(() =>
  actKeys.value.length ? Math.min(100, Math.round((doneCount.value / actKeys.value.length) * 100)) : 0
);
const stars = computed(() => (lesson.value ? progress.lessonStars(lesson.value.id) : 0));
/** 本课答错过的词（按错次数降序）：详情页用来提示“这几个词需要加强” */
const weakWords = computed(() => {
  const l = lesson.value;
  if (!l) return [] as { id: string; en: string; zh: string; image?: string | null; emoji: string; wrong: number }[];
  const stats = progress.progress[l.id]?.words || {};
  return l.words
    .map((w) => ({ ...w, wrong: stats[w.id]?.wrong || 0 }))
    .filter((w) => w.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong)
    .slice(0, 8);
});
const ctaLabel = computed(() => {
  if (percent.value >= 100) return "再玩一遍";
  return percent.value > 0 ? "继续学习" : "开始学习";
});
function goLearn() {
  void router.push(`/course/${lessonId.value}`);
}

const dateLabel = computed(() => {
  const d = lesson.value?.date;
  if (!d) return "";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[2])} 月 ${Number(m[3])} 日` : d;
});

function goBack() {
  void router.push(`/course/${lessonId.value}`);
}
</script>

<template>
  <PageShell scroll back-label="返回" @back="goBack">
    <template #title><span>课程详情</span></template>

    <div v-if="lesson" class="about">
      <!-- 课程头：emoji 大图 + 中英文名 + 上课日期 -->
      <header class="about-hero">
        <span class="about-emoji" :class="'tone-' + lesson.tone">{{ lesson.emoji }}</span>
        <h1 class="about-title">{{ lesson.title }}</h1>
        <p class="about-sub">{{ lesson.titleZh }}<span v-if="dateLabel"> · {{ dateLabel }}</span></p>
      </header>

      <!-- 本课进度：孩子练到哪了、拿了多少星 -->
      <section class="about-card progress-card">
        <div class="progress-top">
          <span class="about-h progress-h">已完成 {{ doneCount }}/{{ actKeys.length }} 关</span>
          <span class="progress-pct">{{ percent }}%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" :style="{ width: percent + '%' }"></div></div>
        <div v-if="stars" class="progress-stars">⭐ 已得 {{ stars }} 颗星</div>
      </section>

      <!-- 需要加强的单词：只列本课答错过的词，点词卡可回关卡列表重练 -->
      <section v-if="weakWords.length" class="about-card">
        <h2 class="about-h">需要加强的单词<span class="about-count">{{ weakWords.length }}</span></h2>
        <div class="weak-list">
          <button v-for="w in weakWords" :key="w.id" class="weak" @click="goLearn">
            <img v-if="w.image" class="weak-img" :src="w.image" :alt="w.en" loading="lazy" />
            <span v-else class="weak-img weak-emoji">{{ w.emoji }}</span>
            <span class="weak-text">
              <span class="weak-en">{{ w.en }}</span>
              <span class="weak-wrong">错过 {{ w.wrong }} 次</span>
            </span>
          </button>
        </div>
      </section>

      <section v-if="story" class="about-card">
        <h2 class="about-h">绘本故事</h2>
        <p class="about-text">{{ story }}</p>
      </section>

      <section v-if="lesson.words.length" class="about-card">
        <h2 class="about-h">重点词汇<span class="about-count">{{ lesson.words.length }}</span></h2>
        <div class="word-grid">
          <div v-for="w in lesson.words" :key="w.id" class="word">
            <img v-if="w.image" class="word-img" :src="w.image" :alt="w.en" loading="lazy" />
            <span v-else class="word-emoji">{{ w.emoji }}</span>
            <div class="word-meta">
              <span class="word-en">{{ w.en }}</span>
              <span class="word-zh">{{ w.zh }}</span>
            </div>
          </div>
        </div>
      </section>

      <section v-if="extras.length" class="about-card">
        <div v-for="(p, i) in extras" :key="i" class="about-para">{{ p }}</div>
      </section>

      <!-- 主行动：进现在的关卡列表（#/course/:id） -->
      <div class="cta-bar">
        <button class="cta" @click="goLearn">
          <Play class="cta-ico" />
          <span>{{ ctaLabel }}</span>
        </button>
      </div>
    </div>

    <div v-else class="about-empty">这节课的介绍还没准备好</div>
  </PageShell>
</template>

<style scoped>
.about {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
  padding-bottom: 12px;
}

/* 课程头：沿用课卡的 tone 底色，让介绍页和课程页是同一门课 */
.about-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px var(--gap-m) 18px;
  border: 1.5px solid var(--line);
  border-radius: var(--radius);
  background: var(--card-bg);
  text-align: center;
}
.about-emoji {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--fs-emoji-xl) + 18px);
  height: calc(var(--fs-emoji-xl) + 18px);
  margin-bottom: 6px;
  border-radius: 24px;
  font-size: var(--fs-emoji-xl);
  line-height: 1;
}
.about-title {
  margin: 0;
  font-size: var(--fs-title);
  font-weight: var(--fw-strong);
  color: var(--ink);
}
.about-sub {
  margin: 0;
  color: var(--ink-soft);
  font-size: var(--fs-small);
}

.about-card {
  padding: 14px var(--gap-m);
  border: 1.5px solid var(--line);
  border-radius: var(--radius);
  background: var(--card-bg);
}
.about-h {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  font-size: var(--fs-body);
  font-weight: var(--fw-mid);
  color: var(--ink);
}
.about-count {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
}
.about-text {
  margin: 0;
  color: var(--ink-soft);
  font-size: var(--fs-small);
  line-height: 1.8;
}
.about-para {
  margin: 0 0 8px;
  color: var(--ink-soft);
  font-size: var(--fs-small);
  line-height: 1.8;
}
.about-para:last-child {
  margin-bottom: 0;
}

/* 词卡：图 + 英 + 中，两列（宽屏自动多列） */
.word-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--gap-s);
}
.word {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.word-img,
.word-emoji {
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 10px;
  object-fit: cover;
  background: var(--brand-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
}
.word-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.word-en {
  font-size: var(--fs-body);
  font-weight: var(--fw-mid);
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.word-zh {
  font-size: var(--fs-small);
  color: var(--ink-faint);
}

/* 进度卡：已完成 X/Y + 百分比 + 星数（口径与关卡列表一致） */
.progress-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-s);
}
.progress-h {
  margin: 0;
}
.progress-pct {
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  color: var(--brand);
}
.progress-bar {
  height: 8px;
  margin: 10px 0 6px;
  border-radius: 999px;
  background: var(--brand-tint);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--brand-grad);
  transition: width 0.25s ease;
}
.progress-stars {
  font-size: var(--fs-small);
  color: var(--ink-soft);
}

/* 需要加强的单词：词卡小格子，点一下回关卡列表重练 */
.weak-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--gap-s);
}
.weak {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.weak-img {
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: 10px;
  object-fit: cover;
  background: var(--brand-soft);
}
.weak-emoji {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}
.weak-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.weak-en {
  font-size: var(--fs-body);
  font-weight: var(--fw-mid);
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.weak-wrong {
  font-size: var(--fs-small);
  color: var(--orange);
}

/* 主行动：粘在滚动区底部的“开始学习 / 继续学习” */
.cta-bar {
  position: sticky;
  bottom: 0;
  z-index: 2;
  padding: 10px 0 2px;
  background: var(--bg);
}
.cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 52px;
  border: none;
  border-radius: 999px;
  background: var(--brand);
  color: var(--on-tone);
  font-size: var(--fs-btn);
  font-weight: var(--fw-strong);
  cursor: pointer;
  box-shadow: var(--shadow-hard);
}
.cta:active {
  transform: translateY(2px);
  box-shadow: var(--shadow-soft);
}
.cta-ico {
  width: 1.1em;
  height: 1.1em;
}

.about-empty {
  padding: 20px;
  text-align: center;
  color: var(--ink-faint);
}
</style>
