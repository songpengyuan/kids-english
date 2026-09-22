<script setup>
import { computed } from "vue";
import WordCard from "./WordCard.vue";
import { celebrate, bigCelebrate, sfxCorrect } from "../utils/effects";

const props = defineProps({ words: { type: Array, required: true } });
const emit = defineEmits(["done"]);

const finished = computed(() => false); // 由按钮主动结束

function next() {
  sfxCorrect();
  bigCelebrate();
  celebrate();
  emit("done");
}
</script>

<template>
  <div class="learn">
    <p class="hint anim-fade-up">👆 点图片听发音，点单词再听一遍</p>
    <div class="grid">
      <WordCard
        v-for="(w, i) in words"
        :key="w.id"
        :word="w"
        class="anim-pop"
        :style="{ animationDelay: i * 0.08 + 's' }"
      />
    </div>
    <button class="k-btn next anim-fade-up" @click="next">我都会啦 ✓</button>
  </div>
</template>

<style scoped>
.learn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-height: 0;
}
.hint { margin: 0; font-size: 15px; color: #8a7f6f; font-weight: 700; flex: none; }
.grid {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  grid-auto-rows: 1fr;
  gap: 12px;
}
.next {
  margin-top: 0;
  flex: none;
  width: 100%;
  max-width: 420px;
  font-size: 22px;
  padding: 12px 32px;
}
</style>
