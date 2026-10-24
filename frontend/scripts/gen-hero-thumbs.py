#!/usr/bin/env python3
"""英雄立绘缩略图生成：public/heroes/*.png → public/heroes/thumbs/<id>.webp。

为什么：图鉴"全部英雄"一屏渲染 81 张 <img>，未收集的也整图加载再 CSS 变灰——
一次 20-30MB。网格/缩略条只显示 80-112px（retina 224px），256px 的 WebP 足够；
原图（500KB 级）只留给详情页的姿势舞台和全屏查看器。

用法（需要带 Pillow 的 python，项目脚本惯用 workbuddy 环境）：
  ~/.workbuddy/binaries/python/envs/default/bin/python scripts/gen-hero-thumbs.py

幂等：mtime 比源文件新的缩略图跳过（--force 全量重出）。
"""
import argparse
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEROES_DIR = os.path.join(ROOT, "public", "heroes")
THUMBS_DIR = os.path.join(HEROES_DIR, "thumbs")
SIZE = 256


def gen(path, force):
    out = os.path.join(THUMBS_DIR, os.path.splitext(os.path.basename(path))[0] + ".webp")
    if not force and os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(path):
        return None
    im = Image.open(path).convert("RGBA")
    im.thumbnail((SIZE, SIZE), Image.LANCZOS)
    im.save(out, "WEBP", quality=75, method=4)
    return os.path.getsize(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="忽略 mtime 全量重出")
    args = ap.parse_args()
    os.makedirs(THUMBS_DIR, exist_ok=True)

    pngs = sorted(f for f in os.listdir(HEROES_DIR) if f.endswith(".png"))
    total = skipped = 0
    for f in pngs:
        size = gen(os.path.join(HEROES_DIR, f), args.force)
        if size is None:
            skipped += 1
        else:
            total += size
    print(f"{len(pngs)} 张立绘 → {len(pngs) - skipped} 张新缩略图（本次写出 {total // 1024}K，单图均值 {total // 1024 // max(1, len(pngs) - skipped)}K）")


if __name__ == "__main__":
    sys.exit(main())
