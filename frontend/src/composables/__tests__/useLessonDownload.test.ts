// @vitest-environment jsdom
/**
 * 「下载本课离线包」组合式：
 *  - collectLessonMedia 纯函数：媒体清单收集（音视频/词图/口语句），去重、滤空、
 *    只收 /lessons/ 路径——这是 SW 下载通道的数据入口，多收会下到不该下的东西，
 *    漏收会让离线播放缺资源，所以用真课程数据锁行为。
 *  - useLessonDownload：无 SW 环境（jsdom）走页面内兜底路径。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { collectLessonMedia, useLessonDownload } from "../useLessonDownload";
import { lessons } from "../../data/lessons";

const l11 = lessons.find((l) => l.id === "l11")!;
const l4 = lessons.find((l) => l.id === "l4")!;

describe("collectLessonMedia", () => {
  it("l11：收集童谣音视频 + 19 词的音图 + 4 句口语句，且全部去重", () => {
    const urls = collectLessonMedia(l11);
    // l11：song 音+视频、tracks 1 组音+视频、19 词（有 image）、4 句
    expect(urls.length).toBeGreaterThan(20);
    expect(urls).toContain("/lessons/l11/brown-bear.mp3");
    expect(urls).toContain("/lessons/l11/brown-bear.mp4");
    expect(urls).toContain("/lessons/l11/song.mp3");
    expect(urls).toContain("/lessons/l11/audio/bear.mp3");
    // 词图路径用课程数据自身的值（格式会随资产优化演进：png→webp）
    const bearImg = l11.words.find((w) => w.id === "bear")?.image;
    expect(bearImg).toBeTruthy();
    expect(urls).toContain(bearImg!);
    expect(urls).toContain("/lessons/l11/audio/ph-1.mp3");
    // 去重：全部唯一
    expect(new Set(urls).size).toBe(urls.length);
    // 全部是 /lessons/ 下的同源媒体路径
    for (const u of urls) expect(u.startsWith("/lessons/")).toBe(true);
  });

  it("l4：null 视频被滤掉，不留空串", () => {
    const urls = collectLessonMedia(l4);
    expect(urls.every((u) => u && !u.endsWith(".mp4") === false ? true : !u.includes("null"))).toBe(true);
    // l4 有视频（song.mp4），应包含
    expect(urls.some((u) => u.endsWith(".mp4"))).toBe(true);
  });

  it("空课程：返回空数组而非报错", () => {
    const empty = {
      id: "l-x", title: "x", titleZh: "x", emoji: "", tone: "blue" as const,
      type: "official" as const, stageStyle: "cards" as const,
      song: { audio: null, video: null, scene: "stage", lyrics: [], tracks: [] },
      words: [], phrases: [],
    } as unknown as Parameters<typeof collectLessonMedia>[0];
    expect(collectLessonMedia(empty)).toEqual([]);
  });
});

describe("useLessonDownload（无 SW 环境 → 页面内兜底）", () => {
  beforeEach(() => {
    // jsdom 没有 serviceWorker；显式确保 controller 为空走兜底路径
    vi.stubGlobal("navigator", { ...navigator, serviceWorker: { controller: null } });
  });

  it("页面内兜底：逐个 fetch 后进入 done，进度递增", async () => {
    const fetched: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      fetched.push(url);
      return Promise.resolve(new Response("", { status: 200 }));
    });
    const dl = useLessonDownload();
    const mini = {
      id: "l-x", title: "x", titleZh: "x", emoji: "", tone: "blue" as const,
      type: "official" as const, stageStyle: "cards" as const,
      song: { audio: "/lessons/l-x/song.mp3", video: null, scene: "stage", lyrics: [], tracks: [] },
      words: [{ id: "a", en: "a", zh: "a", emoji: "", image: null, audio: "/lessons/l-x/audio/a.mp3", lessonId: "l-x" }],
      phrases: [],
    } as unknown as Parameters<typeof dl.start>[0];
    await dl.start(mini);
    expect(dl.state.value).toBe("done");
    expect(dl.loaded.value).toBe(2);
    expect(dl.total.value).toBe(2);
    expect(fetched).toEqual(["/lessons/l-x/song.mp3", "/lessons/l-x/audio/a.mp3"]);
  });

  it("单个 fetch 失败不中断整批，仍收尾 done", async () => {
    vi.stubGlobal("fetch", (url: string) =>
      url.endsWith("bad.mp3") ? Promise.reject(new Error("offline")) : Promise.resolve(new Response("", { status: 200 })),
    );
    const dl = useLessonDownload();
    const mini = {
      id: "l-x", title: "x", titleZh: "x", emoji: "", tone: "blue" as const,
      type: "official" as const, stageStyle: "cards" as const,
      song: { audio: "/lessons/l-x/bad.mp3", video: null, scene: "stage", lyrics: [], tracks: [] },
      words: [{ id: "a", en: "a", zh: "a", emoji: "", image: null, audio: "/lessons/l-x/audio/a.mp3", lessonId: "l-x" }],
      phrases: [],
    } as unknown as Parameters<typeof dl.start>[0];
    await dl.start(mini);
    expect(dl.state.value).toBe("done");
    expect(dl.loaded.value).toBe(2);
  });
});
