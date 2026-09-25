import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

// 每次构建生成唯一 id：src/sw.js 里的构建占位符会被替换成它。
// 于是 sw.js 的字节随部署变化，浏览器下次打开就能检测到新版本 —— PWA「及时更新」的前提。
const BUILD_ID = Date.now().toString(36)

const swSource = () =>
  fs.readFileSync(fileURLToPath(new URL('./src/sw.js', import.meta.url)), 'utf8')

/**
 * PWA 插件：把 src/sw.js 原样输出到 dist/sw.js（不进应用包），
 * dev 时也让 /sw.js 可访问（配合 ?sw=1 手动测试，dev 下不缓存任何模块）。
 */
function kidsPwa() {
  return {
    name: 'kids-pwa',
    config() {
      return { define: { __BUILD_ID__: JSON.stringify(BUILD_ID) } }
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: swSource().replaceAll('__BUILD_ID__', BUILD_ID),
      })
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.split('?')[0] === '/sw.js') {
          res.setHeader('Content-Type', 'text/javascript')
          res.setHeader('Cache-Control', 'no-store')
          res.end(swSource().replace('__BUILD_ID__', 'dev-' + BUILD_ID))
          return
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 部署防护：生产构建且未带 GH_REPO 时，产物 base 会指向根路径，
  // 部署到 GitHub Pages 子路径必 404。本地预览可忽略；CI 部署请走 pnpm build:ci（强制）。
  if (mode === 'production' && !process.env.GH_REPO) {
    console.warn(
      '\n⚠️  [kids-english] 生产构建未设置 GH_REPO 环境变量，产物 base 为 "/"。\n' +
        '    部署到 GitHub Pages 子路径会 404。\n' +
        '    CI 部署请使用 pnpm build:ci（带 GH_REPO）；仅本地预览可忽略本警告。\n'
    )
  }
  return {
    plugins: [vue(), kidsPwa()],
    // GitHub Pages 部署在项目子路径（https://<user>.github.io/<repo>/）下，
    // 资源必须带对应 base；用环境变量注入仓库名，本地 dev/build 不受影响。
    base: mode === 'production' && process.env.GH_REPO ? `/${process.env.GH_REPO}/` : '/',
    // 单元测试（vitest）：默认 node 环境；用到 localStorage 的用例在文件头标 jsdom
    test: {
      environment: 'node',
      include: ['src/**/*.test.{js,ts}'],
    },
  }
})
