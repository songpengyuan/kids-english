<script setup>
/**
 * 歌曲动画舞台 —— 没有视频文件时的「看动画」模式。
 *
 * 可爱但便宜：不加载任何媒体文件，用 CSS + 少量 JS 画出来——
 *   · 场景（sea：大海和小帆船 / rainbow：彩虹 / numbers：数数的小气球 /
 *     letters：字母积木 / stage：小小演奏会）
 *   · 一排课时单词角色，跟着 bpm 一拍一弹（rAF 读 audio.currentTime，精确对拍）
 *   · 当前歌词行以大字幕弹出，孩子跟着唱
 * 将来放真实 song.mp4 时这段不参与，视频优先。
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Music } from "@lucide/vue";

const props = defineProps({
  lesson: { type: Object, required: true },
  audio: { type: Object, default: null }, // <audio> 元素，用于读播放进度对拍
  playing: { type: Boolean, default: false },
  line: { type: Number, default: -1 }, // 当前歌词行（-1 = 段间/未开始）
  idle: { type: String, default: "点我开始唱吧" }
});

const root = ref(null);
const bpm = computed(() => props.lesson.song.timings?.bpm || 0);
const beatCss = computed(() => (bpm.value ? 60 / bpm.value : 0.5) + "s");
/* 当前场景：sea / rainbow / numbers / letters / stage（默认） */
const scene = computed(() => props.lesson.song.scene || "stage");
const subtitle = computed(() => {
  const i = props.line;
  return i >= 0 ? props.lesson.song.lyrics[i] || "" : "";
});
/* 出场角色：本课的单词 emoji，最多 8 个，太多会挤 */
const cast = computed(() => props.lesson.words.slice(0, 8));
const notes = ref([]);
let noteId = 0;

/* ---------- 节拍：rAF 读播放进度，写 CSS 变量（不走 Vue 响应式，60fps 不卡） ---------- */
let raf = 0;
function tick() {
  const a = props.audio;
  const beat = bpm.value ? 60 / bpm.value : 0;
  if (a && beat) {
    const phase = ((a.currentTime || 0) / beat) % 1;
    const bob = Math.abs(Math.sin(phase * Math.PI)); // 每拍弹起一次
    root.value?.style.setProperty("--bob", bob.toFixed(3));
  }
  raf = requestAnimationFrame(tick);
}
watch(
  () => props.playing,
  (on) => {
    cancelAnimationFrame(raf);
    if (on) raf = requestAnimationFrame(tick);
    else root.value?.style.setProperty("--bob", 0);
  }
);
onBeforeUnmount(() => cancelAnimationFrame(raf));

/* ---------- 飘上来的小音符：播放中每隔一会儿冒一个 ---------- */
let noteTimer = 0;
watch(
  () => props.playing,
  (on) => {
    clearInterval(noteTimer);
    if (on) {
      noteTimer = setInterval(() => {
        const n = { id: ++noteId, x: 8 + Math.random() * 84, s: 0.7 + Math.random() * 0.5 };
        notes.value.push(n);
        if (notes.value.length > 7) notes.value.shift();
        setTimeout(() => {
          notes.value = notes.value.filter((m) => m.id !== n.id);
        }, 3800);
      }, 900);
    } else {
      notes.value = [];
    }
  }
);
onBeforeUnmount(() => clearInterval(noteTimer));
</script>

