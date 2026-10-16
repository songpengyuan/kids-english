<script setup lang="ts">
/**
 * 磨耳朵（/listen）：歌曲列表 + 视频 tab。
 *
 * 歌曲播放已提升到全局 player store（audio 单例常驻），
 * 本页只负责：列表交互 / 歌词全屏页渲染 / 视频播放（局部）。
 * 切到其他 tab 播放不中断，底部播放条可随时控制。
 */
import { ref, computed, onBeforeUnmount } from "vue";
import { lessons, asset } from "../../data/lessons";
import { useProgressStore } from "../../stores/progress";
import { usePlayerStore } from "../../stores/player";
import { Play, Pause, X, ChevronDown, ListMusic } from "@lucide/vue";
import BaseDrawer from "../../components/ui/BaseDrawer.vue";
import SegmentedTabs from "../../components/ui/SegmentedTabs.vue";
import type { ListenSubTab } from "../../types";

const player = usePlayerStore();
const progStore = useProgressStore();

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
          <button class="lp-back" @click="player.closeLyrics()"><ChevronDown class="k-ico" /></button>
          <div class="lp-cover" :class="'tone-' + player.currentSong.tone">{{ player.currentSong.emoji }}</div>
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
          <button class="lp-btn" @click="showPlaylist = true"><ListMusic class="k-ico" /></button>
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
          :items="[
            { value: 'songs', label: '歌曲' },
            { value: 'videos', label: '视频' },
          ]"
          @update:model-value="(v: string) => switchTab(v as ListenSubTab)"
        />
      </div>
      <div class="body view-body">
        <template v-if="subTab === 'songs'">
          <div class="song-list">
            <div v-for="(s, i) in player.SONG_LIST" :key="s.id" class="song-row"
              :class="{ active: player.currentIdx === i }" @click="player.openLyrics(i)">
              <span class="sr-emoji" :class="'tone-' + s.tone">{{ s.emoji }}</span>
              <span class="sr-info">
                <span class="sr-title-row">
                  <span class="sr-title">{{ s.title }}</span>
                  <!-- 正在播放：标题旁动态声波（孩子一眼看出哪首在唱） -->
                  <span v-if="player.currentIdx === i && player.playing" class="eq" aria-hidden="true"><i></i><i></i><i></i></span>
                </span>
                <span class="sr-sub">{{ s.titleZh }}</span>
              </span>
              <button v-if="player.currentIdx === i" class="sr-play" @click="player.playFromRow(i)">
                <Pause v-if="player.playing" class="k-ico" /><Play v-else class="k-ico" />
              </button>
              <span v-else class="sr-play"><Play class="k-ico" /></span>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="video-grid">
            <button v-for="v in videoList" :key="v.id" class="video-card" :class="'tone-' + v.tone" @click="playVideo(v)">
              <span class="vc-emoji">{{ v.emoji }}</span>
              <span class="vc-name">{{ v.title }}</span>
              <span class="vc-sub">{{ v.titleZh }}</span>
              <span class="vc-play"><Play class="k-ico" /></span>
            </button>
          </div>
        </template>
      </div>
    </template>

    <!-- 播放列表抽屉 -->
    <BaseDrawer :open="showPlaylist" :title="`播放列表（${player.SONG_LIST.length}）`" @close="showPlaylist = false">
      <div class="drawer-list">
        <button v-for="(s, i) in player.SONG_LIST" :key="s.id" class="drawer-item"
          :class="{ active: player.currentIdx === i }" @click="player.playSong(i); showPlaylist = false">
          <span class="di-idx">{{ i + 1 }}</span>
          <span class="di-emoji">{{ s.emoji }}</span>
          <span class="di-info">
            <span class="di-title">{{ s.title }}</span>
            <span class="di-sub">{{ s.titleZh }}</span>
          </span>
          <span v-if="player.currentIdx === i && player.playing" class="eq"><i></i><i></i><i></i></span>
        </button>
      </div>
    </BaseDrawer>

    <!-- 视频播放 -->
    <div v-if="playingVideo" class="video-mask" @click.self="playingVideo = null">
      <button class="video-close" @click="playingVideo = null"><X class="k-ico" /></button>
      <video :src="playingVideo.src" controls autoplay playsinline preload="auto" class="video-player" />
      <p class="video-caption">{{ playingVideo.titleZh }} · {{ playingVideo.title }}</p>
    </div>
  </div>
