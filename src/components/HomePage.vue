<script setup>
import { lessons } from "../data/lessons";
import progress from "../store/progress";
import { speak } from "../utils/speech";

const emit = defineEmits(["open"]);

function enter(l) {
  speak(l.words[0].en); // 进课时先读一个单词，暖场
  emit("open", l.id);
}
</script>

<template>
  <div class="home">
    <header class="hero anim-fade-up">
      <h1>🌈 宝宝英语乐园</h1>
      <p>点一课，学童谣里的单词吧！</p>
      <div class="total star-badge">⭐ 我的星星：{{ progress.totalStars }}</div>
    </header>

    <div class="cards">
      <button
        v-for="(l, i) in lessons"
        :key="l.id"
        class="lesson-card anim-pop"
        :style="{ background: l.color, animationDelay: i * 0.1 + 's' }"
        @click="enter(l)"
      >
        <span class="big-emoji anim-float">{{ l.emoji }}</span>
        <span class="lt">{{ l.titleZh }}</span>
        <span class="ls">{{ l.title }}</span>
        <span class="done" v-if="progress.isCompleted(l.id)">全部通关 ✓</span>
        <span class="cnt">{{ l.words.length }} 个单词</span>
      </button>
    </div>

    <p class="foot">👨‍👩‍👧 建议家长陪同，每次 10~15 分钟</p>
  </div>
</template>

<style scoped>
.home { display: flex; flex-direction: column; gap: 12px; flex: 1; min-height: 0; }
.hero { text-align: center; flex: none; }
.hero h1 { margin: 2px 0 2px; font-size: 30px; color: var(--ink); }
.hero p { margin: 0 0 8px; color: #8a7f6f; font-weight: 700; }
.total { margin: 0 auto; }
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  grid-auto-rows: 1fr;
  gap: 14px;
  flex: 1;
  min-height: 0;
}
.lesson-card {
  border-radius: 24px; padding: 10px 12px; color: #fff;
  box-shadow: 0 7px 0 rgba(0,0,0,0.16);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px;
  position: relative; transition: transform 0.1s;
  min-height: 0; overflow: hidden;
}
.lesson-card:active { transform: translateY(5px) scale(0.98); }
.big-emoji { font-size: clamp(40px, 8vh, 66px); }
.lt { font-size: clamp(18px, 3.2vh, 24px); font-weight: 800; text-shadow: 0 2px 0 rgba(0,0,0,0.12); }
.ls { font-size: clamp(12px, 1.8vh, 15px); font-weight: 700; opacity: 0.92; }
.cnt { font-size: clamp(11px, 1.6vh, 13px); opacity: 0.85; font-weight: 700; }
.done {
  position: absolute; top: 10px; right: 10px;
  background: rgba(255,255,255,0.92); color: var(--green-dark);
  font-size: 12px; font-weight: 800; padding: 3px 8px; border-radius: 10px;
}
.foot { text-align: center; color: #a89b86; font-weight: 700; margin-top: auto; }
</style>
