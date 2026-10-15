#!/usr/bin/env python3
"""
儿童中文字体子集化（站酷快乐体 ZCOOL KuaiLe，OFL 免费商用）。

用法：
    python3 scripts/subset-font.py [源字体路径]

不带参数时自动从 @fontsource/zcool-kuaile（jsdelivr）下载全量 woff2 缓存到 /tmp。
产出：src/assets/fonts/zcool-kuaile-subset.woff2 —— 只含项目 src/ 下出现过的
汉字与全角标点，离线可用、体积最小。

⚠️ 新增页面/文案后需重跑本脚本（或跑 pnpm build 前的 guard 检查提示），
否则新字会回退到系统字体。重跑命令：
    python3 scripts/subset-font.py
"""
import glob
import os
import re
import subprocess
import sys
import tempfile
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
OUT = os.path.join(ROOT, "src", "assets", "fonts", "zcool-kuaile-subset.woff2")
FONT_SOURCE_URL = (
    "https://cdn.jsdelivr.net/npm/@fontsource/zcool-kuaile@5.3.0/"
    "files/zcool-kuaile-chinese-simplified-400-normal.woff2"
)

CJK_RE = re.compile(r"[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]")


def collect_chars() -> str:
    chars: set[str] = set()
    files = 0
    for ext in ("*.vue", "*.ts", "*.js", "*.css"):
        for p in glob.glob(os.path.join(SRC, "**", ext), recursive=True):
            files += 1
            try:
                text = open(p, encoding="utf-8").read()
            except OSError:
                continue
            chars |= set(CJK_RE.findall(text))
    # 兜底常用标点/数字全角变体
    chars |= set("，。！？：；（）【】「」、…—·")
    print(f"[subset] scanned {files} files, unique CJK chars: {len(chars)}")
    return "".join(sorted(chars))


def get_source_font(arg: str) -> str:
    if arg and os.path.exists(arg):
        return arg
    cache = os.path.join(tempfile.gettempdir(), "zcool-kuaile-full.woff2")
    if not os.path.exists(cache):
        print(f"[subset] downloading ZCOOL KuaiLe from fontsource ...")
        urllib.request.urlretrieve(FONT_SOURCE_URL, cache)
    print(f"[subset] source font: {cache} ({os.path.getsize(cache)//1024} KB)")
    return cache


def main() -> int:
    src_font = get_source_font(sys.argv[1] if len(sys.argv) > 1 else "")
    chars = collect_chars()
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
        f.write(chars)
        chars_file = f.name
    try:
        subprocess.run(
            [
                "pyftsubset", src_font,
                f"--text-file={chars_file}",
                "--flavor=woff2",
                "--output-file=" + OUT,
                "--layout-features='*'",
                "--desubroutinize",
            ],
            check=True,
            capture_output=True,
        )
    finally:
        os.unlink(chars_file)
    size = os.path.getsize(OUT)
    print(f"[subset] output: {OUT} ({size//1024} KB, {len(chars)} chars)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
