// @vitest-environment jsdom
/**
 * useLrc 纯函数测试：LRC 解析 / 当前行索引 / LRC↔歌词行映射。
 * useLrc() 本体的 fetch 拉取由 ListenView/SongView 集成验证，这里不测。
 */
import { describe, expect, it } from "vitest";
import { parseLrc, activeLrcIndex, lrcUrlOf, mapLrcToLyrics } from "../useLrc";

describe("parseLrc", () => {
  it("解析 [mm:ss.xx] 行级时间标签", () => {
    const lines = parseLrc("[ti:测试]\n[offset:0]\n[00:11.80]I am the Music Man,\n[01:09.10]What can you play?\n");
    expect(lines).toEqual([
      { t: 11.8, text: "I am the Music Man," },
      { t: 69.1, text: "What can you play?" },
    ]);
  });

  it("兼容 [mm:ss] 与 [mm:ss.xxx]，忽略元数据行和空词行", () => {
    const lines = parseLrc("[00:05]intro\n[00:07.500]hello world\n[00:09.00]\n[al:x]");
    expect(lines).toEqual([
      { t: 5, text: "intro" },
      { t: 7.5, text: "hello world" },
    ]);
  });

  it("一行多时间戳展开成多行，结果按时间升序", () => {
    const lines = parseLrc("[00:20.00]chorus\n[00:03.00][00:10.00]repeated line");
    expect(lines.map((l) => l.t)).toEqual([3, 10, 20]);
    expect(lines[0].text).toBe("repeated line");
  });

  it("抓到非 LRC 内容（如 SPA 的 index.html）→ 空数组", () => {
    expect(parseLrc("<!DOCTYPE html><html><body>app</body></html>")).toEqual([]);
  });
});

describe("activeLrcIndex", () => {
  const lines = [
    { t: 10, text: "a" },
    { t: 20, text: "b" },
    { t: 30, text: "c" },
  ];

  it("开唱前返回 -1", () => {
    expect(activeLrcIndex(lines, 0)).toBe(-1);
    expect(activeLrcIndex(lines, 9.99)).toBe(-1);
  });

  it("落在某行区间内高亮该行（含整点边界）", () => {
    expect(activeLrcIndex(lines, 10)).toBe(0);
    expect(activeLrcIndex(lines, 19.5)).toBe(0);
    expect(activeLrcIndex(lines, 30)).toBe(2);
  });

  it("唱到最后一直停末行；空列表恒 -1", () => {
    expect(activeLrcIndex(lines, 999)).toBe(2);
    expect(activeLrcIndex([], 5)).toBe(-1);
  });
});

describe("lrcUrlOf", () => {
  it("音频地址推导同名 .lrc（不同扩展名/带 BASE 前缀都成立）", () => {
    expect(lrcUrlOf("/lessons/l5/song.mp3")).toBe("/lessons/l5/song.lrc");
    expect(lrcUrlOf("/app/lessons/l11/brown-bear.mp3")).toBe("/app/lessons/l11/brown-bear.lrc");
  });
});

describe("mapLrcToLyrics", () => {
  it("LRC 行按序对应歌词里的非空行（段间空行被跳过）", () => {
    const lrc = [
      { t: 1, text: "line one" },
      { t: 2, text: "line two" },
      { t: 3, text: "line three" },
    ];
    const lyrics = ["line one", "", "line two", "line three"];
    expect(mapLrcToLyrics(lrc, lyrics)).toEqual([0, 2, 3]);
  });

  it("条数对不上（歌词改了没重跑 gen-lrc.py）→ null", () => {
    const lrc = [{ t: 1, text: "a" }, { t: 2, text: "b" }];
    expect(mapLrcToLyrics(lrc, ["a", "", "b", "c"])).toBeNull();
    expect(mapLrcToLyrics(lrc, [])).toBeNull();
  });

  it("行数碰巧相同但内容换过（首尾文本不一致）→ null", () => {
    const lrc = [{ t: 1, text: "old first" }, { t: 2, text: "old last" }];
    expect(mapLrcToLyrics(lrc, ["new first", "new last"])).toBeNull();
  });
});
