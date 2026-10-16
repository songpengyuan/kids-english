<script setup lang="ts">
/**
 * 磨耳朵（/listen）：歌曲列表 + 视频 tab。
 *
 * 歌曲播放已提升到全局 player store（audio 单例常驻），
 * 本页只负责：列表交互 / 歌词全屏页渲染 / 视频播放（局部）。
 * 切到其他 tab 播放不中断，底部播放条可随时控制。
 *
 * 2026-10 设计系统统一：
 *  · 行内"正在播放"声波改用共享的 SpeakWave 组件（原来本页自己写了一份 .eq，
 *    和 MatchView / QuizView / Hero 详情页那份是同一套动画的第四份拷贝）；
 *  · emoji 封面改用共享的 EmojiTile（歌词页封面 + 列表行封面原本各写一份）；
 *  · 列表行改用全局 .entry-row 骨架（此前和"家长中心/闯关入口"那几处各写一套）；
 *  · 横向 padding 由外层 .view / .lyrics-page 提供，去掉各处重复叠加的那一层
 *    （此前内容实际被内缩了 2 倍 --pad-x，iPad 上尤其明显）；
 *  · 所有色值/字号/圆角/层级改为 token。
 */
import { ref, computed, onBeforeUnmount } from "vue";
import { lessons, asset } from "../../data/lessons";
import { useProgressStore } from "../../stores/progress";
import { usePlayerStore } from "../../stores/player";
import { Play, Pause, X, ChevronDown, ListMusic, Music, Film } from "@lucide/vue";
import BaseDrawer from "../../components/ui/BaseDrawer.vue";
import SegmentedTabs from "../../components/ui/SegmentedTabs.vue";
import EmojiTile from "../../components/ui/EmojiTile.vue";
import SpeakWave from "../../components/ui/SpeakWave.vue";
import type { ListenSubTab } from "../../types";

const player = usePlayerStore();
const progStore = useProgressStore();

/** tab 定义提到 setup 顶层，避免每次渲染新建数组导致子组件 props 反复 diff */
const TABS = [
  { value: "songs", label: "歌曲", icon: Music },
  { value: "videos", label: "视频", icon: Film },
];

const subTab = ref<ListenSubTab>("songs");
function switchTab(t: ListenSubTab) {
  subTab.value = t;
  player.closeLyrics();
  playingVideo.value = null;
}
const showPlaylist = ref(false);

const videoList = computed(() =>
  lessons.filter((l) => l.song.video && !["l6", "l7", "l8"].includes(l.id)).map((l) => ({
    id: l.id, title: l.title, titleZh: l.titleZh, emoji: l.emoji,
    tone: l.tone ?? "blue", src: asset(l.song.video)!,
  }))
);

/* ---------- 视频播放（局部全屏；计时独立，不影响歌曲全局计时） ---------- */
const playingVideo = ref<{ src: string; titleZh: string; title: string } | null>(null);
let videoTimer: number | null = null;
let videoTick = 0;
/** 结算式视频计时：后台标签页 setInterval 被节流也不丢时长（与音频一致） */
function playVideo(v: { src: string; titleZh: string; title: string }) {
  playingVideo.value = v;
  stopVideoTimer();
  videoTick = Date.now();
  videoTimer = window.setInterval(() => {
    const sec = (Date.now() - videoTick) / 1000;
    videoTick = Date.now();
    if (sec > 0.5) progStore.addListenActivity(sec);
  }, 5000);
}
function stopVideoTimer() {
  if (videoTimer) {
    clearInterval(videoTimer);
    videoTimer = null;
  }
  // 尾部结算：停止时把最后一次 tick 到现在的真实秒数补入（>0.5s 才记）
  if (videoTick) {
    const sec = (Date.now() - videoTick) / 1000;
    videoTick = 0;
    if (sec > 0.5) progStore.addListenActivity(sec);
  }
}
onBeforeUnmount(() => {
  stopVideoTimer();
  // 歌曲播放由全局 store 持有，本页卸载不暂停（跨 tab 续播）
});
</script>

