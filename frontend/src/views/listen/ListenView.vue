<script setup lang="ts">
/**
 * 磨耳朵（/listen）：先选课，再进课程播放页。
 *
 * 2026-11 信息架构改造（用户确认）：
 *  · 首页不再按「歌曲 / 视频 / 词句」分三个 tab —— 这三种是同一课的消费方式，
 *    不是三门内容。首页只留课程列表，点课后进同一个播放页。
 *  · 播放页共用一行课程标题（封面 + 课名 + 进度），下面才是「歌曲 / 视频 / 词句」
 *    分段切换；切换不换课，默认落在歌曲。
 *  · 歌曲仍由全局 player store 持有，跨 tab 续播；但播放队列收窄到当前课程，
 *    上一首/下一首不再串到别的课。
 *  · 视频 / 词句播放器改为 embedded 模式：不再各自铺一层浮层和关闭按钮，
 *    共用播放页的页头与模式切换。
 *
 * 历史（2026-10 播放页）：歌词卡拉 OK、当前行自动跟随、歌曲模式单键三档循环；
 * 2026-10-17 起播放页不再隐藏底部导航（下边界抬到底栏之上，底栏常显）。
 */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import { lessons, type Lesson } from "../../data/lessons";
import { useProgressStore } from "../../stores/progress";
import { emojiCoverUrl } from "../../utils/emojiCover";
import { trackCover } from "../../utils/trackCover";
import { usePlayerStore } from "../../stores/player";
import { useLrc, activeLrcIndex, mapLrcToLyrics } from "../../composables/useLrc";
import { hapticTap } from "../../services/haptics";
import { speakZh } from "../../services/speech";
import {
  Play, Pause, ChevronDown, ListMusic, Music, Film, SkipBack, SkipForward,
  Repeat, Repeat1, Shuffle, BookOpen,
} from "@lucide/vue";
import BaseDrawer from "../../components/ui/BaseDrawer.vue";
import SegmentedTabs from "../../components/ui/SegmentedTabs.vue";
import EmojiTile from "../../components/ui/EmojiTile.vue";
import SpeakWave from "../../components/ui/SpeakWave.vue";
import VideoPlayer, { type VideoItem } from "../../components/listen/VideoPlayer.vue";
import LessonClipPlayer from "../../components/listen/LessonClipPlayer.vue";
import type { ListenSubTab } from "../../types";

const player = usePlayerStore();
const progStore = useProgressStore();
const router = useRouter();

/* ---------- 播放模式：单按钮三档循环（随机 → 列表循环 → 单曲循环 → 随机） ---------- */
const modeIcon = computed(() => {
  if (player.shuffleOn) return Shuffle;
  return player.repeatMode === "one" ? Repeat1 : Repeat;
});
const modeLabel = computed(() => {
  if (player.shuffleOn) return "随机";
  return player.repeatMode === "one" ? "单曲循环" : "列表循环";
});

/* ---------- 播放页的歌词（卡拉 OK，整篇可滚动） ---------- */
const lrcLines = useLrc(computed(() => player.currentSong?.src ?? null));
const lrcMap = computed(() => {
  const lrc = lrcLines.value;
  if (!lrc) return null;
  return mapLrcToLyrics(lrc, player.currentLyrics);
});

/** 当前唱到第几行（0 起；-1 = 这首没有歌词 / 还没开唱） */
const activeLine = computed(() => {
  const map = lrcMap.value;
  if (map && player.duration > 0) {
    const k = activeLrcIndex(lrcLines.value ?? [], player.progress * player.duration);
    return k < 0 ? -1 : map[k];
  }
  const n = player.currentLyrics.length;
  if (!n) return -1;
  return Math.min(n - 1, Math.max(0, Math.round(player.progress * n)));
});

/* ===== 整篇歌词滚动 =====
 * 完整歌词列表 + 当前行高亮 + 自动滚动跟随；家长手动滚动后 3 秒内
 * 不自动抢滚动（看完想看的那段，歌词自己"回来"）。 */
const lyricsEl = ref<HTMLElement | null>(null);
const userScrolling = ref(false);
let userScrollTimer = 0;
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
    userScrolling.value = false;
    nextTick(followActiveLine);
  }
);

/* ---------- 课程播放页：共用标题 + 页内模式切换 ---------- */
type PlayerMode = ListenSubTab;

