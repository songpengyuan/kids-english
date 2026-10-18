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
 *  · 横向 padding 由外层 .view / .player 提供，去掉各处重复叠加的那一层
 *    （此前内容实际被内缩了 2 倍 --pad-x，iPad 上尤其明显）；
 *  · 所有色值/字号/圆角/层级改为 token。
 *
 * 2026-10-17 播放页（歌词全屏页）重做成"唱片页"：
 *  · 修掉最硬的一处缺陷——**这台播放器上原本没有播放/暂停**：控制被整体挪给了
 *    底部迷你播放条（底栏那颗 30px 的小圆键），页面只剩一颗没有文案的"播放列表"圆钮。
 *    现在 transport 回到页面里：上一首 / 72px 主播放键 / 下一首，播放列表挪到顶栏右侧。
 *  · 一屏三问：① 听的是哪首（大封面 + 歌名）→ ② 唱到哪（歌词）→ ③ 我要干嘛（主播放键）。
 *  · 歌词从"一整面 2.2 行高的灰字"改成卡拉 OK：当前行带药丸底 + 加粗 + 全不透明，
 *    其余行降到 55% 透明度，并把当前行自动滚到卡片正中（位置本身在说"唱到这里了"）。
 *  · 进度条只留这一条（底栏那条已随迷你播放条一起删掉），颜色回到进度语义色 --brand
 *    （原来是 accent-color: --yellow，与"进度=品牌"的规范相冲）；收起键给上可见的圆底。
 *
 * 2026-10-17 二改：**本页不再隐藏底部导航**。
 *  · 上一版的解法是"藏掉底栏"——播放页因此成了全站唯一没有导航的页面，只能靠
 *    左上角收起键退出，播着歌想切去学习就必须先收起。
 *  · 现在的解法是**浮层让位**：播放页从 inset:0 改成"底栏以上"（bottom = --nav-h + 安全区），
 *    底栏常显；万一哪天边界算错，底栏在 --z-floating(40)、浮层在 --z-bar(30)，
 *    仍是底栏压在上面 —— 不会重演"导航整条消失、孩子无路可退"的事故。
 *  · 补上播放模式（此前 store 里 repeatMode/shuffleOn 一直存在，界面上却没有入口）：
 *    随机 + 循环三档（顺序播放 → 列表循环 → 单曲循环），按钮带中文标注。
 */
import { ref, computed, watch, nextTick, onBeforeUnmount, onMounted } from "vue";
import { lessons, asset } from "../../data/lessons";
import { useProgressStore } from "../../stores/progress";
import { usePlayerStore } from "../../stores/player";
import {
  Play, Pause, X, ChevronDown, ListMusic, Music, Film, SkipBack, SkipForward,
  Repeat, Repeat1, Shuffle,
} from "@lucide/vue";
import BaseDrawer from "../../components/ui/BaseDrawer.vue";
import SegmentedTabs from "../../components/ui/SegmentedTabs.vue";
import EmojiTile from "../../components/ui/EmojiTile.vue";
import SpeakWave from "../../components/ui/SpeakWave.vue";
import type { ListenSubTab } from "../../types";

const player = usePlayerStore();
const progStore = useProgressStore();

/* ---------- 播放页的歌词（卡拉 OK，整篇可滚动） ---------- */

/** 当前唱到第几行（0 起；-1 = 这首没有歌词） */
const activeLine = computed(() => {
  const n = player.currentLyrics.length;
  if (!n) return -1;
  return Math.min(n - 1, Math.max(0, Math.round(player.progress * n)));
});

/* ===== 整篇歌词滚动（2026-10-18 按家长反馈从"固定 5 行窗"升级）=====
 * 完整歌词列表 + 当前行高亮 + 自动滚动跟随；家长手动滚动后 3 秒内
 * 不自动抢滚动（看完想看的那段，歌词自己"回来"）。 */
const lyricsEl = ref<HTMLElement | null>(null);
const userScrolling = ref(false);
let userScrollTimer = 0;
/** 程序滚动进行中的计数（smooth scroll 期间触发的 scroll 事件不算用户手势） */
let programmaticScrolls = 0;

function followActiveLine() {
  const box = lyricsEl.value;
  if (!box || activeLine.value < 0) return;
  const line = box.querySelector<HTMLElement>(`.pl-line[data-line="${activeLine.value}"]`);
  if (!line) return;
  const target = line.offsetTop - box.clientHeight / 2 + line.offsetHeight / 2;
  if (Math.abs(box.scrollTop - target) < 4) return;
  programmaticScrolls++;
  box.scrollTo({ top: target, behavior: "smooth" });
  window.setTimeout(() => (programmaticScrolls = Math.max(0, programmaticScrolls - 1)), 700);
}

