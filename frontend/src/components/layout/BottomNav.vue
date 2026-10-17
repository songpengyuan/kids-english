<script setup>
/**
 * 底部导航（App 风格常驻）：📖 学习 / 🎧 磨耳朵 / 👤 我的
 *
 * - 学习是独立路由 #/course；游戏入口收在学习页右上角按钮（非底部主 tab）。
 * - 中间位**永远是「磨耳朵」入口**，但有两副面孔（位置决定语义，见 onMiddle）：
 *     · 站在别的 tab（哪怕有歌在播）→ 槽位就是入口本身：🎧 + 正在播放的小圆点；
 *     · 已站在磨耳朵页 → 槽位换成播放/暂停键（--tap-min，品牌蓝）。
 *      列表页本身一个 transport 都没有，这颗键只有在这里才是真的"暂停键"。
 *   两副面孔的关键是**键面必须等于它的行为**：不能长得像暂停键、点下去却是导航，
 *   也不能"有歌就永远是播放键"——那颗键会盖住整格唯一的命中区（52px 图标位
 *   ≈ 整格 60% 高度），孩子点上去只暂停不导航，而磨耳朵全站只此一个入口，
 *   于是开始播放后中间 tab 等于失灵，从别的 tab 再也回不来（2026-10-17 反馈）。
 *   也不再把封面/歌名/进度塞进槽位——那是播放页的事，塞进来只会让歌名被
 *   截成 "Walki…"，还把三格的宽度与基线一起撑歪。
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
/** 磨耳朵入口（点槽位进列表） */
function goListen() {
  hapticTap();
  speakZh("磨耳朵");
  if (isListen.value) return;
  void router.push("/listen").catch(() => {});
}

/**
 * 中间位：位置决定语义。
 * - 已在磨耳朵页 → 这颗键是播放/暂停（列表页没有别的 transport，它是唯一一颗）；
 * - 在其他 tab → 整格都是回磨耳朵列表的入口（有歌在播也一样）。
 *
 * 上一版是"有歌就永远是播放键"，命中区被那颗键吃掉，从别的 tab 点中间位
 * 只暂停、不导航 —— 而磨耳朵全站只有这一个入口，等于再也回不去。
 * tab 的第一职责是导航，任何状态下都不能失效。
 */
function onMiddle() {
  if (isListen.value) {
    hapticTap();
    player.togglePlay();
    return;
  }
  goListen();
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

    <!-- 中间位·入口形态：没在磨耳朵页时（含"有歌在播但在别的 tab"）。
         整格都是入口，图标只是一个状态显示（正在播放 → 右上角小圆点）。 -->
    <button
      v-if="!isListen || !player.currentSong"
      role="tab"
      class="bn-tab"
      aria-label="磨耳朵"
      :aria-selected="isListen"
      :class="{ on: isListen }"
      @click="goListen"
    >
      <span class="bn-zone">
        <span class="bn-ico" :class="{ live: player.playing }">🎧</span>
      </span>
      <span class="bn-cap">磨耳朵</span>
    </button>
    <!-- 中间位·播放键形态：只出现在磨耳朵页上（此时导航目标就是当前页） -->
    <button
      v-else
      role="tab"
      class="bn-tab"
      :aria-label="player.playing ? '暂停' : '播放'"
      :aria-selected="isListen"
      :class="{ on: isListen }"
      @click="onMiddle"
    >
      <span class="bn-zone">
        <span class="bn-play round" :class="{ live: player.playing }">
          <Pause v-if="player.playing" class="k-ico" /><Play v-else class="k-ico" />
        </span>
      </span>
      <span class="bn-cap">磨耳朵</span>
    </button>

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
  position: relative;
  line-height: 1;
}
/* 正在播放：图标右上角一颗呼吸小圆点（状态信号，不是可点区域）。
 * 不能做成"长着暂停脸的键"——那颗键只在磨耳朵页存在，这里的图标点了是导航。 */
.bn-ico.live::after {
  content: "";
  position: absolute;
  top: 1px;
  right: -7px;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--brand);
  animation: nav-dot 1.8s ease-in-out infinite;
}
@keyframes nav-dot {
  0%, 100% { opacity: 0.35; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1); }
}
.bn-cap {
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
}
/* ===== 槽位里的播放/暂停键（只在磨耳朵页出现） =====
 * 底栏唯一带颜色的元素，也是全站最容易够到的一颗键。
 * 它是 <span>：整格是一个 <button>（tab），键只是这颗 tab 的"脸"——
 * 三个 tab 结构一致，基线、灰底、焦点环都不会再各走一套。
 * 宽度用 --tap-min：儿童手指定位精度低，这颗键会是他们按得最多的一个。 */
.bn-play {
  display: flex;
  align-items: center;
  justify-content: center;
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
