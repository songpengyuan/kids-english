#!/usr/bin/env python3
"""生成英雄图鉴图片核查网格：把 public/heroes/ 的图片按 9 列网格拼成一张大图，
方便人工（或视觉模型）批量核查是否有错图/杂图。

用法:
    python3 scripts/review-hero-grid.py [--out /tmp/hero-grid]
输出:
    main.png     81 张主图
    pose2.png    -2 姿势图
    pose3.png    -3 姿势图
    p2a/p2b/p3a/p3b  带红色序号的分区放大图（定位坏格用）

背景:
    - 图鉴素材来自多图源（dcd 官方卡面 / moegirl / bing / baidu），英文名易撞词的
      形态（Jack/Corona/Supreme/Alpha 等）可能抓错图，抓取后应跑本工具核查。
    - 卡面带文字（DCD 卡面）容易被视觉模型误读为"界面截图/游戏封面"，
      定位坏格时以"完全无关的实物（服饰/实验图/照片）"为准。
"""
import os
import re
import sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEROES_TS = os.path.join(ROOT, "src", "data", "heroes.ts")
HEROES_DIR = os.path.join(ROOT, "public", "heroes")


def load_forms():
    src = open(HEROES_TS, encoding="utf-8").read()
    roster = src[src.index("const ROSTER"): src.index("/** 展开成图鉴用的正式结构")]
    return re.findall(r'\["([a-z0-9-]+)", "([^"]+)", "([^"]+)"\]', roster)


def make_grid(items, path, start_no, label, numbered):
    """items: [(fid, 中文名)]；numbered 时每格左上角印红色序号。"""
    n = len(items)
    cols, rows = 9, (n + 8) // 9
    cell_w, cell_h, pad, tag = (200, 260, 6, 22) if numbered else (150, 200, 4, 18)
    W = cols * cell_w + (cols + 1) * pad
    H = rows * (cell_h + tag) + (rows + 1) * pad + 30
    img = Image.new("RGB", (W, H), "#f2f2f2")
    d = ImageDraw.Draw(img)
    d.text((pad, pad), label, fill="black")
    for i, (fid, zh) in enumerate(items):
        no = start_no + i
        r, c = divmod(i, cols)
        x = pad + c * (cell_w + pad)
        y = pad + 30 + r * (cell_h + tag + pad)
        if numbered:
            d.rectangle((x, y, x + 34, y + 24), fill="#d00")
            d.text((x + 6, y + 4), str(no), fill="white")
        try:
            im = Image.open(os.path.join(HEROES_DIR, fid + ".png")).convert("RGB")
            im.thumbnail((cell_w - 14, cell_h - 14))
            img.paste(im, (x + 7, y + 7))
        except Exception:
            d.rectangle((x, y, x + cell_w, y + cell_h), fill="#ddd")
            d.text((x + 6, y + 6), "缺失", fill="red")
        d.text((x + 4, y + cell_h), f"{no} {zh}" if numbered else f"{zh}", fill="#333")
        if not numbered:
            d.text((x + 4, y + cell_h + 9), fid, fill="#888")
    img.save(path)
    print(f"{label}: {n} 格 → {path}")


def main():
    out = "/tmp/hero-grid"
    args = sys.argv[1:]
    if "--out" in args:
        i = args.index("--out")
        if i + 1 < len(args):
            out = args[i + 1]
    os.makedirs(out, exist_ok=True)
    forms = load_forms()
    base = [(f[0], f[1]) for f in forms]
    p2 = [(f"{f[0]}-2", f[1]) for f in forms]
    p3 = [(f"{f[0]}-3", f[1]) for f in forms]

    make_grid(base, os.path.join(out, "main.png"), 1, f"主图 {len(base)}", numbered=True)
    make_grid(p2[:42], os.path.join(out, "p2a.png"), 1, "姿势#2 上（1-42）", numbered=True)
    make_grid(p2[42:], os.path.join(out, "p2b.png"), 43, "姿势#2 下（43-81）", numbered=True)
    make_grid(p3[:42], os.path.join(out, "p3a.png"), 1, "姿势#3 上（1-42）", numbered=True)
    make_grid(p3[42:], os.path.join(out, "p3b.png"), 43, "姿势#3 下（43-81）", numbered=True)


if __name__ == "__main__":
    main()