function onLyricsScroll() {
  if (programmaticScrolls > 0) return;
  userScrolling.value = true;
  clearTimeout(userScrollTimer);
  userScrollTimer = window.setTimeout(() => (userScrolling.value = false), 3000);
}

watch(activeLine, () => {
  if (!userScrolling.value) followActiveLine();
});
watch(
  () => player.currentSong?.id,
  () => {
    userScrolling.value = false; // 换歌重新跟随
    nextTick(followActiveLine);
  }
);
onMounted(followActiveLine);

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

/**
 * 进页面拉一次云端：页面顶部「今天磨了 N 分钟」读的是 progress.todayStats，
 * 而它只会被 syncFromServer 合并刷新。之前只有启动 / 「我的」页 / 家长中心会拉，
 * 直接落在磨耳朵页（底栏中间位进来、或播放页返回）时读到的是本机 _daily，
 * 于是同一口令在另一台设备上显示 0 分钟 —— 数字会"看着像没同步"。
 */
onMounted(() => {
  void progStore.syncFromServer();
});
</script>

<template>
  <div class="listen view">
    <!-- ===== 播放页（唱片页；状态来自全局 store，跨路由保持） =====
         一屏三问：听的是哪首 → 唱到哪 → 我要干嘛。整页只有一颗主播放键。 -->
    <Transition name="lyrics">
      <div v-if="player.nowPlaying && player.currentSong" class="player">
        <!-- 顶栏只剩"页面级动作"：收起 / 播放列表（transport 不放在这里） -->
        <div class="pl-bar">
          <button class="pl-chip round" aria-label="收起歌词" @click="player.closeLyrics()">
            <ChevronDown class="k-ico" />
          </button>
          <button class="pl-chip round" aria-label="打开播放列表" @click="showPlaylist = true">
            <ListMusic class="k-ico" />
          </button>
        </div>

        <div class="pl-hero">
          <EmojiTile :emoji="player.currentSong.emoji" :tone="player.currentSong.tone" size="xl" />
          <p class="pl-title">{{ player.currentSong.title }}</p>
          <p class="pl-sub">{{ player.currentSong.titleZh }}</p>
        </div>

        <!-- 整篇歌词：当前行高亮 + 自动滚动跟随；家长可手动滚动（3s 后自动跟随恢复） -->
        <div class="pl-lyrics" ref="lyricsEl" @scroll.passive="onLyricsScroll">
          <div class="pl-lines">
            <template v-if="player.currentLyrics.length">
              <p
                v-for="(line, i) in player.currentLyrics"
                :key="i"
                class="pl-line"
                :class="{ on: i === activeLine }"
                :data-line="i"
              >{{ line }}</p>
            </template>
            <p v-else class="pl-line on">🎵</p>
          </div>
        </div>

        <!-- 播放模式：随机 + 循环三档（顺序播放 → 列表循环 → 单曲循环）。
             带中文标注而不是纯图标：孩子/家长都不用猜"这个圈圈箭头现在是哪种"。
             两者互斥（单曲循环 + 随机同亮 = 点了没反应），互斥规则在 store 里。 -->
        <div class="pl-modes">
          <button class="pl-mode" :class="{ on: player.shuffleOn }"
            :aria-pressed="player.shuffleOn" aria-label="随机播放" @click="player.toggleShuffle()">
            <Shuffle class="k-ico" />
            <span class="pl-mode-label">随机</span>
          </button>
          <button class="pl-mode" :class="{ on: player.repeatMode !== 'off' }"
            :aria-label="player.repeatLabel" @click="player.toggleRepeat()">
            <Repeat1 v-if="player.repeatMode === 'one'" class="k-ico" />
            <Repeat v-else class="k-ico" />
            <span class="pl-mode-label">{{ player.repeatLabel }}</span>
          </button>
        </div>

        <!-- transport：整页唯一的主行动就是中间那颗实底播放键 -->
        <div class="pl-transport">
          <button class="pl-side round" aria-label="上一首" @click="player.prev()">
            <SkipBack class="k-ico" />
          </button>
          <button class="pl-main round" :aria-label="player.playing ? '暂停' : '播放'" @click="player.togglePlay()">
            <Pause v-if="player.playing" class="k-ico" /><Play v-else class="k-ico" />
          </button>
          <button class="pl-side round" aria-label="下一首" @click="player.next()">
            <SkipForward class="k-ico" />
          </button>
        </div>

        <div class="pl-progress-row">
          <span class="pl-time">{{ player.formatTime(player.progress * player.duration) }}</span>
          <input class="pl-progress" type="range" aria-label="播放进度"
            :style="{ '--p': Math.round(player.progress * 100) + '%' }"
            :value="Math.round(player.progress * 100)" @input="player.seek" min="0" max="100" />
          <span class="pl-time">{{ player.formatTime(player.duration) }}</span>
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

