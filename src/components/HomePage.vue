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
.home { display: flex; flex-direction: column; gap: 18px; flex: 1; }
.hero { text-align: center; }
.hero h1 { margin: 8px 0 4px; font-size: 34px; color: var(--ink); }
.hero p { margin: 0 0 12px; color: #8a7f6f; font-weight: 700; }
.total { margin: 0 auto; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
.lesson-card {
  border-radius: 24px; padding: 22px 14px; color: #fff;
  box-shadow: 0 7px 0 rgba(0,0,0,0.16);
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  position: relative; transition: transform 0.1s;
}
.lesson-card:active { transform: translateY(5px) scale(0.98); }
.big-emoji { font-size: 66px; }
.lt { font-size: 24px; font-weight: 800; text-shadow: 0 2px 0 rgba(0,0,0,0.12); }
.ls { font-size: 15px; font-weight: 700; opacity: 0.92; }
.cnt { font-size: 13px; opacity: 0.85; font-weight: 700; }
.done {
  position: absolute; top: 10px; right: 10px;
  background: rgba(255,255,255,0.92); color: var(--green-dark);
  font-size: 12px; font-weight: 800; padding: 3px 8px; border-radius: 10px;
}
.foot { text-align: center; color: #a89b86; font-weight: 700; margin-top: auto; }
</style>
