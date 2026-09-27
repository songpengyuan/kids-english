#!/usr/bin/env python3
"""英雄图鉴的**素材获取/归位**脚本（私人使用工具）。

用途：把 81 个形态的图片按 `<formId>.png` 归位到 public/heroes/，
      自动转 PNG、保留透明通道、最长边压到 512px（卡片最大只显示 ~88px，够用且省流量）。

三种取图方式（可混用，按 id 去重）：

  1) 自动搜（联网时最省事）—— 从 Fandom 的 MediaWiki API 搜角色页取主图
       python3 scripts/fetch-hero-art.py --auto --only tiga-multi,zero-base
       python3 scripts/fetch-hero-art.py --auto --limit 10      # 先试 10 张看看质量

  2) 你手动整理的直链清单（浏览器"复制图片地址"即可）—— urls.txt 每行 `formId URL`
       python3 scripts/fetch-hero-art.py --urls hero-urls.txt

  3) 你下载好的本地图片（文件名随意）—— map.txt 每行 `formId 文件名`
       python3 scripts/fetch-hero-art.py --from-dir ~/Downloads/ultraman --map map.txt

其它：
  --check             只检查哪些形态还缺图（不联网）
  --out DIR           输出目录（默认 public/heroes）
  --force             已有 png 的形态也重新下载
  --dry-run           只打印计划与命中的图，不下载

产出：<out>/<formId>.png + <out>/fetch-report.tsv（id / 来源 / 尺寸 / 状态，便于复核）

⚠️ 图片版权归原权利人，本工具只负责下载与归位；请仅用于家庭内部。
   默认输出目录里的 *.png 已在 .gitignore 里（不会被推送到公开仓库）；
   若你确认要随仓库分发，删掉 .gitignore 里那行再自己 add。
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEROES_TS = os.path.join(ROOT, "src", "data", "heroes.ts")
DEFAULT_OUT = os.path.join(ROOT, "public", "heroes")

UA = "kids-english-hero-art/1.0 (personal, non-commercial use)"
FANDOM = "https://ultra.fandom.com"
SLEEP_SEC = 1.2  # 对上游站点保持礼貌
MAX_EDGE = 512


def show_path(path):
    """仓库内的文件显示相对路径，仓库外（如 /tmp）直接显示绝对路径"""
    rel = os.path.relpath(path, ROOT)
    return path if rel.startswith("..") else rel


# ---------------------------------------------------------------- 数据源

def load_forms():
    """从 src/data/heroes.ts 读形态清单（唯一数据源，避免两边不一致）。

    返回 [(form_id, 形态中文, 形态英文, 角色英文)]，顺序与名录一致。
    """
    src = open(HEROES_TS, encoding="utf-8").read()
    roster = src[src.index("const ROSTER"): src.index("/** 展开成图鉴用的正式结构")]
    heroes = re.findall(r'id: "([a-z0-9]+)", name: "([^"]+)", en: "([^"]+)"', roster)
    forms = re.findall(r'\["([a-z0-9-]+)", "([^"]+)", "([^"]+)"\]', roster)
    out = []
    for fid, zh, en in forms:
        hero = next((h for h in heroes if fid.startswith(h[0] + "-")), None)
        out.append((fid, zh, en, hero[2] if hero else ""))
    return out


# ---------------------------------------------------------------- HTTP

_warned_network = False


def http_bytes(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def http_json(url, timeout=15):
    return json.loads(http_bytes(url, timeout).decode("utf-8"))


def network_hint(err):
    global _warned_network
    if not _warned_network:
        _warned_network = True
        print(
            f"\n⚠️  连不上图片源（{err}）。\n"
            "    常见原因：本机代理/网络拦截。可以改用另外两种方式：\n"
            "      · 浏览器里手动找图 → 复制图片地址 → 写进 urls.txt → --urls urls.txt\n"
            "      · 手动下载到文件夹 → --from-dir 目录 --map 映射表\n",
            file=sys.stderr,
        )


# ---------------------------------------------------------------- 自动搜图（Fandom）

def fandom_search(query, limit=5):
    """搜索词 → 候选页面标题（按与查询词的贴合度排序）"""
    url = f"{FANDOM}/api.php?action=query&list=search&srlimit={limit}&format=json&srsearch=" + urllib.parse.quote(query)
    j = http_json(url)
    hits = j.get("query", {}).get("search", [])
    words = [w.lower() for w in re.split(r"[^A-Za-z0-9]+", query) if len(w) > 2]

    def score(title):
        t = title.lower()
        return sum(1 for w in words if w in t)

    return sorted((h["title"] for h in hits), key=score, reverse=True)


def fandom_page_image(title):
    """页面主图（通常是角色立绘）"""
    url = (
        f"{FANDOM}/api.php?action=query&prop=pageimages&piprop=original&format=json&titles="
        + urllib.parse.quote(title)
    )
    pages = http_json(url).get("query", {}).get("pages", {})
    for _, page in pages.items():
        original = page.get("original") or {}
        if original.get("source"):
            return original["source"]
    return None


def fandom_image_candidates(title, keyword):
    """页面里所有图片，按文件名与形态关键词的贴合度排序（主图不合适时的兜底）"""
    url = f"{FANDOM}/api.php?action=parse&prop=images&format=json&page=" + urllib.parse.quote(title)
    names = [i["*"] if isinstance(i, dict) else str(i) for i in http_json(url).get("parse", {}).get("images", [])]
    words = [w.lower() for w in re.split(r"[^A-Za-z0-9]+", keyword) if len(w) > 2]

    def score(name):
        n = name.lower()
        return sum(1 for w in words if w in n)

    ranked = sorted(names, key=score, reverse=True)
    return [n for n in ranked if score(n) > 0][:5]


def fandom_file_url(file_name):
    url = (
        f"{FANDOM}/api.php?action=query&prop=imageinfo&iiprop=url&format=json&titles=File:"
        + urllib.parse.quote(file_name)
    )
    pages = http_json(url).get("query", {}).get("pages", {})
    for _, page in pages.items():
        info = (page.get("imageinfo") or [{}])[0]
        if info.get("url"):
            return info["url"]
    return None


def auto_find(form):
    """按 (角色英文, 形态英文) 自动找一张图 → (url, 说明) 或 (None, 失败原因)"""
    fid, zh, en_form, en_hero = form
    query = f"{en_hero} {en_form}".strip()
    try:
        titles = fandom_search(query)
        if not titles:
            return None, "搜索无结果"
        title = titles[0]
        url = fandom_page_image(title)
        note = f"pageimages: {title}"
        if not url:
            for cand in fandom_image_candidates(title, query):
                url = fandom_file_url(cand)
                note = f"页面图片: {cand}"
                if url:
                    break
        if not url:
            return None, f"页面 {title} 没有可用图片"
        return url, note
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as e:
        network_hint(e)
        return None, f"网络错误: {e}"


# ---------------------------------------------------------------- 图片规整

def normalize(src_path, out_path):
    """转 PNG、保留透明、最长边压到 MAX_EDGE（macOS 自带 sips）"""
    if not shutil.which("sips"):
        raise RuntimeError("找不到 sips（macOS 自带）。可改用 --out 后手动处理图片。")
    subprocess.run(
        ["sips", "-s", "format", "png", "--resampleHeightWidthMax", str(MAX_EDGE), src_path, "--out", out_path],
        check=True,
        capture_output=True,
    )
    probe = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", out_path], capture_output=True, text=True)
    if "pixelWidth" not in probe.stdout:
        raise RuntimeError("生成的文件不是有效图片")
    return " ".join(line.split(":")[-1].strip() for line in probe.stdout.splitlines() if "pixel" in line)


def download(url, tmp_path):
    data = http_bytes(url)
    if len(data) < 200:
        raise RuntimeError(f"下载内容过小（{len(data)}B），可能不是图片")
    with open(tmp_path, "wb") as f:
        f.write(data)
    return tmp_path


def read_pairs(path):
    """读 `id 值` 形式的两列文件（# 开头为注释）"""
    pairs = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.split("#")[0].strip()
            if not line:
                continue
            parts = line.split(None, 1)
            if len(parts) == 2:
                pairs[parts[0]] = parts[1].strip()
    return pairs


