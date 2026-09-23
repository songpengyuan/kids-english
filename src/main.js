import { createApp } from 'vue'
import './styles/tokens.css'
import './styles/base.css'
// animate.css 必须在 base.css 之后引入：同权重的 .animate__tada / .anim-pop
// 都定义 animation，后引入者生效，点击时 tada 才不会被 pop-in 覆盖
import 'animate.css'
import App from './App.vue'

createApp(App).mount('#app')
