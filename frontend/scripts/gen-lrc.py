#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从真实录音的歌曲里提取**逐行时间轴**，产出标准 LRC 歌词文件 + 核查 song-timings.json。

为什么需要它：
  · gen-songs.py 合成的 l6/l7/l8 是纯器乐、时间轴由生成器精确给出，不需要它；
  · l4/l5/l9/l10/l11 用的是老师/家长提供的真人演唱 mp3，时间轴要么是按比例
    估算的（estimated: true，核查发现偏差可达十几秒），要么根本没有。
  · 本脚本用 faster-whisper 识别（词级时间戳），再做 Needleman-Wunsch 全局
    词对齐得到每行歌词的真实起止时间。

对齐策略（三步）：
  1. 整曲识别 → 歌词词序与识别词序做全局对齐（模糊匹配，允许插入/丢失）；
  2. 没对上的行所在区间，把那段音频切出来、拿歌词原文当 initial_prompt
     二次识别（儿歌副歌 "Pia, pia, piano" 这类拟声词首遍常被听成 oompa）；
  3. 仍对不上的行在前后锚点间线性插值，并在报告里标注。

用法：
    /Users/perrysong/.workbuddy/binaries/python/envs/default/bin/python scripts/gen-lrc.py [l4 l9 ...]
    不带参数 = 处理所有需要音频对齐的课（l4/l5/l9/l10/l11）。

产出：
    public/lessons/<id>/<音频同名>.lrc   标准 LRC（[mm:ss.xx] 行级时间标签）
    src/data/song-timings.json           核查 l4/l5 的时间轴（l9/l10/l11 只出 LRC，
                                         不写 JSON —— 那几课原本没有条目，乱加 bpm
                                         会改变 SongStage 的节拍动画行为）
原则：
  · 低置信行保留原估算值（l4/l5）或标注插值（报告里逐行列出），绝不悄悄写错时间；
  · mp3 → wav 用 macOS 自带 afconvert 解码，不依赖 ffmpeg。
