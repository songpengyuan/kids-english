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
import { speak, speakText, speakZh } from "../../services/speech";
import { emojiCoverUrl } from "../../utils/emojiCover";
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

/* ---------- 介绍文案的结构化排版（2026-11-14） ----------
 * intro 的后续段落是老师写的分节文案：亲子口语/口语句型/句子/歌词（句子）/
 * 拓展词汇 + 无前缀的绘本正文（歌谣分节）。此前整段塞进一个 <p>，"/"分隔
 * 挤成一坨；现在解析成条目：英文一行 + 中文小字，逐条可点读。
 * 条目形态两种：en（zh） 全角/半角括号对；en zh 无括号对（l13 拓展词汇，
 * 分隔符是全角"｜"）。分隔符 "/" 或 "｜"。 */
interface LinePair {
  en: string;
  zh: string;
}
function parseItem(raw: string): LinePair {
  const t = raw.trim();
  const paren = t.match(/^(.*?)\s*[（(]([^）)]*)[）)]\s*$/);
  if (paren) return { en: paren[1].trim(), zh: paren[2].trim() };
  const cjk = t.search(/[\u4e00-\u9fff]/);
  if (cjk > 0) return { en: t.slice(0, cjk).trim(), zh: t.slice(cjk).trim() };
  return { en: t, zh: "" };
}
function parseSection(p: string): LinePair[] {
  return p
    .replace(/^[^：]{1,12}[:：]\s*/, "")
    .split(/\s*\/\s*|\s*｜\s*/)
    .map(parseItem)
    .filter((x) => x.en || x.zh);
}
interface AboutSection {
  title: string;
  items: LinePair[];
}
const aboutSections = computed<{ sections: AboutSection[]; verses: LinePair[][] }>(() => {
  const sections: AboutSection[] = [];
  const verses: LinePair[][] = [];
  for (const p of paragraphs.value.slice(1)) {
    const prefix = p.match(/^([^：]{1,12})[:：]/)?.[1] ?? "";
    if (prefix.startsWith("重点词汇")) continue; // 词卡网格承担，不重复渲染
    if (/^(亲子口语|口语句型)/.test(prefix)) {
      sections.push({ title: "亲子口语", items: parseSection(p) });
    } else if (/^(拓展词汇|扩展词汇)/.test(prefix)) {
      sections.push({ title: "拓展词汇", items: parseSection(p) });
    } else if (/^(句子|歌词|歌词句子|绘本句子)/.test(prefix)) {
      sections.push({ title: "绘本句子", items: parseSection(p) });
    } else {
      verses.push(parseSection(p));
    }
  }
  return { sections, verses };
});

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
  if (!l) return [] as (Lesson["words"][number] & { wrong: number })[];
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

/* 点读：详情页的标题和词卡都能出声——词卡优先用课时里预生成的童声 mp3，
 * 没音频自动回退浏览器 TTS；标题按课名朗读（ttsOnly，不查词音文件） */
