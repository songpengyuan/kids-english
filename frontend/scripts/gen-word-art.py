#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
单词贴纸图生成器 —— 给自研课（l6 颜色 / l7 数字 / l8 字母）画一套统一风格的图片。

为什么自己画：
  · 网上的儿童图片版权不清，风格还七拼八凑；
  · 贴纸风（粗白描边 + 圆角 + 柔和底色 + 会笑的圆眼睛）自己画反而更整齐，
    而且和 App 的吉祥物／卡片色调板是同一套色，放一起不违和；
  · SVG 只有几 KB，放大不糊，离线可用，还省流量。

产出：
  public/lessons/l6/words/*.svg   9 张颜色贴纸（颜色小人：一眼看出是那个色）
  public/lessons/l7/words/*.svg  11 张数字贴纸（大数字 + 可数的小圆点）
  public/lessons/l8/words/*.svg   9 张字母贴纸（大写字母 + 以它开头的单词简笔画）

用法：
  /Users/perrysong/.workbuddy/binaries/python/envs/default/bin/python scripts/gen-word-art.py

自检：脚本会读 src/data/lessons.json，核对「生成的文件」与「课里引用的图片」完全一致，
      多一个少一个都报错——避免出现图片改了名字、课里还指着旧名字的 404。
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LESSONS_JSON = os.path.join(ROOT, "src", "data", "lessons.json")
PUBLIC = os.path.join(ROOT, "public")

# 与 src/styles/tokens.css 的色调板同源，保证和卡片/按钮是一套颜色
INK = "#4a3f35"
BLUE, BLUE_D = "#1cb0f6", "#1590c9"
GREEN, GREEN_D = "#58cc02", "#46a302"
ORANGE, ORANGE_D = "#ff9f43", "#d97b1e"
PURPLE, PURPLE_D = "#ce82ff", "#a95fd6"
PINK, PINK_D = "#ff6b9d", "#d94f7e"
TEAL, TEAL_D = "#14b8a6", "#0e9285"
YELLOW, GOLD = "#ffc800", "#e0a800"
RED, RED_D = "#ff5b5b", "#d64545"
LINE = "#e8e0cf"


# ---------------------------------------------------------------- 基础工具


def tint(color, keep=0.18):
    """把颜色往白色里调（keep = 保留多少原色），做贴纸的浅色底"""
    color = color.lstrip("#")
    r, g, b = (int(color[i : i + 2], 16) for i in (0, 2, 4))
    mix = lambda c: round(c * keep + 255 * (1 - keep))  # noqa: E731
    return "#%02x%02x%02x" % (mix(r), mix(g), mix(b))


def svg(inner):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" '
        'width="512" height="512" role="img">\n' + inner + "\n</svg>\n"
    )


def backdrop(color):
    """贴纸底：浅色圆角方块 + 一个更浅的圆，像贴在纸上"""
    return (
        f'<rect x="24" y="24" width="464" height="464" rx="120" fill="{tint(color, 0.16)}"/>'
        f'<circle cx="256" cy="246" r="196" fill="{tint(color, 0.3)}"/>'
    )


def ground(cy=430, rx=132, fill="#000000" , opacity="0.07"):
    return f'<ellipse cx="256" cy="{cy}" rx="{rx}" ry="{round(rx * 0.16)}" fill="{fill}" opacity="{opacity}"/>'


def face(cx, cy, gap=44, eye=INK, mouth="#4a3f35", blush="#ff9f9f", scale=1.0):
    """会笑的圆眼睛 + 腮红：整套贴纸的「亲切感」都来自这里"""
    r = 17 * scale
    g = gap * scale
    out = []
    for sx in (-1, 1):
        out.append(f'<circle cx="{cx + sx * g}" cy="{cy}" r="{r}" fill="{eye}"/>')
    # 眼睛里的高光：让眼神「活」起来
    out.append(
        f'<circle cx="{cx - g + r * 0.35}" cy="{cy - r * 0.35}" r="{r * 0.34}" fill="#ffffff" opacity="0.9"/>'
        f'<circle cx="{cx + g + r * 0.35}" cy="{cy - r * 0.35}" r="{r * 0.34}" fill="#ffffff" opacity="0.9"/>'
    )
    out.append(
        f'<path d="M{cx - 30 * scale} {cy + 34 * scale} q{30 * scale} {26 * scale} {60 * scale} 0" '
        f'stroke="{mouth}" stroke-width="{5 * scale}" fill="none" stroke-linecap="round"/>'
    )
    for sx in (-1, 1):
        out.append(
            f'<circle cx="{cx + sx * 74 * scale}" cy="{cy + 24 * scale}" r="{13 * scale}" '
            f'fill="{blush}" opacity="0.55"/>'
        )
    return "".join(out)


# ---------------------------------------------------------------- l6 颜色：颜色小人


COLOR_SPECS = {
    "red": (RED, RED_D, INK),
    "yellow": (YELLOW, GOLD, INK),
    "blue": (BLUE, BLUE_D, INK),
    "green": (GREEN, GREEN_D, INK),
    "orange": (ORANGE, ORANGE_D, INK),
    "purple": (PURPLE, PURPLE_D, INK),
    "pink": (PINK, PINK_D, INK),
    "white": ("#ffffff", LINE, INK),
    "black": ("#3b3b44", "#2b2b33", "#ffffff"),
    # l11 Brown→深暖棕（美洲黑熊那课的棕色词；l6 调色板没有它）
    "brown": ("#8a5a2b", "#6e451f", "#ffffff"),
}


def color_friend(word_id):
    fill, deep, eye = COLOR_SPECS[word_id]
    # 白色小人：底色不能用白色系（会隐形），换成浅暖灰衬托出「白」
    bg = "#d9d2c2" if fill == "#ffffff" else fill
    body = (
        # 小耳朵
        f'<circle cx="150" cy="118" r="42" fill="{fill}" stroke="#ffffff" stroke-width="12"/>'
        f'<circle cx="362" cy="118" r="42" fill="{fill}" stroke="#ffffff" stroke-width="12"/>'
        # 身体（超椭圆）
        f'<rect x="82" y="104" width="348" height="330" rx="128" fill="{fill}" '
        f'stroke="#ffffff" stroke-width="14"/>'
        # 肚皮：深一档，显出圆滚滚的体积
        f'<ellipse cx="256" cy="360" rx="112" ry="52" fill="{deep}" opacity="0.35"/>'
        # 高光
        f'<ellipse cx="176" cy="196" rx="34" ry="24" fill="#ffffff" opacity="0.5" '
        f'transform="rotate(-28 176 196)"/>'
    )
    return svg(backdrop(bg) + ground() + body + face(256, 250, 52, eye=eye, blush="#ffffff" if word_id == "black" else "#ff9f9f"))


# ---------------------------------------------------------------- l7 数字：大数字 + 可数圆点

NUM_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]
NUM_HUES = [GREEN, TEAL, BLUE, PURPLE, ORANGE, PINK]


def number_tile(n):
    hue = NUM_HUES[n % len(NUM_HUES)]
    out = [backdrop(hue), ground(cy=452, rx=120)]
    # 大数字：描白边（paint-order）保证在任何底色上都清楚
    out.append(
        f'<text x="256" y="258" text-anchor="middle" font-size="212" font-weight="800" '
        f'font-family="\'Arial Rounded MT Bold\',\'Baloo 2\',\'Helvetica Neue\',Arial,sans-serif" '
        f'fill="{hue}" stroke="#ffffff" stroke-width="16" paint-order="stroke" '
        f'stroke-linejoin="round">{n}</text>'
    )
    if n == 0:
        # 0 个：画一个空空的方框，孩子一眼懂「没有」
        out.append(
            f'<rect x="150" y="330" width="212" height="96" rx="34" fill="#ffffff" '
            f'opacity="0.75" stroke="{hue}" stroke-width="8" stroke-dasharray="22 16"/>'
        )
    else:
        # n 个圆点：排成一行最多 5 个，多出来的换行——可以直接数
        rows = [min(5, n)] + ([n - 5] if n > 5 else [])
        for ri, cnt in enumerate(rows):
            span = 62
            y = 372 + ri * 66
            start = 256 - (cnt - 1) * span / 2
            for i in range(cnt):
                out.append(
                    f'<circle cx="{start + i * span}" cy="{y}" r="24" fill="{hue}" '
                    f'stroke="#ffffff" stroke-width="8"/>'
                )
                out.append(f'<circle cx="{start + i * span - 7}" cy="{y - 8}" r="7" fill="#ffffff" opacity="0.55"/>')
    return svg("".join(out))


# ---------------------------------------------------------------- l8 字母：大写字母 + 简笔画
# 每个物体都在 0..100 的局部坐标里画，再整体缩放贴到卡片下半部分


def art_apple():
    return (
        f'<path d="M50 26C38 12 12 20 12 46c0 28 18 46 38 46s38-18 38-46c0-26-26-34-38-20z" fill="{RED}" '
        f'stroke="#ffffff" stroke-width="5"/>'
        f'<path d="M50 24c0-10 4-16 11-19" stroke="#8a5a2b" stroke-width="6" fill="none" stroke-linecap="round"/>'
        f'<path d="M56 12c10-8 22-6 26 2-8 8-20 8-26-2z" fill="{GREEN}" stroke="#ffffff" stroke-width="4"/>'
        f'<ellipse cx="34" cy="44" rx="9" ry="6" fill="#ffffff" opacity="0.5" transform="rotate(-25 34 44)"/>'
    )


def art_ball():
    return (
        f'<circle cx="50" cy="52" r="36" fill="#ffffff" stroke="#ffffff" stroke-width="5"/>'
        f'<path d="M50 52V16a36 36 0 0 1 31 54z" fill="{YELLOW}"/>'
        f'<path d="M50 52V16a36 36 0 0 0-31 54z" fill="{BLUE}"/>'
        f'<path d="M50 52L19 70a36 36 0 0 0 62 0z" fill="{RED}"/>'
        f'<circle cx="50" cy="52" r="36" fill="none" stroke="#ffffff" stroke-width="5"/>'
        f'<circle cx="50" cy="52" r="7" fill="#ffffff"/>'
    )


def art_cat():
    return (
        f'<path d="M22 40L18 8l30 14z" fill="{ORANGE}" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"/>'
        f'<path d="M78 40L82 8 52 22z" fill="{ORANGE}" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"/>'
        f'<circle cx="50" cy="56" r="34" fill="{ORANGE}" stroke="#ffffff" stroke-width="5"/>'
        f'<circle cx="38" cy="50" r="4" fill="{INK}"/><circle cx="62" cy="50" r="4" fill="{INK}"/>'
        f'<path d="M46 62h8l-4 5z" fill="{PINK}"/>'
        f'<path d="M44 70q6 6 12 0" stroke="{INK}" stroke-width="3" fill="none" stroke-linecap="round"/>'
        f'<path d="M18 56h12M18 64h12M70 56h12M70 64h12" stroke="{INK}" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>'
    )


def art_dog():
    return (
        f'<ellipse cx="18" cy="52" rx="12" ry="22" fill="{ORANGE_D}"/>'
        f'<ellipse cx="82" cy="52" rx="12" ry="22" fill="{ORANGE_D}"/>'
        f'<circle cx="50" cy="54" r="32" fill="#c98a4b" stroke="#ffffff" stroke-width="5"/>'
        f'<ellipse cx="50" cy="70" rx="20" ry="14" fill="#f6e3cc"/>'
        f'<circle cx="50" cy="64" r="7" fill="{INK}"/>'
        f'<circle cx="37" cy="46" r="4" fill="{INK}"/><circle cx="63" cy="46" r="4" fill="{INK}"/>'
        f'<path d="M44 76q6 8 12 0" stroke="{INK}" stroke-width="3" fill="none" stroke-linecap="round"/>'
    )


def art_egg():
    return (
        f'<ellipse cx="50" cy="54" rx="32" ry="40" fill="#fffaf0" stroke="{LINE}" stroke-width="5"/>'
        f'<circle cx="50" cy="58" r="15" fill="{YELLOW}"/>'
        f'<ellipse cx="38" cy="36" rx="8" ry="6" fill="#ffffff" opacity="0.9" transform="rotate(-25 38 36)"/>'
    )


def art_fish():
    return (
        f'<ellipse cx="46" cy="52" rx="36" ry="24" fill="{BLUE}" stroke="#ffffff" stroke-width="5"/>'
        f'<path d="M78 52l18-16v32z" fill="{BLUE_D}" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"/>'
        f'<path d="M40 30c6-12 16-12 20-4" fill="{BLUE_D}"/>'
        f'<circle cx="34" cy="46" r="7" fill="#ffffff"/><circle cx="33" cy="46" r="3.5" fill="{INK}"/>'
        f'<path d="M52 40q6 12 0 24" stroke="#ffffff" stroke-width="3.5" fill="none" opacity="0.7"/>'
    )


def art_grape():
    pts = [(34, 44), (50, 40), (66, 44), (42, 62), (58, 62), (50, 78)]
    return (
        f'<path d="M50 26c0-8 6-14 14-15" stroke="#8a5a2b" stroke-width="5" fill="none" stroke-linecap="round"/>'
        f'<path d="M54 18c10-8 22-6 26 2-8 8-20 8-26-2z" fill="{GREEN}" stroke="#ffffff" stroke-width="4"/>'
        + "".join(f'<circle cx="{x}" cy="{y}" r="17" fill="{PURPLE}" stroke="#ffffff" stroke-width="5"/>' for x, y in pts)
        + f'<circle cx="29" cy="39" r="5" fill="#ffffff" opacity="0.5"/>'
    )


def art_hat():
    return (
        f'<ellipse cx="50" cy="78" rx="44" ry="10" fill="#3a3a44"/>'
        f'<rect x="26" y="22" width="48" height="56" rx="7" fill="#4a4a56" stroke="#ffffff" stroke-width="5"/>'
        f'<rect x="26" y="56" width="48" height="12" rx="4" fill="{RED}"/>'
        f'<ellipse cx="50" cy="78" rx="44" ry="10" fill="none" stroke="#ffffff" stroke-width="5"/>'
    )


def art_icecream():
    return (
        f'<path d="M32 52h36L50 96z" fill="#f0c07a" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"/>'
        f'<path d="M38 62l12 12M44 56l10 10" stroke="#c99a55" stroke-width="3" opacity="0.8"/>'
        f'<circle cx="50" cy="44" r="26" fill="{PINK}" stroke="#ffffff" stroke-width="5"/>'
        f'<circle cx="50" cy="16" r="9" fill="{RED}" stroke="#ffffff" stroke-width="4"/>'
        f'<path d="M50 6c0-4 2-6 6-6" stroke="{GREEN}" stroke-width="4" fill="none" stroke-linecap="round"/>'
        f'<ellipse cx="40" cy="36" rx="7" ry="5" fill="#ffffff" opacity="0.55" transform="rotate(-25 40 36)"/>'
    )


LETTER_HUES = [BLUE, ORANGE, PINK, PURPLE, YELLOW, TEAL, GREEN, BLUE, PINK]
LETTER_ART = {
    "apple": ("A", art_apple),
    "ball": ("B", art_ball),
    "cat": ("C", art_cat),
    "dog": ("D", art_dog),
    "egg": ("E", art_egg),
    "fish": ("F", art_fish),
    "grape": ("G", art_grape),
    "hat": ("H", art_hat),
    "icecream": ("I", art_icecream),
}


def letter_tile(word_id, index):
    letter, art = LETTER_ART[word_id]
    hue = LETTER_HUES[index % len(LETTER_HUES)]
    text_color = GOLD if hue == YELLOW else hue
    return svg(
        backdrop(hue)
        + ground(cy=438, rx=104)
        # 大写字母
        + f'<text x="256" y="214" text-anchor="middle" font-size="196" font-weight="800" '
        f'font-family="\'Arial Rounded MT Bold\',\'Baloo 2\',\'Helvetica Neue\',Arial,sans-serif" '
        f'fill="{text_color}" stroke="#ffffff" stroke-width="16" paint-order="stroke" stroke-linejoin="round">{letter}</text>'
        # 以这个字母开头的单词简笔画
        + f'<g transform="translate(156 236) scale(2.0)">{art()}</g>'
    )


# ---------------------------------------------------------------- 主流程


def referenced_images():
    """从 lessons.json 读出「课时id → {单词id: 图片路径}」，作为唯一数据源"""
    import json
    lessons = json.load(open(LESSONS_JSON, encoding="utf-8"))
    out = {}
    for lesson in lessons:
        mapping = out.setdefault(lesson["id"], {})
        for w in lesson.get("words", []):
            if w.get("image"):
                mapping[w["id"]] = w["image"]
    return out


# ---------------------------------------------------------------- l11 动物（原创贴纸）
# 2026-11-08 版权清洗：替换掉"老师提供的绘本扫描件"（Brown Bear 绘本切图），
# 全部动物改为本管线原创绘制，画风与 cat/dog/fish 一致（白描边 + INK 眼睛）。

BEAR_BROWN = "#8a5a2b"

def art_bear():
    return (
        f'<circle cx="30" cy="30" r="13" fill="{BEAR_BROWN}" stroke="#ffffff" stroke-width="5"/>'
        f'<circle cx="70" cy="30" r="13" fill="{BEAR_BROWN}" stroke="#ffffff" stroke-width="5"/>'
        f'<circle cx="30" cy="30" r="6" fill="#f6e3cc"/>'
        f'<circle cx="70" cy="30" r="6" fill="#f6e3cc"/>'
        f'<circle cx="50" cy="56" r="36" fill="{BEAR_BROWN}" stroke="#ffffff" stroke-width="5"/>'
        f'<ellipse cx="50" cy="68" rx="18" ry="14" fill="#f6e3cc"/>'
        f'<ellipse cx="50" cy="62" rx="7" ry="5" fill="{INK}"/>'
        f'<circle cx="37" cy="48" r="4.5" fill="{INK}"/><circle cx="63" cy="48" r="4.5" fill="{INK}"/>'
        f'<path d="M44 70q6 5 12 0" stroke="{INK}" stroke-width="3" fill="none" stroke-linecap="round"/>'
    )


def art_bird():
    return (
        f'<path d="M50 18c14 0 24 10 24 24 0 22-14 38-34 38-6 0-11-2-14-5l6-10c-6-6-8-14-8-23 0-14 12-24 26-24z" '
        f'fill="{GREEN}" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"/>'
        f'<path d="M74 44l16-4-12 12z" fill="{ORANGE}" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"/>'
        f'<circle cx="58" cy="36" r="7" fill="#ffffff"/><circle cx="59.5" cy="36" r="3.5" fill="{INK}"/>'
        f'<path d="M34 58q10 8 22 4" stroke="{GREEN_D}" stroke-width="3" fill="none" stroke-linecap="round"/>'
        f'<path d="M44 80l-2 10M58 79l2 11" stroke="{ORANGE}" stroke-width="4" stroke-linecap="round"/>'
    )


def art_duck():
    return (
        f'<circle cx="38" cy="40" r="24" fill="{YELLOW}" stroke="#ffffff" stroke-width="5"/>'
        f'<path d="M38 62c4 18 20 24 34 20 16-5 22-20 14-32l-8 4c2 8-4 14-12 14-10 0-16-8-16-18z" '
        f'fill="{YELLOW}" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"/>'
        f'<path d="M14 40l16-6-14-8z" fill="{ORANGE}" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"/>'
        f'<circle cx="42" cy="34" r="6" fill="#ffffff"/><circle cx="43.5" cy="34" r="3" fill="{INK}"/>'
        f'<path d="M60 82l-2 9M74 80l3 9" stroke="{ORANGE}" stroke-width="4" stroke-linecap="round"/>'
    )


def art_frog():
    return (
        f'<circle cx="30" cy="26" r="14" fill="{GREEN}" stroke="#ffffff" stroke-width="5"/>'
        f'<circle cx="70" cy="26" r="14" fill="{GREEN}" stroke="#ffffff" stroke-width="5"/>'
        f'<circle cx="30" cy="26" r="6" fill="#ffffff"/><circle cx="30" cy="26" r="3" fill="{INK}"/>'
        f'<circle cx="70" cy="26" r="6" fill="#ffffff"/><circle cx="70" cy="26" r="3" fill="{INK}"/>'
        f'<ellipse cx="50" cy="58" rx="40" ry="30" fill="{GREEN}" stroke="#ffffff" stroke-width="5"/>'
        f'<path d="M36 58q6 6 12 0M52 58q6 6 12 0" stroke="{INK}" stroke-width="3" fill="none" stroke-linecap="round"/>'
        f'<path d="M42 68h16" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>'
        f'<ellipse cx="24" cy="84" rx="10" ry="6" fill="{GREEN_D}"/><ellipse cx="76" cy="84" rx="10" ry="6" fill="{GREEN_D}"/>'
    )


def art_horse():
    return (
        f'<path d="M26 20c8-6 18-4 22 4l-8 10c-6-4-14-6-20-2z" fill="{PINK}" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"/>'
        f'<circle cx="46" cy="42" r="22" fill="{PINK}" stroke="#ffffff" stroke-width="5"/>'
        f'<path d="M60 34l24-8-8 22z" fill="{PINK_D}" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"/>'
        f'<path d="M46 62c14 2 26-2 32-10l6 8c-8 12-24 16-38 12z" fill="{PINK}" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"/>'
        f'<path d="M38 62l-4 22M56 64l2 20" stroke="{PINK_D}" stroke-width="6" stroke-linecap="round"/>'
        f'<circle cx="44" cy="38" r="5" fill="#ffffff"/><circle cx="45" cy="38" r="2.5" fill="{INK}"/>'
        f'<path d="M28 30q-8 4-6 14" stroke="{PINK_D}" stroke-width="8" fill="none" stroke-linecap="round"/>'
    )


def art_sheep():
    return (
        f'<circle cx="34" cy="32" r="14" fill="{ORANGE}" stroke="#ffffff" stroke-width="5"/>'
        f'<circle cx="64" cy="30" r="12" fill="{ORANGE}" stroke="#ffffff" stroke-width="5"/>'
        f'<circle cx="82" cy="42" r="11" fill="{ORANGE}" stroke="#ffffff" stroke-width="5"/>'
        f'<circle cx="18" cy="44" r="11" fill="{ORANGE}" stroke="#ffffff" stroke-width="5"/>'
        f'<circle cx="24" cy="64" r="12" fill="{ORANGE}" stroke="#ffffff" stroke-width="5"/>'
        f'<circle cx="76" cy="62" r="12" fill="{ORANGE}" stroke="#ffffff" stroke-width="5"/>'
        f'<circle cx="50" cy="54" r="30" fill="#fff6ea" stroke="#ffffff" stroke-width="5"/>'
        f'<circle cx="40" cy="46" r="4" fill="{INK}"/><circle cx="58" cy="46" r="4" fill="{INK}"/>'
        f'<path d="M44 56h12l-6 6z" fill="{PINK}"/>'
        f'<path d="M42 62q8 7 16 0" stroke="{INK}" stroke-width="3" fill="none" stroke-linecap="round"/>'
        f'<path d="M42 84l-2 8M60 84l2 8" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>'
    )


ANIMAL_ART = {
    "bear": art_bear,
    "bird": art_bird,
    "duck": art_duck,
    "frog": art_frog,
    "horse": art_horse,
    "sheep": art_sheep,
    "cat": art_cat,
    "dog": art_dog,
    "goldfish": art_fish,
}


def main():
    import json
    lessons = json.load(open(LESSONS_JSON, encoding="utf-8"))
    live_ids = {l["id"] for l in lessons}
    made = []
    # 2026-11-08：改为数据驱动——课程在 lessons.json 里才生成/自检，
    # 加餐课（l6/l7/l8）下线后不再产出孤儿贴纸
    if "l6" in live_ids:
        for wid in COLOR_SPECS:
            made.append(("l6", wid, color_friend(wid)))
    if "l7" in live_ids:
        for n, wid in enumerate(NUM_WORDS):
            made.append(("l7", wid, number_tile(n)))
    if "l8" in live_ids:
        for i, wid in enumerate(LETTER_ART):
            made.append(("l8", wid, letter_tile(wid, i)))
    if "l11" in live_ids:
        # 颜色贴纸复用 l6 的颜色小人（lessons.json 里指到 l11/words/，由本管线统一产出）
        for wid in COLOR_SPECS:
            made.append(("l11", wid, color_friend(wid)))
        # 动物贴纸画在 0-100 空间，放大 4 倍居中到 512 画布
        for wid in ANIMAL_ART:
            made.append(("l11", wid, svg(f'<g transform="translate(56 56) scale(4.0)">{ANIMAL_ART[wid]()}</g>')))

    for lid, wid, content in made:
        out = os.path.join(PUBLIC, "lessons", lid, "words", f"{wid}.svg")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "w", encoding="utf-8") as fh:
            fh.write(content)
    print(f"生成 {len(made)} 张单词贴纸 → public/lessons/l6|l7|l8/words/")

    # 自检：生成的文件必须和课里引用的完全对上（多/少/名字不符都报错）。
    # 只校验本管线生成的课（l4/l5/l9 等的词图是外部素材，不归这里管）。
    ref = referenced_images()
    mine = {}
    for lid, wid, _ in made:
        mine.setdefault(lid, set()).add(wid)
    bad = 0
    for lid in sorted(mine):
        want = set((ref.get(lid) or {}).keys())
        got = mine.get(lid, set())
        if want != got:
            bad += 1
            print(f"  ✗ {lid}: 课里引用 {sorted(want)} / 实际生成 {sorted(got)}", file=sys.stderr)
    if bad:
        sys.exit("图片与 lessons.json 不一致，请先对齐再生成")
    print("自检通过：三课引用的图片与生成结果一致")
    return 0


if __name__ == "__main__":
    sys.exit(main())
