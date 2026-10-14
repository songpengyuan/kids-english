// @vitest-environment jsdom
/**
 * content store 测试（契约对齐后端 /api/v1/content 真实返回）：
 * 远端拉取替换本地、离线降级本地、详情缓存复用。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useContentStore } from "../content";
import { setToken } from "../../services/api";

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

const SUMMARY = {
  ok: true,
  lessons: [
    { id: "l4", order_no: 4, title: "A Sailor Went to Sea", title_zh: "水手出海去", emoji: "🌊", tone: "blue", type: "official", date: "2026-09-18" },
    { id: "l5", order_no: 5, title: "I Am the Music Man", title_zh: "音乐人", emoji: "🎺", tone: "orange", type: "official", date: "2026-09-16" },
  ],
};

const DETAIL = {
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
      { id: "seahorse", en: "seahorse", zh: "海马", emoji: "🐴", image: "/lessons/l4/words/seahorse.png", audio: "/lessons/l4/audio/seahorse.mp3" },
    ],
    phrases: [{ en: "What do you see?", zh: "你看见什么啦？", audio: "/lessons/l4/audio/ph-1.mp3" }],
  },
};

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

  it("loadFromServer：拉取概要 + 预取详情，远端数据源生效", async () => {
    const { calls } = mockFetch({
      "/api/v1/content/lessons": SUMMARY,
      "/api/v1/content/lessons/l4": DETAIL,
      "/api/v1/content/lessons/l5": { ok: true, lesson: { id: "l5", titleZh: "音乐人", tone: "orange", song: { lyrics: [], scene: "stage" }, words: [], phrases: [] } },
    });
    const c = useContentStore();
    await c.loadFromServer();
    expect(c.source).toBe("remote");
    expect(c.lessonList).toHaveLength(2);
    expect(c.lessonList[0].id).toBe("l4");
    // 预取了详情：l4 可从缓存取（不再发请求）
    expect(Object.keys(c.detailCache)).toContain("l4");
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
});