/* ===== 播放页（唱片页） =====
 * 「一屏三问」：① 听的是哪首（封面 + 歌名）→ ② 唱到哪（歌词）→ ③ 我要干嘛（主播放键）。
 *
 * 下边界 = 底栏之上（--nav-h + 安全区），**不是 inset:0**：
 * 底栏常显，播着歌也能直接切 tab。这样"两个底部"不用互相躲 —— 浮层只占底栏之上的空间，
 * 而不是靠把底栏藏掉来腾地方（藏底栏的代价见 nav-visibility.ts 的事故记录）。
 * 层级上底栏 --z-floating(40) > 浮层 --z-bar(30)：即使以后边界算法被改坏，
 * 也是底栏压在浮层上，不会出现"整条导航消失"。
 */
.player {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: calc(var(--nav-h) + env(safe-area-inset-bottom));
  z-index: var(--z-bar);
  display: flex;
  flex-direction: column;
  gap: var(--gap-m);
  padding:
    max(var(--gap-s), env(safe-area-inset-top))
    var(--pad-x)
    var(--gap-m);
}
/* 顶栏只放"页面级动作"：收起在左、播放列表在右。
 * 两颗都是白底圆键——原来是透明底的图标，孩子看不出那里能点。 */
.pl-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pl-chip {
  width: var(--tap-min);
  height: var(--tap-min);
  background: var(--card-bg);
  color: var(--ink-soft);
  box-shadow: var(--shadow-soft);
  font-size: var(--fs-title);
}
/* 唱片区：封面是整页的主角（第①问） */
.pl-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-xs);
}
.pl-title {
  margin: var(--gap-s) 0 0;
  text-align: center;
  color: var(--ink);
  font-weight: var(--fw-strong);
  font-size: var(--fs-title);
}
.pl-sub {
  margin: 0;
  text-align: center;
  color: var(--ink-soft);
  font-weight: var(--fw-mid);
  font-size: var(--fs-small);
}
/* 歌词卡：整篇可滚动（家长手动滑 / 播放时自动跟随当前行）。
 * flex:1 + min-height:0 吃掉剩余高度；内层 .pl-lines 用 margin-block:auto
 * 安全居中——行数少时垂直居中，行数多溢出时可滚（auto margin 溢出时自动归零，
 * 不会像 justify-content:center 那样把顶部内容裁进摸不到的区域）。 */
.pl-lyrics {
  position: relative; /* 行的 offsetTop 以此为基准，供自动滚动计算 */
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none; /* 孩子界面不露滚动条，滚动手感保留 */
  padding: var(--gap-m) var(--gap-s);
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  text-align: left;
}
.pl-lyrics::-webkit-scrollbar {
  display: none;
}
.pl-lines {
  margin-block: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pl-line {
  margin: 0;
  padding: var(--gap-s) var(--gap-m);
  border-radius: var(--radius-pill);
  color: var(--ink);
  font-weight: var(--fw-mid);
  font-size: var(--fs-body);
  line-height: 1.6;
  opacity: 0.45;
  transition: opacity var(--dur-base), background var(--dur-base);
}
.pl-line.on {
  background: var(--brand-soft);
  font-weight: var(--fw-strong);
  opacity: 1;
}
/* 播放模式行：随机 + 循环三档。
 * 做成"图标 + 中文"的胶囊而不是纯图标：模式是抽象概念，只有图标时
 * 三种循环状态（顺序/列表循环/单曲循环）长得几乎一样，必须靠文字区分。
 * 未激活时降到次级文字色、激活时品牌色 + 品牌浅底，与「当前行」那套高亮语言一致。 */
.pl-modes {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--gap-m);
}
.pl-mode {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-xs);
  padding: var(--gap-xs) var(--gap-m);
  border-radius: var(--radius-pill);
  background: var(--card-bg);
  color: var(--ink-soft);
  box-shadow: var(--shadow-soft);
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
}
.pl-mode.on {
  background: var(--brand-soft);
  color: var(--brand);
  font-weight: var(--fw-strong);
}
.pl-mode-label {
  line-height: 1;
}