/** 模式定义提到 setup 顶层，避免每次渲染新建数组导致子组件 props 反复 diff */
const MODE_TABS = [
  { value: "songs", label: "歌曲", icon: Music },
  { value: "videos", label: "视频", icon: Film },
  { value: "clips", label: "词句", icon: BookOpen },
];

const activeLesson = ref<Lesson | null>(null);
const mode = ref<PlayerMode>("songs");
const showPlaylist = ref(false);
/** 离开歌曲模式前是否在播：切回歌曲时恢复，切走时先暂停，避免两路声音叠在一起 */
const songWasPlaying = ref(false);

/** 当前课在全局 SONG_LIST 里的曲目（多轨课会展开成多条） */
function songEntriesFor(l: Lesson | null) {
  if (!l) return [];
  return player.SONG_LIST
    .map((song, index) => ({ song, index }))
    .filter(({ song }) => song.id === l.id || song.id.startsWith(`${l.id}-t`));
}
function songIndicesFor(l: Lesson | null) {
  return songEntriesFor(l).map((e) => e.index);
}
const courseSongs = computed(() => songEntriesFor(activeLesson.value));

function lessonForSongId(id: string | undefined): Lesson | null {
  if (!id) return null;
  const lid = id.replace(/-t\d+$/, "");
  return lessons.find((l) => l.id === lid) ?? null;
}

/** 把播放页落到当前歌所属的课程（从别的 tab 回到磨耳朵时也走这里）。
 *  2026-11-13 课程级口径：不再把播放队列锁进单课——循环/下一首都走全站
 *  SONG_LIST（跨课连续磨），页头靠 currentSong watcher 跟着歌走。 */
function adoptCurrentSong() {
  const l = lessonForSongId(player.currentSong?.id);
  if (!l) return;
  activeLesson.value = l;
  mode.value = "songs";
}

function openCourse(l: Lesson) {
  hapticTap();
  activeLesson.value = l;
  mode.value = "songs";
  songWasPlaying.value = false;
  const indices = songIndicesFor(l);
  if (!indices.length) return;
  const start = indices.includes(player.currentIdx) ? player.currentIdx : indices[0];
  player.openLyrics(start);
}

function closePlayer() {
  hapticTap();
  player.closeLyrics();
  player.clearQueue();
  activeLesson.value = null;
  mode.value = "songs";
  showPlaylist.value = false;
}

function switchMode(next: PlayerMode) {
  if (next === mode.value || !activeLesson.value) return;
  hapticTap();
  if (mode.value === "songs") {
    songWasPlaying.value = player.playing;
    if (player.playing) player.togglePlay();
    player.closeLyrics();
  }
  if (next === "songs") {
    const indices = songIndicesFor(activeLesson.value);
    const start = indices.includes(player.currentIdx) ? player.currentIdx : indices[0];
    if (start !== undefined) player.openLyrics(start);
    if (songWasPlaying.value && !player.playing) player.togglePlay();
  }
  // 视频/词句是跨课流播放器：主动进入（含换课进入）时 epoch+1 重挂，
  // 落到当前课的起点；之后播完跨课推进不重挂，无缝续播
  if (next === "videos") videoEpoch.value++;
  if (next === "clips") clipsEpoch.value++;
  mode.value = next;
}

function playTrack(index: number) {
  hapticTap();
  mode.value = "songs";
  songWasPlaying.value = true;
  player.playSong(index);
  showPlaylist.value = false;
}

/** 当前歌所属课时 id（「去这一课」） */
const currentLessonId = computed(() => player.currentSong?.id.replace(/-t\d+$/, "") ?? null);
function goCurrentLesson() {
  hapticTap();
  speakZh("去看看这一课");
  const lid = currentLessonId.value;
  if (lid) router.push(`/course/${lid}`);
}

/* ---------- 视频 / 词句：跨课程连续流（2026-11-13 课程级口径） ----------
 * 循环与上一/下一都在全部课程的池上转，播完一课自动续到下一课；
 * 页头（activeLesson）由播放器的 change 事件跟随落到当前内容所属课程。
 * videoEpoch/clipsEpoch 只在「用户主动进入该形态」时 +1 重挂（起点=当前课），
 * 跨课推进不改 epoch——组件不重挂，播放不中断。 */
