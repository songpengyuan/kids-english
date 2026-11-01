<script setup lang="ts">
/**
 * 转盘复习（spinner）—— 登记表外首例代码事件（见 docs/ACTIVITY-VARIANTS.md）。
 *
 * 玩法口径（2026-11-01 教材 Day 6 拓展游戏 App 化）：
 *  · 点「转一转」→ 转盘高速旋转减速，顶部固定指针停到本课某词；
 *  · 停下自动朗读该词图 + 英文，记一次 seen（**不判对错**，纯点读复习）；
 *  · 一轮内每个词恰好转到一次（洗牌队列依次取，不重复）；
 *  · 9 词全部转到后按完成度结算，满分 3 星。
 *
 * 舞台契约（与其他玩法一致）：emit done / progress / total；
 * 发音走 speak(word.en, { lessonId, wordId })，缺失预生成 mp3 时回退浏览器 TTS。
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { speak } from "../../services/speech";
import { sfxCorrect, sfxTap } from "../../services/effects";
import { celebrate } from "../../services/effects";
import { useProgressStore } from "../../stores/progress";
import { shuffleWith } from "../../utils/quizSession";
import type { Word } from "../../data/lessons";
import StageHead from "./StageHead.vue";
import { RotateCw, Volume2 } from "@lucide/vue";

const props = defineProps<{ words: Word[] }>();
const emit = defineEmits(["done", "progress", "total"]);

const progress = useProgressStore();

const total = computed(() => props.words.length);
watch(total, () => emit("total", total.value), { immediate: true });

/** 一轮访问队列（洗牌：同一轮内每个词只出现一次）；扇区视觉顺序仍按 words 原始顺序 */
const queue = ref<Word[]>(shuffleWith(props.words));
const idx = ref(0);
const current = ref<Word | null>(null);
const visited = ref<Set<string>>(new Set());
const rotation = ref(0);
const spinning = ref(false);
const imgFail = ref<Record<string, boolean>>({});

let settleTimer: ReturnType<typeof setTimeout> | null = null;
let spinTimer: ReturnType<typeof setTimeout> | null = null;
onBeforeUnmount(() => {
  if (settleTimer) clearTimeout(settleTimer);
  if (spinTimer) clearTimeout(spinTimer);
});

const seg = computed(() => (total.value ? 360 / total.value : 360));
/** 已转到数量 → 顶栏进度 0-100 */
const pct = computed(() => Math.round((idx.value / total.value) * 100));
watch(pct, (v) => emit("progress", v));

/** 圆盘交替底色（奇偶扇区）：品牌浅底 / 卡片底，模板内联 var()，无硬编码色值 */
const wheelBg = computed(() => {
  const parts: string[] = [];
  for (let i = 0; i < total.value; i++) {
    const from = i * seg.value;
    const to = (i + 1) * seg.value;
    parts.push(`${i % 2 === 0 ? "var(--brand-soft)" : "var(--card-bg)"} ${from}deg ${to}deg`);
  }
  return `conic-gradient(from 0deg, ${parts.join(", ")})`;
});

/** 扇区标签定位：先转到扇区中心角；内层再反向抵消，文字保持正向可读。
 *  水平居中（translateX）与角度抵消分两层，避免 transform 矩阵顺序把居中带偏。 */
function sectorStyle(i: number) {
  const center = i * seg.value + seg.value / 2;
  return { transform: `rotate(${center}deg)` };
}
function labelStyle(i: number) {
  const center = i * seg.value + seg.value / 2;
  return { transform: `rotate(${-center}deg)` };
}

