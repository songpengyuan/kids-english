#!/usr/bin/env python3
"""生成跨平台 emoji 子集字体（Noto Color Emoji）+ 对应 @font-face 样式。

为什么需要
---------
内容 emoji 在不同系统上由不同字体渲染：macOS/iOS 走 Apple Color Emoji，Windows 走
Segoe UI Emoji。两边字形与色彩风格完全不同；更糟的是 Unicode 15 之后的新 emoji
（如 🪼 水母）在 Windows 10 / 旧版 Win11 上根本没有字形，直接渲染成豆腐块。

做法
----
1. 扫描项目里真正用到的 emoji 码位：数据文件（lessons.json）+ 源码硬编码字面量。
   **两边都要扫**——只扫数据字段会漏掉组件里写死的界面 emoji（如拼句子页的 🧩）。
2. 拉 Google Fonts 的 Noto Color Emoji CSS，它已按 unicode-range 切成多个分片。
3. 按码位把用到的字符映射到分片，对每个分片再做一次 pyftsubset 精确裁剪。
   几十个码位通常能压到 50KB 量级（整包是 2MB 量级，差两个数量级）。
4. 输出 `public/fonts/noto-emoji/*.woff2` + `src/styles/emoji-font.css`。

授权：Noto Color Emoji 为 SIL OFL 1.1，可免费商用、可自托管、可再分发。

用法
----
    cd frontend && python3 scripts/build-emoji-font.py

新增了 emoji（数据或源码）之后重跑一次即可；脚本会同时删除不再需要的旧分片。
需要网络（从 fonts.googleapis.com / fonts.gstatic.com 拉取）。
"""

from __future__ import annotations

import collections
import json
import os
import re
import subprocess
import tempfile
import sys
import urllib.request

FRONTEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(FRONTEND, "public", "fonts", "noto-emoji")
CSS_PATH = os.path.join(FRONTEND, "src", "styles", "emoji-font.css")

CSS_URL = "https://fonts.googleapis.com/css2?family=Noto+Color+Emoji"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)

# 扫描范围：这些区段之外的字符（箭头 →、对勾 ✓、星号 ★ 等）由正文字体负责，不算 emoji。
EMOJI_RANGES = [
    (0x1F000, 0x1FAFF),  # 绝大多数 emoji
    (0x2600, 0x27BF),    # 杂项符号与装饰
    (0x2B00, 0x2BFF),    # 箭头与几何图形补充（⭐ U+2B50、⬆ U+2B06）
    (0x2190, 0x21FF),    # 箭头区（↔ U+2194 带 FE0F 时是 emoji）
    (0x2300, 0x23FF),    # 技术符号（⌛ ⏰）
    (0x25A0, 0x25FF),    # 几何图形
    (0x3030, 0x3030),    # 〰 U+3030
    (0x303D, 0x303D),    # 〽
    (0x3297, 0x3299),    # ㊗ ㊙
]
VS16 = "\ufe0f"  # 变体选择符-16：把前面的符号强制成 emoji 呈现


def is_emoji_cp(cp: int) -> bool:
    return any(lo <= cp <= hi for lo, hi in EMOJI_RANGES)


def collect_codepoints() -> tuple[set[int], dict[str, list[str]]]:
    """返回 (需要的码位集合, 命中位置索引)。"""
    need: set[int] = set()
    where: dict[str, list[str]] = collections.defaultdict(list)

    def feed(text: str, origin: str, start_line: int = 0) -> None:
        for idx, ch in enumerate(text):
            cp = ord(ch)
            if not is_emoji_cp(cp):
                continue
            # 跟着 FE0F 的符号才算 emoji 呈现（↔️ ⚠️ ⬆️），裸 ↔ ⚠ 交给正文字体
            nxt = text[idx + 1] if idx + 1 < len(text) else ""
            if cp < 0x1F000 and nxt != VS16:
                continue
            need.add(cp)
            line = start_line + text[:idx].count("\n") + 1
            where[ch].append(f"{origin}:{line}")

    # 1) 课时数据里的 emoji 字段
    data_path = os.path.join(FRONTEND, "src", "data", "lessons.json")
    data = json.load(open(data_path, encoding="utf-8"))
    for lesson in data:
        if lesson.get("emoji"):
            feed(lesson["emoji"], "src/data/lessons.json (lesson)")
        for word in lesson.get("words", []):
            if word.get("emoji"):
                feed(word["emoji"], "src/data/lessons.json (word)")

    # 2) 源码里硬编码的字面量
    for root, dirs, files in os.walk(os.path.join(FRONTEND, "src")):
        dirs[:] = [d for d in dirs if d != "__tests__"]
        for name in files:
            if not name.endswith((".vue", ".ts", ".js")):
                continue
            path = os.path.join(root, name)
            rel = os.path.relpath(path, FRONTEND)
            try:
                text = open(path, encoding="utf-8").read()
            except UnicodeDecodeError:
                continue
            feed(text, rel)

    need.add(ord(VS16))  # FE0F 本身并入第一个分片，保证带变体选择符的序列有归属
    return need, where