"""

import difflib
import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LESSONS_JSON = os.path.join(ROOT, "src", "data", "lessons.json")
TIMINGS_JSON = os.path.join(ROOT, "src", "data", "song-timings.json")

# 需要音频对齐的课：(课时id, 音频相对路径, 只取前 N 行歌词或 None, LRC 标题或 None)。
# l6/l7/l8 是合成曲、时间轴精确，不在此列。
# l11 Brown Bear 用顶层歌词；颜色轨用 tracks[].lyrics，键为 "<id>#<track 标题>"。
# l10 音频只唱一轮（4 个动物各出现一次，见 lessons.json 注释），歌词已裁成一轮。
ALIGN_LESSONS = [
    ("l4", "/lessons/l4/song.mp3", None, None),
    ("l5", "/lessons/l5/song.mp3", None, None),
    ("l9", "/lessons/l9/song.mp3", None, None),
    ("l10", "/lessons/l10/song.mp3", None, None),
    ("l11", "/lessons/l11/brown-bear.mp3", None, None),
    ("l11#Colors Song", "/lessons/l11/song.mp3", None, "Colors Song"),
]

# 仅核查/修正 song-timings.json 的课（其余只产 LRC）
TIMINGS_LESSONS = {"l4", "l5"}

# 合成曲（gen-songs.py 产出，时间轴精确到行，无需对齐）
SYNTH_LESSONS = ["l6", "l7", "l8"]


# ---------------------------------------------------------------- 读歌词


def read_lessons_data():
    """从 lessons.json（课时数据本体，2212736 起应用/种子/生成脚本三方同源）读歌词。
    顶层 song.lyrics 键为课时 id；tracks[].lyrics 键为 "<id>#<track 标题>"。"""
    lessons = json.load(open(LESSONS_JSON, encoding="utf-8"))
    out = {}
    for l in lessons:
        song = l.get("song") or {}
        if song.get("lyrics"):
            out[l["id"]] = song["lyrics"]
        for t in song.get("tracks") or []:
            if t.get("lyrics"):
                out[f"{l['id']}#{t['title']}"] = t["lyrics"]
    return out


def lesson_title_of(lid):
    """LRC 的 [ti:] 标题：课用 lesson.title，轨用 track.title。"""
    base, _, track = lid.partition("#")
    for l in json.load(open(LESSONS_JSON, encoding="utf-8")):
        if l["id"] != base:
            continue
        if track:
            for t in l.get("song", {}).get("tracks") or []:
                if t.get("title") == track:
                    return t["title"]
            return lid
        return l.get("title") or lid
    return lid


def words_of(line):
    return [w for w in re.findall(r"[a-z']+", line.lower())]


def norm_text(line):
    return " ".join(words_of(line))


# ---------------------------------------------------------------- 音频


def mp3_to_wav16k(mp3_path):
    """afconvert 解码为 16k 单声道 wav（faster-whisper 的输入格式）。"""
    wav_path = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    subprocess.run(
        ["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", mp3_path, wav_path],
        check=True, capture_output=True,
    )
    return wav_path


class ASR:
    def __init__(self):
        from faster_whisper import WhisperModel

        self.model = WhisperModel("small.en", device="cpu", compute_type="int8")

    def words(self, wav_path, prompt=None):
        """整段识别返回词级 (token, start, end)。

        prompt 只给切片补识别用：整曲喂歌词提示会让 whisper 提前「对答案」，
        把副歌拼成单字母碎片、甚至跳过真实唱词（实测），所以主识别绝不带 prompt。
        """
        segs, info = self.model.transcribe(
            wav_path, language="en", beam_size=5, word_timestamps=True,
            condition_on_previous_text=False,
            initial_prompt=prompt,
            vad_filter=False, temperature=[0.0, 0.2, 0.4, 0.6],
        )
        out = []
        for seg in segs:
            for w in seg.words or []:
                token = w.word.strip().lower().strip("',.")
                if len(token) == 1 and token not in ("i", "a"):
                    continue  # 副歌常被拼成 p/a/n/o 碎片，丢掉免得污染对齐
                if token:
                    out.append((token, float(w.start), float(w.end)))
        return out, info.duration


# ---------------------------------------------------------------- NW 全局对齐


def _cost(a, b):
    """歌词词 ↔ 识别词 的对上代价。0=完全一致。
    完全不匹配的代价必须高于 GAP_L + GAP_A（双双跳过 = 2.2 + 1.0），
    否则 DP 宁可把歌词词硬凑到拟声杂音上，把一行摊出几十秒。"""
    if a == b:
        return 0.0
    r = difflib.SequenceMatcher(None, a, b).ratio()
    if r >= 0.75:
        return 0.3
    if r >= 0.5:
        return 0.8
    return 4.0


def nw_pairs(lyric_words, audio_words):
    """Needleman-Wunsch：返回长度 len(lyric_words) 的列表，
    lyrics[i] -> 对上的 audio 下标 或 None。顺序保持。"""
    n, m = len(lyric_words), len(audio_words)
    GAP_A, GAP_L = 1.0, 2.2  # 丢识别词便宜（拟声串/杂音），丢歌词词贵（尽量锚定）
    # 预算代价矩阵
    C = np.empty((n, m))
    for i, lw in enumerate(lyric_words):
        row = C[i]
        for j, aw in enumerate(audio_words):
            row[j] = _cost(lw, aw)
    D = np.empty((n + 1, m + 1))
    D[0, :] = np.arange(m + 1) * GAP_A
    D[:, 0] = np.arange(n + 1) * GAP_L
    for i in range(1, n + 1):
        Di, Dim1, Ci = D[i], D[i - 1], C[i - 1]
        for j in range(1, m + 1):
            Di[j] = min(
                Dim1[j - 1] + Ci[j - 1],  # 配对
                Dim1[j] + GAP_L,          # 歌词词没对上
                Di[j - 1] + GAP_A,        # 识别词多余
            )
    # 回溯。平局时优先「跳过多余音频词」：歌词一行对应音频里重复多次的
    # 词句时（儿歌常态），锚到最早一次出现，而不是后面的重复。
    pairs = [None] * n
    i, j = n, m
    while i > 0 or j > 0:
        if (
            i > 0 and j > 0
            and D[i, j] == D[i - 1, j - 1] + C[i - 1, j - 1]
            and not (j > 1 and D[i, j] == D[i, j - 1] + GAP_A)
        ):
            pairs[i - 1] = j - 1
            i, j = i - 1, j - 1
        elif i > 0 and D[i, j] == D[i - 1, j] + GAP_L:
            i -= 1
        else:
            j -= 1
    return pairs


def anchor_lines(lyric_lines, pairs):
    """按词配对结果聚合到行：(start, end, 锚定词数)。锚定=该行 ≥ 一半词配上了。"""
    # 每行词的起止下标
    spans, k = [], 0
    for ln in lyric_lines:
        ws = words_of(ln)
        spans.append((k, k + len(ws)))
        k += len(ws)
    all_lyric = [w for ln in lyric_lines for w in words_of(ln)]
    audio = pairs  # lyric idx -> audio idx
    lines = []
    for (a, b) in spans:
        idxs = [audio[i] for i in range(a, b) if audio[i] is not None]
        if len(idxs) >= max(1, 0.5 * (b - a)) and idxs:
            lines.append((idxs[0], idxs[-1], len(idxs), b - a))
        else:
            lines.append(None)
    return lines  # (audio_start_idx, audio_end_idx, matched, total) 或 None


# ---------------------------------------------------------------- 主流程


def fmt_lrc(t):
    mm, ss = int(t // 60), t % 60
    return f"[{mm:02d}:{ss:05.2f}]"


def process(asr, lid, audio_rel, lyrics, lrc_title=None):
    mp3 = os.path.join(ROOT, "public", audio_rel.lstrip("/"))
    if not os.path.exists(mp3):
        print(f"!! {lid}: 找不到 {audio_rel}，跳过")
        return None
    wav = mp3_to_wav16k(mp3)
    try:
        # whisper 在「童声+伴奏」上同参数两次运行结果都会漂（实测 132~183 词），
        # 所以跑最多 3 遍、取「锚上歌词词数」最多的一遍；够好就提前停。
        all_lyric = [w for ln in lyrics for w in words_of(ln)]
        best = None
        for _attempt in range(3):
            audio_words, duration = asr.words(wav)
            pairs = nw_pairs(all_lyric, [w[0] for w in audio_words])
            score = sum(1 for p in pairs if p is not None)
            if best is None or score > best[0]:
                best = (score, audio_words, duration, pairs)
            if score >= 0.85 * len(all_lyric):
                break
        _score, audio_words, duration, pairs = best
        lines = anchor_lines(lyrics, pairs)

        # 第 2 步：未锚定行的结构化兜底。不二次识别——提示词会让 whisper 在
        # 副歌「串烧回调」上幻觉出提示文本；改用重复歌曲的结构规律推导：
        # ① 相同文本/相同词数行对的节距 ② 上一行的结束时间。
        audio_t0 = [w[1] for w in audio_words]
        audio_t1 = [w[2] for w in audio_words]
        words_n = [len(words_of(ln)) for ln in lyrics]

        def anchored_pairs():
            """已锚定行的 (起点时间, 结束时间)"""
            out = {}
            for p, x in enumerate(lines):
                if x is not None:
                    out[p] = (audio_t0[x[0]], audio_t1[x[1]])
            return out

        t_anchor = anchored_pairs()
        times = [t_anchor.get(p) for p in range(len(lines))]

        def pair_delta(p):
            """找参考节距：相同文本对 > 相同词数对（都用已锚定的相邻行）"""
            for a in range(p):
                b = a + 1
                if a in t_anchor and b in t_anchor and lyrics[a].strip() and lyrics[b].strip():
                    if (norm_text(lyrics[a]) == norm_text(lyrics[p - 1])
                            and norm_text(lyrics[b]) == norm_text(lyrics[p])):
                        return t_anchor[b][0] - t_anchor[a][0]
            for a in range(p):
                b = a + 1
                if a in t_anchor and b in t_anchor and lyrics[a].strip() and lyrics[b].strip():
                    if words_n[a] == words_n[p - 1] and words_n[b] == words_n[p]:
                        return t_anchor[b][0] - t_anchor[a][0]
            return None

        last_t, last_end = None, None
        for p, ln in enumerate(lyrics):
            if not ln.strip():
                continue
            if times[p] is None:
                d = pair_delta(p) if p > 0 else None
                if d is not None and last_t is not None:
                    times[p] = (last_t + d, None)
                elif last_end is not None:
                    # 副歌通常紧跟「I play the X」结束就开唱
                    times[p] = (last_end, None)
                else:
                    nxt = next((q for q in range(p + 1, len(lines)) if times[q]), len(lines))
                    hi_t = times[nxt][0] if nxt < len(lines) else duration
                    lo = max((q for q in range(p) if times[q]), default=-1)
                    times[p] = (max(0.0, (hi_t - 4.0 * (nxt - p))), None)
            last_t = times[p][0]
            last_end = t_anchor[p][1] if p in t_anchor else last_t + 4.0

        # 单调性护栏：非空行必须逐行推进
        prev_t = -1e9
        for p, ln in enumerate(lyrics):
            if ln.strip() and times[p]:
                times[p] = (max(times[p][0], prev_t + 0.2), times[p][1])
                prev_t = times[p][0]

        aligned = []
        for p, ln in enumerate(lyrics):
            if ln.strip():
                s, e = times[p]
                aligned.append((s, e if e is not None else s, e is not None))
            else:
                nxt = next((times[q][0] for q in range(p + 1, len(lyrics))
                            if lyrics[q].strip() and times[q]), duration)
                aligned.append((nxt, nxt, True))
    finally:
        os.unlink(wav)

    # ---- LRC ----
    lrc_name = os.path.splitext(os.path.basename(audio_rel))[0] + ".lrc"
    lrc_path = os.path.join(ROOT, "public", os.path.dirname(audio_rel.lstrip("/")), lrc_name)
    if lrc_title:
        title = lrc_title
    else:
        title = lesson_title_of(lid)
    out_lines = [
        f"[ti:{title}]",
        f"[al:lesson {lid.split('#')[0]}]",
        "[offset:0]",
    ]
    for ln, (s, _e, _c) in zip(lyrics, aligned):
        if ln.strip():
            out_lines.append(f"{fmt_lrc(s)}{ln}")
    os.makedirs(os.path.dirname(lrc_path), exist_ok=True)
    with open(lrc_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out_lines) + "\n")

    return {
        "lid": lid, "duration": duration, "lrc": lrc_path,
        "timeline": [round(s, 2) for s, _e, _c in aligned],
        "confident": [c for _s, _e, c in aligned],
        "rows": [
            {"i": p, "text": lyrics[p][:46], "aligned": round(s, 2), "confident": c}
            for p, (s, _e, c) in enumerate(aligned)
        ],
    }


def export_synth_lrc(lyrics_all, timings):
    """l6/l7/l8：直接从 song-timings.json 的精确时间轴导出 LRC。"""
    for lid in SYNTH_LESSONS:
        lyrics = lyrics_all.get(lid)
        timing = timings.get(lid)
        if not lyrics or not timing:
            print(f"!! {lid}: 缺歌词或时间轴，跳过")
            continue
        timeline = timing["timeline"]
        if len(timeline) != len(lyrics):
            print(f"!! {lid}: 时间轴 {len(timeline)} 条 ≠ 歌词 {len(lyrics)} 行，跳过")
            continue
        out_lines = [
            f"[ti:{lesson_title_of(lid)}]",
            f"[al:lesson {lid}]",
            "[offset:0]",
        ]
        for ln, t in zip(lyrics, timeline):
            if ln.strip():
                out_lines.append(f"{fmt_lrc(t)}{ln}")
        path = os.path.join(ROOT, "public", "lessons", lid, "song.lrc")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("\n".join(out_lines) + "\n")
        print(f"   {lid}: {sum(1 for ln in lyrics if ln.strip())} 行 → {os.path.relpath(path, ROOT)}")


def main():
    synth_only = "--synth" in sys.argv[1:]
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    lyrics_all = read_lessons_data()
    timings = json.load(open(TIMINGS_JSON, encoding="utf-8")) if os.path.exists(TIMINGS_JSON) else {}

    if synth_only:
        export_synth_lrc(lyrics_all, timings)
        return 0

    targets = args or [lid for lid, _, _, _ in ALIGN_LESSONS]
    new_timings = dict(timings)
    asr = None

    for lid, audio_rel, line_limit, lrc_title in ALIGN_LESSONS:
        if lid not in targets:
            continue
        lyrics = lyrics_all.get(lid)
        if not lyrics:
            print(f"!! {lid}: lessons.json 里没有歌词，跳过")
            continue
        if line_limit:
            lyrics = lyrics[:line_limit]
        print(f"== {lid}（{len(lyrics)} 行，{audio_rel}）")
        if asr is None:
            asr = ASR()
        rep = process(asr, lid, audio_rel, lyrics, lrc_title)
        if rep is None:
            continue

        old = timings.get(lid, {}).get("timeline") or []
        deltas = []
        for r, est in zip(rep["rows"], list(old) + [None] * len(rep["rows"])):
            r["estimated"] = est
            if est is not None:
                r["delta"] = round(abs(est - r["aligned"]), 2)
                deltas.append(r["delta"])
        if deltas:
            print(f"   估算 vs 对齐：平均偏差 {sum(deltas)/len(deltas):.2f}s，最大 {max(deltas):.2f}s，"
                  f"低置信行 {sum(1 for r in rep['rows'] if not r['confident'])}")
        else:
            print(f"   原本无时间轴；低置信行 {sum(1 for r in rep['rows'] if not r['confident'])}")
        for r in rep["rows"]:
            flag = ""
            if r.get("delta") is not None and r["delta"] > 1.5:
                flag += "  <<< 偏差大"
            if not r["confident"]:
                flag += "  ~ 插值"
            est = r["estimated"]
            est_s = f"{est:.1f}" if est is not None else "—"
            print(f"   #{r['i']:>2} 对齐 {r['aligned']:>7.2f}s  估算 {est_s:>7}s  {r['text']}{flag}")
        print(f"   LRC → {os.path.relpath(rep['lrc'], ROOT)}")

        # song-timings.json：只动 l4/l5。对齐值为主，低置信行保留原估算。
        if lid in TIMINGS_LESSONS and any(rep["confident"]):
            prev = new_timings.get(lid, {})
            timeline = [
                old[p] if (not rep["confident"][p] and p < len(old)) else rep["timeline"][p]
                for p in range(len(rep["timeline"]))
            ]
            entry = {
                "bpm": prev.get("bpm", 96),
                "beatsPerBar": prev.get("beatsPerBar", 4),
                "duration": round(rep["duration"], 1),
                "timeline": [round(v, 2) for v in timeline],
            }
            if not all(rep["confident"]):
                entry["estimated"] = True
            new_timings[lid] = entry

    with open(TIMINGS_JSON, "w", encoding="utf-8") as fh:
        json.dump(new_timings, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(f"时间轴核查完毕 → {os.path.relpath(TIMINGS_JSON, ROOT)}")
    export_synth_lrc(lyrics_all, new_timings)
    return 0


if __name__ == "__main__":
    sys.exit(main())
