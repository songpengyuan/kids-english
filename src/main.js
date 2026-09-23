import { createApp } from 'vue'
import './styles/tokens.css'
import './styles/base.css'
// animate.css 必须在 base.css 之后引入：同权重的 .animate__tada / .anim-pop
// 都定义 animation，后引入者生效，点击时 tada 才不会被 pop-in 覆盖
import 'animate.css'
import App from './App.vue'
import { initHaptics, hapticsInfo } from './utils/haptics'

createApp(App).mount('#app')

// Safari 没有 Vibration API，挂载后给可点元素叠加透明 switch 以获得原生触感
initHaptics()
// 便于在 Safari 控制台自检：输入 __kidsHaptics()
window.__kidsHaptics = hapticsInfo
