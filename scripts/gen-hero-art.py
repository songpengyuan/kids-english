#!/usr/bin/env python3
"""生成"光之英雄"图鉴的**原创**占位形象（SVG）→ public/heroes/*.svg

为什么要有这个脚本：
  · 图鉴需要一个"没放图也不难看"的默认形象（解锁时孩子立刻能看到角色，而不是空白）；
  · 这些形象是**本项目原创**（配色 + 头型 + 光晕的自绘简笔小人），
    不使用任何受版权保护的角色形象；
  · 家长想换成自己的图片（例如孩子喜欢的角色卡图）时**不用改代码**：
    把图片命名为同名 <id>.png 放进 public/heroes/ 即可，应用优先用 png。

用法：python3 scripts/gen-hero-art.py          # 重新生成 9 张
      python3 scripts/gen-hero-art.py --check  # 只校验文件是否齐全

数据口径：一个**角色**有多个**形态**（form），每个形态是独立收集品。
形态之间在形象上要有可辨识差异：配色 / 体型（瘦高·标准·壮实）/ 头型 / 姿势。
"""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "heroes")

# 名录：(角色主色, [形态 id …])，必须与 src/data/heroes.ts 的 ROSTER 完全一致
# （`--check` 会校验文件齐全；Node 侧还有一条单测校验每个形态都有占位图）。
ROSTER = [
    ("#c0392b", ["zoffy-base"]),
    ("#b8b8c8", ["ultraman-base"]),
    ("#d94f3d", ["seven-base"]),
    ("#e0703a", ["jack-base"]),
    ("#d1372e", ["ace-base"]),
    ("#e8453c", ["taro-base"]),
    ("#d9a13b", ["leo-base"]),
    ("#c98a2e", ["astra-base"]),
    ("#e0453c", ["eighty-base"]),
    ("#e07aa8", ["yullian-base"]),
    ("#a8322a", ["father-base"]),
    ("#e59ab8", ["mother-base"]),
    ("#e8453c", ["tiga-multi", "tiga-power", "tiga-sky"]),
    ("#e0453c", ["dyna-flash", "dyna-miracle", "dyna-strong"]),
    ("#d1372e", ["gaia-v1", "gaia-v2", "gaia-supreme"]),
    ("#2f7df6", ["agul-v1", "agul-v2"]),
    ("#3f8ef0", ["cosmos-luna", "cosmos-corona", "cosmos-eclipse"]),
    ("#8c98a8", ["justice-standard", "justice-crusher"]),
    ("#8c98a8", ["nexus-anphans", "nexus-red", "nexus-blue"]),
    ("#d1372e", ["max-base"]),
    ("#e8453c", ["mebius-base", "mebius-burning", "mebius-infinity"]),
    ("#2f7df6", ["zero-base", "zero-corona", "zero-luna", "zero-ultimate"]),
    ("#b8b8c8", ["noa-base"]),
    ("#e0a63a", ["legend-base"]),
    ("#2f7df6", ["ginga-base", "ginga-strium"]),
    ("#d1372e", ["victory-base", "victory-knight"]),
    ("#3f8ef0", ["x-base", "x-gomora", "x-beta"]),
    ("#e05a2b", ["orb-origin", "orb-zeperion", "orb-burn", "orb-hurricane"]),
    ("#d1372e", ["geed-primitive", "geed-solid", "geed-acro", "geed-royal"]),
    ("#e8453c", ["rosso-flame", "rosso-wind"]),
    ("#2f7df6", ["blu-aqua", "blu-ground"]),
    ("#ff6b9d", ["grigio-base"]),
    ("#ff9f43", ["taiga-base", "taiga-photon"]),
    ("#d1372e", ["titas-base"]),
    ("#34c759", ["fuma-base"]),
    ("#8c98a8", ["z-original", "z-alpha", "z-beta", "z-gamma", "z-delta"]),
    ("#a05bd6", ["trigger-multi", "trigger-power", "trigger-sky", "trigger-eternity"]),
    ("#e8453c", ["decker-flash", "decker-strong", "decker-miracle"]),
    ("#e05a2b", ["blazar-base", "blazar-firdran"]),
    ("#e0a63a", ["reiga-base"]),
    ("#2f7df6", ["arc-base"]),
]

# 形态造型按"在角色里的序号"循环，保证同一角色的形态一眼能分辨
VARIANTS = [
    ("crest", "stand", "std"),
    ("round", "walk", "std"),
    ("horns", "fist", "wide"),
    ("triple", "beam", "slim"),
    ("triple", "beam", "wide"),
]

# 形态主色：与 src/data/heroes.ts 的 formColor 保持同一套规则
COLOR_TWEAKS = [(None, 0), ("#ffffff", 0.18), ("#000000", 0.12), ("#000000", 0.26)]

