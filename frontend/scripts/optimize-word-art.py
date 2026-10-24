#!/usr/bin/env python3
"""词图去白底 → 透明 WebP（一次性资产管线，产出入库后源 PNG 删除）。

背景：词图是三条来源混着的 40 张 RGB PNG——绘本扫描件（带纸纹/污渍）、
白底卡通、书页裁片。米色卡面上一律显示成一块白方块。

做法：
  1. 从四边种子做 BFS 泛洪：与边界均值同色系（或足够亮）的连通区 → 透明。
     只用泛洪不用全局键色，保护主体内部的白色（眼睛/高光）不被打穿；
  2. 容差分两档：亮部（纸面 200+）宽进，彩部按色距卡，兼容泛黄纸纹；
  3. alpha 做 1px 盒滤波羽化，锯齿边贴彩色卡面不扎眼；
  4. 输出同尺寸 WebP q80 到同目录（.png → .webp），打印前后体积对照。

用法（需要带 Pillow 的 python，项目脚本惯用 workbuddy 环境）：
  ~/.workbuddy/binaries/python/envs/default/bin/python scripts/optimize-word-art.py
可选 --min-alpha N：纸纹残留重时调高（默认 235，越大去得越狠）。
"""
import argparse
import os
import sys
from collections import deque

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORDS_DIR = os.path.join(ROOT, "public", "lessons")


