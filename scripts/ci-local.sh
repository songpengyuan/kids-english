#!/usr/bin/env bash
# ============================================================================
# 本地 CI 镜像门禁 —— 在 push 之前跑一遍 CI 会跑的东西
# ============================================================================
#
# 为什么需要它：
#   2026-10-16 那次事故，CI 连红 3 次、deploy 被 skip、线上一直是旧产物，
#   而日志里只有孤零零一句：
#       ##[error]Process completed with exit code 1
#   上面没有任何报错 —— 因为失败发生在「取测试数」那行的命令替换里，
#   grep 匹配不到（vitest 输出带 ANSI 色码）返回 1，bash -e 静默退出。
#   同一步里单测 310 条全过、vue-tsc 也没报错，所以看起来像玄学。
#
#   这类失败的共同点是「沉默」：本地什么都没发生，CI 红在一个你没想到的地方。
#   本脚本把 CI 的检查原样搬到本地，并且**失败时明确告诉你卡在哪一步**。
#
# 覆盖范围（与 .github/workflows/deploy.yml 逐条对齐）：
#   1. 前端单测        pnpm test          （CI: fe-gate）
#   2. 前端类型检查    pnpm type-check    （CI: fe-gate）
#   3. 后端单测        pytest tests/ -q   （CI: be-gate）
#   4. OpenAPI 契约    导出后 git diff 必须为空（CI: be-gate）
#   5. 课程种子同步    导出后 git diff 必须为空（CI: Content seed drift check）
#   6. 生产构建        BASE_PATH=/ pnpm build:ci（CI: build 步的 build:root）
#   7. 白屏冒烟        无头 Chrome 打开 /app/#/，断言应用真的渲染出来
#                      （CI 没有这一步 —— 而白屏正是这个项目的头号线上故障）
#
# 用法：
#   bash scripts/ci-local.sh              # 全量（pre-push 默认走这条）
#   bash scripts/ci-local.sh --commit     # 秒级快检（pre-commit 走这条）
#   bash scripts/ci-local.sh --frontend   # 跳过后端（只改前端时更快）
#   bash scripts/ci-local.sh --no-smoke   # 跳过无头浏览器冒烟
#
# 应急跳过（不推荐）：
#   CI_LOCAL_SKIP=1 git push     /     git push --no-verify
#   CI_LOCAL_SKIP=1 git commit   /     git commit --no-verify
#
# 环境变量：
#   CI_LOCAL_DIST=<dir>   构建产物输出目录（默认临时目录，不动 frontend/dist）
#   CI_LOCAL_SKIP=1       整段跳过
#
# 实现约定（血泪教训，改这个文件时请守住）：
#   * 每步用自己的退出码判定，**绝不用** `cmd | tail` —— tail 的 0 会把
#     失败吃掉，测试挂了照样放行（旧的 pre-push 钩子就栽在这里）。
#   * 不用 `set -e`：我们要自己收集「哪一步失败」再给出人话的结论。
#   * 不把「取数据」和「判失败」写在同一条命令替换里。
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FE="$ROOT/frontend"
BE="$ROOT/backend"

MODE="full"          # full | commit | frontend
RUN_SMOKE=1
for a in "$@"; do
  case "$a" in
    --commit)   MODE="commit" ;;
    --frontend) MODE="frontend" ;;
    --no-smoke) RUN_SMOKE=0 ;;
    -h|--help)  sed -n '2,46p' "$0"; exit 0 ;;
    *) echo "未知参数: $a（可用: --commit / --frontend / --no-smoke）"; exit 2 ;;
  esac
done
[ "$MODE" = "commit" ] && RUN_SMOKE=0

if [ "${CI_LOCAL_SKIP:-}" = "1" ]; then
  echo "⏭️  CI_LOCAL_SKIP=1 —— 已跳过本地门禁（应急通道）"
  exit 0
fi

# ---------- 输出 ----------
if [ -t 1 ]; then B=$'\033[1m'; G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; D=$'\033[2m'; N=$'\033[0m'
else B=; G=; R=; Y=; D=; N=; fi

STEP_NO=0
step() { STEP_NO=$((STEP_NO + 1)); printf '\n%s▸ [%d] %s%s\n' "$B" "$STEP_NO" "$1" "$N"; }
ok()   { printf '  %s✅ %s%s\n' "$G" "$1" "$N"; }
bad()  { printf '  %s❌ %s%s\n' "$R" "$1" "$N"; }
warn() { printf '  %s⚠️  %s%s\n' "$Y" "$1" "$N"; }

FAILED_STEP=""
fail() { FAILED_STEP="$1"; }

# ---------- 环境：git 钩子跑在非交互 shell 里，nvm 没被加载，pnpm/node 会不在 PATH ----------
ensure_node() {
  if command -v node >/dev/null 2>&1 && command -v pnpm >/dev/null 2>&1; then return 0; fi
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1090,SC1091
    . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
    nvm use --silent default >/dev/null 2>&1 || nvm use --silent node >/dev/null 2>&1 || true
  fi
  command -v node >/dev/null 2>&1 && command -v pnpm >/dev/null 2>&1
}

