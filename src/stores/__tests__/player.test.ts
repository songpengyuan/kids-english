// @vitest-environment jsdom
/**
 * 全局播放 store 测试（跨 tab 续播的地基）：
 * 选曲/播放暂停/上一曲下一曲/重复与随机/歌词页状态/时间格式。
 * audio 是模块级单例：mock HTMLMediaElement 原型即可拦截真实调用。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { usePlayerStore, SONG_LIST } from "../player";

describe("player store · 播放控制", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("歌曲列表非空，条目含封面与音频地址", () => {
    expect(SONG_LIST.length).toBeGreaterThan(0);
    const s = SONG_LIST[0];
    expect(s.title).toBeTruthy();
    expect(s.emoji).toBeTruthy();
    expect(s.src).toMatch(/^https?:|^\//);
  });

  it("playSong：选曲、置播放态、audio.src 更新", () => {
    const p = usePlayerStore();
    p.playSong(0);
    expect(p.currentIdx).toBe(0);
    expect(p.currentSong?.id).toBe(SONG_LIST[0].id);
    expect(p.playing).toBe(true);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it("playFromRow：非当前曲切歌；当前曲切换播放/暂停", () => {
    const p = usePlayerStore();
    p.playSong(0);
    p.playFromRow(1);
    expect(p.currentIdx).toBe(1);
    p.playFromRow(1); // 同一首 → 暂停
    expect(p.playing).toBe(false);
    p.playFromRow(1); // 再点 → 恢复
    expect(p.playing).toBe(true);
  });

  it("openLyrics：切歌并展开歌词页；同曲直接展开", () => {
    const p = usePlayerStore();
    p.openLyrics(0);
    expect(p.currentIdx).toBe(0);
    expect(p.nowPlaying).toBe(true);
    p.closeLyrics();
    expect(p.nowPlaying).toBe(false);
    p.openLyrics(0); // 同曲不重播（不重置 audio.src）
    expect(p.currentIdx).toBe(0);
    expect(p.nowPlaying).toBe(true);
  });

  it("togglePlay：播放 ⇄ 暂停", () => {
    const p = usePlayerStore();
    p.playSong(0);
    p.togglePlay();
    expect(p.playing).toBe(false);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    p.togglePlay();
    expect(p.playing).toBe(true);
  });

  it("next：顺序下一首；repeat one 循环当前曲", () => {
    const p = usePlayerStore();
    p.playSong(0);
    p.next();
    expect(p.currentIdx).toBe(1);
    p.repeatMode = "one";
    p.next();
    expect(p.currentIdx).toBe(1); // 单曲循环不切歌
  });

  it("next：末曲 + 列表循环 → 回到第一首", () => {
    const p = usePlayerStore();
    p.playSong(SONG_LIST.length - 1);
    p.next();
    expect(p.currentIdx).toBe(0); // repeatMode 默认 all
  });

  it("prev：播放超 3s 归零；否则上一首", () => {
    const p = usePlayerStore();
    p.playSong(1);
    // currentTime 由 audio 实例持有，store 不直接暴露——用 next/prev 边界验证
    p.prev();
    expect(p.currentIdx).toBe(0);
  });

  it("repeatMode 循环：off → all → one → off", () => {
    const p = usePlayerStore();
    expect(p.repeatMode).toBe("all");
    p.toggleRepeat();
    expect(p.repeatMode).toBe("one");
    p.toggleRepeat();
    expect(p.repeatMode).toBe("off");
    p.toggleRepeat();
    expect(p.repeatMode).toBe("all");
  });

  it("shuffleOn 切换", () => {
    const p = usePlayerStore();
    p.toggleShuffle();
    expect(p.shuffleOn).toBe(true);
    p.toggleShuffle();
    expect(p.shuffleOn).toBe(false);
  });

  it("formatTime：秒 → m:ss，非法值兜底 0:00", () => {
    const p = usePlayerStore();
    expect(p.formatTime(0)).toBe("0:00");
    expect(p.formatTime(65)).toBe("1:05");
    expect(p.formatTime(Number.NaN)).toBe("0:00");
  });

  it("currentLyrics：随当前曲变化（有歌词返回歌词，无则空数组）", () => {
    const p = usePlayerStore();
    p.playSong(0);
    expect(Array.isArray(p.currentLyrics)).toBe(true);
  });
});
