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

const CACHE_KEY = "kids-content-lessons-v1";

/** 后端课程 JSON → 前端 Lesson 形状（与本地数据对齐） */
function toLesson(raw: Record<string, unknown>): Lesson {
  const song = raw.song as Record<string, unknown>;
  const words = (raw.words as Record<string, unknown>[]) ?? [];
  const phrases = (raw.phrases as Record<string, unknown>[]) ?? [];
  return {
    id: raw.id as string,
    title: raw.title as string,
    titleZh: raw.titleZh as string,
    emoji: (raw.emoji as string) ?? "",
    tone: (raw.tone as Lesson["tone"]) ?? "blue",
    type: ((raw.type as Lesson["type"]) ?? "official") as Lesson["type"],
    date: (raw.date as string) ?? undefined,
    song: {
      audio: (song.audio as string) ?? null,
      video: (song.video as string) ?? null,
      scene: (song.scene as string) ?? "stage",
      lyrics: (song.lyrics as string[]) ?? [],
      timings: (song.timings as Lesson["song"]["timings"]) ?? null,
    },
    words: words.map((w) => ({
      id: w.id as string,
      en: w.en as string,
      zh: w.zh as string,
      emoji: (w.emoji as string) ?? "",
      image: (w.image as string) ?? null,
      audio: (w.audio as string) ?? null,
      lessonId: raw.id as string,
    })),
    phrases: phrases.map((p) => ({
      en: p.en as string,
      zh: p.zh as string,
      audio: (p.audio as string) ?? "",
    })),
  };
}

export const useContentStore = defineStore("content", () => {
  /** 概要列表（本地静态优先：顺序/字段与现状一致；远端成功后替换） */
  const summaries = ref<LessonSummary[]>([]);
  /** 远端课程详情缓存（id → Lesson），防重复请求 */
  const detailCache = ref<Record<string, Lesson>>({});
  /** 数据源标记：remote=已从后端拉取成功；local=本地静态 */
  const source = ref<"local" | "remote">("local");

  /** 当前可用的课程全量（对齐 src/data/lessons 的语义，未远端化时即本地数据） */
  const lessons = computed<Lesson[]>(() =>
    Object.keys(detailCache.value).length
      ? Object.values(detailCache.value).sort((a, b) => a.id.localeCompare(b.id))
      : localLessons,
  );

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
      const res = await requestWithTimeout<{ ok: boolean; lessons: LessonSummary[] }>(
        "/content/lessons",
      );
      if (res.ok && Array.isArray(res.lessons) && res.lessons.length) {
        summaries.value = res.lessons;
        source.value = "remote";
        // 预取全部详情缓存（内容库规模小，一次拿全最省请求）
        await Promise.all(
          res.lessons.map((s) => getLesson(s.id).catch(() => null)),
        );
      }
    } catch {
      /* 离线：保持本地 */
    }
  }

  /** 取课程详情：远端缓存优先 → 本地静态兜底 */
  async function getLesson(id: string): Promise<Lesson | null> {
    if (detailCache.value[id]) return detailCache.value[id];
    try {
      const res = await requestWithTimeout<{ ok: boolean; lesson: Record<string, unknown> }>(
        `/content/lessons/${id}`,
      );
      if (res.ok && res.lesson) {
        const lesson = toLesson(res.lesson);
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
