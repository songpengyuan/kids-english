#!/usr/bin/env python3
"""
PWA 图标生成：从 192px 原图提取闪电形状，重绘出更清晰的 512 版本。

产出（public/ 下）：
  icon-512.png           512×512，"any" 用途（渐变全出血 + 白色闪电）
  icon-maskable-512.png  512×512，"maskable" 用途（闪电缩小到圆形安全区内）

用法：/Users/perrysong/.workbuddy/binaries/python/envs/default/bin/python scripts/gen-icons.py
"""

from PIL import Image
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "icon-192.png"  # 现有图标，作为设计源
SIZE = 512
C0 = (138, 63, 252)   # 渐变起点（左上，深紫）——与 192 原图逐像素对齐
C1 = (200, 165, 255)  # 渐变终点（右下，浅紫）


def gradient(size):
    """对角线渐变：t = (x+y)/(w+h-2)，与原图的采样值吻合到 ±1。"""
    im = Image.new("RGB", (size, size))
    px = im.load()
    denom = 2 * size - 2
    for y in range(size):
        for x in range(size):
            t = (x + y) / denom
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(C0, C1))
    return im


def bolt_alpha(size, box_ratio):
    """从 192 原图提取白色闪电的透明度蒙版，缩放到 size 画布、
    使闪电包围盒占 box_ratio 比例并居中。

    alpha 不能用灰度（紫色底转灰后是中灰，会留下方形光晕），
    而是用「通道最小值有多接近 255」：白色≈255，渐变紫底最亮处 min≈165。"""
    src = Image.open(SRC).convert("RGB")
    w, h = src.size
    px = src.load()
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r > 230 and g > 230 and b > 230:
                xs.append(x)
                ys.append(y)
    crop = src.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))
    cw, ch = crop.size
    cpx = crop.load()
    mask = Image.new("L", (cw, ch))
    mpx = mask.load()
    LO, HI = 165, 235  # 紫底最亮的 min≈165 → 0；纯白 ≥235 → 255，中间线性过渡
    for y in range(ch):
        for x in range(cw):
            minc = min(cpx[x, y])
            mpx[x, y] = max(0, min(255, round((minc - LO) / (HI - LO) * 255)))
    scale = size * box_ratio / max(cw, ch)
    new_w = max(1, round(cw * scale))
    new_h = max(1, round(ch * scale))
    alpha = mask.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("L", (size, size), 0)
    canvas.paste(alpha, ((size - new_w) // 2, (size - new_h) // 2))
    return canvas


def make(size, box_ratio):
    base = gradient(size).convert("RGBA")
    white = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    return Image.composite(white, base, bolt_alpha(size, box_ratio))


def main():
    out = ROOT / "public"
    any_icon = make(SIZE, 0.66)  # 与 192 原图同比例（66%）
    maskable = make(SIZE, 0.52)  # 缩进圆形安全区（40% 半径内）
    any_icon.save(out / "icon-512.png", optimize=True)
    maskable.save(out / "icon-maskable-512.png", optimize=True)
    for name in ("icon-512.png", "icon-maskable-512.png"):
        p = out / name
        print(f"{name}: {p.stat().st_size / 1024:.1f} KB")
    # 自检：maskable 版闪电最远点必须在安全区内（半径 40%）
    im = maskable.convert("RGBA")
    w, h = im.size
    cx = cy = w / 2
    far = 0
    px = im.load()
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 200 and px[x, y][:3] == (255, 255, 255):
                far = max(far, ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5)
    limit = 0.4 * w
    print(f"闪电最远点 {far:.0f}px / 安全区 {limit:.0f}px -> {'OK' if far <= limit else '超出!'}")
    if far > limit:
        sys.exit(1)


if __name__ == "__main__":
    main()
