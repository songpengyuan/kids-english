// @vitest-environment jsdom
/**
 * content store 测试（契约对齐后端 /api/v1/content 真实返回）：
 * 远端拉取替换本地、离线降级本地、详情缓存复用。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useContentStore } from "../content";
import { setToken } from "../../services/api";
import type { components } from "../../types/api";

type LessonsOut = components["schemas"]["LessonsOut"];
type LessonDetailOut = components["schemas"]["LessonDetailOut"];

function mockFetch(routes: Record<string, unknown>) {
  const calls: Array<{ url: string }> = [];
  const fn = vi.fn(async (url: string) => {
    calls.push({ url });
    if (!(url in routes)) throw new TypeError("network down");
    return { ok: true, status: 200, json: async () => routes[url] } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}

const SUMMARY: LessonsOut = {
  ok: true,
  lessons: [
    { id: "l4", order_no: 4, title: "A Sailor Went to Sea", title_zh: "水手出海去", emoji: "🌊", tone: "blue", type: "official", date: "2026-09-18" },
    { id: "l5", order_no: 5, title: "I Am the Music Man", title_zh: "音乐人", emoji: "🎺", tone: "orange", type: "official", date: "2026-09-16" },
  ],
};

const DETAIL: LessonDetailOut = {
  ok: true,
  lesson: {
    id: "l4",
    title: "A Sailor Went to Sea",
    titleZh: "水手出海去",
    emoji: "🌊",
    tone: "blue",
    type: "official",
    song: {
      audio: "/lessons/l4/song.mp3",
      video: null,
      scene: "sea",
      lyrics: ["A sailor went to sea, sea, sea", "To see what he could see"],
      timings: { bpm: 120, beatsPerBar: 4, duration: 10, timeline: [0, 1, 2] },
    },
    words: [
      { id: "seahorse", en: "seahorse", zh: "海马", emoji: "🐴", image: "/lessons/l4/words/seahorse.png", audio: "/lessons/l4/audio/seahorse.mp3", group: "animals" },
    ],
    phrases: [{ en: "What do you see?", zh: "你看见什么啦？", audio: "/lessons/l4/audio/ph-1.mp3" }],
    colorPairs: [{ color: "blue", wordId: "seahorse" }],
    wordGroups: [{ key: "animals", name: "动物" }],
  },
};

/** 简版课程详情（后端契约要求 title/tone/type/song，必须齐全才合法） */
type Tone = components["schemas"]["LessonOut"]["tone"];
type LessonType = components["schemas"]["LessonOut"]["type"];
function briefLesson(id: string, title: string, titleZh: string, tone: Tone, type: LessonType = "official", lyrics: string[] = []): LessonDetailOut {
  return { ok: true, lesson: { id, title, titleZh, emoji: "", tone, type, song: { lyrics, scene: "stage" }, words: [], phrases: [] } };
}

describe("content store · 契约", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    setToken("tok");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("loadFromServer：只拉概要，详情按需加载（不预取）", async () => {
    const { calls } = mockFetch({
      "/api/v1/content/lessons": SUMMARY,
      "/api/v1/content/lessons/l4": DETAIL,
      "/api/v1/content/lessons/l5": briefLesson("l5", "I Am the Music Man", "音乐人", "orange"),
    });
    const c = useContentStore();
    await c.loadFromServer();
    expect(c.source).toBe("remote");
    expect(c.lessonList).toHaveLength(2);
    expect(c.lessonList[0].id).toBe("l4");
    // 没有预取详情：detailCache 为空，详情请求数为 0
    expect(Object.keys(c.detailCache)).toHaveLength(0);
    expect(calls.filter((x) => x.url.startsWith("/api/v1/content/lessons/l"))).toHaveLength(0);
    // 点进 l4 才发详情请求
    await c.getLesson("l4");
    expect(calls.filter((x) => x.url === "/api/v1/content/lessons/l4")).toHaveLength(1);
  });

  it("getLesson：远端详情转成前端 Lesson 形状（含 lessonId/timings）", async () => {
    mockFetch({
      "/api/v1/content/lessons": SUMMARY,
      "/api/v1/content/lessons/l4": DETAIL,
    });
    const c = useContentStore();
    const lesson = await c.getLesson("l4");
    expect(lesson).not.toBeNull();
    expect(lesson!.id).toBe("l4");
    expect(lesson!.words[0]).toMatchObject({ en: "seahorse", lessonId: "l4", image: "/lessons/l4/words/seahorse.png" });
    expect(lesson!.song.timings).toEqual({ bpm: 120, beatsPerBar: 4, duration: 10, timeline: [0, 1, 2] });
    expect(lesson!.phrases[0].audio).toBe("/lessons/l4/audio/ph-1.mp3");
    // 新增契约字段必须一起映射：词群（分组展示）与颜色配对（l11 连一连）
    expect(lesson!.words[0].group).toBe("animals");
    expect(lesson!.wordGroups).toEqual([{ key: "animals", name: "动物" }]);
    expect(lesson!.colorPairs).toEqual([{ color: "blue", wordId: "seahorse" }]);
  });

  it("后端不可用：降级本地静态数据（功能不受影响）", async () => {
    mockFetch({}); // 所有请求抛网络错误
    const c = useContentStore();
    const lesson = await c.getLesson("l4");
    expect(lesson).not.toBeNull();
    expect(lesson!.id).toBe("l4");
    // 本地兜底：静态数据有完整歌词
    expect(lesson!.song.lyrics.length).toBeGreaterThan(0);
  });

  it("远端列表为空/异常：保持本地 source", async () => {
    mockFetch({ "/api/v1/content/lessons": { ok: true, lessons: [] } });
    const c = useContentStore();
    await c.loadFromServer();
    expect(c.source).toBe("local"); // 空列表不切换数据源
    expect(c.lessonList.length).toBeGreaterThan(0); // 仍返回本地课程
  });

  it("部分详情拉取失败：远端成功的用远端，失败的降级本地", async () => {
    mockFetch({
      "/api/v1/content/lessons": SUMMARY,
      "/api/v1/content/lessons/l4": DETAIL,
      // l5 详情网络失败
    });
    const c = useContentStore();
    await c.loadFromServer();
    expect(c.source).toBe("remote");
    // l4 远端成功 → 带 timings
    const l4 = await c.getLesson("l4");
    expect(l4!.song.timings).toBeTruthy();
    // l5 远端失败 → 降级本地（仍有歌词）
    const l5 = await c.getLesson("l5");
    expect(l5!.song.lyrics.length).toBeGreaterThan(0);
  });

  it("远端新增课程：列表可见，点进去才拉详情", async () => {
    const NEW_SUMMARY: LessonsOut = {
      ok: true,
      lessons: [
        ...SUMMARY.lessons,
        { id: "l11", order_no: 11, title: "New Song", title_zh: "新课", emoji: "🎵", tone: "teal", type: "official", date: null },
      ],
    };
    mockFetch({
      "/api/v1/content/lessons": NEW_SUMMARY,
      "/api/v1/content/lessons/l11": briefLesson("l11", "New Song", "新课", "teal", "official", ["la la"]),
    });
    const c = useContentStore();
    await c.loadFromServer();
    // 列表里能看到 l11（来自 summaries）
    expect(c.lessonList.some((x) => x.id === "l11")).toBe(true);
    // 点进去才拉详情
    const l11 = await c.getLesson("l11");
    expect(l11!.id).toBe("l11");
    expect(l11!.song.lyrics).toContain("la la");
  });
});
