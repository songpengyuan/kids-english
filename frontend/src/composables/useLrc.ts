/**
 * LRC 歌词：解析 / 加载缓存 / 当前行索引 —— 磨耳朵歌词页与课时"音乐"tab 共用。
 *
 * 数据从哪来：public/lessons/<id>/<音频同名>.lrc（scripts/gen-lrc.py 产出，
 * 逐行时间来自语音对齐或合成器时间轴，工作流见 docs/LYRICS-WORKFLOW.md）。
 * 运行时按音频 src 推导同名 .lrc 拉取（l11 两轨各自配对：brown-bear.mp3 →
 * brown-bear.lrc、song.mp3 → song.lrc），拉不到/解析不出就返回 null，
 * 调用方回退到旧的"按比例高亮"或不高亮。
 *
 * 为什么 LRC 行数要和数据里的 lyrics 对上：LRC 只含唱词行（无段间空行），
 * 而界面渲染的是完整 lyrics（含空行）。mapLrcToLyrics 负责"第 k 条 LRC 行
 * ↔ lyrics 里第 k 个非空行"的映射，条数对不上视为 LRC 过期，返回 null。
 */
import { ref, watch, type Ref } from "vue";

export interface LrcLine {
  /** 该行开始时间（秒） */
  t: number;
  text: string;
}

const cache = new Map<string, LrcLine[] | null>();

/** 解析 LRC 文本。只保留带有效时间戳的非空歌词行（[ti:] 等元数据忽略），
 *  按 t 升序返回。一行多时间戳（[00:01.00][00:05.00]词）展开成多行。
 *  没有任何有效行（如误抓到 SPA 的 index.html）→ 返回 []。 */
export function parseLrc(text: string): LrcLine[] {
  const out: LrcLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const body = raw.replace(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g, "").trim();
    if (!body) continue;
    for (const m of stamps) {
      const t = Number(m[1]) * 60 + Number(m[2]) + Number(`0.${m[3] || "0"}`);
      out.push({ t, text: body });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** 播放到 t 秒时的高亮行号（最后一条 t <= 当前行；开唱前返回 -1）。 */
export function activeLrcIndex(lines: LrcLine[], t: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= t) idx = i;
    else break;
  }
  return idx;
}

/** 音频地址 → 同名 LRC 地址（.../song.mp3 → .../song.lrc；跨 BASE 子路径部署也成立）。 */
export function lrcUrlOf(audioSrc: string): string {
  return audioSrc.replace(/\.[a-z0-9]+\??$/i, ".lrc");
}

/** LRC 行 ↔ 数据歌词行的映射：第 k 条 LRC 行对应 lyrics 里第 k 个非空行。
 *  条数对不上（改了歌词没重跑 gen-lrc.py）→ 返回 null，调用方走兜底。 */
export function mapLrcToLyrics(lrc: LrcLine[], lyrics: string[]): number[] | null {
  if (!lrc.length || !lyrics.length) return null;
  const sung: number[] = [];
  lyrics.forEach((ln, i) => {
    if (ln.trim()) sung.push(i);
  });
  if (sung.length !== lrc.length) return null;
  // 双重保险：首尾行文本也要一致（防"行数碰巧相同但内容换过"）
  const first = lyrics[sung[0]].trim();
  const last = lyrics[sung[sung.length - 1]].trim();
  if (first !== lrc[0].text.trim() || last !== lrc[lrc.length - 1].text.trim()) return null;
  return sung;
}

/**
 * 按音频 src 加载对应 LRC（会话内缓存；src 变化自动重载，竞态用序号守卫）。
 * 返回 null = 没有可用时间轴。
 */
export function useLrc(audioSrc: Ref<string | null | undefined>): Ref<LrcLine[] | null> {
  const lines = ref<LrcLine[] | null>(null);
  let seq = 0;

  async function load(src: string | null | undefined) {
    const mySeq = ++seq;
    if (!src) {
      lines.value = null;
      return;
    }
    const url = lrcUrlOf(src);
    if (cache.has(url)) {
      lines.value = cache.get(url) ?? null;
      return;
    }
    lines.value = null;
    try {
      const res = await fetch(url);
      const parsed = res.ok ? parseLrc(await res.text()) : [];
      const result = parsed.length ? parsed : null;
      cache.set(url, result);
      if (mySeq === seq) lines.value = result;
    } catch {
      if (mySeq === seq) lines.value = null;
    }
  }

  watch(audioSrc, load, { immediate: true });
  return lines;
}
