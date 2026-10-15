<script setup>
/**
 * 底部导航（App 风格常驻）：
 *   📖 学习 / 🎧 播放条（磨耳朵入口 + 全局播放控制）/ 👤 我的
 *
 * - 学习是独立路由 #/learn；游戏入口收在学习页右上角按钮（非底部主 tab）。
 * - 中间位：未播放时是「磨耳朵」入口按钮；播放中升级为迷你播放条
 *   （当前歌 + 进度 + 播放/暂停），点击展开歌词页——切到任何 tab 歌不停。
 * - 我的 tab 高亮覆盖其子页：/me、/treasure、/report、/review。
 * - 玩法页（/learn/:id）不渲染本组件（沉浸学习，见 App.vue）。
 */
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import PathIcon from "../PathIcon.vue";
import { speakZh } from "../../services/speech";
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
  speakZh("学习");
  if (isHome.value) return;
  void router.push("/learn").catch(() => {});
}
function goMe() {
  speakZh("我的");
  if (route.name === "me") return;
  void router.push("/me").catch(() => {});
}
/** 磨耳朵入口（未播放时点这里进列表页） */
function goListen() {
  speakZh("磨耳朵");
  if (isListen.value) return;
  void router.push("/listen").catch(() => {});
}
/** 播放条点击：展开歌词页（已播放时）；不在磨耳朵页先跳过去 */
function openPlayer() {
  const s = player.currentSong;
  if (!s) return;
  player.openLyrics(player.currentIdx);
  if (!isListen.value) void router.push("/listen").catch(() => {});
}
</script>

<template>
  <nav class="bottom-nav" role="tablist" aria-label="主导航">
    <button
      role="tab"
      aria-label="学习"
      :aria-selected="isHome"
      :class="{ on: isHome }"
      @click="goPractice"
    >
      <span class="bn-ico"><PathIcon name="free" /></span>
      <span class="bn-cap">学习</span>
    </button>

    <!-- 中间位：未播放 = 磨耳朵入口；播放中 = 迷你播放条 -->
    <button v-if="!player.currentSong" role="tab" aria-label="磨耳朵" :aria-selected="isListen"
      :class="{ on: isListen }" @click="goListen">
      <span class="bn-ico">🎧</span>
      <span class="bn-cap">磨耳朵</span>
    </button>
    <div v-else class="bn-player" :class="'tone-' + player.currentSong.tone" role="button"
      aria-label="正在播放，点击打开歌词页" @click="openPlayer">
      <span class="bp-emoji">{{ player.currentSong.emoji }}</span>
      <span class="bp-info">
        <span class="bp-title">{{ player.currentSong.title }}</span>
        <span class="bp-progress"><i :style="{ width: Math.round(player.progress * 100) + '%' }" /></span>
      </span>
      <button class="bp-btn" :aria-label="player.playing ? '暂停' : '播放'" @click.stop="player.togglePlay()">
        <Pause v-if="player.playing" class="k-ico" /><Play v-else class="k-ico" />
      </button>
    </div>

    <button role="tab" aria-label="我的" :aria-selected="isMe" :class="{ on: isMe }" @click="goMe">
      <span class="bn-ico"><PathIcon name="me" /></span>
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
  z-index: 40;
  margin-inline: auto;
  max-width: 1180px; /* 与 #app 同宽居中 */
  display: flex;
  gap: var(--gap-s);
  padding: 6px calc(var(--pad-x) + env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) calc(var(--pad-x) + env(safe-area-inset-left));
  /* 毛玻璃：与 HeaderBar 同一套 token（--bar-bg / --bar-blur） */
  background: var(--bar-bg, var(--bg));
  -webkit-backdrop-filter: blur(var(--bar-blur, 14px));
  backdrop-filter: blur(var(--bar-blur, 14px));
  box-shadow: 0 -2px 0 rgba(0, 0, 0, 0.06), 0 -6px 16px rgba(0, 0, 0, 0.05);
}
.bottom-nav button {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: clamp(4px, 1vh, 8px) 0;
  border-radius: var(--radius-s);
  font-weight: 800;
  font-size: 12px;
  color: var(--ink-faint);
  transition: background 0.2s, color 0.2s, transform 0.1s;
  /* 移动端：消除轻滑误判成滚动/双击缩放导致的 click 丢失（"有时点不过去"） */
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}
.bottom-nav button:active {
  transform: translateY(1px);
}
.bottom-nav button.on {
  color: var(--brand);
  background: var(--brand-soft);
}
.bn-ico {
  font-size: clamp(20px, min(3.4vh, 2.8vw), 28px);
  line-height: 1;
}
.bn-cap {
  font-size: 11px;
  font-weight: 800;
}
/* ===== 迷你播放条（播放中替换磨耳朵 tab） ===== */
.bn-player {
  flex: 1.35;
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  padding: 6px 8px;
  border-radius: 999px;
  background: var(--card-bg);
  box-shadow: var(--shadow-hard);
  min-width: 0;
  cursor: pointer;
  transition: transform 0.08s;
}
.bn-player:active {
  transform: translateY(1px);
}
.bp-emoji {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex: none;
}
.bp-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.bp-title {
  font-weight: 800;
  font-size: 12px;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bp-progress {
  display: block;
  height: 4px;
  border-radius: 2px;
  background: var(--line);
  overflow: hidden;
}
.bp-progress i {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--green);
  transition: width 0.3s linear;
}
.bp-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--green);
  color: #fff;
  flex: none;
  padding: 0;
}
.bp-btn .k-ico {
  width: 18px;
  height: 18px;
}
/* 宽屏档：图标/文字更大（iPad/Mac） */
@media (min-width: 768px) {
  .bottom-nav button {
    font-size: 14px;
  }
  .bn-ico {
    font-size: clamp(24px, min(4vh, 3.2vw), 34px);
  }
  .bn-cap {
    font-size: 13px;
  }
  .bp-title {
    font-size: 13px;
  }
}
</style>