<template>
  <div
    ref="root"
    class="stage"
    :class="'scene-' + scene"
    :style="{ '--beat': beatCss }"
    data-haptic
    @click="$emit('tap')"
  >
    <!-- 场景装饰 -->
    <template v-if="lesson.song.scene === 'sea'">
      <span class="sun"></span>
      <span class="cloud c1"></span><span class="cloud c2"></span><span class="cloud c3"></span>
      <span class="hero" :class="{ bobbing: playing }">{{ lesson.emoji }}</span>
      <div class="waves">
        <span class="wave w1"></span><span class="wave w2"></span><span class="wave w3"></span>
      </div>
    </template>
    <template v-else-if="lesson.song.scene === 'rainbow'">
      <span class="rainbow"></span>
      <span class="cloud c1"></span><span class="cloud c2"></span><span class="cloud c3"></span>
      <span class="hero" :class="{ bobbing: playing }">{{ lesson.emoji }}</span>
      <span class="float-emoji f1">🌈</span><span class="float-emoji f2">⭐</span><span class="float-emoji f3">☁️</span>
    </template>
    <template v-else-if="lesson.song.scene === 'numbers'">
      <span class="hill h1"></span><span class="hill h2"></span>
      <span class="balloon b1">1</span><span class="balloon b2">2</span><span class="balloon b3">3</span>
      <span class="hero" :class="{ bobbing: playing }">{{ lesson.emoji }}</span>
      <span class="float-emoji f1">🎈</span><span class="float-emoji f2">⭐</span><span class="float-emoji f3">🎈</span>
    </template>
    <template v-else-if="lesson.song.scene === 'letters'">
      <span class="letter-tile t1">A</span><span class="letter-tile t2">B</span><span class="letter-tile t3">C</span>
      <span class="hero" :class="{ bobbing: playing }">{{ lesson.emoji }}</span>
      <span class="float-emoji f1">✏️</span><span class="float-emoji f2">⭐</span><span class="float-emoji f3">📖</span>
    </template>
    <template v-else>
      <span class="spot"></span><span class="spot s2"></span>
      <span class="curtain l"></span><span class="curtain r"></span>
      <span class="hero" :class="{ bobbing: playing }">{{ lesson.emoji }}</span>
    </template>

    <!-- 演出名单：本课单词角色，跟着节拍一排小弹簧 -->
    <div class="cast">
      <span
        v-for="(w, i) in cast"
        :key="w.id"
        class="member"
        :style="{ '--i': i, '--amp': 5 + (i % 3) * 3 }"
      >
        {{ w.emoji }}
      </span>
    </div>

    <!-- 飘起的小音符 -->
    <span v-for="n in notes" :key="n.id" class="note" :style="{ left: n.x + '%', '--s': n.s }">
      <Music class="k-ico" />
    </span>

    <!-- 卡拉OK字幕 -->
    <Transition name="sub" mode="out-in">
      <p v-if="subtitle" :key="props.line" class="subtitle">{{ subtitle }}</p>
      <p v-else :key="'idle'" class="subtitle idle">
        {{ playing ? "🎵" : idle }}
      </p>
    </Transition>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  overflow: hidden;
  cursor: pointer;
  --bob: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: var(--gap-s);
}