function spin() {
  if (spinning.value || idx.value >= queue.value.length) return;
  const target = queue.value[idx.value];
  const i = props.words.findIndex((w) => w.id === target.id);
  if (i < 0) return;
  sfxTap();
  spinning.value = true;

  const center = i * seg.value + seg.value / 2;
  // 单调递增累计角度：向上取整到整圈 + 多转 5 整圈。
  // CSS rotate 与 conic-gradient 同为顺时针、固定指针在正上方 0°：扇区静态中心
  // 位于 center，圆盘需再顺时针转到 (360−center)，使 center + rotation ≡ 0 (mod 360)，
  // 目标扇区中心才正对顶部指针（写成 +center 会镜像到对称扇区 j = total−1−i）。
  const targetAngle = (360 - center) % 360;
  rotation.value = Math.ceil(rotation.value / 360) * 360 + 360 * 5 + targetAngle;

  spinTimer = setTimeout(() => {
    spinning.value = false;
    current.value = target;
    visited.value.add(target.id);
    progress.recordWord(target.lessonId, target.id, { seen: 1 });
    speak(target.en, { lessonId: target.lessonId, wordId: target.id });
    sfxCorrect();
    idx.value++;

    if (idx.value >= queue.value.length) {
      // 一轮遍历完成：稍作停留让孩子看完最后一词，再结算（满分 3 星，无对错）
      settleTimer = setTimeout(() => {
        celebrate();
        emit("done", 3);
      }, 1300);
    }
  }, 1900);
}

function replay() {
  if (current.value) speak(current.value.en, { lessonId: current.value.lessonId, wordId: current.value.id });
}

const finished = computed(() => idx.value >= queue.value.length);
</script>

<template>
  <div class="spinner view">
    <StageHead class="spinner-head" :right-text="`已转 ${idx} / ${total}`">
      <template #tip>
        <RotateCw class="k-ico tip-ico" />
        转一转，读出指针指到的单词
      </template>
    </StageHead>

    <div class="board view-body">
      <div class="wheel-wrap">
        <!-- 顶部固定指针 -->
        <div class="pointer" aria-hidden="true" />
        <div
          class="wheel"
          :class="{ spinning }"
          :style="{ transform: `rotate(${rotation}deg)`, background: wheelBg }"
        >
          <div
            v-for="(w, i) in words"
            :key="w.id"
            class="sector"
            :style="sectorStyle(i)"
          >
            <div class="sector-pos">
              <span class="sector-label" :class="{ hit: visited.has(w.id) }" :style="labelStyle(i)">
                <img
                  v-if="!imgFail[w.id] && w.image"
                  class="sector-img"
                  loading="lazy"
                  decoding="async"
                  :src="w.image"
                  :alt="w.en"
                  @error="imgFail[w.id] = true"
                />
                <span v-else class="sector-emoji">{{ w.emoji }}</span>
                <span class="sector-word">{{ w.en }}</span>
              </span>
            </div>
          </div>
          <div class="hub" aria-hidden="true">
            <RotateCw class="hub-ico" />
          </div>
        </div>
      </div>

      <!-- 当前停到的词卡 -->
      <div class="current" :class="{ empty: !current }">
        <template v-if="current">
          <div class="current-art">
            <img
              v-if="!imgFail[current.id] && current.image"
              :src="current.image"
              :alt="current.en"
              @error="imgFail[current.id] = true"
            />
            <span v-else class="current-emoji">{{ current.emoji }}</span>
          </div>
          <div class="current-text">
            <button class="current-speak" @click="replay" aria-label="再听一遍">
              <Volume2 class="k-ico" />
            </button>
            <span class="current-en">{{ current.en }}</span>
            <span class="current-zh">{{ current.zh }}</span>
          </div>
        </template>
        <span v-else class="current-hint">点下面的按钮，开始转盘游戏</span>
      </div>

      <button class="spin-btn" :disabled="spinning || finished" data-haptic @click="spin">
        <RotateCw :class="{ spinning: spinning }" class="btn-ico" />
        {{ spinning ? "转动中…" : finished ? "完成啦" : "转一转" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.spinner-head {
  margin-bottom: var(--gap-s);
}
.tip-ico { color: var(--orange); }

.board {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--gap-m);
  min-height: 0;
}

.wheel-wrap {
  position: relative;
  width: min(62vw, 300px);
  aspect-ratio: 1;
  flex: none;
}
.pointer {
  position: absolute;
  top: -2px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 12px solid transparent;
  border-right: 12px solid transparent;
  border-top: 20px solid var(--orange);
  z-index: 3;
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.18));
}
.wheel {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 3px solid var(--line);
  overflow: hidden;
  transition: transform 1.9s cubic-bezier(0.12, 0.82, 0.18, 1);
  will-change: transform;
}
.wheel:not(.spinning) {
  transition: none;
}