function videosOf(l: Lesson): VideoItem[] {
  const first = l.song.video
    ? [{
        id: l.id, title: l.song.title || l.title, titleZh: l.titleZh, emoji: l.emoji,
        tone: l.tone ?? "blue", src: l.song.video,
      }]
    : [];
  const extras = (l.song.tracks || [])
    .filter((t) => t.video)
    .map((t, i) => {
      const cover = trackCover(t.group, l.emoji, l.tone ?? "blue");
      return {
        id: `${l.id}-t${i + 2}`,
        title: t.title,
        titleZh: t.titleZh || l.titleZh,
        emoji: cover.emoji,
        tone: cover.tone,
        src: t.video!,
      };
    });
  return [...first, ...extras];
}
const allVideos = lessons.flatMap(videosOf);
const videoEpoch = ref(0);
const clipsEpoch = ref(0);
const videoStartIdx = computed(() => {
  const lid = activeLesson.value?.id;
  if (!lid) return 0;
  const i = allVideos.findIndex((v) => v.id === lid || v.id.startsWith(`${lid}-t`));
  return i >= 0 ? i : 0;
});

/** 视频/词句跨课推进 → 页头落到新课程（不重挂播放器） */
function onVideoChange(idx: number) {
  const l = lessonForSongId(allVideos[idx]?.id);
  if (l) activeLesson.value = l;
}
function onClipChange(lessonId: string) {
  const l = lessons.find((x) => x.id === lessonId);
  if (l) activeLesson.value = l;
}

const lessonMeta = computed(() => {
  const l = activeLesson.value;
  if (!l) return "";
  return `${l.words.length} 个单词 · ${l.phrases.length} 句亲子口语`;
});
const currentTrackTitle = computed(() => player.currentSong?.title ?? activeLesson.value?.song.title ?? "");
const currentTrackSub = computed(() => player.currentSong?.titleZh ?? activeLesson.value?.titleZh ?? "");

onMounted(() => {
  void progStore.syncFromServer();
  // 从其他 tab 切回来时，有加载过的歌就直接落到正在播的课程播放页（2026-11-08 惯例）。
  // 只展开不重播：同曲 openLyrics 不会重置 audio.src。
  if (player.currentIdx >= 0) {
    adoptCurrentSong();
    if (!player.nowPlaying) player.nowPlaying = true;
    nextTick(followActiveLine);
  }
});

/** 全局 store 被其它入口打开时，同步当前课程（不让播放页停在上一课） */
watch(
  () => player.nowPlaying,
  (on) => {
    if (on && player.currentSong) adoptCurrentSong();
  }
);

/** 歌跨课推进（课程级循环/下一首）→ 页头落到新歌所属课程 */
watch(
  () => player.currentSong?.id,
  (id) => {
    if (!activeLesson.value || mode.value !== "songs") return;
    const l = lessonForSongId(id);
    if (l && l.id !== activeLesson.value.id) activeLesson.value = l;
  }
);

onBeforeUnmount(() => {
  clearTimeout(userScrollTimer);
  player.clearQueue();
});
</script>

