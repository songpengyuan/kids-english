<script setup lang="ts">
/**
 * 首次三步引导（/onboarding，P0-2）
 * 降低冷启动流失：① 确认这是谁的学习小屋（跟班进度）→ ② 试一关完整体验 → ③ 告诉家长怎么看报告。
 * 完成后 localStorage 标记 kc-onboarded，不再重复出现。
 */
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { lessons, getLesson, activityKeys } from "../data/lessons";
import { useProgressStore } from "../stores/progress";
import { speak, speakZh } from "../services/speech";
import { Check, ChevronRight, Volume2, BarChart3, School, Rocket } from "@lucide/vue";

const router = useRouter();
const auth = useAuthStore();
const progress = useProgressStore();

const ONBOARD_KEY = "kc-onboarded";
const kidName = computed(() => auth.currentChild?.name ?? "丞丞");
const kidAvatar = computed(() => auth.currentChild?.avatar ?? "🦊");

const step = ref(1);
const totalSteps = 3;

/** 试玩词卡：当前课第一个词（与今日任务同一"本课"逻辑） */
const OFFICIAL_ORDER = ["l5", "l4", "l9"];
const demoWord = computed(() => {
  const last = progress.lastLesson ? getLesson(progress.lastLesson) : null;
  const cur =
    (last && !progress.isCompleted(last.id, activityKeys(last)) && last) ||
    OFFICIAL_ORDER.map((id) => getLesson(id)).find(
      (l) => l && !progress.isCompleted(l.id, activityKeys(l)),
    ) ||
    lessons[0];
  return cur.words[0];
});
const played = ref(false);

function sayWord() {
  played.value = true;
  speak(demoWord.value.en);
}

function next() {
  if (step.value < totalSteps) {
    step.value += 1;
  } else {
    finish();
  }
}
function skip() {
  finish();
}
function finish() {
  try {
    localStorage.setItem(ONBOARD_KEY, "1");
  } catch {
    /* 隐私模式下失败不阻塞 */
  }
  speakZh("开始学习");
  router.replace("/learn");
}

/** 试玩完成判定：播放过发音即可下一步 */
function canNext(): boolean {
  if (step.value === 2) return played.value;
  return true;
}
</script>

<template>
  <div class="onb view">
    <div class="onb-card">
      <!-- 进度点 -->
      <div class="onb-dots" aria-hidden="true">
        <span
          v-for="s in totalSteps"
          :key="s"
          class="onb-dot"
          :class="{ on: s <= step, done: s < step }"
        />
      </div>

      <!-- Step 1：这是谁的学习小屋 -->
      <transition name="slide" mode="out-in">
        <div v-if="step === 1" key="s1" class="onb-body">
          <span class="onb-ico"><School class="k-ico" /></span>
          <h1 class="onb-title">这是谁的学习小屋？</h1>
          <div class="onb-kid">
            <span class="onb-avatar" aria-hidden="true">{{ kidAvatar }}</span>
            <span class="onb-kid-name">{{ kidName }}的学习小屋</span>
          </div>
          <p class="onb-desc">跟着老师的课走，<br />每天 10 分钟，做完今天的任务就收工。</p>
          <button class="onb-btn" @click="next">
            就是 TA！
            <ChevronRight class="k-ico" />
          </button>
        </div>

        <!-- Step 2：试一关 -->
        <div v-else-if="step === 2" key="s2" class="onb-body">
          <span class="onb-ico"><Rocket class="k-ico" /></span>
          <h1 class="onb-title">先试一关！</h1>
          <p class="onb-desc">点一下这个单词，听听它怎么读——<br />学习就是像这样，点一点、听一听。</p>
          <button
            class="onb-word"
            :class="{ played }"
            @click="sayWord"
          >
            <span class="onb-word-en">{{ demoWord.en }}</span>
            <span class="onb-word-zh">{{ demoWord.zh }} {{ demoWord.emoji }}</span>
            <span class="onb-word-play"><Volume2 class="k-ico" /></span>
          </button>
          <button class="onb-btn" :class="{ ghost: !played }" :disabled="!canNext()" @click="next">
            {{ played ? "我学会啦！" : "点上面的单词再继续" }}
            <Check v-if="played" class="k-ico" />
            <ChevronRight v-else class="k-ico" />
          </button>
        </div>

        <!-- Step 3：家长怎么看报告 -->
        <div v-else key="s3" class="onb-body">
          <span class="onb-ico"><BarChart3 class="k-ico" /></span>
          <h1 class="onb-title">家长怎么看我学了啥？</h1>
          <p class="onb-desc">打开【我的】→【家长中心】，<br />一眼看到：练了吗、练了多久、卡在哪、要不要复习。</p>
          <button class="onb-btn" @click="next">
            开始学习！
            <Rocket class="k-ico" />
          </button>
        </div>
      </transition>

      <button class="onb-skip" @click="skip">跳过引导</button>
    </div>
  </div>