<template>
  <div class="listen view">
    <!-- ===== 歌词全屏页（状态来自全局 store，跨路由保持） ===== -->
    <Transition name="lyrics">
      <div v-if="player.nowPlaying && player.currentSong" class="lyrics-page">
        <div class="lp-header">
          <button class="lp-back round" aria-label="收起歌词" @click="player.closeLyrics()">
            <ChevronDown class="k-ico" />
          </button>
          <EmojiTile :emoji="player.currentSong.emoji" :tone="player.currentSong.tone" />
          <div class="lp-title-area">
            <p class="lp-title">{{ player.currentSong.title }}</p>
            <p class="lp-sub">{{ player.currentSong.titleZh }}</p>
          </div>
        </div>
        <div class="lp-lyrics">
          <p v-for="(line, i) in player.currentLyrics" :key="i" class="lp-line"
            :class="{ active: Math.round(player.progress * player.currentLyrics.length) === i }">{{ line }}</p>
          <p v-if="player.currentLyrics.length === 0" class="lp-line">🎵</p>
        </div>
        <!-- 播放控制交给底部「磨耳朵」迷你播放条，这里只留播放列表入口 -->
        <div class="lp-controls">
          <button class="lp-btn round" aria-label="打开播放列表" @click="showPlaylist = true">
            <ListMusic class="k-ico" />
          </button>
        </div>
        <div class="lp-progress-row">
          <span class="lp-time">{{ player.formatTime(player.progress * player.duration) }}</span>
          <input class="lp-progress" type="range" :value="Math.round(player.progress * 100)" @input="player.seek" min="0" max="100" />
          <span class="lp-time">{{ player.formatTime(player.duration) }}</span>
        </div>
      </div>
    </Transition>

    <!-- ===== 列表页（无顶部 header）；非播放态显示 ===== -->
    <template v-if="!player.nowPlaying || !player.currentSong">
      <div class="today-chip">今天磨了 <b>{{ Math.floor((progStore.todayStats.listenSec ?? 0) / 60) }}</b> 分钟</div>
      <!-- 顶部 tab：与学习页「正式课/加餐」同款 SegmentedTabs -->
      <div class="type-tabs">
        <SegmentedTabs
          :model-value="subTab"
          :items="TABS"
          @update:model-value="(v: string) => switchTab(v as ListenSubTab)"
        />
      </div>
      <div class="view-body body">
        <template v-if="subTab === 'songs'">
          <div class="song-list">
            <div v-for="(s, i) in player.SONG_LIST" :key="s.id" class="entry-row song-row"
              :class="{ on: player.currentIdx === i }" @click="player.openLyrics(i)">
              <EmojiTile :emoji="s.emoji" :tone="s.tone" />
              <span class="entry-row__body">
                <span class="sr-title-row">
                  <span class="entry-row__title sr-title">{{ s.title }}</span>
                  <!-- 正在播放：标题旁动态声波（孩子一眼看出哪首在唱） -->
                  <SpeakWave v-if="player.currentIdx === i && player.playing" size="sm" tone="var(--brand)" />
                </span>
                <span class="entry-row__desc">{{ s.titleZh }}</span>
              </span>
              <button v-if="player.currentIdx === i" class="sr-play" aria-label="播放/暂停" @click.stop="player.playFromRow(i)">
                <Pause v-if="player.playing" class="k-ico" /><Play v-else class="k-ico" />
              </button>
              <span v-else class="sr-play sr-play--idle"><Play class="k-ico" /></span>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="video-grid">
            <button v-for="v in videoList" :key="v.id" class="video-card" :class="'tone-' + v.tone" @click="playVideo(v)">
              <span class="vc-emoji" aria-hidden="true">{{ v.emoji }}</span>
              <span class="vc-name">{{ v.title }}</span>
              <span class="vc-sub">{{ v.titleZh }}</span>
              <span class="vc-play round"><Play class="k-ico" /></span>
            </button>
          </div>
        </template>
      </div>
    </template>

    <!-- 播放列表抽屉 -->
    <BaseDrawer :open="showPlaylist" :title="`播放列表（${player.SONG_LIST.length}）`" @close="showPlaylist = false">
      <div class="drawer-list">
        <button v-for="(s, i) in player.SONG_LIST" :key="s.id" class="drawer-item"
          :class="{ on: player.currentIdx === i }" @click="player.playSong(i); showPlaylist = false">
          <span class="di-idx">{{ i + 1 }}</span>
          <span class="di-emoji" aria-hidden="true">{{ s.emoji }}</span>
          <span class="di-info">
            <span class="di-title">{{ s.title }}</span>
            <span class="di-sub">{{ s.titleZh }}</span>
          </span>
          <SpeakWave v-if="player.currentIdx === i && player.playing" size="sm" tone="var(--brand)" />
        </button>
      </div>
    </BaseDrawer>

    <!-- 视频播放 -->
    <div v-if="playingVideo" class="video-mask" @click.self="playingVideo = null">
      <button class="video-close round" aria-label="关闭视频" @click="playingVideo = null">
        <X class="k-ico" />
      </button>
      <video :src="playingVideo.src" controls autoplay playsinline preload="auto" class="video-player" />
      <p class="video-caption">{{ playingVideo.titleZh }} · {{ playingVideo.title }}</p>
    </div>
  </div>
