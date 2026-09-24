#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成课时童谣音频 —— 完全自研合成器 + 自编曲，不依赖任何第三方素材（无版权风险）。

为什么自己做：
  · 网上找的「儿歌 mp3」基本都是别人的录音，放进仓库/上线有版权隐患；
  · 儿童版要「可爱」，需要的是玩具乐器音色（音乐盒、钟琴、玩具钢琴、哨笛）而不是合成器 pad；
  · 自己生成才能拿到**逐音节的时间轴**，歌词高亮可以精确到行，不靠比例猜。

⚠️ 适用范围：只合成「自研课」l6 / l7 / l8。
   l4、l5 的音视频是用户自己提供的素材（public/lessons/l4|l5/song.mp3|mp4），
   本脚本**不会**覆盖它们；这两课在 song-timings.json 里也没有条目，
   歌词高亮会自动回退成按比例映射（见 SongView.vue 的 syncActiveLine）。

用法：
    /Users/perrysong/.workbuddy/binaries/python/envs/default/bin/python scripts/gen-songs.py

产出：
    public/lessons/<id>/song.mp3     童谣音频（覆盖旧文件）
    src/data/song-timings.json       每行歌词的开始时间（秒）+ bpm，供 KTV 式精确高亮

歌词来源：src/data/lessons.js 的 song.lyrics —— 单一数据源，改完歌词重跑本脚本即可。
脚本会逐句核对「旋律音符数 == 歌词音节数」，对不上直接报错，不会悄悄生成跑调的伴奏。
"""

import json
import os
import re
import sys

import lameenc
import numpy as np

SR = 44100
BPM = 120
BEAT = 60.0 / BPM  # 0.5s；两首统一速度，动画舞台好对拍
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LESSONS_JS = os.path.join(ROOT, "src", "data", "lessons.js")
TIMINGS_JSON = os.path.join(ROOT, "src", "data", "song-timings.json")

rng = np.random.default_rng(20260924)

# ---------------------------------------------------------------- 音高工具

_STEP = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def midi_of(name):
    letter = name[0].upper()
    i, semi = 1, 0
    while i < len(name) and name[i] in "#b":
        semi += 1 if name[i] == "#" else -1
        i += 1
    return 12 * (int(name[i:]) + 1) + _STEP[letter] + semi


def name_of(midi):
    return _NAMES[midi % 12] + str(midi // 12 - 1)


def freq_of(name):
    return 440.0 * 2 ** ((midi_of(name) - 69) / 12)


# ---------------------------------------------------------------- 英文音节估算
# 够用的规则版：元音组 = 一个音节，元音连写若是常见双元音则合并，
# 词尾不发音的 e 去掉，词首 y 当辅音。只是为了「音符数 == 音节数」这条自检。

_DIGRAPHS = {
    "ai", "ay", "ea", "ee", "ei", "ey", "ie", "oa", "oo", "ou", "ow", "oy",
    "au", "aw", "ue", "ui", "oi", "eu",
}


def syllables(word):
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 0
    if len(w) > 2 and w.endswith("e") and not w.endswith(("ee", "ie", "oe", "ye")):
        w = w[:-1]
    vowels = "aeiouy"
    count, i = 0, 0
    while i < len(w):
        ch = w[i]
        if ch in vowels and not (ch == "y" and i == 0):
            if i + 1 < len(w) and w[i + 1] in vowels and (ch + w[i + 1]) in _DIGRAPHS:
                i += 2
            else:
                i += 1
            count += 1
        else:
            i += 1
    return max(1, count)


def words_of(line):
    return re.findall(r"[A-Za-z]+", line)


def line_syllables(line):
    return sum(syllables(w) for w in words_of(line))


# ---------------------------------------------------------------- 基础工具


def _attack(env, seconds):
    n = int(seconds * SR)
    if n > 1:
        env[:n] *= np.linspace(0.0, 1.0, n)
    return env


def sine(f, t):
    return np.sin(2 * np.pi * f * t)


def lowpass_fast(x, cutoff):
    """频域一阶滚降：给噪声类短音柔化（比逐样本 IIR 快得多）"""
    n = len(x)
    if n < 8:
        return x
    nfft = 1 << int(np.ceil(np.log2(n)))
    spec = np.fft.rfft(x, nfft)
    f = np.fft.rfftfreq(nfft, 1 / SR)
    spec /= 1.0 + (f / cutoff) ** 2
    return np.fft.irfft(spec, nfft)[:n]


def highpass_fast(x, cutoff):
    return x - lowpass_fast(x, cutoff)


def fft_convolve(sig, ir, chunk=1 << 18):
    """分块重叠相加的 FFT 卷积（混响用；避免一次性开巨大 FFT 吃爆内存）"""
    L = len(ir)
    nfft = 1 << int(np.ceil(np.log2(chunk + L - 1)))
    H = np.fft.rfft(ir, nfft)
    out = np.zeros(len(sig) + L - 1)
    for s in range(0, len(sig), chunk):
        seg = sig[s : s + chunk]
        blk = np.fft.irfft(np.fft.rfft(seg, nfft) * H, nfft)
        take = min(len(blk), len(out) - s)  # 最后一块不满，按剩余长度截断
        out[s : s + take] += blk[:take]
    return out[: len(sig)]


# ---------------------------------------------------------------- 乐器音色


def bell(freq, dur, vel, partials, decay, attack=0.002, ring=2.6):
    """钟琴类：非谐泛音 + 指数衰减，最「可爱」的一类音色"""
    n = int((dur + decay * ring) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for mult, amp, dscale in partials:
        f = freq * mult
        if f > SR * 0.45:
            continue
        out += amp * sine(f, t) * np.exp(-t / (decay * dscale))
    return _attack(out, attack) * vel * 0.5


def music_box(freq, dur, vel):
    return bell(freq, dur, vel, [(1, 1.0, 1.0), (2.76, 0.30, 0.45), (5.40, 0.11, 0.22)], 0.85)


def glock(freq, dur, vel):
    return bell(
        freq, dur, vel,
        [(1, 1.0, 1.0), (2.99, 0.34, 0.40), (5.42, 0.16, 0.22), (8.9, 0.07, 0.12)],
        0.75, attack=0.001,
    )


def toy_piano(freq, dur, vel):
    return bell(
        freq, dur, vel,
        [(1, 1.0, 1.0), (2.0, 0.42, 0.62), (3.0, 0.20, 0.42), (4.0, 0.09, 0.28), (5.0, 0.04, 0.18)],
        0.95, attack=0.004, ring=1.9,
    )


def marimba(freq, dur, vel):
    return bell(
        freq, dur, vel, [(1, 1.0, 1.0), (3.9, 0.22, 0.45), (9.2, 0.05, 0.2)], 0.5, attack=0.003, ring=1.6
    )


def whistle(freq, dur, vel):
    """哨笛 / 木笛：当「唱旋律的那把嗓子」"""
    n = int((dur + 0.2) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.0055 * np.sin(2 * np.pi * 5.2 * t + 0.7)
    phase = 2 * np.pi * np.cumsum(freq * vib) / SR
    out = np.sin(phase) + 0.16 * np.sin(2 * phase) + 0.05 * np.sin(3 * phase)
    out += 0.018 * rng.standard_normal(n)
    env = np.ones(n)
    a, r = int(0.045 * SR), int(0.13 * SR)
    env[:a] *= np.linspace(0, 1, a) ** 0.7
    env[-r:] *= np.linspace(1, 0, r) ** 1.4
    body = int(dur * SR)
    if body < n:
        env[body:] *= np.exp(-np.arange(n - body) / (0.07 * SR))
    return out * env * vel * 0.42


def bowed(freq, dur, vel):
    """小提琴感：锯齿 + 正弦，颤音明显"""
    n = int((dur + 0.22) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.008 * np.sin(2 * np.pi * 5.6 * t)
    phase = 2 * np.pi * np.cumsum(freq * vib) / SR
    saw = 2 * (phase / (2 * np.pi) % 1.0) - 1
    out = lowpass_fast(0.5 * saw + 0.5 * np.sin(phase), 3600)
    env = np.ones(n)
    a, r = int(0.07 * SR), int(0.16 * SR)
    env[:a] *= np.linspace(0, 1, a) ** 0.8
    env[-r:] *= np.linspace(1, 0, r) ** 1.4
    return out * env * vel * 0.3


def brass(freq, dur, vel):
    """长号感：低通锯齿 + 方波，憨憨的"""
    n = int((dur + 0.2) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 4.8 * t)
    phase = 2 * np.pi * np.cumsum(freq * vib) / SR
    saw = 2 * (phase / (2 * np.pi) % 1.0) - 1
    out = lowpass_fast(0.6 * saw + 0.4 * np.sign(np.sin(phase)), 2200)
    env = np.ones(n)
    a, r = int(0.06 * SR), int(0.14 * SR)
    env[:a] *= np.linspace(0, 1, a) ** 0.6
    env[-r:] *= np.linspace(1, 0, r) ** 1.3
    return out * env * vel * 0.22


def soft_bass(freq, dur, vel):
    n = int((dur + 0.45) * SR)
    t = np.arange(n) / SR
    out = sine(freq, t) + 0.22 * sine(freq * 2, t) + 0.07 * sine(freq * 3, t)
    return _attack(out * np.exp(-t / 0.5), 0.006) * vel * 0.5


def pad(freq, dur, vel):
    """软垫和弦：慢起慢落 + 轻微失谐，给玩具音色垫个暖底"""
    n = int((dur + 0.5) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k, amp in ((1, 1.0), (2, 0.4), (3, 0.18), (4, 0.08), (5, 0.04)):
        out += amp * sine(freq * k, t) / (1 + 0.05 * k)
    out += 0.35 * sine(freq * 1.004, t)
    env = np.ones(n)
    a, r = int(0.18 * SR), int(0.35 * SR)
    env[:a] *= np.linspace(0, 1, a)
    env[-r:] *= np.linspace(1, 0, r)
    return out * env * vel * 0.055


def shaker(dur, vel):
    n = int(0.09 * SR)
    x = highpass_fast(rng.standard_normal(n), 900)
    return _attack(x * np.exp(-np.arange(n) / (0.028 * SR)), 0.004) * vel * 0.16


def kick(dur, vel):
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    f = 118 * np.exp(-t / 0.035) + 46
    return sine(1.0, np.cumsum(f) / SR) * np.exp(-t / 0.075) * vel * 0.5


def clap(vel):
    n = int(0.26 * SR)
    x = np.zeros(n)
    for k, off in enumerate((0.0, 0.011, 0.023)):  # 三下叠成一声「啪」
        i0 = int(off * SR)
        seg = rng.standard_normal(n - i0) * np.exp(-np.arange(n - i0) / (0.02 * SR))
        x[i0:] += seg * (1.0 if k < 2 else 1.5)
    return lowpass_fast(highpass_fast(x, 1100), 6200) * vel * 0.2


def sparkle(freq, vel):
    return glock(freq, 0.2, vel * 0.8)


def wave_swell(dur, vel):
    """海浪：慢起慢落的带限噪声，开场铺气氛"""
    n = int(dur * SR)
    x = lowpass_fast(rng.standard_normal(n), 1500) - lowpass_fast(rng.standard_normal(n), 220)
    t = np.arange(n) / SR
    return x * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.6 * vel * 0.32


INSTR = {
    "music_box": music_box,
    "glock": glock,
    "piano": toy_piano,
    "marimba": marimba,
    "lead": whistle,
    "violin": bowed,
    "trombone": brass,
    "bass": soft_bass,
    "pad": pad,
    "shaker": lambda f, d, v: shaker(d, v),
    "kick": lambda f, d, v: kick(d, v),
    "clap": lambda f, d, v: clap(v),
    "sparkle": lambda f, d, v: sparkle(f, v),
    "wave": lambda f, d, v: wave_swell(d, v),
}


# ---------------------------------------------------------------- 编曲引擎

CHORDS = {
    "C": ("C3", ["C4", "E4", "G4"]),
    "G": ("G2", ["B3", "D4", "G4"]),
    "F": ("F2", ["A3", "C4", "F4"]),
    "Am": ("A2", ["A3", "C4", "E4"]),
    "Dm": ("D2", ["D4", "F4", "A4"]),
}


class Score:
    def __init__(self):
        self.events = []  # (t, note|None, beats, inst, vel, pan)

    def add(self, t, note, beats, inst, vel=1.0, pan=0.0):
        self.events.append((t, note, beats, inst, vel, pan))

    def melody(self, t0, pattern, inst, vel=1.0, pan=0.0):
        """pattern: 'C5:.5 E5:1 r:2' → 依次排音符，返回结束时间"""
        t = t0
        for tok in pattern.split():
            name, _, dur = tok.partition(":")
            beats = float(dur) if dur else 1.0
            if name != "r":
                self.add(t, name, beats, inst, vel, pan)
            t += beats * BEAT
        return t


def notes_in(pattern):
    return [x for x in pattern.split() if not x.startswith("r")]


def pat_beats(pattern):
    return sum(float(tok.partition(":")[2] or 1.0) for tok in pattern.split())


def accomp_bar(sc, t0, chord, style):
    """一小节（4 拍）的伴奏织体"""
    bass, triad = CHORDS[chord]
    if style == "clap_game":
        # 拍手童谣：音乐盒琶音铺满 8 分音符，贝斯 1、3 拍，底鼓 + 沙锤
        for beat in (0, 2):
            sc.add(t0 + beat * BEAT, bass, 1.6, "bass", 0.9)
        for i, n in enumerate(triad):
            sc.add(t0, n, 4, "pad", 0.85, pan=-0.15 + 0.15 * i)
        arp = [triad[0], triad[2], triad[1], triad[2]] * 2
        for i, n in enumerate(arp):
            sc.add(t0 + i * 0.5 * BEAT, n, 0.5, "music_box", 0.5 if i % 2 else 0.7, pan=0.26)
        for beat in (0, 2):
            sc.add(t0 + beat * BEAT, None, 0, "kick", 0.9)
        for i in range(4):
            sc.add(t0 + i * BEAT, None, 0, "shaker", 0.35 if i % 2 == 0 else 0.55)
    elif style == "march":
        # 进行曲：1、3 拍贝斯，2、4 拍小鼓感（沙锤 + 底鼓），玩具钢琴弹和弦
        for beat in (0, 2):
            sc.add(t0 + beat * BEAT, bass, 1.6, "bass", 1.0)
        for i, n in enumerate(triad):
            sc.add(t0, n, 4, "pad", 0.8, pan=-0.2 + 0.2 * i)
        for i, n in enumerate([triad[2], triad[1], triad[0], triad[1]]):
            sc.add(t0 + i * BEAT, n, 0.5, "piano", 0.34, pan=-0.32)
        for beat in (1, 3):
            sc.add(t0 + beat * BEAT, None, 0, "kick", 0.62)
        for i in range(4):
            sc.add(t0 + i * BEAT, None, 0, "shaker", 0.32 if i % 2 == 0 else 0.5)
    elif style == "bubble":
        # 泡泡音型（颜色歌 / 字母歌）：钟琴八分音符「咕噜咕噜」冒泡，底鼓只点一下
        sc.add(t0, bass, 3.4, "bass", 0.85)
        sc.add(t0 + 2 * BEAT, bass, 1.6, "bass", 0.55)
        for i, n in enumerate(triad):
            sc.add(t0, n, 4, "pad", 0.75, pan=-0.2 + 0.2 * i)
        for i, n in enumerate([triad[0], triad[1], triad[2], triad[1]] * 2):
            sc.add(t0 + i * 0.5 * BEAT, n, 0.5, "glock", 0.34 if i % 2 else 0.5, pan=-0.28)
        for i in range(4):
            sc.add(t0 + i * BEAT, None, 0, "shaker", 0.3 if i % 2 == 0 else 0.5)
        sc.add(t0 + 2 * BEAT, None, 0, "kick", 0.5)
    else:  # simple
        sc.add(t0, bass, 3.4, "bass", 0.8)
        for i, n in enumerate(triad):
            sc.add(t0, n, 4, "pad", 0.7, pan=-0.15 + 0.15 * i)


def chord_arp(chord, octave_shift=1):
    """某和弦的琶音（上行后回落），供「念词」的碎音使用，永远贴合和声"""
    _, triad = CHORDS[chord]
    up = [name_of(midi_of(n) + 12 * octave_shift) for n in triad]
    return [up[1], up[0], up[2], up[1]]


def chatter(sc, t0, chord_spec, groups, inst, octave_shift, vel, pan=0.0):
    """副歌里那串「pia, pia, piano…」：按单词分组，组尾拖长、组头加重，
    时长按权重恰好填满 chord_spec 的小节数（乐器不同、音节数不同都能自适应）。"""
    picks = []
    for c in chord_spec:
        picks += chord_arp(c, octave_shift)
    target_beats = len(chord_spec) * 4
    units = sum(1 for g in groups for j in range(g) if j < g - 1) + 2 * len(groups)
    unit = target_beats / units

    t, k = t0, 0
    for g in groups:
        for j in range(g):
            last = j == g - 1
            beats = unit * (2 if last else 1)
            sc.add(t, picks[k % len(picks)], beats, inst, vel * (1.0 if (last or j == 0) else 0.68), pan)
            t += beats * BEAT
            k += 1
    return t


# ---------------------------------------------------------------- 读歌词


def read_lyrics():
    src = open(LESSONS_JS, encoding="utf-8").read()
    out = {}
    marks = [(m.group(1), m.start()) for m in re.finditer(r'id:\s*"(l\d+)"', src)]
    for idx, (lid, pos) in enumerate(marks):
        end = marks[idx + 1][1] if idx + 1 < len(marks) else len(src)
        m = re.search(r"lyrics:\s*\[(.*?)\]", src[pos:end], re.S)
        if m:
            out[lid] = [ln.replace('\\"', '"') for ln in re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(1))]
    return out


def stanzas(lines):
    """按空行切段；返回 [(段首行的下标, [句子...]), ...]"""
    groups, cur, start = [], [], None
    for i, ln in enumerate(lines):
        if ln == "":
            if cur:
                groups.append((start, cur))
            cur, start = [], None
        else:
            if start is None:
                start = i
            cur.append(ln)
    if cur:
        groups.append((start, cur))
    return groups


# ---------------------------------------------------------------- 第 4 课：A Sailor Went to Sea


def build_l4(lines):
    """拍手童谣：音乐盒 + 哨笛 + 拍手，第三段加入拍手游戏感"""
    sc = Score()
    timeline, t = [], 0.0

    # 前奏 4 小节：海浪 + 音乐盒先把主旋律亮一遍
    sc.add(0.0, None, 5, "wave", 0.7)
    for i, c in enumerate(["C", "G", "C", "G"]):
        accomp_bar(sc, t + i * 4 * BEAT, c, "clap_game" if i >= 2 else "simple")
    sc.melody(t + 4 * BEAT, "G4:.5 C5:.5 G4:1 A4:.5 G4:.5 E4:1 E4:1 E4:2 r:1", "music_box", 0.72, 0.22)
    sc.melody(t + 6 * BEAT, "E4:.5 G4:.5 A4:1 G4:.5 E4:.5 A4:1 G4:2 r:1", "music_box", 0.72, 0.22)
    t += 4 * 4 * BEAT
    sc.add(t - 0.75 * BEAT, "G6", 0.5, "sparkle", 0.85)
    sc.add(t - 0.25 * BEAT, "C6", 0.5, "glock", 0.7)

    line_pat = [
        "G4:.5 C5:.5 G4:1 A4:.5 G4:.5 E4:1 E4:1 E4:2 r:1",
        "E4:.5 G4:.5 A4:1 G4:.5 E4:.5 A4:1 G4:1 G4:2 r:1",
        "G3:.5 C4:.5 G3:1 A3:.5 G3:.5 E3:1 E3:1 E3:2 r:1",
        "C4:.5 E4:.5 G4:.5 A4:.5 G4:.5 E4:.5 G4:1 A4:1 G4:1 E4:1 C4:1",
    ]
    line_chords = [["C", "G"], ["C", "F"], ["Am", "G"], ["C", "C"]]

    groups = stanzas(lines)
    for si, (_base, stanza) in enumerate(groups):
        assert len(stanza) == 4, f"l4 第{si + 1}段应为 4 句，实际 {len(stanza)}"
        for li, text in enumerate(stanza):
            pat = line_pat[li]
            assert len(notes_in(pat)) == line_syllables(text), (
                f"l4 第{si + 1}段第{li + 1}句：旋律 {len(notes_in(pat))} 个音 "
                f"≠ 歌词 {line_syllables(text)} 个音节（{text}）"
            )
            assert pat_beats(pat) == 8, f"l4 第{li + 1}句应为 2 小节（8 拍），实际 {pat_beats(pat)}"
            timeline.append(t)
            sc.melody(t, pat, "lead", 1.0, -0.05)
            if li == 3:
                sc.melody(t, pat, "glock", 0.3, 0.3)  # 末句高八度加亮
            for bi, c in enumerate(line_chords[li]):
                t_bar = t + bi * 4 * BEAT
                accomp_bar(sc, t_bar, c, "clap_game")
                if si == 2:  # 第三段：2、4 拍真的拍手（这就是拍手游戏）
                    for beat in (1, 3):
                        sc.add(t_bar + beat * BEAT, None, 0, "clap", 0.85)
            t += 8 * BEAT
        if si < len(groups) - 1:
            # 段间 1 小节：只有拍手 + 一下低音，孩子跟着拍
            for beat in (0, 1, 2, 3):
                sc.add(t + beat * BEAT, None, 0, "clap", 0.95 if beat % 2 == 0 else 0.5)
            sc.add(t, "C3", 2, "bass", 0.8)
            timeline.append(t)  # 对应歌词里的空行
            t += 4 * BEAT

    # 尾声 2 小节
    for i, n in enumerate(["C5", "E5", "G5", "C6", "G5", "E5", "C5"]):
        sc.add(t + i * 0.5 * BEAT, n, 0.5, "music_box", 0.62, -0.2 + 0.4 * (i % 2))
    accomp_bar(sc, t, "C", "clap_game")
    accomp_bar(sc, t + 4 * BEAT, "C", "clap_game")
    sc.add(t + 2 * BEAT, "C6", 3, "glock", 0.85)
    sc.add(t + 3 * BEAT, "G6", 1, "sparkle", 0.8)
    t += 8 * BEAT

    assert len(timeline) == len(lines), f"l4 时间轴 {len(timeline)} ≠ 歌词行数 {len(lines)}"
    return sc, timeline, t


# ---------------------------------------------------------------- 第 5 课：I Am the Music Man


def build_l5(lines):
    """进行曲：每段换主角乐器（钢琴 / 小提琴 / 长号），副歌由该乐器自己「念」出来"""
    sc = Score()
    timeline, t = [], 0.0

    # 前奏 4 小节：进行曲鼓点 + 玩具钢琴先吹个号
    for i, c in enumerate(["C", "G", "C", "G"]):
        accomp_bar(sc, t + i * 4 * BEAT, c, "march")
    sc.melody(t + 4 * BEAT, "G4:.5 A4:.5 B4:1 C5:2 G4:.5 A4:.5 B4:2 r:1", "piano", 0.8, 0.05)
    t += 4 * 4 * BEAT
    sc.add(t - 0.5 * BEAT, "C6", 0.5, "sparkle", 0.85)

    head = [
        ("C5:1 E5:.5 D5:.5 E5:1 F5:1 G5:2 r:2", ["C", "G"]),
        ("G5:.5 F5:.5 E5:1 D5:1 C5:1 D5:2 r:2", ["G", "C"]),
        ("E5:.5 G5:.5 F5:1 D5:2", ["G"]),
        ("D5:.5 F5:.5 E5:1 C5:2", ["C"]),
    ]
    # 第 5 句「I play the piano / violin / trombone」音节数不同（6 / 6 / 5），各配一条
    play_pat = {
        6: "C5:1 C5:.5 C5:.5 E5:1 D5:1 C5:2 r:2",
        5: "C5:1 C5:.5 D5:.5 E5:1 C5:3 r:2",
    }
    # 每段的「主角乐器」：音色 + 念词用的八度 + 音量
    cast = {
        "piano": ("piano", 1, 0.85),
        "violin": ("violin", 1, 1.0),
        "trombone": ("trombone", 0, 0.9),
    }

    groups = stanzas(lines)
    for si, (_base, stanza) in enumerate(groups):
        assert len(stanza) == 7, f"l5 第{si + 1}段应为 7 句，实际 {len(stanza)}"
        m = re.search(r"\bthe\s+([A-Za-z]+)", stanza[4])
        word = (m.group(1) if m else "piano").lower()
        inst, shift, vel = cast.get(word, cast["piano"])

        for li in range(5):
            if li == 4:
                want = line_syllables(stanza[4])
                if want not in play_pat:
                    raise AssertionError(f"l5 「{stanza[4]}」有 {want} 个音节，没配旋律")
                pat, chords = play_pat[want], ["C", "G"]
            else:
                pat, chords = head[li]
                want = line_syllables(stanza[li])
            assert len(notes_in(pat)) == want, (
                f"l5 第{si + 1}段第{li + 1}句：旋律 {len(notes_in(pat))} 个音 ≠ 歌词 {want} 个音节"
                f"（{stanza[li]}）"
            )
            assert pat_beats(pat) == len(chords) * 4
            timeline.append(t)
            sc.melody(t, pat, inst, vel, -0.05)
            if li in (0, 4):
                sc.melody(t, pat, "glock", 0.2, 0.32)  # 高八度加亮，句子更亮更甜
            for bi, c in enumerate(chords):
                t_bar = t + bi * 4 * BEAT
                accomp_bar(sc, t_bar, c, "march")
                if li == 3:  # 「What can you play?」末拍留白，等孩子接话
                    sc.add(t_bar + 3 * BEAT, None, 0, "clap", 0.5)
            t += len(chords) * 4 * BEAT

        # 第 6、7 句：「Pia, pia, piano…」主角乐器自己念一串（音节数由歌词算）
        for li, chord_spec in ((5, ["C", "G", "C"]), (6, ["G", "C", "C"])):
            text = stanza[li]
            syl_groups = [syllables(w) for w in words_of(text)]
            assert sum(syl_groups) == line_syllables(text)
            timeline.append(t)
            end = chatter(sc, t, chord_spec, syl_groups, inst, shift, vel, -0.1)
            for bi, c in enumerate(chord_spec):
                accomp_bar(sc, t + bi * 4 * BEAT, c, "march")
            t += len(chord_spec) * 4 * BEAT
            assert end <= t + 1e-6, f"l5 第{si + 1}段第{li + 1}句碎音超长"

        if si < len(groups) - 1:
            for i, c in enumerate(["C", "G"]):
                accomp_bar(sc, t + i * 4 * BEAT, c, "march")
            sc.melody(t + 2 * BEAT, "G5:.5 A5:.5 G5:1 E5:1 D5:.5 E5:.5 C5:2", "glock", 0.65, 0.3)
            timeline.append(t)  # 对应歌词里的空行
            t += 8 * BEAT

    # 尾声 2 小节
    for i, n in enumerate(["C5", "E5", "G5", "C6", "G5", "E5", "G5", "C6"]):
        sc.add(t + i * 0.5 * BEAT, n, 0.5, "piano", 0.62, -0.15 + 0.3 * (i % 2))
    accomp_bar(sc, t, "C", "march")
    accomp_bar(sc, t + 4 * BEAT, "C", "march")
    sc.add(t + 3 * BEAT, "C6", 3, "glock", 0.85)
    sc.add(t + 5 * BEAT, "G6", 1, "sparkle", 0.8)
    t += 8 * BEAT

    assert len(timeline) == len(lines), f"l5 时间轴 {len(timeline)} ≠ 歌词行数 {len(lines)}"
    return sc, timeline, t


# ---------------------------------------------------------------- 渲染 / 导出


def sing_line(sc, t0, text, contour, beats, inst, vel=1.0, pan=0.0, label=""):
    """「一句歌词 = 一条旋律」的通用唱法。

    contour 的音符个数必须**恰好等于**这句歌词的音节数（syllables() 估算），
    对不上直接报错——这是防止旋律与歌词错位（听起来就是「跑调的伴奏」）的
    唯一保险。节奏上除最后一个音节拖长一倍外，其余均分，正好填满 beats 拍，
    所以不管歌词多长多短，句子都落在整小节上，动画舞台可以对拍。
    """
    n = line_syllables(text)
    assert n == len(contour), (
        f"{label}：旋律 {len(contour)} 个音 ≠ 歌词 {n} 个音节（{text}）"
    )
    base = beats / (n + 1)  # 末音翻倍 → 合计恰好 beats 拍
    toks = [f"{c}:{base:.4f}" for c in contour[:-1]]
    toks.append(f"{contour[-1]}:{base * 2:.4f}")
    return sc.melody(t0, " ".join(toks), inst, vel, pan)


# ---------------------------------------------------------------- 第 6 课：A Rainbow of Colors


def build_l6(lines):
    """颜色歌：泡泡音型 + 哨笛唱颜色，副歌「I see a rainbow」每次钟琴加亮。

    三段各讲 3 个颜色（暖色 / 冷色 / 明暗），第四句都是同一句副歌，
    孩子记一句就能跟着唱。
    """
    sc = Score()
    timeline, t = [], 0.0

    # 前奏 4 小节：彩色泡泡一颗颗冒上来
    for i, c in enumerate(["C", "F", "C", "G"]):
        accomp_bar(sc, t + i * 4 * BEAT, c, "bubble")
    for i, n in enumerate(["C5", "E5", "G5", "A5", "C6", "A5", "G5", "E5"]):
        sc.add(t + i * 0.5 * BEAT, n, 0.5, "glock", 0.5, pan=-0.3 + 0.6 * (i % 2))
    t += 4 * 4 * BEAT
    sc.add(t - 0.5 * BEAT, "C6", 0.5, "sparkle", 0.8)

    # 每段前 3 句（第 4 句统一是副歌）：(旋律轮廓, 两小节的和弦)
    verse = [
        [
            ("C5 E5 G5 A5 G5 E5", ["C", "G"]),
            ("C5 D5 E5 G5 A5 G5 F5 D5", ["C", "G"]),
            ("F5 A5 G5 E5 D5 C5", ["F", "C"]),
        ],
        [
            ("G4 C5 E5 G5 E5 C5", ["C", "G"]),
            ("E5 F5 G5 A5 G5 F5 E5 D5", ["F", "C"]),
            ("G5 A5 G5 E5 D5", ["C", "G"]),
        ],
        [
            ("C5 E5 G5 F5 E5 D5 C5", ["F", "C"]),
            ("A5 G5 F5 E5 F5 G5", ["C", "G"]),
            ("F5 G5 A5 G5 F5 E5", ["C", "G"]),
        ],
    ]
    refrain = ("E5 G5 A5 G5 E5 D5 C5 C5", ["G", "C"])

    groups = stanzas(lines)
    for si, (_base, stanza) in enumerate(groups):
        assert len(stanza) == 4, f"l6 第{si + 1}段应为 4 句，实际 {len(stanza)}"
        for li, text in enumerate(stanza):
            contour, chords = refrain if li == 3 else verse[si][li]
            timeline.append(t)
            sing_line(sc, t, text, contour.split(), 8 * BEAT, "lead", 1.0, -0.05, f"l6 第{si + 1}段第{li + 1}句")
            if li == 3:
                sing_line(sc, t, text, contour.split(), 8 * BEAT, "glock", 0.22, 0.32, f"l6 副歌")
            for bi, c in enumerate(chords):
                t_bar = t + bi * 4 * BEAT
                accomp_bar(sc, t_bar, c, "bubble")
                if li == 3:  # 副歌每拍轻轻拍手，孩子跟着拍
                    for beat in (0, 2):
                        sc.add(t_bar + beat * BEAT, None, 0, "clap", 0.45)
            t += 8 * BEAT
        if si < len(groups) - 1:
            for i, c in enumerate(["C", "G"]):
                accomp_bar(sc, t + i * 4 * BEAT, c, "bubble")
            sc.melody(t + 2 * BEAT, "C6:.5 A5:.5 G5:1 E5:2", "music_box", 0.7, 0.32)
            timeline.append(t)  # 对应歌词里的空行
            t += 8 * BEAT

    # 尾声 2 小节
    for i, n in enumerate(["C5", "E5", "G5", "A5", "G5", "E5", "G5", "C6"]):
        sc.add(t + i * 0.5 * BEAT, n, 0.5, "music_box", 0.6, -0.2 + 0.4 * (i % 2))
    accomp_bar(sc, t, "C", "bubble")
    accomp_bar(sc, t + 4 * BEAT, "C", "bubble")
    sc.add(t + 2 * BEAT, "C6", 3, "glock", 0.85)
    sc.add(t + 3 * BEAT, "G6", 1, "sparkle", 0.8)
    t += 8 * BEAT

    assert len(timeline) == len(lines), f"l6 时间轴 {len(timeline)} ≠ 歌词行数 {len(lines)}"
    return sc, timeline, t


# ---------------------------------------------------------------- 第 7 课：Count With Me


def build_l7(lines):
    """数数歌：木琴 + 进行曲，每个数字都落在拍点上（方便孩子边数边拍手）。

    每句只有 3~5 个音节，一句正好一小节，三句一组往下数；
    最后一句「We counted to ten」收在主音上。
    """
    sc = Score()
    timeline, t = [], 0.0

    # 前奏 4 小节：先拍手把节奏交代清楚，再走一遍上行音阶
    for i, c in enumerate(["C", "G", "C", "G"]):
        accomp_bar(sc, t + i * 4 * BEAT, c, "march")
        for beat in range(4):
            sc.add(t + i * 4 * BEAT + beat * BEAT, None, 0, "clap", 0.5)
    for i, n in enumerate(["C5", "D5", "E5", "F5", "G5", "A5", "B5", "C6"]):
        sc.add(t + i * 0.5 * BEAT, n, 0.5, "marimba", 0.6, pan=-0.25 + 0.5 * (i % 2))
    t += 4 * 4 * BEAT
    sc.add(t - 0.5 * BEAT, "C6", 0.5, "sparkle", 0.85)

    # 三段：正着数 → 再数一遍 → 倒着数
    # 注意音节估算：「zero」「seven」各算 2 个音节，所以这两句要配多一两个音
    verse = [
        [
            ("C5 E5 G5 E5 G5 C6", "C"),
            ("G5 G5 E5", "C"),
            ("G5 G5 F5", "F"),
            ("A5 G5 E5 D5", "C"),
            ("G5 F5 D5", "G"),
        ],
        [
            ("C5 D5 E5 G5 A5", "C"),
            ("G5 G5 E5", "C"),
            ("G5 G5 F5", "F"),
            ("A5 G5 E5 D5", "C"),
            ("G5 F5 D5", "G"),
        ],
        [
            ("G5 F5 E5", "C"),
            ("F5 E5 D5 C5", "F"),
            ("E5 D5 C5", "G"),
            ("D5 C5 C5 D5", "C"),
            ("C5 E5 G5 G5 C5", "C"),
        ],
    ]

    groups = stanzas(lines)
    for si, (_base, stanza) in enumerate(groups):
        assert len(stanza) == 5, f"l7 第{si + 1}段应为 5 句，实际 {len(stanza)}"
        for li, text in enumerate(stanza):
            contour, chord = verse[si][li]
            timeline.append(t)
            sing_line(sc, t, text, contour.split(), 4 * BEAT, "marimba", 0.95, -0.05, f"l7 第{si + 1}段第{li + 1}句")
            sing_line(sc, t, text, contour.split(), 4 * BEAT, "piano", 0.28, 0.3, f"l7 doubling")
            accomp_bar(sc, t, chord, "march")
            if li < 4:  # 数数字的句子：1、3 拍拍手，孩子跟着数
                for beat in (1, 3):
                    sc.add(t + beat * BEAT, None, 0, "clap", 0.42 if beat == 1 else 0.62)
            t += 4 * BEAT
        if si < len(groups) - 1:
            for i, c in enumerate(["C", "G"]):
                accomp_bar(sc, t + i * 4 * BEAT, c, "march")
            sc.melody(t + 2 * BEAT, "G5:.5 A5:.5 G5:1 E5:1 C5:1", "marimba", 0.62, 0.3)
            timeline.append(t)  # 对应歌词里的空行
            t += 8 * BEAT

    # 尾声 2 小节：数到十啦！
    accomp_bar(sc, t, "C", "march")
    accomp_bar(sc, t + 4 * BEAT, "C", "march")
    for i, n in enumerate(["C5", "E5", "G5", "C6", "G5", "E5", "C5", "C6"]):
        sc.add(t + i * 0.5 * BEAT, n, 0.5, "marimba", 0.6, -0.2 + 0.4 * (i % 2))
    sc.add(t + 2 * BEAT, "C6", 3, "glock", 0.85)
    sc.add(t + 5 * BEAT, "C6", 1, "clap", 0.9)
    t += 8 * BEAT

    assert len(timeline) == len(lines), f"l7 时间轴 {len(timeline)} ≠ 歌词行数 {len(lines)}"
    return sc, timeline, t


# ---------------------------------------------------------------- 第 8 课：The ABC Song


def build_l8(lines):
    """字母歌：八音盒唱字母（音乐盒音色最像「字母积木」）。

    旋律就是最经典的字母歌（Twinkle 曲调），两句一段共两段：
    第一段音乐盒，第二段换钟琴（更亮），最后收在主音上。
    """
    sc = Score()
    timeline, t = [], 0.0

    # 前奏 4 小节：音乐盒把音阶爬一遍 C D E F G A B C
    for i, c in enumerate(["C", "F", "C", "G"]):
        accomp_bar(sc, t + i * 4 * BEAT, c, "bubble")
    for i, n in enumerate(["C5", "D5", "E5", "F5", "G5", "A5", "B5", "C6"]):
        sc.add(t + i * 0.5 * BEAT, n, 0.5, "music_box", 0.6, pan=-0.28 + 0.56 * (i % 2))
    t += 4 * 4 * BEAT
    sc.add(t - 0.5 * BEAT, "C6", 0.5, "sparkle", 0.85)

    # 每段 6 句：(旋律轮廓, 和弦, 拍数)
    spec = [
        ("C5 C5 G5 G5 A5 A5 G5", ["C", "G"], 8),
        ("F5 F5 E5 E5 D5 D5 D5 C5 C5", ["C", "G"], 8),
        ("G5 G5 F5 F5 E5 E5", ["F"], 4),
        ("D5 D5 G5 G5 F5", ["G"], 4),
        ("E5 E5 D5 D5 C5", ["C"], 4),
        ("G5 G5 F5 F5 E5 E5 D5 C5", ["G", "C"], 8),
    ]
    cast = {0: ("music_box", 0.9, -0.05), 1: ("glock", 0.75, -0.05)}

    groups = stanzas(lines)
    for si, (_base, stanza) in enumerate(groups):
        assert len(stanza) == 6, f"l8 第{si + 1}段应为 6 句，实际 {len(stanza)}"
        inst, vel, pan = cast.get(si, cast[0])
        for li, text in enumerate(stanza):
            contour, chords, beats = spec[li]
            timeline.append(t)
            sing_line(sc, t, text, contour.split(), beats * BEAT, inst, vel, pan, f"l8 第{si + 1}段第{li + 1}句")
            sing_line(sc, t, text, contour.split(), beats * BEAT, "glock", 0.16, 0.32, "l8 doubling")
            for bi, c in enumerate(chords):
                accomp_bar(sc, t + bi * 4 * BEAT, c, "bubble")
            if li == 5 and si == 1:  # 最后一句：拍手收尾
                sc.add(t + 3 * BEAT, None, 0, "clap", 0.6)
            t += beats * BEAT
        if si < len(groups) - 1:
            for i, c in enumerate(["C", "G"]):
                accomp_bar(sc, t + i * 4 * BEAT, c, "bubble")
            sc.melody(t + 2 * BEAT, "G5:.5 A5:.5 B5:1 C6:2", "music_box", 0.7, 0.32)
            timeline.append(t)  # 对应歌词里的空行
            t += 8 * BEAT

    # 尾声 2 小节：字母爬到最后，放一颗星星音
    for i, n in enumerate(["C5", "E5", "G5", "C6", "G5", "E5", "G5", "C6"]):
        sc.add(t + i * 0.5 * BEAT, n, 0.5, "music_box", 0.6, -0.2 + 0.4 * (i % 2))
    accomp_bar(sc, t, "C", "bubble")
    accomp_bar(sc, t + 4 * BEAT, "C", "bubble")
    sc.add(t + 2 * BEAT, "C6", 3, "glock", 0.85)
    sc.add(t + 3 * BEAT, "G6", 1, "sparkle", 0.8)
    t += 8 * BEAT

    assert len(timeline) == len(lines), f"l8 时间轴 {len(timeline)} ≠ 歌词行数 {len(lines)}"
    return sc, timeline, t


def make_ir(seconds, seed):
    """混响脉冲：指数衰减噪声 + 20ms 预延迟"""
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = lowpass_fast(r.standard_normal(n) * np.exp(-t / 0.26), 4200)
    ir[: int(0.02 * SR)] = 0
    return ir / np.sqrt(np.sum(ir**2))


def render(sc, total_s):
    n = int(total_s * SR) + SR
    dry_l, dry_r = np.zeros(n), np.zeros(n)
    peaks = {}
    for t0, note, beats, inst, vel, pan in sc.events:
        i0 = int(t0 * SR)
        if i0 >= n:
            continue
        sig = INSTR[inst](freq_of(note) if note else 0.0, beats * BEAT, vel)
        seg = sig[: n - i0]
        ang = (pan + 1) * np.pi / 4  # 等功率声像
        dry_l[i0 : i0 + len(seg)] += seg * np.cos(ang)
        dry_r[i0 : i0 + len(seg)] += seg * np.sin(ang)
    l = dry_l + fft_convolve(dry_l, make_ir(1.0, 7) * 0.15)
    r = dry_r + fft_convolve(dry_r, make_ir(0.94, 21) * 0.15)
    peak = max(np.abs(l).max(), np.abs(r).max()) or 1.0
    l, r = l / peak * 0.9, r / peak * 0.9
    peaks["peak"] = float(peak)
    return np.tanh(l * 1.04) * 0.95, np.tanh(r * 1.04) * 0.95, peaks


def encode_mp3(l, r, path, kbps=128):
    enc = lameenc.Encoder()
    enc.set_bit_rate(kbps)
    enc.set_in_sample_rate(SR)
    enc.set_channels(2)
    enc.set_quality(2)
    inter = np.empty(len(l) * 2, dtype="<i2")
    inter[0::2] = (np.clip(l, -1, 1) * 32767).astype("<i2")
    inter[1::2] = (np.clip(r, -1, 1) * 32767).astype("<i2")
    data = enc.encode(inter.tobytes()) + enc.flush()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(data)
    return len(data)


def main():
    lyrics = read_lyrics()
    timings = {}
    # 只合成自研课；l4 / l5 用用户自己提供的音视频，不在这里重做
    builders = (
        ("l6", build_l6),
        ("l7", build_l7),
        ("l8", build_l8),
    )
    for lid, build in builders:
        lines = lyrics.get(lid)
        if not lines:
            print(f"!! {lid} 没读到歌词，跳过")
            continue
        sc, timeline, total_s = build(lines)
        l, r, _ = render(sc, total_s)
        out = os.path.join(ROOT, "public", "lessons", lid, "song.mp3")
        size = encode_mp3(l, r, out)
        timings[lid] = {
            "bpm": BPM,
            "beatsPerBar": 4,
            "duration": round(total_s, 3),
            "timeline": [round(v, 3) for v in timeline],
        }
        print(
            f"{lid}: {total_s:.1f}s ({int(total_s // 60)}:{int(total_s % 60):02d}) / "
            f"{len(lines)} 行歌词 / {len(sc.events)} 个音 / {size / 1024:.0f} KB"
        )

    with open(TIMINGS_JSON, "w", encoding="utf-8") as fh:
        json.dump(timings, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(f"时间轴 → {os.path.relpath(TIMINGS_JSON, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