def fetch_google_faces() -> list[tuple[str, list[tuple[int, int]]]]:
    req = urllib.request.Request(CSS_URL, headers={"User-Agent": UA})
    css = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
    faces = re.findall(
        r"src: url\((https://[^)]+\.woff2)\)[^}]*unicode-range: ([^;]+);", css
    )
    parsed = []
    for url, rng in faces:
        spans = []
        for item in rng.split(","):
            item = item.strip().replace("U+", "")
            if "-" in item:
                a, b = item.split("-")
                spans.append((int(a, 16), int(b, 16)))
            else:
                v = int(item, 16)
                spans.append((v, v))
        parsed.append((url, spans))
    return parsed


def main() -> int:
    need, where = collect_codepoints()
    print(f"项目用到的 emoji 码位：{len(need) - 1} 个（另有 1 个变体选择符）")
    for ch, locs in sorted(where.items(), key=lambda kv: -len(kv[1])):
        print(f"  {ch!r} ×{len(locs)}  首个位置 {locs[0]}")

    faces = fetch_google_faces()
    assign: dict[str, set[int]] = collections.defaultdict(set)
    for cp in sorted(need):
        if cp == ord(VS16):
            continue
        for url, spans in faces:
            if any(lo <= cp <= hi for lo, hi in spans):
                assign[url.split("/")[-1].split(".")[-2]].add(cp)
                break
        else:
            print(f"⚠️ 码位 U+{cp:04X} 不在 Noto Color Emoji 覆盖范围内", file=sys.stderr)

    assign.setdefault("0", set()).add(ord(VS16))

    os.makedirs(FONT_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(CSS_PATH), exist_ok=True)
    # 清掉上一版分片，避免码位迁移后留下孤儿文件
    for f in os.listdir(FONT_DIR):
        if f.endswith(".woff2"):
            os.remove(os.path.join(FONT_DIR, f))

    url_by_idx = {u.split("/")[-1].split(".")[-2]: u for u, _ in faces}
    src_dir = tempfile.mkdtemp(prefix="emoji-font-src-")  # 原始分片缓存放系统临时目录，不入库
    blocks = []
    total = 0
    for idx in sorted(assign, key=int):
        cps = sorted(c for c in assign[idx] if c != ord(VS16))
        if not cps:
            continue
        src = os.path.join(src_dir, f"{idx}.woff2")
        if not os.path.exists(src):
            req = urllib.request.Request(url_by_idx[idx], headers={"User-Agent": UA})
            open(src, "wb").write(urllib.request.urlopen(req, timeout=60).read())
        out = os.path.join(FONT_DIR, f"noto-emoji-{idx}.woff2")
        unicodes = ",".join(f"U+{c:04X}" for c in cps)
        subprocess.run(
            [
                sys.executable, "-m", "fontTools.subset", src,
                f"--unicodes={unicodes}",
                "--flavor=woff2",
                "--layout-features=",
                "--no-hinting",
                "--desubroutinize",
                f"--output-file={out}",
            ],
            check=True,
            capture_output=True,
        )
        size = os.path.getsize(out)
        total += size
        print(f"  分片 {idx}: {len(cps)} 码位 → {size} B")
        blocks.append(
            f"""@font-face {{
  font-family: "Noto Color Emoji";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/noto-emoji/noto-emoji-{idx}.woff2") format("woff2");
  unicode-range: {unicodes};
}}"""
        )

    header = '''/* ---------- 跨平台 emoji 字体（Noto Color Emoji 子集） ----------
 * 由 frontend/scripts/build-emoji-font.py 生成，不要手改。
 *
 * 为什么需要：内容 emoji 在 macOS/iOS 走 Apple Color Emoji、Windows 走 Segoe UI Emoji，
 *   两边字形与色彩风格完全不同；更麻烦的是 Unicode 15 之后的新 emoji（如 🪼 水母）
 *   Win10 / 旧版 Win11 根本没有字形，直接渲染成豆腐块。
 *
 * 做法：按 unicode-range 切成多片自托管，浏览器只下载页面真正出现的码位对应的分片。
 *   字形是 COLRv1 矢量化彩色字体，任意缩放不糊，也不依赖系统装没装对应 emoji。
 *
 * 授权：Noto Color Emoji 为 SIL OFL 1.1 —— 可免费商用、可自托管、可再分发。
 * 新增 emoji 后重跑脚本即可；说明见 docs/EMOJI-FONT.md。
 */
'''
    open(CSS_PATH, "w", encoding="utf-8").write(header + "\n\n".join(blocks) + "\n")
    print(f"总计 {total} B（{total / 1024:.1f} KB），已写入 {os.path.relpath(CSS_PATH, FRONTEND)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
