#!/usr/bin/env python3
"""
为所有课时单词生成神经网络发音 mp3（默认音色 en-US-AnaNeural 童声）。

用法：
    # 只补缺失的（增量，推荐）
    python3 scripts/gen-word-audio.py

    # 全部重新生成（换音色时用）
    python3 scripts/gen-word-audio.py --force --voice en-US-AriaNeural

依赖：
    pip install edge-tts

约定：
    - 单词数据来自 src/data/lessons.js（正则解析，改数据结构后需同步此脚本）
    - 输出到 public/lessons/<课时id>/audio/<单词id>.mp3
    - speech.js 会自动按单词 en 名播音频，文件缺失时回退浏览器 TTS
"""

import argparse
import asyncio
import os
import re
import sys

try:
    import edge_tts
except ImportError:
    sys.exit("请先安装依赖：pip install edge-tts")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LESSONS_JS = os.path.join(ROOT, "src", "data", "lessons.js")


def extract_words():
    """从 lessons.js 提取 [(lesson_id, word_id, en)]。"""
    src = open(LESSONS_JS, encoding="utf-8").read()
    blocks = re.split(r"\n  \{\n    id:", src)[1:]
    words = []
    for b in blocks:
        lid = re.match(r'\s*"(l\d)"', b).group(1)
        for wid, en in re.findall(r'id:\s*"([^"]+)",\s*en:\s*"([^"]+)"', b):
            words.append((lid, wid, en))
    return words


async def gen(text, out, voice):
    await edge_tts.Communicate(text, voice).save(out)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default="en-US-AnaNeural")
    ap.add_argument("--force", action="store_true", help="已存在的也重新生成")
    args = ap.parse_args()

    todo, skip = [], 0
    for lid, wid, en in extract_words():
        out = os.path.join(ROOT, "public", "lessons", lid, "audio", f"{wid}.mp3")
        if os.path.exists(out) and not args.force:
            skip += 1
            continue
        os.makedirs(os.path.dirname(out), exist_ok=True)
        todo.append((f"{lid}/{wid}", en, out))

    print(f"音色: {args.voice}  待生成 {len(todo)}  已存在跳过 {skip}")
    fail = 0
    for tag, en, out in todo:
        try:
            await gen(en, out, args.voice)
            print(f"  ✓ {tag} ({en})")
        except Exception as e:  # noqa: BLE001
            fail += 1
            print(f"  ✗ {tag} ({en}): {e}", file=sys.stderr)
    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    asyncio.run(main())
