// @vitest-environment jsdom
/**
 * useLrc 纯函数测试：LRC 解析 / 当前行索引 / LRC↔歌词行映射。
 * useLrc() 本体的 fetch 拉取由 ListenView/SongView 集成验证，这里不测。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { parseLrc, activeLrcIndex, lrcUrlOf, mapLrcToLyrics, useLrc } from "../useLrc";

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

  it("LRC 为空数组 → null（不产生映射）", () => {
    expect(mapLrcToLyrics([], ["a", "b"])).toBeNull();
  });
});

describe("useLrc composable（fetch 拉取 + 缓存 + 竞态守卫）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** 等 fetch promise 链与 watch 回调走完 */
  async function flush() {
    await new Promise((r) => setTimeout(r, 0));
  }

  it("拉取成功 → 解析出行；换回同一 url 时走缓存不再发请求", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => "[00:01.00]alpha\n[00:05.00]beta\n",
    }));
    vi.stubGlobal("fetch", fetchMock);
    const src = ref<string | null>(null);
    const lines = useLrc(src);

    src.value = "/lessons/lx/a.mp3";
    await flush();
    expect(lines.value?.map((l) => l.text)).toEqual(["alpha", "beta"]);

    src.value = "/lessons/lx/b.mp3"; // 未缓存的另一个 url
    await flush();
    src.value = "/lessons/lx/a.mp3"; // 回到已缓存 url
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2); // a.mp3 第二次没再请求
    expect(lines.value?.map((l) => l.text)).toEqual(["alpha", "beta"]);
  });

  it("404 / fetch 抛错 / src 为空 → lines 为 null（调用方走兜底）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, text: async () => "" })));
    const src = ref<string | null>(null);
    const lines = useLrc(src);
    src.value = "/lessons/lx/missing.mp3";
    await flush();
    expect(lines.value).toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("network down");
    }));
    src.value = "/lessons/lx/broken.mp3";
    await flush();
    expect(lines.value).toBeNull();

    src.value = null;
    await flush();
    expect(lines.value).toBeNull();
  });

  it("快速切换音频：旧请求晚到不污染新结果（序号守卫）", async () => {
    let resolveSlow!: (v: { ok: boolean; text: () => Promise<string> }) => void;
    const fetchMock = vi.fn((url: string) =>
      url.includes("slow")
        ? new Promise((resolve) => {
            resolveSlow = resolve;
          })
        : Promise.resolve({ ok: true, text: async () => "[00:02.00]fast\n" })
    );
    vi.stubGlobal("fetch", fetchMock);
    const src = ref<string | null>(null);
    const lines = useLrc(src);

    src.value = "/lessons/lx/slow.mp3";
    await flush();
    src.value = "/lessons/lx/fast.mp3";
    await flush();
    expect(lines.value?.[0]?.text).toBe("fast");

    resolveSlow({ ok: true, text: async () => "[00:09.00]late\n" }); // 旧请求这时才回来
    await flush();
    expect(lines.value?.[0]?.text).toBe("fast"); // 仍是被守卫的新结果
  });
});
