/**
 * 部署构建防护（CI 用）：
 * 两种部署模式必须显式其一，防止资源路径 404：
 *   1. 自定义域名（根路径）     → BASE_PATH=/ pnpm build:ci（或 pnpm build:root）
 *   2. GitHub Pages 项目子路径 → GH_REPO=<repo> pnpm build:ci
 * 均未设置时 vite 产物 base 指向根路径，子路径部署后所有资源 404，这里强制拦截。
 *
 * 仅本地预览请用 pnpm build（vite.config 只打警告、不拦截）。
 */
if (process.env.BASE_PATH || process.env.GH_REPO) {
  process.exit(0)
}
console.error(
  '✋ 生产构建需要 BASE_PATH 或 GH_REPO 环境变量。\n' +
    '   自定义域名（根路径）：  pnpm build:root\n' +
    '   GitHub Pages 子路径：   GH_REPO=<仓库名> pnpm build:ci\n' +
    '   仅本地预览请用 pnpm build（会打印警告但不拦截）'
)
process.exit(1)
