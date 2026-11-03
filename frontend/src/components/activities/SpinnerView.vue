<script setup lang="ts">
/**
 * 转盘复习（spinner）—— 登记表外首例代码事件（见 docs/ACTIVITY-VARIANTS.md）。
 *
 * 玩法口径（2026-11-02 调整：先开口、后推进）：
 *  · 点「转一转」→ 转盘高速旋转减速，顶部固定指针停到本课某词；
 *  · 停下**不主动朗读**：先展示词图，让孩子自己点麦克风大声读出来；
 *  · 孩子完成一次录音（计一次今日开口尝试）后，才出现「下一转」，进入下一词；
 *  · 一轮内每个词恰好转到一次（洗牌队列依次取，不重复）；
 *  · 全部词读完后按完成度结算，满分 3 星（纯复习、不判对错）。
 *  · 右上角小喇叭是自愿示范：孩子想先听标准发音时可点，默认不自动播。
 *
 * 舞台契约（与其他玩法一致）：emit done / progress / total；
 * 示范发音走 speak(word.en, { lessonId, wordId })，缺失预生成 mp3 时回退浏览器 TTS。
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { speak } from "../../services/speech";
import { sfxCorrect, sfxTap } from "../../services/effects";
import { celebrate } from "../../services/effects";
import { useProgressStore } from "../../stores/progress";
import { shuffleWith } from "../../utils/quizSession";
import { createRecorder, recorderSupported } from "../../utils/speechScore";
import type { Word } from "../../data/lessons";
import StageHead from "./StageHead.vue";
import {
  RotateCw,
  Volume2,
  Mic,
  Square,
  ChevronRight,
  ThumbsUp,
} from "@lucide/vue";

const props = defineProps<{ words: Word[] }>();
const emit = defineEmits(["done", "progress", "total"]);

const progress = useProgressStore();

const total = computed(() => props.words.length);
watch(total, () => emit("total", total.value), { immediate: true });
/** 词数较多时只保留双色扇区，避免 19 词在小圆盘上图文挤成一团；当前词卡承担详情 */
const dense = computed(() => total.value > 12);

/** 一轮访问队列（洗牌：同一轮内每个词只出现一次）；扇区视觉顺序仍按 words 原始顺序 */
const queue = ref<Word[]>(shuffleWith(props.words));
/** 已完成（孩子读完并点下一转）的词数；转盘目标 = queue[doneCount] */
const doneCount = ref(0);
const current = ref<Word | null>(null);
const visited = ref<Set<string>>(new Set());
const rotation = ref(0);
const spinning = ref(false);
const imgFail = ref<Record<string, boolean>>({});

/** 本词录音状态：idle 待开口 / listening 录音中 / done 已完成一次录音 */
type MicPhase = "idle" | "listening" | "done";
const micPhase = ref<MicPhase>("idle");
const micBlocked = ref(false);
const canRecord = recorderSupported();

let recorder: ReturnType<typeof createRecorder> | null = null;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let spinTimer: ReturnType<typeof setTimeout> | null = null;
let recTimer: ReturnType<typeof setTimeout> | null = null;

onBeforeUnmount(() => {
  if (settleTimer) clearTimeout(settleTimer);
  if (spinTimer) clearTimeout(spinTimer);
  if (recTimer) clearTimeout(recTimer);
  if (recorder) recorder.release();
});

const seg = computed(() => (total.value ? 360 / total.value : 360));
/** 已完成数量 → 顶栏进度 0-100（孩子读完一词才推进一格） */
const pct = computed(() => Math.round((doneCount.value / total.value) * 100));
watch(pct, (v) => emit("progress", v));

const finished = computed(() => doneCount.value >= queue.value.length);
const isLast = computed(() => doneCount.value + 1 >= queue.value.length);

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
  if (spinning.value || finished.value) return;
  const target = queue.value[doneCount.value];
  if (!target) return;
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
    // 停下不主动发音：重置到待开口，等孩子自己点麦克风
    micPhase.value = "idle";
    micBlocked.value = false;
  }, 1900);
}