# 体型：瘦高 / 标准 / 壮实（腰宽 + 头身比不同，孩子一眼能区分形态）
BODY = {
    "slim": {"torso_w": 34, "torso_x": 43, "shoulder_w": 12, "leg_w": 12, "leg_x": (44, 64), "head_r": (25, 23)},
    "std": {"torso_w": 40, "torso_x": 40, "shoulder_w": 14, "leg_w": 15, "leg_x": (42, 63), "head_r": (27, 25)},
    "wide": {"torso_w": 50, "torso_x": 35, "shoulder_w": 17, "leg_w": 18, "leg_x": (38, 64), "head_r": (28, 26)},
}

CREST = {
    # 头顶中央鳍
    "crest": '<path d="M60 8 L68 26 L60 34 L52 26 Z" fill="{body_dark}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>',
    # 两侧尖角
    "horns": (
        '<path d="M34 24 L40 10 L48 26 Z" fill="{body_dark}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>'
        '<path d="M86 24 L80 10 L72 26 Z" fill="{body_dark}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>'
    ),
    # 圆润无鳍（幼年形态）
    "round": '<path d="M46 20 Q60 6 74 20 Z" fill="{body_dark}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>',
    # 三叉鳍（稀有/传说）
    "triple": (
        '<path d="M60 4 L67 24 L60 31 L53 24 Z" fill="{body_dark}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>'
        '<path d="M40 20 L45 9 L51 23 Z" fill="{body_dark}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>'
        '<path d="M80 20 L75 9 L69 23 Z" fill="{body_dark}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>'
    ),
}

def arms(variant: str, bw: int) -> str:
    """手臂：宽度跟体型走，姿势区分形态。"""
    w = bw
    lx = 24 - (bw - 14) // 2  # 壮实的角色手臂往外挪一点
    rx = 82 + (bw - 14) // 2
    style = f'fill="url(#body)" stroke="#fff" stroke-width="2"'
    if variant == "stand":
        return (
            f'<rect x="{lx}" y="72" width="{w}" height="40" rx="{w / 2}" {style}/>'
            f'<rect x="{rx}" y="72" width="{w}" height="40" rx="{w / 2}" {style}/>'
        )
    if variant == "walk":
        return (
            f'<rect x="{lx - 2}" y="72" width="{w}" height="38" rx="{w / 2}" {style} '
            f'transform="rotate(-16 {lx + w / 2} 91)"/>'
            f'<rect x="{rx + 2}" y="72" width="{w}" height="38" rx="{w / 2}" {style} '
            f'transform="rotate(16 {rx + w / 2} 91)"/>'
        )
    if variant == "fist":
        # 握拳下沉：手臂斜向下、末端一个拳头圆
        return (
            f'<rect x="{lx - 6}" y="72" width="{w}" height="34" rx="{w / 2}" {style} '
            f'transform="rotate(-26 {lx + w / 2} 76)"/>'
            f'<circle cx="{lx - 12}" cy="105" r="{w / 2 + 1}" fill="url(#body)" stroke="#fff" stroke-width="2"/>'
            f'<rect x="{rx + 6}" y="72" width="{w}" height="34" rx="{w / 2}" {style} '
            f'transform="rotate(26 {rx + w / 2} 76)"/>'
            f'<circle cx="{rx + 12}" cy="105" r="{w / 2 + 1}" fill="url(#body)" stroke="#fff" stroke-width="2"/>'
        )
    # beam：必杀姿势，双臂上举成 L 形
    return (
        f'<rect x="{lx - 6}" y="34" width="{w - 1}" height="44" rx="{(w - 1) / 2}" {style} '
        f'transform="rotate(-22 {lx} 56)"/>'
        f'<rect x="{rx + 7}" y="34" width="{w - 1}" height="44" rx="{(w - 1) / 2}" {style} '
        f'transform="rotate(22 {rx + w + 6} 56)"/>'
    )

