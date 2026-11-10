#!/usr/bin/env bash
#
# 新课/素材变更后的内容管线一键串联（2026-11-11 架构收敛）：
#   词图贴纸 → 词音句音 → 导出后端种子 → 数据校验，fail-fast。
#
# 背景：加一课要在 4 个散装脚本间按顺序跑、手工核对每步输出；
# 漏跑一步就会在门禁（种子漂移/数据校验）或运行时（音频缺失回退 TTS）才暴露。
# 本脚本把顺序固化：任何一步红了立即停，最后一步绿了 = 内容四件套全部一致。
#
# 用法：
#   pnpm lesson:pipeline            # 增量（已有音频跳过、贴纸按数据重算）
#   pnpm lesson:pipeline --force    # 词音全量重生成（换音色/参数时用，参数在 gen-word-audio.py 默认值里）
#
# 依赖：python3（edge-tts）、node。词音参数/音色变更见 gen-word-audio.py 头注释。
set -euo pipefail
cd "$(dirname "$0")/.."   # frontend/

echo "▸ [1/4] 词图贴纸（数据驱动，gen-word-art.py）"
python3 scripts/gen-word-art.py

echo "▸ [2/4] 词音/句音（${1:-增量}）"
if [ "${1:-}" = "--force" ]; then
  python3 scripts/gen-word-audio.py --force
else
  python3 scripts/gen-word-audio.py
fi

echo "▸ [3/4] 导出后端种子（export-lessons.mjs）"
node scripts/export-lessons.mjs

echo "▸ [4/4] 数据校验（validate-data.mjs）"
node scripts/validate-data.mjs

echo "✅ 内容管线全绿：词图/词音/种子/校验一致。"