<template>
  <div class="listen view">
    <!-- ===== 课程播放页：共用页头 + 页内模式切换 =====
         一屏三问：这一课是什么 → 现在用哪种方式磨 → 播到哪 / 我要干嘛。 -->
    <Transition name="lyrics">
      <div v-if="activeLesson" class="player">
        <div class="lp-head">
          <button class="pl-chip round" aria-label="收起播放页" @click="closePlayer">
            <ChevronDown class="k-ico" />
          </button>
          <span class="lp-course">
            <span class="lp-cover"><EmojiTile :emoji="activeLesson.emoji" :tone="activeLesson.tone" /></span>
            <span class="lp-course-text">
              <span class="lp-title">{{ activeLesson.title }}</span>
              <span class="lp-sub">{{ activeLesson.titleZh }} · {{ lessonMeta }}</span>
            </span>
          </span>
          <span class="lp-head-actions">
            <button
              v-if="currentLessonId"
              class="pl-chip round"
              aria-label="去这一课"
              title="去这一课"
              @click="goCurrentLesson"
            >
              <BookOpen class="k-ico" />
            </button>
            <button
              v-if="mode === 'songs' && courseSongs.length > 1"
              class="pl-chip round"
              aria-label="打开播放列表"
              @click="showPlaylist = true"
            >
              <ListMusic class="k-ico" />
            </button>
          </span>
        </div>

        <div class="lp-tabs">
          <SegmentedTabs
            :model-value="mode"
            :items="MODE_TABS"
            @update:model-value="(v: string) => switchMode(v as PlayerMode)"
          />
        </div>

        <!-- 歌曲：宽屏左侧当前曲目 / 右侧整篇歌词；手机只留歌词，把高度让给内容 -->
        <template v-if="mode === 'songs'">
          <div class="lp-song">
            <div class="lp-art">
              <EmojiTile :emoji="player.currentSong?.emoji ?? activeLesson.emoji" :tone="player.currentSong?.tone ?? activeLesson.tone" size="xl" />
              <p class="lp-art-title">{{ currentTrackTitle }}</p>
              <p class="lp-art-sub">{{ currentTrackSub }}</p>
            </div>

            <div class="pl-lyrics" ref="lyricsEl" @scroll.passive="onLyricsScroll">
              <div class="pl-lines">
                <template v-if="player.currentLyrics.length">
                  <p
                    v-for="(line, i) in player.currentLyrics"
                    :key="i"
                    class="pl-line"
                    :class="{ on: i === activeLine }"
                    :data-line="i"
                  >{{ line }}<span v-if="player.currentLyricsZh[i]" class="pl-zh">{{ player.currentLyricsZh[i] }}</span></p>
                </template>
                <p v-else class="pl-line on">🎵</p>
              </div>
            </div>
          </div>

          <div class="pl-transport">
            <button class="pl-mode on" :aria-label="`播放模式：${modeLabel}，点击切换`" @click="player.cycleMode()">
              <component :is="modeIcon" class="k-ico" />
              <span class="pl-mode-label">{{ modeLabel }}</span>
            </button>
            <span class="pl-transport-gap" aria-hidden="true" />
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
        </template>

        <!-- 视频：跨课程连续流，播完自动续下一课（页头随 change 落到新课程） -->
        <div v-else-if="mode === 'videos'" class="lp-media">
          <VideoPlayer
            v-if="allVideos.length"
            :key="videoEpoch"
            :videos="allVideos"
            :start-index="videoStartIdx"
            embedded
            @change="onVideoChange"
          />
          <div v-else class="lp-empty">
            <EmojiTile :emoji="activeLesson.emoji" :tone="activeLesson.tone" size="xl" />
            <p class="lp-empty-title">还没有课程视频</p>
            <p class="lp-empty-sub">先听歌曲，或者切到词句跟读吧</p>
          </div>
        </div>

        <!-- 词句：跨课程连续流（逐课 词→句 衔接），共用页头随 change 落到新课程 -->
        <div v-else class="lp-media lp-clips">
          <LessonClipPlayer
            :key="clipsEpoch"
            :lessons="lessons"
            :start-lesson-id="activeLesson.id"
            embedded
            @change="onClipChange"
          />
        </div>
      </div>
    </Transition>

    <!-- ===== 磨耳朵首页：只按课程列，格式入口不在这里 ===== -->
    <template v-if="!activeLesson">
      <div class="today-chip">🎵 今天听了 <b>{{ Math.floor((progStore.todayStats.listenSec ?? 0) / 60) }}</b> 分钟啦</div>
      <div class="view-body body">
        <button
          v-for="l in lessons"
          :key="l.id"
          class="entry-row course-row"
          @click="openCourse(l)"
        >
          <EmojiTile :emoji="l.emoji" :tone="l.tone" size="md" />
          <span class="entry-row__body">
            <span class="sr-title-row">
              <span class="entry-row__title sr-title">{{ l.title }}</span>
              <SpeakWave
                v-if="songEntriesFor(l).some(({ song }) => player.currentSong?.id === song.id) && player.playing"
                size="sm"
                tone="var(--brand)"
              />
            </span>
            <span class="entry-row__desc">
              {{ l.titleZh }} · 歌曲 · 视频 · {{ l.words.length }} 词 / {{ l.phrases.length }} 句
            </span>
          </span>
          <span class="course-play"><Play class="k-ico" /></span>
        </button>
      </div>
    </template>

    <!-- 播放列表抽屉（仅一课多轨时出现，不承担跨课导航） -->
    <BaseDrawer :open="showPlaylist" :title="`本课歌曲（${courseSongs.length}）`" @close="showPlaylist = false">
      <div class="drawer-list">
        <button v-for="entry in courseSongs" :key="entry.song.id" class="drawer-item"
          :class="{ on: player.currentIdx === entry.index }" @click="playTrack(entry.index)">
          <span class="di-idx">{{ entry.index + 1 }}</span>
          <span class="di-emoji" aria-hidden="true">
            <img v-if="emojiCoverUrl(entry.song.emoji)" class="di-emoji__img" :src="emojiCoverUrl(entry.song.emoji)!" alt="" />
            <template v-else>{{ entry.song.emoji }}</template>
          </span>
          <span class="di-info">
            <span class="di-title">{{ entry.song.title }}</span>
            <span class="di-sub">{{ entry.song.titleZh }}</span>
          </span>
          <SpeakWave v-if="player.currentIdx === entry.index && player.playing" size="sm" tone="var(--brand)" />
        </button>
      </div>
    </BaseDrawer>
  </div>