function speakTitle() {
  if (lesson.value) void speak(lesson.value.title, { ttsOnly: true });
}
function speakWord(w: Lesson["words"][number]) {
  if (lesson.value) void speak(w.en, { lessonId: lesson.value.id, wordId: w.id });
}
/** 口语/句子/拓展词汇条目点读：先英文再中文释义（介绍文案没有预生成 mp3，走 TTS） */
async function speakLine(it: { en: string; zh: string }) {
  if (it.en) await speakText(it.en, { rate: 0.85 });
  if (it.zh) await speakZh(it.zh, 1, { bypassMute: true });
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
      <!-- 课程头：原创封面图 + 中英文名 + 上课日期 -->
      <button type="button" class="about-hero" aria-label="朗读课程名" @click="speakTitle">
        <span class="about-emoji" :class="'tone-' + lesson.tone">
          <img
            v-if="emojiCoverUrl(lesson.emoji)"
            class="about-emoji__img"
            :src="emojiCoverUrl(lesson.emoji)!"
            alt=""
          />
          <template v-else>{{ lesson.emoji }}</template>
        </span>
        <h1 class="about-title">{{ lesson.title }}</h1>
        <p class="about-sub">{{ lesson.titleZh }}<span v-if="dateLabel"> · {{ dateLabel }}</span></p>
        <span class="about-hint">轻点标题 / 词卡可听发音</span>
      </button>

      <!-- 本课进度：孩子练到哪了、拿了多少星 -->
      <section class="about-card progress-card">
        <div class="progress-top">
          <span class="about-h progress-h">已完成 {{ doneCount }}/{{ actKeys.length }} 关</span>
          <span class="progress-pct">{{ percent }}%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" :style="{ width: percent + '%' }"></div></div>
        <div v-if="stars" class="progress-stars">⭐ 已得 {{ stars }} 颗星</div>
      </section>

      <!-- 需要加强的单词：只列本课答错过的词；点词卡先听发音（点读口径），
           重练走底部「开始学习」——一处入口就够，孩子点词永远等于听词 -->
      <section v-if="weakWords.length" class="about-card">
        <h2 class="about-h">需要加强的单词<span class="about-count">{{ weakWords.length }}</span></h2>
        <div class="weak-list">
          <button v-for="w in weakWords" :key="w.id" class="weak" :aria-label="`朗读 ${w.en}`" @click="speakWord(w)">
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
          <button
            v-for="w in lesson.words"
            :key="w.id"
            type="button"
            class="word"
            :aria-label="`朗读 ${w.en}`"
            @click="speakWord(w)"
          >
            <img v-if="w.image" class="word-img" :src="w.image" :alt="w.en" loading="lazy" />
            <span v-else class="word-emoji">{{ w.emoji }}</span>
            <span class="word-meta">
              <span class="word-en">{{ w.en }}</span>
              <span class="word-zh">{{ w.zh }}</span>
            </span>
          </button>
        </div>
      </section>

      <!-- 口语 / 句子 / 拓展词汇：解析成「英文 + 中文」条目，逐条点读 -->
      <section v-for="sec in aboutSections.sections" :key="sec.title" class="about-card">
        <h2 class="about-h">{{ sec.title }}<span class="about-count">{{ sec.items.length }}</span></h2>
        <div class="line-list">
          <button
            v-for="(it, i) in sec.items"
            :key="i"
            type="button"
            class="line"
            :aria-label="`朗读 ${it.en}`"
            @click="speakLine(it)"
          >
            <span class="line-en">{{ it.en }}</span>
            <span v-if="it.zh" class="line-zh">{{ it.zh }}</span>
          </button>
        </div>
      </section>

      <!-- 绘本正文：歌谣分节排版——节与节留空，行内英文 + 中文小字，同样可点读 -->
      <section v-if="aboutSections.verses.length" class="about-card">
        <h2 class="about-h">绘本正文</h2>
        <div v-for="(stanza, i) in aboutSections.verses" :key="i" class="verse">
          <button
            v-for="(it, j) in stanza"
            :key="j"
            type="button"
            class="line"
            :aria-label="`朗读 ${it.en}`"
            @click="speakLine(it)"
          >
            <span class="line-en">{{ it.en }}</span>
            <span v-if="it.zh" class="line-zh">{{ it.zh }}</span>
          </button>
        </div>
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
  width: 100%;
  padding: 16px var(--gap-m) 18px;
  font: inherit;
  color: inherit;
  cursor: pointer;
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
/* 原创封面图：占底座 78%，四周留白与纯文字 emoji 观感一致 */
.about-emoji__img {
  width: 78%;
  height: 78%;
  object-fit: contain;
}
.about-hero:active {
  transform: scale(0.99);
}
.about-hint {
  margin-top: 6px;
  color: var(--ink-faint);
  font-size: var(--fs-small);
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

/* 词卡：图 + 英 + 中。**卡宽由内容决定**（flex 流式换行）——固定 140px 列会把
 * jellyfish 这类长词截断成省略号、中文挤压换行；短词也不必占满列宽。 */
.word-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-s);
}
.word {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: none;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.word:active {
  transform: scale(0.97);
}
/* 词图与 emoji 分开写：只有图片需要"去底浮出"，emoji 仍要落在浅蓝底上才看得清。
 * 词图素材（public/lessons/<id>/words/*.webp）本来就是 512×512 透明实物抠图
 * （l4 实测透明率 60–85%），之前装进 44px 的 --brand-soft 方块 + cover，
 * 等于把"实物"压成了"缩略图"：色底是平的、图还被方块圈住。
 * 去底 + contain 之后图自己就是那个物体，与底部 tab / 关卡节点同一套观感。
 * 尺寸同时从 44 提到 52：素材画布里内容只占约 40% 边长（海马透明 85%），
 * 不放大就等于去掉了底板、物体反而更小。 */
.word-img {
  width: 52px;
  height: 52px;
  flex: none;
  object-fit: contain;
  /* 矩形图（如 sea 的海景）靠这一行保住圆角；透明图的四角本来就是空的，裁不到 */
  border-radius: 10px;
  /* 落地影：让它"放在纸上"，而不是"贴上去的一张图" */
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.18));
}
.word-emoji {
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 10px;
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
  white-space: nowrap;
}
.word-zh {
  font-size: var(--fs-small);
  color: var(--ink-faint);
}

/* 口语 / 句子 / 拓展词汇条目：英文一行 + 中文小字，整行可点读。
 * 竖排卡列表（原文案是"/"分隔挤成一段，孩子和家长都没法逐句跟读） */
.line-list {
  display: flex;
  flex-direction: column;
  gap: var(--gap-xs);
}
.line {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 10px var(--gap-s);
  border: 1px solid var(--line);
  border-radius: 12px;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.line:active {
  transform: scale(0.98);
}
.line-en {
  font-size: var(--fs-body);
  font-weight: var(--fw-mid);
  color: var(--ink);
  line-height: 1.35;
}
.line-zh {
  font-size: var(--fs-small);
  color: var(--ink-faint);
}
/* 绘本正文：歌谣分节——节间留空，行不加边框（诗的观感，不是按钮堆） */
.verse {
  margin-top: var(--gap-s);
}
.verse:first-of-type {
  margin-top: 0;
}
.verse .line {
  width: 100%;
  padding: 4px var(--gap-xs);
  border: none;
  border-radius: 8px;
}
.verse .line:active {
  transform: none;
  background: var(--brand-tint);
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