</template>

<style scoped>
.body { display: flex; flex-direction: column; width: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: calc(80px + var(--pad-y)); }
.today-chip { text-align: center; font-weight: 800; font-size: var(--fs-small); color: var(--ink-soft); margin-top: max(8px, env(safe-area-inset-top)); }
.today-chip b { color: var(--brand); font-size: var(--fs-body); }
.sub-tabs { display: flex; gap: var(--gap-s); padding: 0 var(--pad-x); margin-top: var(--gap-s); }
.sub-tabs button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 0; border-radius: var(--radius-pill); background: var(--card-bg); box-shadow: var(--shadow-hard); font-weight: 800; font-size: var(--fs-small); color: var(--ink-faint); transition: all 0.2s; }
.sub-tabs button.on { background: var(--yellow); color: var(--ink); }
.sub-tabs .k-ico { width: 18px; height: 18px; }
.song-list { display: flex; flex-direction: column; gap: var(--gap-s); padding: var(--gap-s) var(--pad-x) 0; }
.song-row { display: flex; align-items: center; gap: var(--gap-m); background: var(--card-bg); border-radius: var(--radius); box-shadow: var(--shadow-hard); padding: var(--gap-s) var(--gap-m); text-align: left; transition: transform 0.08s; }
.song-row:active { transform: scale(0.98); }
.song-row.active { box-shadow: var(--shadow-hard), inset 0 0 0 2px var(--yellow); }
.sr-emoji { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 28px; flex: none; }
.sr-info { flex: 1; min-width: 0; }
.sr-title-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.sr-title { display: block; font-weight: 800; font-size: var(--fs-body); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sr-sub { display: block; font-size: var(--fs-small); color: var(--ink-faint); font-weight: 700; }
.sr-play { color: var(--ink-faint); }
.sr-play .k-ico { width: 22px; height: 22px; }
.eq { display: flex; gap: 2px; align-items: flex-end; height: 18px; }
.eq i { width: 3px; background: var(--brand); border-radius: 2px; animation: eq 0.8s ease-in-out infinite; }
.eq i:nth-child(1) { height: 10px; animation-delay: 0s; }
.eq i:nth-child(2) { height: 16px; animation-delay: 0.2s; }
.eq i:nth-child(3) { height: 7px; animation-delay: 0.4s; }
@keyframes eq { 0%,100% { transform: scaleY(0.5); } 50% { transform: scaleY(1.2); } }

/* ===== 歌词全屏页 ===== */
.lyrics-page {
  position: fixed; inset: 0; z-index: 30; /* 低于底部导航(40)：歌词抽屉下垫着常驻 tab 栏 */
  background: transparent;
  display: flex; flex-direction: column;
  padding: env(safe-area-inset-top) var(--pad-x) 0;
  gap: var(--gap-s);
}
.lp-header { display: flex; align-items: center; gap: var(--gap-m); padding: var(--gap-s) 0; }
.lp-back {
  width: var(--tap-min); height: var(--tap-min);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--ink-soft); background: transparent;
  flex: none;
}
.lp-back .k-ico { width: 28px; height: 28px; }
.lp-cover {
  width: 56px; height: 56px; border-radius: var(--radius-s);
  display: flex; align-items: center; justify-content: center;
  font-size: 32px; flex: none;
}
.lp-title-area { flex: 1; min-width: 0; }
.lp-title { margin: 0; color: var(--ink); font-weight: 900; font-size: var(--fs-title); }
.lp-sub { margin: 2px 0 0; color: var(--ink-soft); font-weight: 700; font-size: var(--fs-small); }
.lp-lyrics {
  flex: 1; overflow-y: auto;
  padding: var(--gap-l) var(--gap-m);
  background: var(--card-bg); border-radius: var(--radius); box-shadow: var(--shadow-hard);
  text-align: left; -webkit-overflow-scrolling: touch;
}
.lp-line { color: var(--ink-faint); font-weight: 700; font-size: var(--fs-body); line-height: 2.2; transition: all 0.3s; }
.lp-line.active { color: var(--ink); font-weight: 900; }
.lp-controls { display: flex; align-items: center; justify-content: center; gap: var(--gap-m); padding: var(--gap-s) 0; }
.lp-btn {
  width: var(--tap-min); height: var(--tap-min); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--ink-soft); background: var(--card-bg); box-shadow: var(--shadow-soft);
}
.lp-btn .k-ico { width: 26px; height: 26px; }
.lp-progress-row {
  display: flex; align-items: center; gap: var(--gap-s);
  padding-left: var(--pad-x); padding-right: var(--pad-x);
  /* 底部常驻导航（fixed）预留高度 + 全面屏 Home 条安全距离 */
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 72px);
}
.lp-progress { flex: 1; accent-color: var(--yellow); height: 6px; }
.lp-time { font-size: 11px; font-weight: 700; color: var(--ink-faint); min-width: 36px; text-align: center; }

