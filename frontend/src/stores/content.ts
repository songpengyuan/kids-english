/**
 * 内容 store（P0）：课程列表/详情。
 *
 * 数据源策略（后端优先 + 离线降级）：
 * - 登录后尝试从 /api/v1/content 拉取，成功后缓存到 localStorage 并刷新界面；
 * - 后端不可用（GitHub Pages / 服务器挂 / 离线）时回退本地静态数据
 *   （src/data/lessons），应用功能不受影响——「进度上云」期间内容层零风险。
 */
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { requestWithTimeout } from "../services/api";
import { lessons as localLessons, getLesson as getLocalLesson } from "../data/lessons";
import type { Lesson } from "../data/lessons";
import type { LessonSummary } from "../types";
import type { components } from "../types/api";

/** 后端课程契约（openapi-typescript 自 backend/openapi.json 生成，勿手改） */
type LessonOut = components["schemas"]["LessonOut"];
type LessonSummaryOut = components["schemas"]["LessonSummaryOut"];

const CACHE_KEY = "kids-content-lessons-v1";

/** 后端课程 JSON（契约类型）→ 前端 Lesson 形状（与本地数据对齐） */
function toLesson(raw: LessonOut): Lesson {
  const song = raw.song;
  return {
    id: raw.id,
    title: raw.title,
    titleZh: raw.titleZh,
    emoji: raw.emoji ?? "",
    tone: raw.tone,
    type: raw.type,
    date: raw.date ?? undefined,
    stageStyle: raw.stageStyle === "dialog" ? "dialog" : "cards",
    song: {
      audio: song.audio ?? null,
      video: song.video ?? null,
      scene: song.scene ?? "stage",
      group: song.group ?? undefined,
      lyrics: song.lyrics ?? [],
      timings: song.timings ?? null,
      tracks: (song.tracks ?? []).map((t) => ({
        title: t.title ?? "",
        audio: t.audio ?? null,
        video: t.video ?? null,
        lyrics: t.lyrics ?? [],
        group: t.group ?? undefined,
      })),
    },
    words: (raw.words ?? []).map((w) => ({
      id: w.id,
      en: w.en,
      zh: w.zh,
      emoji: w.emoji ?? "",
      image: w.image ?? null,
      audio: w.audio ?? null,
      lessonId: raw.id,
      group: w.group ?? undefined,
    })),
    phrases: (raw.phrases ?? []).map((p) => ({
      en: p.en,
      zh: p.zh,
      audio: p.audio ?? "",
    })),
    // 契约里可能为 null（其他课不配）；转成前端可选字段
    colorPairs: raw.colorPairs ?? undefined,
    wordGroups: raw.wordGroups ?? undefined,
  };
}

export const useContentStore = defineStore("content", () => {
  /** 概要列表（本地静态优先：顺序/字段与现状一致；远端成功后替换） */
  const summaries = ref<LessonSummary[]>([]);
  /** 远端课程详情缓存（id → Lesson），防重复请求 */
  const detailCache = ref<Record<string, Lesson>>({});
  /** 数据源标记：remote=已从后端拉取成功；local=本地静态 */
  const source = ref<"local" | "remote">("local");

  /**
   * 当前可用的课程全量（远端详情为准、本地补缺口）。
   *
   * 合并策略：远端预取有部分失败（网络抖动）时，用本地静态数据补齐缺失课程，
   * 绝不因部分失败而丢课；后端新增课程（本地没有）也会自动并入。
   * 排序：按课程数字序（l4,l5,…,l10），与本地 lessons 语义一致。
   */
  const lessons = computed<Lesson[]>(() => {
    if (!Object.keys(detailCache.value).length) return localLessons;
    const merged = new Map(localLessons.map((l) => [l.id, l]));
    for (const [id, lesson] of Object.entries(detailCache.value)) {
      merged.set(id, lesson);
    }
    return [...merged.values()].sort(
      (a, b) => Number(a.id.replace(/\D/g, "")) - Number(b.id.replace(/\D/g, "")),
    );
  });

  /** 课程概要列表（若远端列表已加载用远端，否则由本地推导） */
  const lessonList = computed<LessonSummary[]>(() => {
    if (summaries.value.length) return summaries.value;
    return localLessons.map((l) => ({
      id: l.id,
      order_no: Number(l.id.replace(/\D/g, "")),
      title: l.title,
      title_zh: l.titleZh,
      emoji: l.emoji,
      tone: l.tone,
      type: l.type,
      date: l.date ?? null,
    }));
  });

  /** 拉取远端课程概要（登录后调用；失败静默保持本地） */
  async function loadFromServer(): Promise<void> {
    try {
      const res = await requestWithTimeout<components["schemas"]["LessonsOut"]>(
        "/content/lessons",
      );
      if (res.ok && Array.isArray(res.lessons) && res.lessons.length) {
        summaries.value = res.lessons as LessonSummary[];
        source.value = "remote";
        // 详情按需加载：点进哪课才请求哪课（getLesson 自带缓存），不预取全量
      }
    } catch {
      /* 离线：保持本地 */
    }
  }

  /** 取课程详情：远端缓存优先 → 本地静态兜底 */
  async function getLesson(id: string): Promise<Lesson | null> {
    if (detailCache.value[id]) return detailCache.value[id];
    try {
      const res = await requestWithTimeout<components["schemas"]["LessonDetailOut"]>(
        `/content/lessons/${id}`,
      );
      if (res.ok && res.lesson) {
        const lesson = toLesson(res.lesson as LessonOut);
        detailCache.value = { ...detailCache.value, [id]: lesson };
        return lesson;
      }
    } catch {
      /* 离线回退 */
    }
    return getLocalLesson(id);
  }

  return { summaries, detailCache, source, lessons, lessonList, loadFromServer, getLesson };
});