/* transport：中间实底主键 + 立体厚度（整页唯一的主行动），两侧降为白底圆键 */
.pl-transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--gap-l);
}
.pl-side {
  width: var(--tap-min);
  height: var(--tap-min);
  background: var(--card-bg);
  color: var(--ink-soft);
  box-shadow: var(--shadow-soft);
  font-size: var(--fs-title);
}
.pl-main {
  width: var(--play-btn);
  height: var(--play-btn);
  background: var(--brand);
  color: var(--on-tone);
  box-shadow: 0 var(--press) 0 var(--brand-dark), var(--shadow-soft);
  font-size: var(--fs-hero);
}
.pl-progress-row {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
}
/* 进度：色回到进度语义色 --brand（原来写 accent-color: --yellow，
 * 与"进度/导航类用品牌色"的规范相冲）。
 * 也不用原生 accent-color：它跟着 UA 与 color-scheme 变（无头 Chrome 下整条轨道
 * 渲染成深色），显式画轨道与拇指才能各浏览器一致，也才把拇指做大给孩子按。 */
.pl-progress {
  flex: 1;
  height: var(--slider-thumb);
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
}
/* 已播段实底品牌色、未播段浅色，用模板注入的 --p（百分比）切分 */
.pl-progress::-webkit-slider-runnable-track {
  height: var(--gap-xs);
  border-radius: var(--radius-pill);
  background: linear-gradient(90deg, var(--brand) 0 var(--p), var(--line) var(--p) 100%);
}
.pl-progress::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: var(--slider-thumb);
  height: var(--slider-thumb);
  margin-top: calc((var(--gap-xs) - var(--slider-thumb)) / 2);
  border: 3px solid var(--card-bg);
  border-radius: var(--radius-pill);
  background: var(--brand);
  box-shadow: var(--shadow-soft);
}
.pl-progress::-moz-range-track {
  height: var(--gap-xs);
  border-radius: var(--radius-pill);
  background: var(--line);
}
.pl-progress::-moz-range-progress {
  height: var(--gap-xs);
  border-radius: var(--radius-pill);
  background: var(--brand);
}
.pl-progress::-moz-range-thumb {
  width: var(--slider-thumb);
  height: var(--slider-thumb);
  border: 3px solid var(--card-bg);
  border-radius: var(--radius-pill);
  background: var(--brand);
}
.pl-time {
  min-width: 3em;
  text-align: center;
  color: var(--ink-faint);
  font-weight: var(--fw-mid);
  font-size: var(--fs-small);
  font-variant-numeric: tabular-nums;
}

/* ===== iPad 横屏 / 桌面：单列必溢出，改双栏 =====
 * 根因（2026-10-17 反馈"播放页看不到播放键"）：单列总高约 850px，
 * 而浮层只有 视口-底栏 ≈ 652px（iPad 横屏 1024×768、--nav-h=116）——
 * flex 收缩压不掉固定尺寸的 transport，主播放键 bottom=809 直接被裁出视口。
 * 解法：宽横屏用 grid 两栏，左列封面+模式+控制+进度，右列歌词卡占满整高。
 * 用 grid-area 重排而**不动 DOM**：手机竖屏的单列节奏（封面→歌词→控制）原样保留。
 * 行分布 1fr 给 hero 行：封面在左列垂直居中，控制键贴底（拇指落点）。 */
@media (min-width: 768px) and (orientation: landscape) {
  .player {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
    grid-template-rows: auto minmax(0, 1fr) auto auto auto;
    grid-template-areas:
      "bar bar"
      "hero lyrics"
      "modes lyrics"
      "transport lyrics"
      "progress lyrics";
    column-gap: var(--gap-l);
    align-content: stretch;
  }
  .pl-bar { grid-area: bar; }
  .pl-hero { grid-area: hero; align-self: center; }
  .pl-lyrics {
    grid-area: lyrics;
    height: 100%;
  }
  .pl-modes { grid-area: modes; }
  .pl-transport { grid-area: transport; }
  .pl-progress-row { grid-area: progress; }
}

/* ===== 手机横屏（tiny）兜底：竖排塞不下，砍装饰保控制 =====
 * 可用高约 290px：歌词窗（~290px）与播放模式行整块砍掉，标题/副标题并入封面行，
 * 间距收紧；overflow-y:auto 只做最后保险 —— 任何情况下 transport 不能被裁掉。 */
@media (max-height: 480px) {
  .player {
    gap: var(--gap-s);
    overflow-y: auto;
  }
  .pl-modes,
  .pl-lyrics,
  .pl-sub {
    display: none;
  }
  .pl-hero {
    flex: none;
    flex-direction: row;
    gap: var(--gap-m);
  }
  .pl-title {
    margin: 0;
    text-align: left;
  }
  .pl-hero :deep(.emoji-tile) {
    font-size: clamp(48px, 13vh, 64px);
  }
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
  /* 显式透明：全局 button 重置没重置 background，会带出浏览器默认浅灰底 */
  background: transparent;
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
