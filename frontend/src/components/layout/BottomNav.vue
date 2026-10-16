<script setup>
/**
 * 底部导航（App 风格常驻）：📖 学习 / 🎧 磨耳朵 / 👤 我的
 *
 * - 学习是独立路由 #/course；游戏入口收在学习页右上角按钮（非底部主 tab）。
 * - 中间位**永远是「磨耳朵」入口**；一旦有歌在播，槽位里换成一颗播放/暂停键
 *   （--tap-min，品牌蓝）。不再把封面/歌名/进度塞进槽位——那是播放页的事，
 *   塞进来只会让歌名被截成 "Walki…"，还把三格的宽度与基线一起撑歪。
 *   点那颗键 = 播放/暂停；点槽位其余 = 进磨耳朵列表。
 *   为什么不能"只留一个播放键"：磨耳朵全站只有这一个入口（别处没有 push /listen），
 *   一旦放歌就再也回不去列表，所以入口必须留着。
 * - 我的 tab 高亮覆盖其子页：/me、/treasure、/report、/review。
 * - 玩法页（/course/:id）与播放页（歌词全屏页展开时）不渲染本组件（沉浸，见 App.vue）。
 */
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import PathIcon from "../PathIcon.vue";
import { speakZh } from "../../services/speech";
import { hapticTap } from "../../services/haptics";
import { usePlayerStore } from "../../stores/player";
import { Pause, Play } from "@lucide/vue";

const route = useRoute();
const router = useRouter();
const player = usePlayerStore();

const isHome = computed(() => route.name === "learn");
const isListen = computed(() => route.name === "listen");
const isMe = computed(
  () =>
    route.name === "me" ||
    route.name === "streak" ||
    route.name === "treasure" ||
    route.name === "hero-detail" ||
    route.name === "report" ||
    route.name === "review"
);

function goPractice() {
  hapticTap();
  speakZh("学习");
  if (isHome.value) return;
  void router.push("/course").catch(() => {});
}
function goMe() {
  hapticTap();
  speakZh("我的");
  if (route.name === "me") return;
  void router.push("/me").catch(() => {});
}
/** 磨耳朵入口（点槽位进列表，点槽位里的播放键只切播放态） */
function goListen() {
  hapticTap();
  speakZh("磨耳朵");
  if (isListen.value) return;
  void router.push("/listen").catch(() => {});
}
</script>

<template>
  <nav class="bottom-nav" role="tablist" aria-label="主导航">
    <button
      role="tab"
      class="bn-tab"
      aria-label="学习"
      :aria-selected="isHome"
      :class="{ on: isHome }"
      @click="goPractice"
    >
      <span class="bn-zone"><PathIcon name="free" /></span>
      <span class="bn-cap">学习</span>
    </button>

    <!-- 中间位：没有在播 = 磨耳朵入口；有歌在播 = 槽位里只放一颗播放/暂停键 -->
    <button
      v-if="!player.currentSong"
      role="tab"
      class="bn-tab"
      aria-label="磨耳朵"
      :aria-selected="isListen"
      :class="{ on: isListen }"
      @click="goListen"
    >
      <span class="bn-zone"><span class="bn-ico">🎧</span></span>
      <span class="bn-cap">磨耳朵</span>
    </button>
    <div
      v-else
      role="tab"
      tabindex="0"
      class="bn-tab"
      aria-label="磨耳朵（正在播放）"
      :aria-selected="isListen"
      :class="{ on: isListen }"
      @click="goListen"
      @keydown.enter="goListen"
    >
      <span class="bn-zone">
        <button
          class="bn-play round"
          :class="{ live: player.playing }"
          :aria-label="player.playing ? '暂停' : '播放'"
          @click.stop="player.togglePlay()"
        >
          <Pause v-if="player.playing" class="k-ico" /><Play v-else class="k-ico" />
        </button>
      </span>
      <span class="bn-cap">磨耳朵</span>
    </div>

    <button role="tab" class="bn-tab" aria-label="我的" :aria-selected="isMe" :class="{ on: isMe }" @click="goMe">
      <span class="bn-zone"><PathIcon name="me" /></span>
      <span class="bn-cap">我的</span>
    </button>
  </nav>