</template>

<style scoped>
.onb {
  position: fixed;
  inset: 0;
  z-index: var(--z-top, 100);
  background: var(--brand-grad, linear-gradient(135deg, #1e7fd0, #38a3e8, #6cc3f5));
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--pad-x);
}
.onb-card {
  width: min(420px, 100%);
  background: rgba(255, 255, 255, 0.97);
  border-radius: 28px;
  box-shadow: 0 18px 50px rgba(8, 47, 88, 0.35);
  padding: clamp(20px, 4vh, 32px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(12px, 2.4vh, 20px);
}
.onb-dots {
  display: flex;
  gap: 8px;
}
.onb-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #dbe7f2;
  transition: all 0.25s;
}
.onb-dot.on {
  background: var(--brand, #00a3ff);
  transform: scale(1.25);
}
.onb-dot.done {
  background: var(--brand-soft, #e3f5ff);
}
.onb-body {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: clamp(10px, 2vh, 16px);
}
.onb-ico {
  width: clamp(52px, 9vh, 68px);
  height: clamp(52px, 9vh, 68px);
  border-radius: 20px;
  background: var(--brand-soft, #e3f5ff);
  color: var(--brand-dark, #0086d6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
}
.onb-title {
  font-size: clamp(19px, 3.4vh, 26px);
  font-weight: 900;
  color: #24344a;
  margin: 0;
}
.onb-kid {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 18px;
  background: var(--brand-soft, #e3f5ff);
}
.onb-avatar {
  font-size: clamp(34px, 7vh, 46px);
}
.onb-kid-name {
  font-weight: 900;
  font-size: clamp(15px, 2.4vh, 18px);
  color: var(--brand-dark, #0086d6);
}
.onb-desc {
  font-size: clamp(13px, 2.2vh, 15px);
  font-weight: 700;
  line-height: 1.6;
  color: #5f7188;
  margin: 0;
}
.onb-word {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: linear-gradient(160deg, #b7e6ff, #8ad4ff);
  border-radius: 20px;
  padding: clamp(14px, 3vh, 22px);
  box-shadow: 0 4px 0 #4a9ed6;
  transition: transform 0.1s, box-shadow 0.1s;
}
.onb-word:active {
  transform: translateY(3px);
  box-shadow: 0 1px 0 #4a9ed6;
}
.onb-word.played {
  outline: 3px solid var(--ok, #58cc02);
}
.onb-word-en {
  font-size: clamp(22px, 4vh, 30px);
  font-weight: 900;
  color: #0b5c96;
}
.onb-word-zh {
  font-size: clamp(13px, 2.2vh, 16px);
  font-weight: 800;
  color: #2a6f9e;
}
.onb-word-play {
  margin-top: 4px;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #fff;
  color: #0b5c96;
  display: flex;
  align-items: center;
  justify-content: center;
}
.onb-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  background: var(--brand, #00a3ff);
  color: #fff;
  border-radius: 999px;
  padding: clamp(12px, 2.2vh, 16px);
  font-size: clamp(15px, 2.4vh, 18px);
  font-weight: 900;
  box-shadow: 0 4px 0 var(--brand-dark, #0086d6);
  transition: transform 0.1s, box-shadow 0.1s, opacity 0.25s;
}
.onb-btn:active {
  transform: translateY(3px);
  box-shadow: 0 1px 0 var(--brand-dark, #0086d6);
}
.onb-btn.ghost {
  background: #dfe9f2;
  color: #8aa0b5;
  box-shadow: 0 4px 0 #c3d2df;
}
.onb-btn:disabled {
  opacity: 0.7;
}
.onb-skip {
  align-self: center;
  font-size: 12px;
  font-weight: 800;
  color: #5f7188;
  text-decoration: underline;
  padding: 4px 8px;
}
.slide-enter-active, .slide-leave-active { transition: all 0.25s ease; }
.slide-enter-from { opacity: 0; transform: translateX(24px); }
.slide-leave-to { opacity: 0; transform: translateX(-24px); }
</style>
