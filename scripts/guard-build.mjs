/**
 * 部署构建防护（CI 用）：
 * 生产部署到 GitHub Pages 必须带 GH_REPO，否则 vite 产物 base 指向根路径、
 * 部署到 <user>.github.io/<repo>/ 子路径后所有资源 404。
 *
 * 用法：
 *   pnpm build:ci           # = node scripts/guard-build.mjs && vite build（带 GH_REPO 才放行）
 *   GH_REPO=repo pnpm build # 本地/CI 手动带变量（不经过强制检查）
 *
 * 仅本地预览请用 pnpm build（vite.config 只打警告、不拦截）。
 */
if (process.env.GH_REPO) {
  process.exit(0)
}
console.error(
  '✋ 生产构建需要 GH_REPO 环境变量（GitHub Pages 子路径部署）。\n' +
    '   CI: GH_REPO=<仓库名> pnpm build:ci\n' +
    '   仅本地预览请用 pnpm build（会打印警告但不拦截）'
)
process.exit(1)