# ---------------------------------------------------------------- 主流程

def main():
    ap = argparse.ArgumentParser(description="英雄图鉴素材获取/归位")
    ap.add_argument("--auto", action="store_true", help="从 Fandom 自动搜图（默认模式）")
    ap.add_argument("--urls", help="直链清单文件：每行 `formId URL`")
    ap.add_argument("--from-dir", help="本地图片目录（配合 --map）")
    ap.add_argument("--map", help="映射文件：每行 `formId 文件名`")
    ap.add_argument("--only", help="只处理这些形态 id（逗号分隔）")
    ap.add_argument("--limit", type=int, default=0, help="最多处理几个形态（0 = 不限）")
    ap.add_argument("--out", default=DEFAULT_OUT, help=f"输出目录（默认 {show_path(DEFAULT_OUT)}）")
    ap.add_argument("--force", action="store_true", help="已有 png 也重新处理")
    ap.add_argument("--dry-run", action="store_true", help="只打印计划，不下载")
    ap.add_argument("--check", action="store_true", help="只检查缺图情况")
    args = ap.parse_args()

    forms = load_forms()
    by_id = {f[0]: f for f in forms}
    os.makedirs(args.out, exist_ok=True)

    def has_png(fid):
        return os.path.exists(os.path.join(args.out, fid + ".png"))

    # ---- 只检查
    if args.check:
        have = [f[0] for f in forms if has_png(f[0])]
        missing = [f[0] for f in forms if not has_png(f[0])]
        print(f"形态总数 {len(forms)}｜已有 png {len(have)}｜缺 {len(missing)}")
        if missing:
            print("缺少：", ", ".join(missing[:40]) + (" …" if len(missing) > 40 else ""))
        return 0

    url_map, file_map = {}, {}
    if args.urls:
        url_map = read_pairs(args.urls)
    if args.from_dir:
        file_map = read_pairs(args.map) if args.map else {}
        if not file_map:
            # 没给映射表：按"文件名里含 formId"自动匹配
            for name in os.listdir(args.from_dir):
                for fid in by_id:
                    if fid in name:
                        file_map[fid] = name

    # 目标集合：
    #  · 显式 --only → 只听它的
    #  · 否则给了清单（--urls / --from-dir）→ **只处理清单里的 id**（不再顺手联网搜剩下的，
    #    否则网络被拦时每个 id 都要等一次超时，整批卡死）
    #  · --auto 显式打开时 → 全都上（清单里的 id 仍优先用清单）
    if args.only:
        want = [x.strip() for x in args.only.split(",") if x.strip()]
        unknown = [w for w in want if w not in by_id]
        if unknown:
            print("未知形态 id:", ", ".join(unknown), file=sys.stderr)
            return 2
        targets = want
    else:
        listed = list(dict.fromkeys([*url_map, *file_map]))
        targets = list(by_id.keys()) if (args.auto or not listed) else listed
    if not args.force:
        targets = [t for t in targets if not has_png(t)]
    if args.limit:
        targets = targets[: args.limit]

    if not targets:
        print("没有需要处理的形态（都有 png 了；要重下加 --force）")
        return 0

    print(f"计划处理 {len(targets)} 个形态 → {show_path(args.out)}")
    report = []
    tmp = os.path.join(args.out, ".tmp-download")
    ok = fail = skipped = 0
    consecutive_net_failures = 0

    for fid in targets:
        form = by_id[fid]
        out_path = os.path.join(args.out, fid + ".png")
        source_note = ""
        try:
            if fid in url_map:
                url, source_note = url_map[fid], "urls 清单"
                if args.dry_run:
                    print(f"  {fid:<18} ← {source_note}: {url}")
                    skipped += 1
                    continue
                download(url, tmp)
                size = normalize(tmp, out_path)
            elif fid in file_map:
                src = os.path.join(args.from_dir, file_map[fid])
                source_note = f"本地文件 {file_map[fid]}"
                if args.dry_run:
                    print(f"  {fid:<18} ← {source_note}")
                    skipped += 1
                    continue
                size = normalize(src, out_path)
            else:
                url, note = auto_find(form)
                if not url:
                    print(f"  {fid:<18} ✗ {note}")
                    report.append((fid, "-", "-", f"失败: {note}"))
                    fail += 1
                    if note.startswith("网络错误"):
                        consecutive_net_failures += 1
                        if consecutive_net_failures >= 3:
                            print(
                                "\n连续 3 次网络失败 —— 停下，不再逐个等超时。\n"
                                "请改用 --urls（浏览器复制图片地址）或 --from-dir（手动下载后归位）。",
                                file=sys.stderr,
                            )
                            break
                    continue
                consecutive_net_failures = 0
                source_note = note
                if args.dry_run:
                    print(f"  {fid:<18} ← {note}\n      {url}")
                    skipped += 1
                    continue
                download(url, tmp)
                size = normalize(tmp, out_path)
            if not args.dry_run:
                print(f"  {fid:<18} ✓ {size}  ← {source_note}")
                report.append((fid, source_note, size, "ok"))
                ok += 1
        except Exception as e:  # 单张失败不影响整批
            print(f"  {fid:<18} ✗ {e}")
            report.append((fid, "-", "-", f"失败: {e}"))
            fail += 1
        finally:
            time.sleep(SLEEP_SEC if not (fid in file_map) else 0.05)

    if os.path.exists(tmp):
        os.remove(tmp)

    if report and not args.dry_run:
        rep_path = os.path.join(args.out, "fetch-report.tsv")
        with open(rep_path, "w", encoding="utf-8") as f:
            f.write("formId\tsource\tsize\tstatus\n")
            for row in report:
                f.write("\t".join(row) + "\n")
        print(f"\n报告：{show_path(rep_path)}（建议逐张复核，尤其看剪影/logo 误命中）")

    print(f"\n完成：成功 {ok}｜标了 {skipped}｜失败 {fail}")
    if fail:
        print("失败的可用 --urls / --from-dir 手动补。")
    print("提示：public/heroes/*.png 已加入 .gitignore（不会进公开仓库）；要随仓库分发请自行删掉那行。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
