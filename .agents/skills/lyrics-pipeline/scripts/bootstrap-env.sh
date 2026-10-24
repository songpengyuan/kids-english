#!/usr/bin/env bash
# 一次性搭建歌词对齐环境（lyrics-pipeline skill）。
# 用法: ./bootstrap-env.sh [pip镜像URL]
#   例: ./bootstrap-env.sh https://pypi.tuna.tsinghua.edu.cn/simple
# 产出独立 venv，路径可用环境变量 LYRICS_VENV 覆盖。
# 之后跑对齐: HF_ENDPOINT=https://hf-mirror.com HF_HUB_DISABLE_XET=1 \
#   "$LYRICS_VENV/bin/python" frontend/scripts/gen-lrc.py <课时id>
set -euo pipefail

VENV="${LYRICS_VENV:-$HOME/.venvs/kids-lyrics}"
MIRROR="${1:-}"
PIP_ARGS=()
[ -n "$MIRROR" ] && PIP_ARGS=(-i "$MIRROR")

if ! command -v python3 >/dev/null; then
  echo "需要 python3（≥3.9）" >&2
  exit 1
fi

python3 -m venv "$VENV"
PIP="$VENV/bin/pip"
"$PIP" install -q "${PIP_ARGS[@]}" -U pip
# av<19: PyAV 19 删了 faster-whisper 依赖的 av.open(metadata_errors=...) 参数
"$PIP" install -q "${PIP_ARGS[@]}" "faster-whisper>=1.2,<2" "av<19" "numpy"

echo "OK: $VENV/bin/python"
echo "模型首次运行会下载 whisper small.en（~480MB）；国内请配:"
echo "  export HF_ENDPOINT=https://hf-mirror.com HF_HUB_DISABLE_XET=1"
command -v afconvert >/dev/null || echo "⚠️ 未找到 afconvert（非 macOS）：gen-lrc.py 的 mp3 解码暂依赖它，需自行改造为 ffmpeg。"