/** 点一下开始录，再点一下结束；最多 5 秒自动收尾，避免孩子忘记停止 */
async function onMicTap() {
  if (micPhase.value === "listening") {
    await stopListening();
    return;
  }
  if (!canRecord) {
    micBlocked.value = true;
    return;
  }
  try {
    if (!recorder) recorder = createRecorder();
    await recorder.start();
    micPhase.value = "listening";
    micBlocked.value = false;
    if (recTimer) clearTimeout(recTimer);
    recTimer = setTimeout(() => void stopListening(), 5000);
  } catch {
    micBlocked.value = true;
    micPhase.value = "idle";
  }
}

async function stopListening() {
  if (recTimer) {
    clearTimeout(recTimer);
    recTimer = null;
  }
  if (!recorder) {
    micPhase.value = "idle";
    return;
  }
  const url = await recorder.stop();
  if (url) {
    // 仅用于判定"是否真的录到声音"，不在转盘回放；立即释放 ObjectURL，不入库不上传
    URL.revokeObjectURL(url);
    micPhase.value = "done";
    progress.addSpeakAttempt();
    sfxCorrect();
  } else {
    micPhase.value = "idle";
  }
}

/** 孩子读完 → 进入下一词；最后一词读完 → 结算（满分 3 星，无对错） */
function advance() {
  if (!current.value) return;
  sfxTap();
  doneCount.value++;
  current.value = null;
  micPhase.value = "idle";
  if (doneCount.value >= queue.value.length) {
    settleTimer = setTimeout(() => {
      celebrate();
      emit("done", 3);
    }, 900);
  }
}

/** 自愿示范：想先听标准发音时点喇叭，默认不自动播 */
function replay() {
  if (current.value) speak(current.value.en, { lessonId: current.value.lessonId, wordId: current.value.id });
}

const micLabel = computed(() => {
  if (micPhase.value === "listening") return "正在录…再点一下结束";
  if (micPhase.value === "done") return "读完啦，点下一转";
  return "点麦克风，大声读出来";
});
</script>

<template>
  <div class="spinner view">
    <StageHead class="spinner-head" :right-text="`已说 ${doneCount} / ${total}`">
      <template #tip>
        <RotateCw class="k-ico tip-ico" />
        转一转，先自己大声读出指针指到的单词
      </template>
    </StageHead>

    <div class="board view-body">
      <div class="wheel-wrap" :class="{ dense }">
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
            <div class="current-row">
              <button class="current-speak" @click="replay" aria-label="想听示范再点喇叭">
                <Volume2 class="k-ico" />
              </button>
              <span class="current-en">{{ current.en }}</span>
            </div>
            <span class="current-zh">{{ current.zh }}</span>
          </div>
        </template>
        <span v-else class="current-hint">点下面的按钮，开始转盘游戏</span>
      </div>

      <!-- 控制区：未停词 → 转一转；停词后 → 麦克风 + 下一转 -->
      <div class="control-zone">
        <template v-if="current && !finished">
          <!-- 麦克风不可用：不阻塞，提示直接读 + 可继续 -->
          <div v-if="micBlocked || !canRecord" class="mic-blocked">
            <p class="blocked-tip">🎤 麦克风不可用，看着词大声读出来就好</p>
            <button class="next-btn" data-haptic @click="advance">
              {{ isLast ? "完成" : "下一转" }}<ChevronRight class="k-ico" />
            </button>
          </div>

          <template v-else>
            <div class="mic-row">
              <button
                class="mic"
                :class="{ live: micPhase === 'listening' }"
                :aria-label="micPhase === 'listening' ? '结束录音' : '开始说话'"
                @click="onMicTap"
              >
                <Square v-if="micPhase === 'listening'" class="k-ico" />
                <Mic v-else class="k-ico" />
              </button>
              <button
                v-if="micPhase === 'done'"
                class="next-btn"
                data-haptic
                @click="advance"
              >
                <ThumbsUp class="k-ico" />
                {{ isLast ? "完成" : "下一转" }}<ChevronRight class="k-ico" />
              </button>
            </div>
            <p class="mic-label">{{ micLabel }}</p>
          </template>
        </template>

        <button class="spin-btn" :disabled="spinning || finished" data-haptic @click="spin">
          <RotateCw :class="{ spinning: spinning }" class="btn-ico" />
          {{ spinning ? "转动中…" : finished ? "完成啦" : "转一转" }}
        </button>
      </div>
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
  top: 9%;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  justify-content: center;
}
/* 扇区：教材小图在上、单词在下，紧凑排在外沿一圈。
   外移到 top:9%（半径更大、圆周间隔更宽）+ 小图收到 30px，
   避免 9 个扇区图文互相重叠（旧版 top:13%、图 44px、标签宽 92px 必挤）。 */