</template>

<style scoped>
.bottom-nav {
  /* App 化：底栏脱离文档流，固定钉在视口底部（内容再高也不会把它挤出/盖住） */
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: var(--z-floating);
  margin-inline: auto;
  max-width: 1180px; /* 与 #app 同宽居中 */
  display: flex;
  gap: var(--gap-s);
  padding:
    var(--gap-xs)
    calc(var(--pad-x) + env(safe-area-inset-right))
    max(var(--gap-xs), env(safe-area-inset-bottom))
    calc(var(--pad-x) + env(safe-area-inset-left));
  /* 毛玻璃：与 HeaderBar 同一套 token（--bar-bg / --bar-blur） */
  background: var(--bar-bg, var(--bg));
  -webkit-backdrop-filter: blur(var(--bar-blur, 14px));
  backdrop-filter: blur(var(--bar-blur, 14px));
  box-shadow: var(--shadow-bar-up);
}
.bn-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-xs);
  padding: var(--gap-xs) 0;
  /* 显式透明：全局 button 重置没有重置 background，不写这一行就会带出
   * 浏览器默认的浅灰底（左右两个 tab 是 <button>、中间是 <div>，
   * 三者底色就会不一致）。选中态由 .on 上色。 */
  background: transparent;
  border-radius: var(--radius-s);
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
  color: var(--ink-faint);
  transition: background var(--dur-base), color var(--dur-base), transform var(--dur-fast);
  /* 移动端：消除轻滑误判成滚动/双击缩放导致的 click 丢失（"有时点不过去"） */
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}
.bn-tab:active {
  transform: translateY(1px);
}
.bn-tab.on {
  color: var(--brand);
  background: var(--brand-soft);
}
/* 命中动画：图标弹跳 + 淡入 */
.bn-tab.on .bn-ico {
  animation: tab-pop var(--dur-base) var(--ease-pop);
}
.bn-tab.on .bn-cap {
  animation: tab-fade var(--dur-base) ease;
}
@keyframes tab-pop {
  0% { transform: scale(0.82); }
  55% { transform: scale(1.16); }
  100% { transform: scale(1); }
}
@keyframes tab-fade {
  from { opacity: 0.4; }
  to { opacity: 1; }
}
/* 图标位：三格统一 --tap-min 高。
 * 中间那颗播放键和左右图标尺寸不同，靠固定高的图标位，
 * 三格的标签才能落在同一条基线上（否则底栏会像以前那样左右不齐）。 */
.bn-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--tap-min);
  font-size: var(--fs-title);
  line-height: 1;
}
.bn-ico {
  line-height: 1;
}
.bn-cap {
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
}
/* ===== 槽位里的播放/暂停键 =====
 * 底栏唯一带颜色的元素，也是全站最容易够到的一颗键。
 * 它只负责播放/暂停；导航仍由整个槽位负责（点槽位=进磨耳朵列表）。
 * 宽度用 --tap-min：儿童手指定位精度低，这颗键会是他们按得最多的一个。 */
.bn-play {
  width: var(--tap-min);
  height: var(--tap-min);
  background: var(--brand);
  color: var(--on-tone);
  box-shadow: 0 var(--press) 0 var(--brand-dark);
  font-size: var(--fs-body);
}
/* 播放中：外扩一圈呼吸光环（"正在唱"的状态信号，颜色跟随品牌色） */
.bn-play.live {
  animation: play-live 2s ease-in-out infinite;
}
@keyframes play-live {
  0%, 100% {
    box-shadow: 0 var(--press) 0 var(--brand-dark),
      0 0 0 0 color-mix(in srgb, var(--brand) 34%, transparent);
  }
  50% {
    box-shadow: 0 var(--press) 0 var(--brand-dark),
      0 0 0 6px color-mix(in srgb, var(--brand) 14%, transparent);
  }
}
</style>