</template>

<style scoped>
.body {
  display: flex;
  flex-direction: column;
  width: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.today-chip {
  text-align: center;
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
  color: var(--ink-soft);
  margin-top: max(var(--gap-s), env(safe-area-inset-top));
}
.today-chip b {
  color: var(--brand);
  font-size: var(--fs-body);
}
/* 顶部 tab 容器：与学习页「正式课/加餐」一致 */
.type-tabs {
  margin: var(--gap-s) 0 var(--gap-m);
}
.song-list {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
}
/* 列表行骨架来自全局 .entry-row；这里只补"正在播放"的态 */
.song-row.on {
  box-shadow: var(--shadow-hard), inset 0 0 0 2px var(--brand);
}
.sr-title-row {
  display: flex;
  align-items: center;
  gap: var(--gap-xs);
  min-width: 0;
}
.sr-title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sr-play {
  font-size: var(--fs-title);
  color: var(--brand);
  background: none;
  padding: 0;
  flex: none;
}
.sr-play--idle {
  color: var(--ink-faint);
}

/* ===== 歌词全屏页 ===== */
.lyrics-page {
  position: fixed;
  inset: 0;
  /* 低于底部导航：歌词页下垫着常驻 tab 栏，随时能切走 */
  z-index: var(--z-bar);
  background: transparent;
  display: flex;
  flex-direction: column;
  padding: env(safe-area-inset-top) var(--pad-x) 0;
  gap: var(--gap-s);
}
.lp-header {
  display: flex;
  align-items: center;
  gap: var(--gap-m);
  padding: var(--gap-s) 0;
}
.lp-back {
  width: var(--tap-min);
  height: var(--tap-min);
  color: var(--ink-soft);
  background: transparent;
  font-size: var(--fs-hero);
}
.lp-title-area {
  flex: 1;
  min-width: 0;
}
.lp-title {
  margin: 0;
  color: var(--ink);
  font-weight: var(--fw-strong);
  font-size: var(--fs-title);
}
.lp-sub {
  margin: var(--gap-xs) 0 0;
  color: var(--ink-soft);
  font-weight: var(--fw-mid);
  font-size: var(--fs-small);
}
.lp-lyrics {
  flex: 1;
  overflow-y: auto;
  padding: var(--gap-l) var(--gap-m);
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  text-align: left;
  -webkit-overflow-scrolling: touch;
}
.lp-line {
  color: var(--ink-faint);
  font-weight: var(--fw-mid);
  font-size: var(--fs-body);
  line-height: 2.2;
  transition: color var(--dur-base);
}
.lp-line.active {
  color: var(--ink);
  font-weight: var(--fw-strong);
}
.lp-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--gap-m);
  padding: var(--gap-s) 0;
}
.lp-btn {
  width: var(--tap-min);
  height: var(--tap-min);
  color: var(--ink-soft);
  background: var(--card-bg);
  box-shadow: var(--shadow-soft);
  font-size: var(--fs-title);
}
.lp-progress-row {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  /* 底部常驻导航（fixed）预留高度 + 全面屏 Home 条安全距离 */
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--nav-h));
}
.lp-progress {
  flex: 1;
  accent-color: var(--yellow);
  height: var(--gap-xs);
}
.lp-time {
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  color: var(--ink-faint);
  min-width: 3em;
  text-align: center;
}