TPL = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 140" width="240" height="280" role="img" aria-label="光之英雄占位形象">
  <!-- 原创简笔形象（scripts/gen-hero-art.py 生成）。家长可用同名 png 替换：public/heroes/{id}.png -->
  <defs>
    <radialGradient id="aura" cx="50%" cy="46%" r="52%">
      <stop offset="0%" stop-color="{accent}" stop-opacity="0.55"/>
      <stop offset="70%" stop-color="{accent}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="{accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="body" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{body_light}"/>
      <stop offset="100%" stop-color="{body_dark}"/>
    </linearGradient>
  </defs>

  <circle cx="60" cy="66" r="60" fill="url(#aura)"/>

  <!-- 腿 -->
  <rect x="{leg1}" y="104" width="{leg_w}" height="28" rx="{leg_r}" fill="{body_dark}" stroke="#fff" stroke-width="2"/>
  <rect x="{leg2}" y="104" width="{leg_w}" height="28" rx="{leg_r}" fill="{body_dark}" stroke="#fff" stroke-width="2"/>
  <!-- 脚 -->
  <rect x="{foot1}" y="126" width="{foot_w}" height="10" rx="5" fill="{body_dark}" stroke="#fff" stroke-width="2"/>
  <rect x="{foot2}" y="126" width="{foot_w}" height="10" rx="5" fill="{body_dark}" stroke="#fff" stroke-width="2"/>

  {arms}

  <!-- 躯干 -->
  <rect x="{torso_x}" y="66" width="{torso_w}" height="44" rx="{torso_r}" fill="url(#body)" stroke="#fff" stroke-width="2"/>
  <!-- 胸口能量计时器 -->
  <circle cx="60" cy="86" r="8" fill="{timer}" stroke="#fff" stroke-width="2.5"/>
  <circle cx="60" cy="86" r="3" fill="#fff" opacity="0.85"/>

  <!-- 头 -->
  <ellipse cx="60" cy="44" rx="{head_rx}" ry="{head_ry}" fill="url(#body)" stroke="#fff" stroke-width="2"/>
  {crest}
  <!-- 眼睛（发光） -->
  <ellipse cx="{eye_l}" cy="46" rx="{eye_rx}" ry="{eye_ry}" fill="{eyes}" transform="rotate(-14 {eye_l} 46)"/>
  <ellipse cx="{eye_r}" cy="46" rx="{eye_rx}" ry="{eye_ry}" fill="{eyes}" transform="rotate(14 {eye_r} 46)"/>
  <ellipse cx="{eye_l}" cy="46" rx="{pupil_rx}" ry="{pupil_ry}" fill="#fff" opacity="0.9" transform="rotate(-14 {eye_l} 46)"/>
  <ellipse cx="{eye_r}" cy="46" rx="{pupil_rx}" ry="{pupil_ry}" fill="#fff" opacity="0.9" transform="rotate(14 {eye_r} 46)"/>
  <!-- 额头水晶 -->
  <path d="M60 30 L64.5 36 L60 42 L55.5 36 Z" fill="{timer}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>
</svg>
"""


def mix(hex_color: str, other: str, ratio: float) -> str:
    """把颜色朝 other 混 ratio（0..1），用来派生出高光/暗部。"""
    def rgb(c):
        c = c.lstrip("#")
        return [int(c[i : i + 2], 16) for i in (0, 2, 4)]

    a, b = rgb(hex_color), rgb(other)
    out = [round(a[i] + (b[i] - a[i]) * ratio) for i in range(3)]
    return "#%02x%02x%02x" % tuple(out)


def forms_of(roster):
    """把名录展开成 (form_id, accent, crest, pose, build) 列表（与 TS 侧同规则）。"""
    out = []
    for base, form_ids in roster:
        for i, fid in enumerate(form_ids):
            other, ratio = COLOR_TWEAKS[min(i, len(COLOR_TWEAKS) - 1)]
            accent = base if other is None else mix(base, other, ratio)
            crest, pose, build = VARIANTS[i % len(VARIANTS)]
            out.append((fid, accent, crest, pose, build))
    return out


def render(form) -> str:
    fid, accent, crest, pose, build = form
    bd = mix(accent, "#000000", 0.22)
    b = BODY[build]
    # 计时器/眼睛按形态主色派生：浅色底 + 近白眼睛，保证任何主色下都清晰
    timer = mix(accent, "#ffffff", 0.72)
    eyes = mix(accent, "#ffffff", 0.88)
    head_rx, head_ry = b["head_r"]
    leg_w, leg_r = b["leg_w"], b["leg_w"] / 2
    leg1, leg2 = b["leg_x"]
    eye_rx = round(head_rx * 0.28, 1)
    eye_ry = round(head_ry * 0.36, 1)
    eye_off = round(head_rx * 0.44, 1)
    return TPL.format(
        id=fid,
        accent=accent,
        timer=timer,
        eyes=eyes,
        body_light=mix(accent, "#ffffff", 0.28),
        body_dark=bd,
        crest=CREST[crest].format(body_dark=bd),
        arms=arms(pose, b["shoulder_w"]),
        torso_x=b["torso_x"],
        torso_w=b["torso_w"],
        torso_r=round(b["torso_w"] * 0.4, 1),
        head_rx=head_rx,
        head_ry=head_ry,
        eye_l=round(60 - eye_off, 1),
        eye_r=round(60 + eye_off, 1),
        eye_rx=eye_rx,
        eye_ry=eye_ry,
        pupil_rx=round(eye_rx * 0.45, 1),
        pupil_ry=round(eye_ry * 0.47, 1),
        leg1=leg1,
        leg2=leg2,
        leg_w=leg_w,
        leg_r=leg_r,
        foot1=round(leg1 - 4, 1),
        foot2=round(leg2 - 4, 1),
        foot_w=leg_w + 7,
    )


def main() -> int:
    check_only = "--check" in sys.argv
    os.makedirs(OUT_DIR, exist_ok=True)
    missing = []
    forms = forms_of(ROSTER)
    for form in forms:
        path = os.path.join(OUT_DIR, form[0] + ".svg")
        if check_only:
            if not os.path.exists(path):
                missing.append(os.path.basename(path))
            continue
        with open(path, "w", encoding="utf-8") as f:
            f.write(render(form))
        print("wrote", os.path.relpath(path, ROOT))
    if check_only:
        if missing:
            print("缺少占位图:", ", ".join(missing), file=sys.stderr)
            return 1
        print(f"✅ {len(forms)} 张占位图齐全")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
