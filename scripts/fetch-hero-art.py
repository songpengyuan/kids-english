#!/usr/bin/env python3
"""英雄图鉴的**素材获取/归位**脚本（私人使用工具）。

用途：把 81 个形态的图片按 `<formId>.png` 归位到 public/heroes/，
      自动转 PNG、保留透明通道、最长边压到 512px（卡片最大只显示 ~88px，够用且省流量）。

三种取图方式（可混用，按 id 去重）：

  1) 自动搜（联网时最省事）—— 多图源依次尝试，可用 --source 指定顺序
       python3 scripts/fetch-hero-art.py --auto --only tiga-multi,zero-base
       python3 scripts/fetch-hero-art.py --auto --limit 10      # 先试 10 张看看质量
       python3 scripts/fetch-hero-art.py --auto --source bing,baidu   # 只走必应/百度

  2) 你手动整理的直链清单（浏览器"复制图片地址"即可）—— urls.txt 每行 `formId URL`
       python3 scripts/fetch-hero-art.py --urls hero-urls.txt

  3) 你下载好的本地图片（文件名随意）—— map.txt 每行 `formId 文件名`
       python3 scripts/fetch-hero-art.py --from-dir ~/Downloads/ultraman --map map.txt

其它：
  --check             只检查哪些形态还缺图（不联网）
  --out DIR           输出目录（默认 public/heroes）
  --source LIST       图源顺序（默认 fandom,bing,baidu,moegirl）
  --force             已有 png 的形态也重新下载
  --dry-run           只打印计划与命中的图，不下载

图源说明：
  fandom   ultra.fandom.com 的 MediaWiki API —— 形态覆盖最全（英文关键词）
  bing     必应图片（cn.bing.com）—— 解析 murl，优先 .png（多半透明底）
  baidu    百度图片 —— 中文关键词命中率高（JSON 偶尔不合法，脚本用正则兜底）
  moegirl  萌娘百科 —— 中文条目图，图片站有防盗链，下载时自动带 Referer

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
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEROES_TS = os.path.join(ROOT, "src", "data", "heroes.ts")
DEFAULT_OUT = os.path.join(ROOT, "public", "heroes")

UA = "kids-english-hero-art/1.0 (personal, non-commercial use)"
# 图源根地址：可用环境变量覆盖（便于用本地 mock 服务器验证解析逻辑）
FANDOM = os.environ.get("HERO_FANDOM_BASE", "https://ultra.fandom.com")
BING = os.environ.get("HERO_BING_BASE", "https://cn.bing.com")
BAIDU = os.environ.get("HERO_BAIDU_BASE", "https://image.baidu.com")
MOEGIRL = os.environ.get("HERO_MOEGIRL_BASE", "https://zh.moegirl.org.cn")
TSUBURAYA = os.environ.get("HERO_TSUBURAYA_BASE", "https://tsuburaya-prod.com")
SLEEP_SEC = 1.2  # 对上游站点保持礼貌
MAX_EDGE = 512


def show_path(path):
    """仓库内的文件显示相对路径，仓库外（如 /tmp）直接显示绝对路径"""
    rel = os.path.relpath(path, ROOT)
    return path if rel.startswith("..") else rel


# ---------------------------------------------------------------- 数据源

def load_forms():
    """从 src/data/heroes.ts 读形态清单（唯一数据源，避免两边不一致）。

    返回 [(form_id, 形态中文, 形态英文, 角色中文, 角色英文, 形态序号)]，顺序与名录一致。
    """
    src = open(HEROES_TS, encoding="utf-8").read()
    roster = src[src.index("const ROSTER"): src.index("/** 展开成图鉴用的正式结构")]
    heroes = re.findall(r'id: "([a-z0-9]+)", name: "([^"]+)", en: "([^"]+)"', roster)
    forms = re.findall(r'\["([a-z0-9-]+)", "([^"]+)", "([^"]+)"\]', roster)
    out = []
    seen = {}
    for fid, zh, en in forms:
        hero = next((h for h in heroes if fid.startswith(h[0] + "-")), None)
        hid = hero[0] if hero else ""
        idx = seen.get(hid, 0)
        seen[hid] = idx + 1
        out.append((fid, zh, en, hero[1] if hero else "", hero[2] if hero else "", idx))
    return out


# ---------------------------------------------------------------- HTTP

_warned_network = False


def http_bytes(url, timeout=15, referer=None):
    # URL 里常带日文/中文文件名（官方站、必应都有），urllib 只吃 ASCII → 先做百分号编码
    url = urllib.parse.quote(url, safe=":/?&=#%+@!$'()*,;[]~")
    headers = {"User-Agent": UA, "Accept": "image/*,*/*;q=0.8"}
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def http_text(url, timeout=15, referer=None):
    return http_bytes(url, timeout, referer).decode("utf-8", "ignore")


def http_json(url, timeout=15, referer=None):
    return json.loads(http_text(url, timeout, referer))


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


def fandom_candidates(ctx, limit=6):
    """Fandom：页面主图 +（主图不合适时）页面图片按关键词打分兜底"""
    query = ctx["query_en"]
    try:
        titles = fandom_search(query)
        if not titles:
            return []
        title = titles[0]
        out = []
        main = fandom_page_image(title)
        if main:
            out.append((main, f"[fandom] pageimages: {title}"))
        for name in fandom_image_candidates(title, query):
            url = fandom_file_url(name)
            if url:
                out.append((url, f"[fandom] 页面图片: {name}"))
        return [(u, n) for u, n in out[:limit]]
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        return []


# ---------------------------------------------------------------- 必应图片

def bing_find(ctx, limit=8):
    """必应图片：解析 async 结果里的 murl，按域名可信度 + .png 排序"""
    query = ctx["query_en"]
    url = f"{BING}/images/async?q={urllib.parse.quote(query)}&first=1&count=35&mmasync=1&FORM=HDRSC2"
    html = http_text(url, referer=f"{BING}/images/")
    urls = re.findall(r"murl&quot;:&quot;(.*?)&quot;", html) or re.findall(r'"murl":"(.*?)"', html)
    if not urls:
        return []
    return [(u, f"[bing] 必应图片") for u in rank_candidates(urls)]


# ---------------------------------------------------------------- 百度图片

def baidu_find(ctx, limit=8):
    """百度图片：acjson 接口；返回的 JSON 有时不合法 → 正则兜底"""
    query = ctx["query_zh"]
    url = (f"{BAIDU}/search/acjson?tn=resultjson_com&ipn=rj&ie=utf-8&pn=0&rn=20&word="
           + urllib.parse.quote(query))
    raw = http_text(url, referer=f"{BAIDU}/")
    urls = []
    try:
        for item in json.loads(raw).get("data", []):
            if isinstance(item, dict):
                for key in ("middleURL", "thumbURL", "hoverURL"):
                    if item.get(key):
                        urls.append(item[key])
                        break
    except json.JSONDecodeError:
        urls = re.findall(r'"(?:middleURL|thumbURL|hoverURL)":"(.*?)"', raw)
    urls = [u.replace("\\/", "/") for u in urls]
    if not urls:
        return []
    return [(u, f"[baidu] 百度图片") for u in rank_candidates(urls)]


# ---------------------------------------------------------------- 萌娘百科

def moegirl_find(ctx, limit=3):
    """萌娘百科：MediaWiki API 搜索 → 页面主图（图片站有防盗链，下载要带 Referer）"""
    query = ctx["query_zh"]
    api = f"{MOEGIRL}/api.php?action=query&list=search&srlimit=5&format=json&srsearch=" + urllib.parse.quote(query)
    hits = http_json(api, referer=f"{MOEGIRL}/").get("query", {}).get("search", [])
    if not hits:
        return []
    title = hits[0]["title"]
    info = (
        f"{MOEGIRL}/api.php?action=query&prop=pageimages&piprop=original&format=json&titles="
        + urllib.parse.quote(title)
    )
    pages = http_json(info, referer=f"{MOEGIRL}/").get("query", {}).get("pages", {})
    for _, page in pages.items():
        src = (page.get("original") or {}).get("source")
        if src:
            return [(src, f"[moegirl] 萌娘百科: {title}")]
    return []


# ---------------------------------------------------------------- 圆谷官方站

_official_cache = None


def official_heroes():
    """圆谷官网 /heroeslist → [{slug, name, image, page}]（进程内缓存，一次请求复用）。

    列表页是懒加载：真实图片在 <noscript><img src=...> 里（形如 /wp-content/uploads/…/Xxx-Top.png），
    每张都是角色的透明立绘，质量最稳，所以把它排在所有图源之前。
    """
    global _official_cache
    if _official_cache is not None:
        return _official_cache
    html = http_text(f"{TSUBURAYA}/heroeslist", referer=TSUBURAYA + "/")
    out = []
    for art in re.findall(r'<article class="p-herolist__item">(.*?)</article>', html, re.S):
        slug = re.search(r'/heroes/([a-z0-9-]+)"', art)
        img = (re.search(r'<noscript><img[^>]+src="([^"]+)"', art)
               or re.search(r'data-src="([^"]+)"', art)
               or re.search(r'<img[^>]+src="(/wp-content[^"]+)"', art))
        name = re.search(r'p-herolist__name">\s*([^<]+)', art)
        if not (slug and img):
            continue
        url = img.group(1)
        if url.startswith("/"):
            url = TSUBURAYA + url
        out.append({
            "slug": slug.group(1),
            "name": (name.group(1).strip() if name else ""),
            "image": url,
            "page": f"{TSUBURAYA}/heroes/{slug.group(1)}",
        })
    _official_cache = out
    return out


def _norm_name(s):
    """归一化角色名：去 ULTRAMAN 前缀与所有非字母数字（'Ultraman Zero' ↔ 'ULTRAMAN ZERO'）"""
    s = re.sub(r"[^A-Za-z0-9]", "", s or "").lower()
    return s.replace("ultraman", "")


def official_match(hero_en):
    for h in official_heroes():
        if _norm_name(h["name"]) and _norm_name(h["name"]) == _norm_name(hero_en):
            return h
    slug_guess = "ultraman-" + re.sub(r"[^a-z0-9]+", "-", hero_en.lower()).strip("-")
    for h in official_heroes():
        if h["slug"] in (slug_guess, slug_guess.replace("ultraman-ultraman", "ultraman")):
            return h
    return None


def official_candidates(ctx, limit=3):
    """官方站候选：
    · 基础形态（index 0）→ 角色页里的立绘 PNG（优先 *-Top.png / 文件名含角色名），
      兜底用列表页那张；
    · 非基础形态 → **只**用角色页里"文件名含形态英文名"的图（找不到就交给后面的图源）。
      刻意不拿基础形态的图顶替 —— 那会把同一个形象套给该角色的所有形态（报告里的 ⚠️ 同图就是这么来的）。
    """
    hero = official_match(ctx["hero_en"])
    if not hero:
        return []
    out = []
    form_key = re.sub(r"[^a-z0-9]", "", ctx["form_en"].lower())
    hero_key = _norm_name(ctx["hero_en"])
    try:
        page = http_text(hero["page"], referer=TSUBURAYA + "/")
    except Exception:
        page = ""
    for u in re.findall(r'src="(/wp-content/uploads/[^"]+\.(?:png|jpg|jpeg))"', page):
        flat = re.sub(r"[^a-z0-9]", "", u.lower())
        # 排除"角色名标题图/logo/横幅"这类非立绘素材
        if any(bad in flat for bad in ("name", "logo", "title", "bnr", "banner", "icon", "thumb")):
            continue
        if ctx["index"] == 0 and ("top" in flat or (hero_key and hero_key in flat)):
            out.append((TSUBURAYA + u, f"[official] {hero['name']}（角色页立绘）"))
        elif ctx["index"] > 0 and form_key and form_key in flat:
            out.append((TSUBURAYA + u, f"[official] {hero['name']} · {ctx['form_en']}"))
    if ctx["index"] == 0:
        out.append((hero["image"], f"[official] {hero['name']}（官方立绘）"))
    # 去重（保留首个说明）
    seen, uniq = set(), []
    for url, note in out:
        if url not in seen:
            seen.add(url)
            uniq.append((url, note))
    return uniq[:limit]


SOURCES = {
    "official": (official_candidates, TSUBURAYA + "/"),
    "fandom": (fandom_candidates, FANDOM + "/"),
    "bing": (bing_find, BING + "/"),
    "baidu": (baidu_find, BAIDU + "/"),
    "moegirl": (moegirl_find, MOEGIRL + "/"),
}


def candidate_stream(form, order, per_source=6, total=10):
    """按图源顺序产出候选图：(url, 说明, referer)。调用方逐张下载质检，不合格再取下一张。"""
    fid, zh_form, en_form, zh_hero, en_hero, index = form
    ctx = {
        "form_id": fid,
        "form_zh": zh_form,
        "form_en": en_form,
        "hero_zh": zh_hero,
        "hero_en": en_hero,
        "index": index,
        "query_en": f"{en_hero} {en_form}".strip(),
        "query_zh": f"{zh_hero} {zh_form}".strip(),
    }
    yielded = 0
    for name in order:
        finder, referer = SOURCES[name]
        try:
            found = finder(ctx)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as e:
            network_hint(e)
            continue
        for url, note in found[:per_source]:
            yield url, note, referer
            yielded += 1
            if yielded >= total:
                return


# ---------------------------------------------------------------- 图片规整

# 官方 / 百科类域名优先（多为干净的角色立绘），电商与壁纸站降权（多为商品照/黑底图）
HOST_GOOD = ("tsuburaya-prod.com", "m-78.jp", "fandom.com", "wikia", "shoutwiki", "moegirl", "wikipedia")
HOST_BAD = ("amazon", "aliexpress", "ebay", "taobao", "tmall", "jd.com", "gundampros",
            "alphacoders", "wallpaper", "wallhere", "pinterest", "zhimg", "sohu", "bilibili")


def host_rank(url):
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    if any(g in host for g in HOST_GOOD):
        return 0
    if any(b in host for b in HOST_BAD):
        return 2
    return 1


def rank_candidates(urls):
    """去重 + 按"域名可信度、是否 .png"排序"""
    seen = set()
    out = []
    for u in urls:
        if not u or u in seen:
            continue
        seen.add(u)
        out.append(u)
    return sorted(out, key=lambda u: (host_rank(u), 0 if u.split("?")[0].lower().endswith(".png") else 1))


def png_transparency(path):
    """PNG 透明情况 → (有透明通道?, 透明像素占比, 透明角数)。非 PNG 直接判否。

    用来挡掉商品照/壁纸/黑底图。**以透明像素占比为主判据**（>10% 基本就是去背立绘），
    四角透明数作辅助 —— 只卡四角会误杀"裁得很紧、图形占满四角"的立绘。
    """
    data = open(path, "rb").read()
    if not data.startswith(b"\x89PNG") or data[12:16] != b"IHDR":
        return False, 0.0, 0
    width, height = struct.unpack(">II", data[16:24])
    bit_depth, color_type = data[24], data[25]
    if color_type not in (4, 6):  # 无透明通道
        return False, 0.0, 0
    if bit_depth != 8:
        return True, 0.0, 0
    interlace = data[28]
    if interlace != 0:
        return True, 0.0, 0

    idat = bytearray()
    pos = 8
    while pos + 8 <= len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        chunk_type = data[pos + 4:pos + 8]
        if chunk_type == b"IDAT":
            idat += data[pos + 8:pos + 8 + length]
        elif chunk_type == b"IEND":
            break
        pos += 12 + length
    try:
        raw = zlib.decompress(bytes(idat))
    except zlib.error:
        return True, 0.0, 0

    bpp = 4 if color_type == 6 else 2
    stride = width * bpp
    prev = bytearray(stride)
    first_row = None
    last_row = None

    def paeth(a, b, c):
        p = a + b - c
        pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
        return a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)

    offset = 0
    for y in range(height):
        if offset + 1 + stride > len(raw):
            break
        ft = raw[offset]
        line = bytearray(raw[offset + 1: offset + 1 + stride])
        offset += 1 + stride
        if ft == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif ft == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ft == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif ft == 4:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                up_left = prev[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + paeth(left, prev[i], up_left)) & 0xFF
        if y == 0:
            first_row = bytes(line)
        last_row = bytes(line)
        prev = line

    if not first_row or not last_row:
        return True, 0.0, 0

    def alpha(row, x):
        return row[x * bpp + (bpp - 1)]

    corners = [alpha(first_row, 0), alpha(first_row, width - 1),
               alpha(last_row, 0), alpha(last_row, width - 1)]
    transparent_px = 0
    total_px = 0
    # 再扫一遍统计透明占比（图像 ≤512px，开销可接受）
    offset = 0
    for _ in range(height):
        if offset + 1 + stride > len(raw):
            break
        ft = raw[offset]
        line = bytearray(raw[offset + 1: offset + 1 + stride])
        offset += 1 + stride
        if ft == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif ft == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ft == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif ft == 4:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                up_left = prev[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + paeth(left, prev[i], up_left)) & 0xFF
        total_px += width
        for x in range(width):
            if line[x * bpp + bpp - 1] < 40:
                transparent_px += 1
        prev = line
    ratio = (transparent_px / total_px) if total_px else 0.0
    return True, ratio, sum(1 for a in corners if a < 40)

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


def download(url, tmp_path, referer=None):
    data = http_bytes(url, referer=referer)
    # 用文件头判断是不是真图片（比"看大小"可靠：错误页/防盗链页会返回 HTML）
    signatures = (b"\x89PNG", b"\xff\xd8\xff", b"GIF8", b"RIFF", b"<svg", b"<?xml")
    if not any(data.startswith(s) for s in signatures):
        head = data[:60].decode("utf-8", "ignore").replace("\n", " ")
        raise RuntimeError(f"下载内容不是图片（{len(data)}B，开头：{head}）")
    if len(data) < 100:
        raise RuntimeError(f"下载内容过小（{len(data)}B）")
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
    ap.add_argument("--source", default="official,fandom,bing,baidu,moegirl",
                    help="图源顺序（逗号分隔）：official,fandom,bing,baidu,moegirl；默认全部依次尝试")
    ap.add_argument("--out", default=DEFAULT_OUT, help=f"输出目录（默认 {show_path(DEFAULT_OUT)}）")
    ap.add_argument("--force", action="store_true", help="已有 png 也重新处理")
    ap.add_argument("--dry-run", action="store_true", help="只打印计划，不下载")
    ap.add_argument("--check", action="store_true", help="只检查缺图情况")
    args = ap.parse_args()

    order = [s.strip() for s in args.source.split(",") if s.strip()]
    unknown_src = [s for s in order if s not in SOURCES]
    if unknown_src or not order:
        print(f"未知图源: {', '.join(unknown_src) or '(空)'}；可选: {', '.join(SOURCES)}", file=sys.stderr)
        return 2

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
    used_urls = {}  # url → formId（撞图提示：同一张图被多个形态命中）

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
                # 逐张候选：下载 → 规整 → 质检（要透明底、四角透明），不合格换下一张
                rejects = []
                size = None
                source_note = ""
                picked_url = None
                official_fb = None  # 官方源首个候选（内容可靠）：透明质检全失败时兜底，宁要对的非透明
                for url, note, referer in candidate_stream(form, order):
                    try:
                        if args.dry_run:
                            print(f"  {fid:<18} ← {note}\n      {url}")
                            source_note, picked_url, size = note, url, "dry-run"
                            break
                        download(url, tmp, referer)
                        size = normalize(tmp, out_path)
                        has_alpha, ratio, corners = png_transparency(out_path)
                        # 透明占比 >10%（去背立绘）或有 3 个以上透明角 → 收
                        if not has_alpha or (ratio < 0.10 and corners < 3):
                            if "official" in note and official_fb is None:
                                official_fb = (url, note, referer)
                            rejects.append(f"{note}: 非透明底（透明占比 {ratio:.0%}，角 {corners}/4）")
                            os.remove(out_path)
                            continue
                        source_note, picked_url = note, url
                        break
                    except Exception as e:
                        rejects.append(f"{note}: {e}")
                        if any(k in str(e) for k in ("timed out", "reset", "Errno", "URLError")):
                            consecutive_net_failures += 1
                            if consecutive_net_failures >= 6:
                                print(
                                    "\n连续 6 次网络失败 —— 停下（避免每个形态都逐个等超时）。\n"
                                    "用 --source 换可达的图源，或改用 --urls / --from-dir。",
                                    file=sys.stderr,
                                )
                                raise SystemExit(0)
                if not picked_url and official_fb and not args.dry_run:
                    # 官方源兜底：内容可靠，即使非透明也收（白底在卡片上可接受，远好过张冠李戴）
                    url, note, referer = official_fb
                    try:
                        download(url, tmp, referer)
                        size = normalize(tmp, out_path)
                        source_note, picked_url = f"{note}（官方兜底，非透明）", url
                    except Exception as e:
                        rejects.append(f"官方兜底: {e}")
                if not picked_url:
                    reason = "；".join(rejects[-3:]) or "所有图源都没找到候选"
                    print(f"  {fid:<18} ✗ {reason}")
                    report.append((fid, "-", "-", f"失败: {reason}"))
                    fail += 1
                    if rejects and all("网络" in r or "timed out" in r or "reset" in r for r in rejects):
                        consecutive_net_failures += 1
                        if consecutive_net_failures >= 3:
                            print(
                                "\n连续多次网络失败 —— 停下。\n"
                                "可改用 --urls / --from-dir，或稍后重试（网络限速时容易中断）。",
                                file=sys.stderr,
                            )
                            break
                    continue
                consecutive_net_failures = 0
                if picked_url in used_urls:
                    source_note += f" ⚠️ 与 {used_urls[picked_url]} 同图"
                used_urls[picked_url] = fid
                if args.dry_run:
                    skipped += 1
                    continue
                if rejects:
                    source_note += f"（换过 {len(rejects)} 张：{'、'.join(r.split(': ')[-1] for r in rejects[:2])}）"
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