/* ---------- 场景：大海 ---------- */
.scene-sea {
  background: linear-gradient(180deg, #bfe9ff 0%, #e8f8ff 46%, #8ed8f7 60%, #4fb3e0 100%);
}
.scene-sea .sun {
  position: absolute;
  top: 7%;
  right: 9%;
  width: clamp(30px, 8vw, 54px);
  height: clamp(30px, 8vw, 54px);
  border-radius: 50%;
  background: radial-gradient(circle at 35% 32%, #fff6c9, var(--yellow));
  box-shadow: 0 0 clamp(14px, 4vw, 26px) rgba(255, 214, 90, 0.75);
}
.cloud {
  position: absolute;
  width: clamp(48px, 13vw, 86px);
  height: clamp(16px, 4.4vw, 28px);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 3px 0 rgba(120, 180, 220, 0.35);
  animation: drift linear infinite;
}
.cloud.c1 { top: 12%; left: 6%; animation-duration: 26s; }
.cloud.c2 { top: 24%; left: 55%; animation-duration: 34s; transform: scale(0.72); }
.cloud.c3 { top: 7%; left: 34%; animation-duration: 44s; transform: scale(0.5); }
@keyframes drift {
  from { translate: -14% 0; }
  50% { translate: 10% 0; }
  to { translate: -14% 0; }
}
.hero {
  position: absolute;
  left: 50%;
  top: 34%;
  translate: -50%;
  font-size: clamp(42px, 13vw, 92px);
  line-height: 1;
  filter: drop-shadow(0 6px 0 rgba(30, 90, 130, 0.18));
}
.hero.bobbing {
  animation: hero-bob calc(var(--beat, 0.5s)) ease-in-out infinite;
}
@keyframes hero-bob {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-9%) rotate(2deg); }
}
.waves {
  position: absolute;
  inset: auto 0 0 0;
  height: 34%;
}
.wave {
  position: absolute;
  inset: auto 0 0 0;
  height: 100%;
  border-radius: 46% 54% 0 0 / 26% 30% 0 0;
  animation: sway ease-in-out infinite alternate;
}
.wave.w1 { background: rgba(255, 255, 255, 0.5); height: 108%; animation-duration: 3.4s; }
.wave.w2 { background: rgba(120, 205, 240, 0.75); height: 76%; animation-duration: 2.6s; }
.wave.w3 { background: linear-gradient(180deg, #59bde8, #2f96c9); height: 46%; animation-duration: 2s; }
@keyframes sway {
  from { translate: -3.5% 0; }
  to { translate: 3.5% 0; }
}

/* ---------- 场景：小小演奏会 ---------- */
.scene-stage {
  background: radial-gradient(120% 90% at 50% 0%, #fff3d6 0%, #ffe6bd 44%, #ffd08a 100%);
}
.scene-stage .spot {
  position: absolute;
  top: -12%;
  left: 50%;
  translate: -50%;
  width: 46%;
  height: 130%;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0));
  animation: glow 3.6s ease-in-out infinite alternate;
}
.scene-stage .spot.s2 { width: 70%; opacity: 0.5; animation-duration: 5.2s; }
@keyframes glow {
  from { opacity: 0.55; }
  to { opacity: 1; }
}
.curtain {
  position: absolute;
  top: 0;
  bottom: 18%;
  width: 9%;
  border-radius: 0 0 999px 999px;
  background: repeating-linear-gradient(90deg, var(--pink) 0 8px, var(--pink-deep) 8px 16px);
  opacity: 0.85;
}
.curtain.l { left: 2%; }
.curtain.r { right: 2%; }

/* ---------- 场景：彩虹（颜色课） ---------- */
.scene-rainbow {
  background: linear-gradient(180deg, #dff1ff 0%, #fdeef7 52%, #fff4dc 100%);
}
.scene-rainbow .rainbow {
  position: absolute;
  left: 50%;
  bottom: 24%;
  translate: -50%;
  width: 76%;
  height: 38%;
  border-radius: 999px 999px 0 0;
  background: radial-gradient(
    100% 100% at 50% 100%,
    transparent 0 56%,
    #ff9fb2 56% 65%,
    #ffd97a 65% 74%,
    #9fe0a5 74% 83%,
    #8fd4f5 83% 92%,
    #c6b4f2 92% 100%
  );
  opacity: 0.95;
}
.scene-rainbow .cloud.c1 { top: 40%; left: 4%; animation-duration: 30s; }
.scene-rainbow .cloud.c2 { top: 30%; right: 5%; left: auto; animation-duration: 38s; transform: scale(0.8); }
.scene-rainbow .cloud.c3 { top: 18%; left: 42%; animation-duration: 46s; transform: scale(0.6); }

/* ---------- 场景：数数的小气球（数字课） ---------- */
.scene-numbers {
  background: linear-gradient(180deg, #e2f9f0 0%, #e9f6ff 58%, #d9f2e6 100%);
}
.scene-numbers .hill {
  position: absolute;
  bottom: -18%;
  width: 64%;
  height: 42%;
  border-radius: 50%;
  background: rgba(126, 200, 152, 0.5);
}
.scene-numbers .hill.h1 { left: -12%; }
.scene-numbers .hill.h2 { right: -12%; background: rgba(102, 187, 138, 0.62); }
.balloon {
  position: absolute;
  top: 14%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: clamp(26px, 7vw, 46px);
  height: clamp(32px, 8.6vw, 56px);
  border-radius: 50% 50% 46% 46%;
  color: #fff;
  font-weight: 800;
  font-size: clamp(14px, 3.6vw, 24px);
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.12);
  animation: balloon-bob 3.2s ease-in-out infinite;
}
.balloon::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  width: 2px;
  height: 46%;
  background: rgba(74, 63, 53, 0.35);
}
.balloon.b1 { left: 12%; background: var(--red); animation-delay: 0s; }
.balloon.b2 { left: 44%; background: var(--blue); animation-delay: 0.5s; }
.balloon.b3 { right: 12%; background: var(--purple); animation-delay: 1s; }
@keyframes balloon-bob {
  0%, 100% { transform: translateY(0) rotate(-3deg); }
  50% { transform: translateY(-7%) rotate(3deg); }
}

/* ---------- 场景：字母积木（字母课） ---------- */
.scene-letters {
  background: linear-gradient(180deg, #efe7ff 0%, #fdf2ff 55%, #e8f2ff 100%);
}
.letter-tile {
  position: absolute;
  top: 12%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: clamp(34px, 9vw, 58px);
  height: clamp(34px, 9vw, 58px);
  border-radius: 26%;
  background: #fff;
  box-shadow: 0 4px 0 rgba(74, 63, 53, 0.14);
  font-weight: 800;
  font-size: clamp(18px, 4.8vw, 32px);
  animation: tile-wiggle 3.6s ease-in-out infinite;
}
.letter-tile.t1 { left: 10%; color: var(--blue); rotate: -8deg; }
.letter-tile.t2 { left: 45%; color: var(--orange); animation-delay: 0.6s; }
.letter-tile.t3 { right: 10%; color: var(--pink); rotate: 8deg; animation-delay: 1.2s; }
@keyframes tile-wiggle {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-8%) rotate(2deg); }
}