/* 歌词全屏页 = 抽屉：进入/收起都从底部丝滑滑出 */
.lyrics-enter-active { transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.32s ease; }
.lyrics-leave-active { transition: transform 0.26s cubic-bezier(0.4, 0, 0.6, 1), opacity 0.26s ease; }
.lyrics-enter-from, .lyrics-leave-to { transform: translateY(100%); opacity: 0; }

/* 播放列表抽屉内容 */
.drawer-list { padding: 8px 0; }
.drawer-item { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 20px; text-align: left; }
.drawer-item:active { background: var(--tint-green); }
.drawer-item.active .di-title { color: var(--brand); }
.di-idx { width: 20px; text-align: center; color: var(--ink-faint); font-weight: 700; font-size: 13px; flex: none; }
.di-emoji { font-size: 24px; flex: none; }
.di-info { flex: 1; min-width: 0; }
.di-title { display: block; color: var(--ink); font-weight: 700; font-size: 15px; }
.di-sub { display: block; color: var(--ink-faint); font-size: 12px; }

/* 视频 */
.video-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gap-s); padding: var(--gap-s) var(--pad-x) 0; }
.video-card { position: relative; border-radius: var(--radius); padding: var(--gap-m); display: flex; flex-direction: column; align-items: center; gap: 4px; box-shadow: var(--shadow-hard); min-height: 120px; transition: transform 0.08s; }
.video-card:active { transform: scale(0.96); }
.vc-emoji { font-size: 44px; }
.vc-name { font-weight: 900; font-size: var(--fs-body); }
.vc-sub { font-size: var(--fs-small); color: var(--ink-faint); font-weight: 700; }
.vc-play { position: absolute; bottom: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%; background: rgba(0,0,0,0.4); color: #fff; display: flex; align-items: center; justify-content: center; }
.vc-play .k-ico { width: 14px; height: 14px; }
.video-mask { position: fixed; inset: 0; z-index: 99; background: rgba(0,0,0,0.92); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--gap-s); }
.video-close { position: absolute; top: 14px; right: 14px; width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.2); color: #fff; display: flex; align-items: center; justify-content: center; }
.video-player { max-width: 95vw; max-height: 70vh; border-radius: 8px; }
.video-caption { color: #ccc; margin: 0; font-weight: 700; }
</style>