def border_reference(rgba):
    """四边各采 32 个像素的中位色，当"纸面参考色"。"""
    w, h = rgba.size
    px = rgba.load()
    samples = []
    for i in range(32):
        t = i / 31.0
        samples += [px[int(t * (w - 1)), 0], px[int(t * (w - 1)), h - 1],
                    px[0, int(t * (h - 1))], px[w - 1, int(t * (h - 1))]]
    ch = list(zip(*samples))
    med = tuple(sorted(c)[len(c) // 2] for c in ch[:3])
    return med


def is_paper(pixel, ref, min_alpha):
    """判定"像纸面"：够亮、低饱和，或与边界参考色距足够近（泛黄纸纹走这条）。"""
    r, g, b = pixel[0], pixel[1], pixel[2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    sat = max(r, g, b) - min(r, g, b)
    if lum >= min_alpha and sat <= 30:
        return True
    dr, dg, db = r - ref[0], g - ref[1], b - ref[2]
    return (dr * dr + dg * dg + db * db) ** 0.5 <= 42


def flood_clear(rgba, min_alpha):
    """边界种子 BFS：连通的纸面区域 alpha=0。返回被清掉的像素数。"""
    w, h = rgba.size
    px = rgba.load()
    ref = border_reference(rgba)
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            q.append((x, y))
    cleared = 0
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        p = px[x, y]
        if p[3] != 0 and not is_paper(p, ref, min_alpha):
            continue  # 主体：不清，也不再扩散
        if p[3] != 0:
            px[x, y] = (p[0], p[1], p[2], 0)
            cleared += 1
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return cleared


def feather(rgba):
    """alpha 1px 盒滤波：边缘半透明过渡，彩色卡面上不显锯齿。"""
    w, h = rgba.size
    px = rgba.load()
    alpha = [[px[x, y][3] for x in range(w)] for y in range(h)]
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            a = alpha[y][x]
            if a == 0 or a == 255:
                continue
            avg = (alpha[y][x - 1] + alpha[y][x + 1] + alpha[y - 1][x] + alpha[y + 1][x] + a) // 5
            if avg != a:
                p = px[x, y]
                px[x, y] = (p[0], p[1], p[2], avg)


def strip_border_junk(rgba, max_frac=0.025):
    """删除"贴着图像边界的小面积不透明连通域"——扫描件的书页线、边缘污点。
    只动贴边的小块：青蛙头上的水珠、五线谱音符这类**不贴边**的装饰不受影响。"""
    w, h = rgba.size
    px = rgba.load()
    seen = bytearray(w * h)
    limit = w * h * max_frac
    removed = 0
    for sx in range(w):
        for sy in (0, h - 1):
            if seen[sy * w + sx] or px[sx, sy][3] == 0:
                continue
            comp = []
            q = deque([(sx, sy)])
            seen[sy * w + sx] = 1
            touches = False
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                if x in (0, w - 1) or y in (0, h - 1):
                    touches = True
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny][3] != 0:
                        seen[ny * w + nx] = 1
                        q.append((nx, ny))
            if touches and 0 < len(comp) <= limit:
                for x, y in comp:
                    p = px[x, y]
                    px[x, y] = (p[0], p[1], p[2], 0)
                removed += len(comp)
    return removed


def strip_grey_specks(rgba, max_frac=0.007):
    """删除漂浮的**灰色**小连通域——扫描噪点/尘埃（章鱼周围的点云、水母下的横线）。
    面积阈值 + 低饱和双条件：青蛙水珠、音乐音符这类**彩色**装饰浮件不受影响。"""
    w, h = rgba.size
    px = rgba.load()
    seen = bytearray(w * h)
    limit = w * h * max_frac
    removed = 0
    comps = []
    for sy in range(h):
        for sx in range(w):
            i = sy * w + sx
            if seen[i] or px[sx, sy][3] == 0:
                continue
            comp = []
            sat_sum = n = 0
            q = deque([(sx, sy)])
            seen[i] = 1
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                p = px[x, y]
                sat_sum += max(p[0], p[1], p[2]) - min(p[0], p[1], p[2])
                n += 1
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if not seen[j] and px[nx, ny][3] != 0:
                            seen[j] = 1
                            q.append((nx, ny))
            comps.append((comp, sat_sum / max(1, n)))
    if not comps:
        return 0
    main = max(comps, key=lambda c: len(c[0]))
    for comp, avg_sat in comps:
        if comp is main[0] or len(comp) > limit or avg_sat >= 35:
            continue
        for x, y in comp:
            p = px[x, y]
            px[x, y] = (p[0], p[1], p[2], 0)
        removed += len(comp)
    return removed


def round_card(rgba, min_alpha, radius_frac=0.12):
    """场景照片模式：按"非纸面像素"的 bbox 裁掉白边，四角烤圆角。
    bbox 不用 alpha 算——纸纹残留是不透明但接近纸色的，按色距排除才能贴住照片。"""
    w, h = rgba.size
    px = rgba.load()
    ref = border_reference(rgba)
    xs, ys = [], []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            p = px[x, y]
            if p[3] > 0 and not is_paper(p, ref, min_alpha):
                xs.append(x)
                ys.append(y)
    if not xs:
        return rgba
    pad = 2
    # 内缩 3.5%：贴纸自带一圈阴影/白框印在照片边上，靠色距排不干净，直接裁掉
    ix, iy = int((max(xs) - min(xs)) * 0.035), int((max(ys) - min(ys)) * 0.035)
    box = (max(0, min(xs) + ix - pad), max(0, min(ys) + iy - pad),
           min(w, max(xs) - ix + pad), min(h, max(ys) - iy + pad))
    im = rgba.crop(box)
    w, h = im.size
    r = int(min(w, h) * radius_frac)
    mask = Image.new("L", (w, h), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=255)
    im.putalpha(mask)
    return im


def process(path, min_alpha, scene=False):
    im = Image.open(path).convert("RGBA")
    before = os.path.getsize(path)
    flood_clear(im, min_alpha)
    if scene:
        strip_border_junk(im)
        im = round_card(im, min_alpha)
    else:
        strip_border_junk(im)
        strip_grey_specks(im)
        feather(im)
    out = os.path.splitext(path)[0] + ".webp"
    im.save(out, "WEBP", quality=80, method=4)
    after = os.path.getsize(out)
    return before, after, im.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-alpha", type=int, default=235, help="亮部判定阈值，纸纹残留重时调高")
    ap.add_argument("--only", nargs="*", help="只处理这些文件（相对 public/ 的路径，支持通配符由 shell 展开）")
    ap.add_argument("--scene", nargs="*", default=[], help="满幅场景图清单：去边后裁剪+圆角，不按贴纸抠图")
    args = ap.parse_args()
    scenes = {os.path.join(ROOT, "public", p.lstrip("/")) for p in args.scene}

    pngs = []
    for lesson in sorted(os.listdir(WORDS_DIR)):
        d = os.path.join(WORDS_DIR, lesson, "words")
        if not os.path.isdir(d):
            continue
        pngs += [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.endswith(".png")]
    if args.only:
        want = {os.path.abspath(os.path.join(ROOT, "public", p)) for p in args.only}
        pngs = [p for p in pngs if os.path.abspath(p) in want]
    if not pngs:
        print("没有匹配的词图 PNG")
        return

    total_b = total_a = 0
    for p in pngs:
        before, after, size = process(p, args.min_alpha, scene=p in scenes)
        total_b += before
        total_a += after
        rel = os.path.relpath(p, ROOT)
        tag = " [scene]" if p in scenes else ""
        print(f"{rel}: {size[0]}x{size[1]}  {before//1024}K → {after//1024}K{tag}")
    print(f"\n合计 {len(pngs)} 张：{total_b//1024}K → {total_a//1024}K（{(1-total_a/total_b)*100:.0f}% 节省）")


if __name__ == "__main__":
    sys.exit(main())