/* ---------- 各场景通用：飘着的小贴纸 ---------- */
.float-emoji {
  position: absolute;
  font-size: clamp(16px, 4.4vw, 30px);
  animation: float-emoji 4.4s ease-in-out infinite;
  opacity: 0.9;
}
.float-emoji.f1 { left: 8%; top: 20%; }
.float-emoji.f2 { right: 10%; top: 34%; animation-delay: 0.8s; }
.float-emoji.f3 { left: 24%; top: 44%; animation-delay: 1.6s; }
@keyframes float-emoji {
  0%, 100% { transform: translateY(0) rotate(-4deg); }
  50% { transform: translateY(-12%) rotate(4deg); }
}

/* ---------- 角色 / 字幕（两种场景共用） ---------- */
.cast {
  position: relative;
  z-index: 2;
  display: flex;
  gap: clamp(2px, 1.4vw, 10px);
  align-items: flex-end;
}
.member {
  font-size: clamp(20px, 5.4vw, 38px);
  line-height: 1;
  /* 每拍一弹：--bob 由 rAF 写入（0..1），--amp 控制各自的弹跳幅度 */
  transform: translateY(calc(var(--bob) * var(--amp) * -1px));
  filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.12));
}
.note {
  position: absolute;
  bottom: 18%;
  z-index: 2;
  color: var(--blue);
  font-size: clamp(13px, 2.6vw, 20px);
  animation: float-up 3.8s ease-out forwards;
  opacity: 0.85;
}
@keyframes float-up {
  0% { transform: translateY(0) scale(var(--s, 1)); opacity: 0; }
  12% { opacity: 0.9; }
  100% { transform: translateY(-160%) scale(var(--s, 1)) rotate(12deg); opacity: 0; }
}
.subtitle {
  position: absolute;
  left: 6%;
  right: 6%;
  bottom: clamp(52px, 13vh, 96px);
  z-index: 3;
  margin: 0;
  text-align: center;
  font-weight: 800;
  font-size: clamp(15px, min(3.1vh, 2.5vw), 24px);
  color: var(--ink);
  background: var(--overlay);
  border-radius: var(--radius-pill);
  padding: clamp(5px, 1.2vh, 10px) clamp(12px, 2.4vw, 22px);
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(2px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.subtitle.idle {
  color: var(--ink-soft);
  width: fit-content;
  margin-inline: auto;
}
.sub-enter-active { animation: anim-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.sub-leave-active { transition: opacity 0.12s; }
.sub-leave-to { opacity: 0; }
</style>
