import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  // GitHub Pages 部署在项目子路径（https://<user>.github.io/<repo>/）下，
  // 资源必须带对应 base；用环境变量注入仓库名，本地 dev/build 不受影响。
  base: mode === 'production' && process.env.GH_REPO ? `/${process.env.GH_REPO}/` : '/',
}))
