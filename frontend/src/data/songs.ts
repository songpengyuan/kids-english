/**
 * 纯听儿歌（磨耳朵「儿歌歌单」）。
 *
 * 这些歌没有配套课时：没有词表、没有亲子口语句、没有关卡，只在磨耳朵里
 * 作为「纯歌曲条目」能听能循环（用户 2026-11-28 确认的口径）。
 *
 * 与课时歌曲的关系：
 *  · 数据落 src/data/songs.json，音频落 public/songs/<slug>.mp3；
 *  · id 统一 `s-` 前缀，与课时 id（lN）不冲突——ListenView 的
 *    lessonForSongId 找不到课时时会走纯歌分支，不会误当课时打开；
 *  · player store 里拼在 SONG_LIST 尾部，队列用 extraSongIndices 收窄，
 *    上一首/下一首只在歌单内转，不会串进课程歌曲。
 */
import songsData from "./songs.json";
import { asset, revSongAsset } from "./lessons";

export interface ExtraSong {
  id: string;
  title: string;
  titleZh: string;
  emoji: string;
  tone: string;
  /** 音频地址（已补 BASE 前缀与 CDN 版本号） */
  src: string;
  lyrics: string[];
  lyricsZh: string[];
}

interface RawSong {
  id: string;
  title: string;
  titleZh: string;
  emoji: string;
  tone: string;
  audio: string;
  lyrics?: string[];
  lyricsZh?: string[];
}

export const extraSongs: ExtraSong[] = (songsData as RawSong[]).map((s) => ({
  id: s.id,
  title: s.title,
  titleZh: s.titleZh,
  emoji: s.emoji,
  tone: s.tone,
  src: revSongAsset(asset(s.audio))!,
  lyrics: s.lyrics ?? [],
  lyricsZh: s.lyricsZh ?? [],
}));

export function isExtraSongId(id: string | undefined | null): boolean {
  return !!id && extraSongs.some((s) => s.id === id);
}