</template>

<style scoped>
.body {
  display: flex;
  flex-direction: column;
  /* 课程卡之间要留出明确间隙：--gap-s 在 390 宽会被压到 6px，卡片会贴成一堵墙 */
  gap: calc(var(--gap-l) + var(--gap-xs));
  width: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
/* 滚动容器里的行不允许被压扁：否则 7 张卡会均分视口高度，
 * 行高小于封面高度，封面溢出到行间，看起来就像卡片粘在一起。 */
.body > * {
  flex-shrink: 0;
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
/* 课程行：复用全局 .entry-row 骨架；右侧只留一个播放提示 */
.course-row {
  padding-block: var(--gap-s);
  text-align: left;
  cursor: pointer;
}
/* 列表封面单独封顶：EmojiTile 的 md/lg 在桌面会被 vh/vw 推到 100px+，
 * 放进课程行会把每张卡撑成一块高墙。48–64px 足够辨认，又不挤压列表。 */
.course-row .emoji-tile {
  width: clamp(48px, 7vh, 64px);
  height: clamp(48px, 7vh, 64px);
  font-size: clamp(26px, 4vh, 34px);
}
.course-row .entry-row__body {
  gap: var(--gap-s);
}
.course-row .entry-row__title {
  line-height: 1.4;
}
.course-row .entry-row__desc {
  line-height: 1.5;
}
.course-play {
  flex: none;
  color: var(--brand);
  font-size: var(--fs-title);
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

/* ===== 课程播放页 =====
 * 浮层只占底栏以上的空间：底栏常显，播着歌也能切 tab。
 * 层级上底栏 --z-floating(40) > 浮层 --z-bar(30)，边界算错也是底栏压在上面。
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
  gap: var(--gap-s);
  padding:
    max(var(--gap-s), env(safe-area-inset-top))
    var(--pad-x)
    var(--gap-m);
}
/* 共用页头：返回 + 课程封面/标题 + 页面级动作，三模式共用同一行 */
.lp-head {
  display: flex;
  align-items: center;
  gap: var(--gap-xs);
  width: 100%;
  max-width: 1040px;
  margin-inline: auto;
}
.lp-course {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--gap-xs);
}
.lp-cover {
  display: inline-flex;
  flex: none;
}
.lp-cover :deep(.emoji-tile) {
  font-size: 22px;
  border-radius: var(--radius-s);
}
.lp-course-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.lp-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink);
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
  line-height: 1.25;
}
.lp-sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-soft);
  font-weight: var(--fw-mid);
  font-size: var(--fs-small);
  line-height: 1.2;
}
.lp-head-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-xs);
  flex: none;
}
.pl-chip {
  width: 40px;
  height: 40px;
  background: var(--card-bg);
  color: var(--ink-soft);
  box-shadow: var(--shadow-soft);
  font-size: var(--fs-body);
}
.lp-tabs {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
}