if ! ensure_node; then
  bad "找不到 node / pnpm —— 请先 nvm use，或在交互终端里重跑"
  exit 1
fi
printf '%s本地门禁 · node %s · pnpm %s · mode=%s%s\n' \
  "$D" "$(node -v)" "$(pnpm -v)" "$MODE" "$N"

T_START=$(date +%s)
STAGED="$(git -C "$ROOT" diff --cached --name-only --diff-filter=ACM)"

# ============================================================================
# --commit：秒级快检。重量级检查（单测/后端/构建/冒烟）留给 pre-push。
# ============================================================================
if [ "$MODE" = "commit" ]; then
  if [ -z "$STAGED" ]; then
    printf '%s  （暂存区为空，跳过）%s\n' "$D" "$N"
    exit 0
  fi

  # 1) 冲突标记 —— 提交了就是语法错误，必然白屏
  step "冲突标记检查"
  conflict_hit=0
  while IFS= read -r f; do
    [ -f "$ROOT/$f" ] || continue
    if grep -nE '^(<<<<<<< |>>>>>>> )' -- "$ROOT/$f" >/dev/null 2>&1; then
      bad "$f 里还有未解决的冲突标记"
      conflict_hit=1
    fi
  done < <(printf '%s\n' "$STAGED")
  if [ "$conflict_hit" = 0 ]; then ok "无冲突标记"; else fail "冲突标记"; fi

  # 2) 误提交 .only —— 会让 CI「绿着漏测」：只跑 1 个用例却报 Tests passed
  step "误提交 .only 检查"
  if git -C "$ROOT" diff --cached -U0 | grep -qE '^\+.*(describe|it|test)\.only\('; then
    bad "暂存区里有 .only()，会让 CI 只跑那个用例、其余静默不执行"
    fail ".only 残留"
  else
    ok "无 .only()"
  fi

  # 3) 疑似硬编码密钥 —— 推上去就洗不掉了
  step "密钥/私钥泄漏检查"
  if git -C "$ROOT" diff --cached -U0 \
      | grep -qE '^\+.*(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)'; then
    bad "暂存区里疑似硬编码 token / 私钥"
    fail "疑似密钥"
  else
    ok "无可疑密钥"
  fi

  # 4) 类型检查（仅当暂存了 TS/Vue 源文件；vue-tsc 没有单文件模式，只能整体跑，约 6s）
  if printf '%s\n' "$STAGED" | grep -qE '\.(ts|tsx|vue)$'; then
    step "前端类型检查  ·  pnpm type-check（暂存区含 .ts/.vue，约 6s）"
    if (cd "$FE" && pnpm type-check); then
      ok "类型检查通过"
    else
      bad "类型检查失败 —— 修好再提交（跳过：git commit --no-verify）"
      fail "类型检查"
    fi
  else
    printf '%s  （暂存区没有 .ts/.vue，跳过类型检查）%s\n' "$D" "$N"
  fi

