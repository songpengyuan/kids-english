<script setup>
import { ref, computed } from "vue";
import LearnView from "./LearnView.vue";
import QuizView from "./QuizView.vue";
import MatchView from "./MatchView.vue";
import SongView from "./SongView.vue";
import { bigCelebrate } from "../utils/effects";
import progress from "../store/progress";
import { speakZh } from "../utils/speech";

const props = defineProps({ lesson: { type: Object, required: true } });
const emit = defineEmits(["back"]);

const stage = ref("menu"); // menu | learn | quiz | match | song | result
const lastStars = ref(0);

const activities = computed(() => [
  { key: "learn", name: "学单词", icon: "📖", color: "#ff9f43", game: "learn", desc: "看图听发音" },
  { key: "quiz", name: "听音选图", icon: "🎧", color: "#1cb0f6", game: "quiz", desc: "听声音找图片" },
  { key: "match", name: "连一连", icon: "🔗", color: "#ce82ff", game: "match", desc: "图片连线单词" },
  { key: "song", name: "唱童谣", icon: "🎵", color: "#58cc02", game: "song", desc: "听歌看视频" }
]);

function open(a) {
  if (a.game === "song") {
    stage.value = "song";
    return;
  }
  stage.value = a.key;
}

function showStars(n) {
  return progress.progress[props.lesson.id]?.[stage.value] || 0 || n;
}

function afterGame(stars) {
  lastStars.value = stars;
  progress.setGameStars(props.lesson.id, stage.value, stars);
  bigCelebrate();
  speakZh(stars >= 3 ? "太厉害了，满分三颗星" : "做得好，继续加油");
  stage.value = "result";
}

function afterSong() {
  stage.value = "result";
  lastStars.value = 1;
}

const lessonProgress = computed(() => {
  const done = progress.progress[props.lesson.id]?.completed?.length || 0;
  return Math.round((done / 3) * 100);
});

function toMenu() {
  stage.value = "menu";
}
</script>

<template>
  <div class="lesson">
    <div class="topbar">
      <button class="back" @click="emit('back')">←</button>
      <div class="title">{{ lesson.emoji }} {{ lesson.titleZh }}</div>
      <div class="star-badge">⭐ {{ progress.lessonStars(lesson.id) }}</div>
    </div>

    <!-- 课时菜单 -->
    <div v-if="stage === 'menu'" class="menu">
      <div class="lesson-cover anim-pop" :style="{ background: lesson.color }">
        <span class="cover-emoji">{{ lesson.emoji }}</span>
        <p>{{ lesson.title }}</p>
      </div>
      <div class="bar"><div class="bar-fill" :style="{ width: lessonProgress + '%' }"></div></div>
      <div class="acts">
        <button
          v-for="(a, i) in activities"
          :key="a.key"
          class="act anim-fade-up"
          :style="{ background: a.color, animationDelay: i * 0.08 + 's' }"
          @click="open(a)"
        >
          <span class="ico">{{ a.icon }}</span>
          <span class="nm">{{ a.name }}</span>
          <span class="ds">{{ a.desc }}</span>
          <span v-if="showStars(0)" class="mini-stars">⭐{{ showStars(0) }}</span>
        </button>
      </div>
    </div>

    <!-- 各玩法 -->
    <component
      v-else-if="stage === 'learn' || stage === 'quiz' || stage === 'match'"
      :is="stage === 'learn' ? LearnView : stage === 'quiz' ? QuizView : MatchView"
      :words="lesson.words"
      @done="afterGame"
    />
    <SongView v-else-if="stage === 'song'" :lesson="lesson" @song-done="afterSong" @back="toMenu" />

    <!-- 结算 -->
    <div v-else-if="stage === 'result'" class="result">
      <div class="stars">
        <span v-for="n in 3" :key="n" class="star anim-pop" :class="{ dim: n > lastStars }" :style="{ animationDelay: n * 0.2 + 's' }">⭐</span>
      </div>
      <h2>真棒！获得 {{ lastStars }} 颗星</h2>
      <div class="row">
        <button class="k-btn gray" @click="toMenu">返回</button>
        <button class="k-btn" @click="emit('back')">下一课</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lesson { display: flex; flex-direction: column; flex: 1; }
.menu { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.lesson-cover {
  width: 100%; border-radius: var(--radius); box-shadow: var(--shadow-hard);
  padding: 18px; display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.cover-emoji { font-size: 66px; }
.lesson-cover p { margin: 0; color: #fff; font-weight: 800; font-size: 22px; text-shadow: 0 2px 0 rgba(0,0,0,0.12); }
.bar { width: 100%; height: 16px; background: #e8e0cf; border-radius: 8px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--green); transition: width 0.5s; }
.acts { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; width: 100%; }
.act {
  position: relative; border-radius: var(--radius); padding: 18px 12px;
  box-shadow: 0 6px 0 rgba(0,0,0,0.15); color: #fff;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  transition: transform 0.08s;
}
.act:active { transform: translateY(4px); box-shadow: 0 2px 0 rgba(0,0,0,0.15); }
.act .ico { font-size: 44px; }
.act .nm { font-size: 22px; font-weight: 800; }
.act .ds { font-size: 14px; opacity: 0.92; font-weight: 700; }
.mini-stars {
  position: absolute; top: 8px; right: 10px;
  background: rgba(255,255,255,0.9); color: #b8860b;
  border-radius: 10px; padding: 2px 8px; font-size: 14px; font-weight: 800;
}
.result { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; }
.stars { display: flex; gap: 10px; }
.star { font-size: 72px; }
.star.dim { filter: grayscale(1); opacity: 0.4; }
.result h2 { margin: 0; color: var(--ink); }
.row { display: flex; gap: 14px; }
</style>
