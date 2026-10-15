import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { router } from './router'
import './styles/tokens.css'
import './styles/base.css'
// animate.css 必须在 base.css 之后引入：同权重的 .animate__tada / .anim-pop
// 都定义 animation，后引入者生效，点击时 tada 才不会被 pop-in 覆盖
import 'animate.css'
import App from './App.vue'
import { initHaptics, hapticsInfo } from './services/haptics'
import { initTheme } from './services/theme'
import { initErrorCapture } from './utils/errors'

// 先应用主题再挂载，避免暗色用户刷新时闪白
initTheme()

// 页面标题（P2-2）：路由 meta.title 驱动浏览器标签页标题，首页保持品牌名
router.afterEach((to) => {
  const t = to.meta.title;
  document.title = t && t !== "丞丞ABC" ? `${t} · 丞丞ABC` : "丞丞ABC";
});

createApp(App).use(createPinia()).use(router).mount('#app')

// Safari 没有 Vibration API，挂载后给可点元素叠加透明 switch 以获得原生触感
initHaptics()
// 便于在 Safari 控制台自检：输入 __kidsHaptics()
window.__kidsHaptics = hapticsInfo
// 错误上报：未捕获异常/未处理 Promise 写入本地环形缓冲（控制台输入 __kidsErrors() 查看）
initErrorCapture()
