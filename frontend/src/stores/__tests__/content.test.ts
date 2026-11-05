// @vitest-environment jsdom
/**
 * content store 测试（2026-11-05 课程内容改纯前端后）：
 * 列表/详情全部来自本地静态数据（src/data/lessons），不再请求后端；
 * loadFromServer 保留为兼容空操作。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useContentStore } from "../content";
import { lessons as localLessons } from "../../data/lessons";

describe("content store · 纯前端数据源", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("lessonList 由本地静态数据推导（id 顺序与 order_no 一致）", () => {
    const c = useContentStore();
    expect(c.lessonList.length).toBe(localLessons.length);
    expect(c.lessonList.length).toBeGreaterThan(0);
    for (let i = 0; i < c.lessonList.length; i++) {
      expect(c.lessonList[i].id).toBe(localLessons[i].id);
      expect(c.lessonList[i].order_no).toBe(Number(localLessons[i].id.replace(/\D/g, "")));
      expect(c.lessonList[i].title_zh).toBe(localLessons[i].titleZh);
    }
  });

  it("lessons computed 即本地静态全量（保持数据文件的原序：上架日期序，非数字序）", () => {
    const c = useContentStore();
    expect(c.lessons.map((l) => l.id)).toEqual(localLessons.map((l) => l.id));
    expect(c.lessons.length).toBeGreaterThan(0);
  });

  it("getLesson：本地详情完整（歌词/词群/颜色配对等字段齐备）", async () => {
    const c = useContentStore();
    const lesson = await c.getLesson("l4");
    expect(lesson).not.toBeNull();
    expect(lesson!.id).toBe("l4");
    expect(lesson!.words[0]).toMatchObject({ en: "seahorse", lessonId: "l4" });
    expect(lesson!.song.lyrics.length).toBeGreaterThan(0);
    // 本地数据自带这些字段，无需远端转换
    expect(lesson!.song.lyricsZh!.length).toBe(lesson!.song.lyrics.length);
    // 词群/颜色配对是 l11 的专属字段（本地数据原样携带）
    const l11 = await c.getLesson("l11");
    expect(l11!.wordGroups).toEqual([{ key: "colors", name: "Colors" }, { key: "animals", name: "Animals" }]);
    expect(l11!.colorPairs!.length).toBeGreaterThan(0);
  });

  it("getLesson：未知 id 返回 null（对齐旧远端 404 兜底语义）", async () => {
    const c = useContentStore();
    expect(await c.getLesson("zzz")).toBeNull();
  });

  it("loadFromServer 是兼容空操作：不发任何请求，source 保持 local", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const c = useContentStore();
    await c.loadFromServer();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(c.source).toBe("local");
    expect(Object.keys(c.detailCache)).toHaveLength(0);
    // 详情同样不发请求
    await c.getLesson("l4");
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