# ============================================================================
# 全量 / --frontend：CI 镜像
# ============================================================================
else

  # ---------- 1) 前端单测 ----------
  step "前端单测  ·  pnpm test"
  if (cd "$FE" && pnpm test); then
    ok "前端单测通过"
  else
    bad "前端单测失败 —— 复现：cd frontend && pnpm test"
    fail "前端单测"
  fi

  # ---------- 2) 前端类型检查 ----------
  if [ -z "$FAILED_STEP" ]; then
    step "前端类型检查  ·  pnpm type-check"
    if (cd "$FE" && pnpm type-check); then
      ok "类型检查通过（零输出 = 干净）"
    else
      bad "类型检查失败 —— 复现：cd frontend && pnpm type-check"
      fail "前端类型检查"
    fi
  fi

  # ---------- 3~4) 后端单测 + OpenAPI 契约 ----------
  if [ -z "$FAILED_STEP" ] && [ "$MODE" != "frontend" ]; then
    PY="$BE/.venv/bin/python"
    if [ ! -x "$PY" ]; then
      PY="$(command -v python3 || true)"
      warn "没找到 backend/.venv，回退到 $PY（依赖可能不全）"
    fi

    step "后端单测  ·  pytest tests/ -q（与 CI 同款 KIDS_JWT_SECRET）"
    if (cd "$BE" && KIDS_JWT_SECRET="${KIDS_JWT_SECRET:-ci-secret-$(printf 'k%.0s' {1..32})}" "$PY" -m pytest tests/ -q); then
      ok "后端单测通过"
    else
      bad "后端单测失败 —— 复现：cd backend && .venv/bin/python -m pytest tests/ -q"
      fail "后端单测"
    fi

    if [ -z "$FAILED_STEP" ]; then
      step "OpenAPI 契约同步  ·  export + git diff"
      if (cd "$BE" && "$PY" scripts/export_openapi.py); then
        # 注意 pathspec 必须相对仓库根写全（backend/openapi.json）。
        # 写成 openapi.json 在仓库根下匹配不到文件，git diff 恒返回 0 —— 校验等于空转
        # （CI 里就踩过这个坑，见 deploy.yml 的注释）。
        if git -C "$ROOT" diff --exit-code -- backend/openapi.json >/dev/null 2>&1; then
          ok "openapi.json 与后端接口一致"
        else
          bad "openapi.json 漂移：后端接口改了但契约没重新导出提交"
          warn "本次导出已写回 backend/openapi.json，检查后一起提交即可"
          git -C "$ROOT" --no-pager diff --stat -- backend/openapi.json
          fail "OpenAPI 契约漂移"
        fi
      else
        bad "导出 OpenAPI 失败（backend/main.py 可能导入不起来）"
        fail "OpenAPI 导出"
      fi
    fi
  fi

  # ---------- 5) 课程内容种子同步（ADR-001）----------
  # lessons.ts 是唯一人工书写源，backend/seed/lessons.json 是它的生成物。
  # 前端 content store「远端优先」：种子过期 → 后端旧内容盖掉前端新内容，
  # 表现为"改了课、也部署了，线上就是不变"，本地起前端时复现不出。
  if [ -z "$FAILED_STEP" ]; then
    step "课程种子同步  ·  pnpm export:lessons + git diff"
    if (cd "$FE" && pnpm export:lessons); then
      if git -C "$ROOT" diff --exit-code -- backend/seed/lessons.json >/dev/null 2>&1; then
        ok "lessons.json 与 lessons.ts 一致"
      else
        bad "课程种子漂移：改了 src/data/lessons.ts 却没重跑导出 —— 后端会用旧内容盖掉新内容"
        warn "本次导出已写回 backend/seed/lessons.json，检查后一起提交即可"
        git -C "$ROOT" --no-pager diff --stat -- backend/seed/lessons.json
        fail "课程种子漂移"
      fi
    else
      bad "导出课程种子失败 —— 复现：cd frontend && pnpm export:lessons"
      fail "课程种子导出"
    fi
  fi

  # ---------- 6) 生产构建 ----------
  BUILD_DIR="${CI_LOCAL_DIST:-}"
  if [ -z "$BUILD_DIR" ]; then
    BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/kids-ci-dist.XXXXXX")"
    CLEANUP_DIST=1
  fi
  if [ -z "$FAILED_STEP" ]; then
    step "生产构建  ·  BASE_PATH=/ pnpm build:ci  →  $BUILD_DIR"
    if (cd "$FE" && BASE_PATH=/ CI_OUT_DIR="$BUILD_DIR" pnpm build:ci); then
      ok "构建通过（含 guard-build 部署模式校验 + validate-data 数据校验）"
    else
      bad "构建失败 —— 复现：cd frontend && BASE_PATH=/ pnpm build:ci"
      fail "生产构建"
    fi
  fi

  # ---------- 7) 白屏冒烟 ----------
  # CI 不跑这一步：它能拦住「构建成功但运行时崩了」——这个项目最痛的线上故障。
  if [ -z "$FAILED_STEP" ] && [ "$RUN_SMOKE" = 1 ]; then
    step "白屏冒烟  ·  无头 Chrome 打开 /app/#/ 断言应用渲染出来"
    (cd "$FE" && node scripts/smoke.mjs --dist "$BUILD_DIR")
    rc=$?
    case "$rc" in
      0) ok "冒烟通过：应用正常渲染，无 JS 异常" ;;
      2) warn "本机没有 Chrome，已跳过冒烟（CI 上也没有这一步，不影响一致性）" ;;
      *) bad "冒烟失败：页面没渲染出来 / 有 JS 异常 —— 这正是「部署后白屏」的形态"
         fail "白屏冒烟" ;;
    esac
  fi

  [ -n "${CLEANUP_DIST:-}" ] && rm -rf "$BUILD_DIR"
fi

# ---------- 结论 ----------
if [ -n "$FAILED_STEP" ]; then
  printf '\n%s❌ 本地门禁未通过：%s%s\n' "$R" "$FAILED_STEP" "$N"
  printf '   这里拦下 = CI 上不会有那次红、不会有 deploy 被 skip、不会有「线上还是旧产物」。\n'
  printf '   修好后重跑：bash scripts/ci-local.sh\n'
  printf '   应急跳过（不推荐）：git push --no-verify / CI_LOCAL_SKIP=1 git push\n'
  exit 1
fi
printf '\n%s✅ 本地门禁全部通过（%ss）—— 与 CI 同款检查，可以放心 push%s\n' \
  "$G" "$(($(date +%s) - T_START))" "$N"