.sector {
  position: absolute;
  inset: 0;
  transform-origin: center;
}
.sector-pos {
  position: absolute;
  top: 13%;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  justify-content: center;
}
.sector-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 92px;
  color: var(--ink);
}
.sector-img {
  width: clamp(28px, 7vw, 44px);
  height: clamp(28px, 7vw, 44px);
  object-fit: contain;
}
.sector-emoji {
  font-size: clamp(22px, 5.5vw, 34px);
  line-height: 1;
}
.sector-word {
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  max-width: 88px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sector-label.hit .sector-word { color: var(--ok-dark); }

.hub {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 58px;
  height: 58px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: var(--orange);
  color: var(--white);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid var(--card-bg);
  z-index: 2;
}
.hub-ico { width: 26px; height: 26px; }

.current {
  display: flex;
  align-items: center;
  gap: var(--gap-m);
  background: var(--card-bg);
  border: 2px solid var(--line);
  border-radius: var(--radius);
  padding: var(--gap-s) var(--gap-m);
  min-height: 96px;
  min-width: min(84vw, 340px);
  justify-content: center;
}
.current.empty {
  border-style: dashed;
  background: transparent;
}
.current-art {
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.current-art img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.current-emoji { font-size: var(--fs-emoji-l); }
.current-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.current-speak {
  border: none;
  background: var(--brand-soft);
  color: var(--brand-deep);
  border-radius: var(--radius-pill);
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex: none;
}
.current-en {
  font-size: var(--fs-title);
  font-weight: var(--fw-strong);
  color: var(--ink);
}
.current-zh {
  font-size: var(--fs-body);
  color: var(--ink-soft);
}
.current-hint {
  color: var(--ink-faint);
  font-weight: var(--fw-mid);
}

.spin-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-s);
  border: none;
  background: var(--orange);
  color: var(--white);
  font-weight: var(--fw-strong);
  font-size: var(--fs-btn);
  border-radius: var(--radius-pill);
  padding: var(--gap-s) var(--gap-l);
  cursor: pointer;
  box-shadow: var(--shadow-hard);
}
.spin-btn:disabled {
  opacity: 0.55;
  cursor: default;
  box-shadow: none;
}
.btn-ico { width: 22px; height: 22px; }
.btn-ico.spinning { animation: spin-ico 0.9s linear infinite; }
@keyframes spin-ico {
  to { transform: rotate(360deg); }
}

/* 手机矮横屏（≤480px 高）：圆盘改由视口高度主导并整体压缩，
   否则 300px 圆盘 + 词卡 + 按钮会把底部按钮挤出视口（参照 QuizView/MatchView 矮横屏惯例）。 */
@media (max-height: 480px) {
  .spinner-head { margin-bottom: var(--gap-xs); }
  .board { gap: var(--gap-xs); }
  .wheel-wrap { width: min(42vw, 38vh, 220px); }
  .sector-label { width: 76px; gap: 1px; }
  .sector-img { width: clamp(22px, 6vh, 32px); height: clamp(22px, 6vh, 32px); }
  .sector-emoji { font-size: clamp(18px, 5vh, 26px); }
  .sector-word { font-size: 12px; max-width: 72px; }
  .hub { width: 46px; height: 46px; border-width: 2px; }
  .hub-ico { width: 22px; height: 22px; }
  .current {
    min-height: 54px;
    min-width: min(70vw, 300px);
    padding: var(--gap-xs) var(--gap-m);
    gap: var(--gap-s);
  }
  .current-art { width: 50px; height: 50px; }
  .current-speak { width: 30px; height: 30px; }
  .spin-btn { padding: 6px var(--gap-m); }
  .btn-ico { width: 18px; height: 18px; }
}
</style>
