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
  <div class="quiz view">
    <div class="progress"><div class="fill" :style="{ width: percent + '%' }"></div></div>

    <button class="big-speaker anim-float" @click="replay" title="再听一遍">🔊</button>
    <p class="tip">听一听，点一点正确的图片</p>

    <div class="options view-body">
      <div
        v-for="opt in q.options"
        :key="opt.id"
        class="opt anim-pop"
        data-haptic
        :class="{
          right: locked && opt.id === q.target.id,
          wrong: locked && picked === opt.id && opt.id !== q.target.id,
          dim: locked && opt.id !== q.target.id && picked !== opt.id
        }"
        @click="choose(opt)"
      >
        <div class="pic">
          <img
            v-if="!imgFail[opt.id]"
            :src="opt.image"
            :alt="opt.en"
            @error="imgFail[opt.id] = true"
          />
          <span v-else class="ph">{{ opt.emoji }}</span>
        </div>
        <!-- 图片下方常驻英文单词，边听边认字 -->
        <div class="w">{{ opt.en }}</div>
      </div>
    </div>

    <p v-if="locked && picked === q.target.id" class="praise anim-pop">太棒了！🎉</p>
    <p v-else-if="locked" class="oh anim-pop">再听一次哦～</p>
    <!-- 占位：忙时用透明文本撑住高度，避免答题后整页上下跳动 -->
    <p v-else class="praise placeholder" aria-hidden="true">占位</p>
  </div>
</template>

<style scoped>
.quiz {
  align-items: center;
}
.big-speaker {
  width: clamp(64px, min(15vh, 12vw), 120px);
  height: clamp(64px, min(15vh, 12vw), 120px);
  flex: none;
  border-radius: 50%;
  font-size: clamp(28px, min(7vh, 5.5vw), 56px);
  background: var(--blue);
  color: #fff;
  box-shadow: 0 var(--press) 0 var(--blue-dark);
}
.big-speaker:active {
  transform: translateY(calc(var(--press) - 1px));
  box-shadow: 0 1px 0 var(--blue-dark);
}
.tip {
  margin: 0;
  font-weight: 700;
  color: var(--ink-soft);
  font-size: var(--fs-small);
  flex: none;
  text-align: center;
}

.options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: minmax(0, 1fr);
  gap: var(--gap-m);
}
.opt {
  border-radius: var(--radius);
  background: var(--card-bg);
  box-shadow: var(--shadow-hard);
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  overflow: hidden;
  border: 5px solid transparent;
  transition: border-color 0.2s, transform 0.12s;
  min-height: 0;
  min-width: 0;
}
.pic {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pic img {
  width: 78%;
  height: 78%;
  object-fit: contain;
  pointer-events: none;
}
.pic .ph {
  font-size: var(--fs-emoji-xl);
  line-height: 1;
}
/* 选项下方的英文单词标签 */
.w {
  flex: none;
  width: 100%;
  text-align: center;
  font-weight: 800;
  letter-spacing: 0.5px;
  font-size: clamp(13px, min(2.6vh, 2vw), 22px);
  color: var(--ink);
  background: var(--tint-cream);
  padding: clamp(2px, 0.8vh, 6px) 4px;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.opt.right {
  border-color: var(--green);
  background: #eafbe0;
}
.opt.wrong {
  border-color: var(--red);
  animation: shake-x 0.45s ease;
}
.opt.dim {
  opacity: 0.45;
}

.praise {
  color: var(--green-dark);
  font-weight: 800;
  font-size: clamp(16px, min(2.6vh, 2.1vw), 22px);
  margin: 0;
  flex: none;
  text-align: center;
}
.oh {
  color: var(--red);
  font-weight: 800;
  font-size: clamp(15px, min(2.4vh, 1.9vw), 20px);
  margin: 0;
  flex: none;
}
.placeholder {
  visibility: hidden;
}

/**
 * 手机横屏：高度只有 300~400px，2×2 会让每张图太扁，
 * 改成 1×4 横向排开，把有限的高度全留给图片。
 */
@media (max-height: 480px) {
  .options {
    grid-template-columns: repeat(4, 1fr);
    grid-auto-rows: minmax(0, 1fr);
    gap: var(--gap-s);
  }
  .big-speaker {
    width: 52px;
    height: 52px;
    font-size: 24px;
  }
  /* 横屏时反馈语与提示挤占高度，收敛成一行 */
  .tip {
    display: none;
  }
  /* 横屏时单词标签更紧凑，把高度留给图片 */
  .w {
    font-size: 12px;
    padding: 1px 2px;
  }
}
</style>