.sector-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  color: var(--white);
  line-height: 1.1;
}
.sector-img {
  width: 38px;
  height: 38px;
  object-fit: contain;
  border-radius: 7px;
}
.sector-emoji {
  font-size: 24px;
  line-height: 1;
}
.sector-word {
  font-size: 11px;
  font-weight: var(--fw-mid);
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}
.sector-label.hit .sector-word { color: var(--ok); }

/* 多词课时（如 19 词的 l11）：圆盘外沿只保留双色交替，图文详情由下方当前词卡展示 */
.wheel-wrap.dense .sector-img,
.wheel-wrap.dense .sector-word { display: none; }
.wheel-wrap.dense .sector-emoji {
  font-size: 15px;
  opacity: 0.82;
}

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
.current-row {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
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

/* 控制区 */
.control-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-xs);
  min-height: 84px;
  justify-content: center;
}
.mic-row {
  display: flex;
  align-items: center;
  gap: var(--gap-m);
}
.mic {
  width: 68px;
  height: 68px;
  flex: none;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  background: radial-gradient(
      circle at 35% 30%,
      rgba(255, 255, 255, 0.42),
      rgba(255, 255, 255, 0) 62%
    ),
    var(--orange);
  color: var(--on-tone);
  box-shadow: 0 6px 0 var(--orange-dark), 0 10px 18px rgba(0, 0, 0, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
  transition: transform 0.1s, box-shadow 0.1s;
}
.mic .k-ico { width: 30px; height: 30px; }
.mic:active,
.mic.live {
  transform: translateY(5px);
  box-shadow: 0 1px 0 var(--orange-dark);
}
.mic.live {
  animation: mic-pulse 1s infinite;
}
@keyframes mic-pulse {
  0%,
  100% { outline: 5px solid rgba(255, 159, 67, 0.32); }
  50% { outline: 12px solid rgba(255, 159, 67, 0.14); }
}
.mic-label {
  margin: 0;
  font-weight: var(--fw-strong);
  color: var(--ink-soft);
  font-size: var(--fs-small);
}
.next-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: var(--ok);
  color: var(--white);
  font-weight: var(--fw-strong);
  font-size: var(--fs-btn);
  border-radius: var(--radius-pill);
  padding: var(--gap-s) var(--gap-l);
  cursor: pointer;
  box-shadow: var(--shadow-hard);
}
.next-btn .k-ico { width: 20px; height: 20px; }
.next-btn:active { transform: translateY(1px); }
.mic-blocked {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-s);
}
.blocked-tip {
  margin: 0;
  text-align: center;
  font-weight: var(--fw-mid);
  color: var(--ink-soft);
  font-size: var(--fs-small);
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
  .sector-pos { top: 8%; }
  .sector-img { width: 24px; height: 24px; border-radius: 4px; }
  .sector-emoji { font-size: 17px; }
  .sector-word { font-size: 9px; }
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
  .control-zone { min-height: 56px; gap: 4px; }
  .mic { width: 52px; height: 52px; }
  .mic .k-ico { width: 24px; height: 24px; }
  .next-btn { padding: 6px var(--gap-m); }
  .spin-btn { padding: 6px var(--gap-m); }
  .btn-ico { width: 18px; height: 18px; }
}
</style>
