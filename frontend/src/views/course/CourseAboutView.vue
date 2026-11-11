<script setup lang="ts">
/**
 * 课程介绍页（#/course/:id/about）——家长视角的课前/课后导读。
 *
 * 为什么独立成页（2026-11-11 交互评估）：
 *  - 挂成关卡会污染孩子“9 关 + 宝箱”的通关节奏，页里只有字、点不动，收益为负；
 *  - 塞在课程详情页折叠卡里，500+ 字展开后把关卡列表整屏推走，想回第 1 关得滑很久。
 * 所以课程页只留一张“课程简介”入口卡（一行摘要），真内容在这里整页读。
 *
 * 数据来源：lesson.intro（老师给的整段文案，空行分段）。其中“重点词汇：…”那段
 * 不再重复渲染——上面的词卡网格用 words 的图/英/中把它表达得更清楚。
 */
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageShell from "../../components/ui/PageShell.vue";
import { getLesson as getLocalLesson, type Lesson } from "../../data/lessons";
import { useContentStore } from "../../stores/content";

const route = useRoute();
const router = useRouter();
const content = useContentStore();

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
    <template #title><span>课程介绍</span></template>

    <div v-if="lesson" class="about">
      <!-- 课程头：emoji 大图 + 中英文名 + 上课日期 -->
      <header class="about-hero">
        <span class="about-emoji" :class="'tone-' + lesson.tone">{{ lesson.emoji }}</span>
        <h1 class="about-title">{{ lesson.title }}</h1>
        <p class="about-sub">{{ lesson.titleZh }}<span v-if="dateLabel"> · {{ dateLabel }}</span></p>
      </header>

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

.about-empty {
  padding: 20px;
  text-align: center;
  color: var(--ink-faint);
}
</style>
