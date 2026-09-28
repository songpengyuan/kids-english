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
    generateBundle(_out, bundle) {
      // 收集构建产出的壳资源（JS/CSS/字体，文件名带内容哈希）：
      // 注入 sw 预缓存清单 → 首次安装即缓存全部应用代码，断网首开不再白屏。
      const shellAssets = Object.keys(bundle)
        .filter((n) => /^assets\/.*\.(js|css|woff2)$/.test(n))
        .sort()
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: swSource()
          .replaceAll('__BUILD_ID__', BUILD_ID)
          .replaceAll('__PRECACHE_ASSETS__', JSON.stringify(shellAssets)),
      })
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.split('?')[0] === '/sw.js') {
          res.setHeader('Content-Type', 'text/javascript')
          res.setHeader('Cache-Control', 'no-store')
          // dev 下不预缓存任何模块（HMR 资源永远直连）
          res.end(swSource()
            .replace('__BUILD_ID__', 'dev-' + BUILD_ID)
            .replace('__PRECACHE_ASSETS__', '[]'))
          return
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 部署模式（base 优先级：BASE_PATH > GH_REPO > 根路径 "/"）：
  //   自定义域名（根路径部署）      → BASE_PATH=/ pnpm build（或 build:root）
  //   GitHub Pages 项目页（子路径） → GH_REPO=<repo> pnpm build:ci
  //   仅本地预览默认根路径，可忽略警告
  if (mode === 'production' && !process.env.BASE_PATH && !process.env.GH_REPO) {
    console.warn(
      '\n⚠️  [kids-english] 生产构建未设置 BASE_PATH / GH_REPO，产物 base 为 "/"。\n' +
        '    自定义域名部署 OK；GitHub Pages 子路径部署会 404。\n' +
        '    自定义域名：pnpm build:root；项目子路径：GH_REPO=<repo> pnpm build:ci\n'
    )
  }
  return {
    plugins: [vue(), kidsPwa()],
    // base 优先级：显式 BASE_PATH（自定义域名/任意部署路径）> GH_REPO（GitHub Pages 项目子路径）> 根路径 "/"
    // sw.js 已用 self.registration.scope 自适应任意部署路径，静态资源只需这里定前缀
    base:
      process.env.BASE_PATH ||
      (mode === 'production' && process.env.GH_REPO ? `/${process.env.GH_REPO}/` : '/'),
    // 单元测试（vitest）：默认 node 环境；用到 localStorage 的用例在文件头标 jsdom
    test: {
      environment: 'node',
      include: ['src/**/*.test.{js,ts}'],
    },
  }
})