/* 歌曲：默认手机单列（歌词占满剩余高）；宽屏下图左文右 */
.lp-song {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 1040px;
  margin-inline: auto;
}
.lp-art {
  display: none;
}
.pl-lyrics {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
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
  padding: var(--gap-xs) var(--gap-m);
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
.pl-zh {
  display: block;
  margin-top: 2px;
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  line-height: 1.4;
  color: var(--ink-soft);
  opacity: 0.85;
}
.pl-line.on .pl-zh {
  color: var(--brand);
  opacity: 0.9;
}
.lp-art-title {
  margin: var(--gap-xs) 0 0;
  max-width: 100%;
  text-align: center;
  color: var(--ink);
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
}
.lp-art-sub {
  margin: 0;
  text-align: center;
  color: var(--ink-soft);
  font-weight: var(--fw-mid);
  font-size: var(--fs-small);
}

/* 播放模式：图标 + 中文，三档循环状态靠文字区分 */
.pl-mode {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-2xs, 4px);
  padding: 4px 12px;
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
.pl-transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--gap-s);
  width: 100%;
  max-width: 1040px;
  margin-inline: auto;
}
.pl-transport-gap {
  flex: 0 0 var(--gap-xs);
}
.pl-side {
  width: 40px;
  height: 40px;
  background: var(--card-bg);
  color: var(--ink-soft);
  box-shadow: var(--shadow-soft);
  font-size: var(--fs-body);
}
.pl-main {
  width: clamp(52px, 14vw, 60px);
  height: clamp(52px, 14vw, 60px);
  background: var(--brand);
  color: var(--on-tone);
  box-shadow: 0 var(--press) 0 var(--brand-dark), var(--shadow-soft);
  font-size: var(--fs-title);
}
.pl-progress-row {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  width: 100%;
  max-width: 1040px;
  margin-inline: auto;
}
/* 进度：显式画轨道与拇指，跨浏览器一致，也把拇指做大给孩子按 */
.pl-progress {
  flex: 1;
  height: var(--slider-thumb);
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
}
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

/* 视频 / 词句内容区：吃掉页头与模式条以外的整块剩余高度 */
.lp-media {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 1040px;
  margin-inline: auto;
}
.lp-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--gap-s);
  padding: var(--gap-l);
  border-radius: var(--radius);
  background: var(--card-bg);
  box-shadow: var(--shadow-hard);
  text-align: center;
}
.lp-empty-title {
  margin: var(--gap-s) 0 0;
  color: var(--ink);
  font-weight: var(--fw-strong);
  font-size: var(--fs-title);
}
.lp-empty-sub {
  margin: 0;
  color: var(--ink-soft);
  font-size: var(--fs-small);
}

/* 宽屏：歌曲图左文右；视频与词句保持组件自己的宽屏布局 */
@media (min-width: 600px) {
  .pl-chip { width: var(--tap-min); height: var(--tap-min); font-size: var(--fs-title); }
  .pl-side { width: var(--tap-min); height: var(--tap-min); font-size: var(--fs-title); }
  .pl-main { width: var(--play-btn); height: var(--play-btn); font-size: var(--fs-hero); }
  .pl-transport { gap: var(--gap-l); }
  .pl-transport-gap { flex: 0 0 clamp(var(--gap-s), 4vw, var(--gap-l)); }
  .pl-mode { padding: var(--gap-xs) var(--gap-m); }
  .lp-cover :deep(.emoji-tile) { font-size: 30px; }
  .lp-title { font-size: var(--fs-title); }
  .lp-song {
    display: grid;
    grid-template-columns: minmax(0, 0.72fr) minmax(0, 1.28fr);
    column-gap: var(--gap-l);
  }
  .lp-art {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--gap-xs);
    min-width: 0;
    padding: var(--gap-m);
  }
  .pl-lyrics { padding: var(--gap-m) var(--gap-s); height: 100%; }
  .pl-line { padding: var(--gap-s) var(--gap-m); }
}

/* 手机横屏：高度只有 290px 左右，砍掉封面与模式胶囊，先保歌词和主键 */
@media (max-height: 480px) {
  .player { gap: var(--gap-s); overflow-y: auto; }
  .lp-art,
  .pl-mode,
  .pl-sub {
    display: none;
  }
  .pl-transport-gap { display: none; }
  .lp-song { display: flex; }
}

/* 歌词页入场/收起：从底部滑出 */
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5em;
  height: 1.5em;
  font-size: var(--fs-title);
  line-height: 1;
  flex: none;
}
.di-emoji__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
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
</style>