/* 歌词全屏页 = 抽屉：进入/收起都从底部丝滑滑出（大元素位移 → --dur-slow） */
.lyrics-enter-active {
  transition: transform var(--dur-slow) var(--ease-out), opacity var(--dur-slow) ease;
}
.lyrics-leave-active {
  transition: transform var(--dur-base) var(--ease-in-out), opacity var(--dur-base) ease;
}
.lyrics-enter-from,
.lyrics-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

/* 播放列表抽屉内容 */
.drawer-list {
  padding: var(--gap-s) 0;
}
.drawer-item {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  width: 100%;
  padding: var(--gap-s) var(--gap-m);
  text-align: left;
}
.drawer-item:active {
  background: var(--tint-green);
}
.drawer-item.on .di-title {
  color: var(--brand);
}
.di-idx {
  width: 1.6em;
  text-align: center;
  color: var(--ink-faint);
  font-weight: var(--fw-mid);
  font-size: var(--fs-small);
  flex: none;
}
.di-emoji {
  font-size: var(--fs-title);
  flex: none;
}
.di-info {
  flex: 1;
  min-width: 0;
}
.di-title {
  display: block;
  color: var(--ink);
  font-weight: var(--fw-mid);
  font-size: var(--fs-body);
}
.di-sub {
  display: block;
  color: var(--ink-faint);
  font-size: var(--fs-small);
}

/* 视频 */
.video-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--gap-s);
}
/* 彩色卡面由全局 .tone-* 注入；这里只描述卡片形状 */
.video-card {
  position: relative;
  border-radius: var(--radius);
  padding: var(--gap-m);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-xs);
  /* 卡片内容是固定的 emoji + 两行字，给个高度下限让网格两行等高、
   * 不至于在窄屏被压成扁条（结构性下限，不是样式值） */
  min-height: 120px;
  transition: transform var(--dur-fast) var(--ease-out);
}
.vc-emoji {
  font-size: var(--fs-emoji-xl);
  line-height: 1;
}
.vc-name {
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
  text-shadow: var(--tone-ink-shadow);
}
.vc-sub {
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  opacity: 0.85;
  text-shadow: var(--tone-ink-shadow);
}
/* 播放键：压在彩色卡面上的半透明黑底徽章（卡色深浅不定，只有固定黑幕能保证白图标对比度） */
.vc-play {
  position: absolute;
  bottom: var(--gap-s);
  right: var(--gap-s);
  width: 2em;
  height: 2em;
  font-size: var(--fs-small);
  background: var(--scrim);
  color: var(--mask-ink);
}
.video-mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-mask);
  background: var(--mask-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--gap-s);
}
.video-close {
  position: absolute;
  top: var(--gap-m);
  right: var(--gap-m);
  width: var(--tap-min);
  height: var(--tap-min);
  font-size: var(--fs-title);
  background: var(--mask-control);
  color: var(--mask-ink);
}
.video-player {
  max-width: 95vw;
  max-height: 70vh;
  border-radius: var(--radius-s);
}
.video-caption {
  color: var(--mask-ink-soft);
  margin: 0;
  font-weight: var(--fw-mid);
}
</style>
