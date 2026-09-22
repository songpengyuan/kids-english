<script setup>
import { ref, computed, onMounted } from "vue";
import { speak } from "../utils/speech";
import { sfxCorrect, sfxWrong, celebrate } from "../utils/effects";

const props = defineProps({ words: { type: Array, required: true } });
const emit = defineEmits(["done"]);

function shuffle(a) {
  return [...a].sort(() => Math.random() - 0.5);
}

// 题目：每个单词出一题，选项为正确图 + 3 个干扰图
const questions = computed(() =>
  shuffle(props.words).map((target) => {
    const distractors = shuffle(props.words.filter((w) => w.id !== target.id)).slice(0, 3);
    return { target, options: shuffle([target, ...distractors]) };
  })
);

const idx = ref(0);
const picked = ref(null); // 已选 word id
const imgFail = ref({}); // 记录加载失败的图
const rightCount = ref(0);

const q = computed(() => questions.value[idx.value]);
const total = computed(() => questions.value.length);
const percent = computed(() => Math.round((idx.value / total.value) * 100));
const locked = computed(() => picked.value !== null);

function autoSpeak() {
  setTimeout(() => speak(q.value.target.en), 350);
}
onMounted(autoSpeak);

function replay() {
  speak(q.value.target.en);
}

function choose(opt) {
  if (locked.value) return;
  picked.value = opt.id;
  if (opt.id === q.value.target.id) {
    rightCount.value++;
    sfxCorrect();
    speak(opt.en);
    celebrate();
  } else {
    sfxWrong();
    // 答错：自动再读一遍正确发音
    setTimeout(() => speak(q.value.target.en, { rate: 0.75 }), 500);
  }
  setTimeout(next, 1300);
}

function next() {
  if (idx.value >= total.value - 1) {
    emit("done", scoreStars.value);
    return;
  }
  idx.value++;
  picked.value = null;
  autoSpeak();
}

const scoreStars = computed(() => {
  const r = rightCount.value / total.value;
  return r >= 0.9 ? 3 : r >= 0.6 ? 2 : 1;
});
</script>

<template>
  <div class="quiz">
    <div class="progress"><div class="fill" :style="{ width: percent + '%' }"></div></div>

    <button class="big-speaker anim-float" @click="replay" title="再听一遍">🔊</button>
    <p class="tip">听一听，点一点正确的图片</p>

    <div class="options">
      <div
        v-for="opt in q.options"
        :key="opt.id"
        class="opt anim-pop"
        :class="{
          right: locked && opt.id === q.target.id,
          wrong: locked && picked === opt.id && opt.id !== q.target.id,
          dim: locked && opt.id !== q.target.id && picked !== opt.id
        }"
        @click="choose(opt)"
      >
        <img
          v-if="!imgFail[opt.id]"
          :src="opt.image"
          :alt="opt.en"
          @error="imgFail[opt.id] = true"
        />
        <span v-else class="ph">{{ opt.emoji }}</span>
      </div>
    </div>
    <p v-if="locked && picked === q.target.id" class="praise anim-pop">太棒了！🎉</p>
    <p v-else-if="locked" class="oh anim-pop">再听一次哦～</p>
  </div>
</template>

<style scoped>
.quiz { display: flex; flex-direction: column; align-items: center; gap: 8px; flex: 1; min-height: 0; }
.quiz .progress { flex: none; width: 100%; }
.big-speaker {
  width: clamp(80px, 14vh, 120px); height: clamp(80px, 14vh, 120px);
  border-radius: 50%;
  font-size: clamp(36px, 6vh, 56px); background: var(--blue); color: #fff;
  box-shadow: 0 6px 0 #1899d6; margin: 2px 0; flex: none;
}
.big-speaker:active { transform: translateY(4px); box-shadow: 0 2px 0 #1899d6; }
.tip { margin: 0; font-weight: 700; color: #8a7f6f; flex: none; }
.options {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
}
.opt {
  border-radius: var(--radius);
  background: #fff;
  box-shadow: var(--shadow-hard);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; overflow: hidden;
  border: 5px solid transparent;
  transition: border-color 0.2s, transform 0.12s;
  min-height: 0;
}
.opt img { width: 80%; height: 80%; object-fit: contain; pointer-events: none; }
.opt .ph { font-size: clamp(40px, 9vh, 66px); }
.opt.right { border-color: var(--green); background: #eafbe0; }
.opt.wrong { border-color: var(--red); animation: shake-x 0.45s ease; }
.opt.dim { opacity: 0.45; }
.praise { color: var(--green-dark); font-weight: 800; font-size: 22px; margin: 4px 0 0; }
.oh { color: var(--red); font-weight: 800; font-size: 20px; margin: 4px 0 0; }
</style>
