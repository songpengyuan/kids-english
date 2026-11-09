<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from "vue";
import { speak } from "../../services/speech";
import { sfxCorrect, sfxTap, sfxWrong } from "../../services/effects";
import type { Lesson, Word } from "../../data/lessons";
import { orderSentences } from "../../utils/orderSentences";
import StageHead from "./StageHead.vue";

const props = defineProps<{ lesson: Lesson }>();
const emit = defineEmits(["done", "progress", "total"]);

/**
 * 题目 = 看图填空（2026-11-05，参考孩子的 The Wheels on the Bus 安静书）：
 * 框架文字印死（I see the ___ / It's a ___），只把本课实义词位置留空，
 * 底部放本课词图卡，孩子点正确的图填进空槽。不再点文字单词块排序。
 */
const items = computed(() => orderSentences(props.lesson));

const idx = ref(0);
const solved = ref(false);
const lock = ref(false);
const wrongCount = ref(0);
/** 刚点错、要抖动一下的那张图卡 id（不锁，可继续点） */
const errKey = ref<string | null>(null);

const total = computed(() => items.value.length);
const cur = computed(() => items.value[idx.value]);

/** 选项：正确答案始终在场 + 从图卡池随机抽 2 张干扰，整体洗牌排布。
 *  为什么不直接 shuffle(池).slice(0,3)：l12 安静书的图卡池有 8 张部件，
 *  裁前 3 会以 5/8 概率把正确答案裁掉——孩子对着「The ___ on the bus go
 *  round and round.」找不到可点的轮子图（2026-11-06 走查实测踩中）。 */
const options = computed<Word[]>(() => {
  const t = cur.value;
  if (!t) return [];
  const distractors = shuffle(t.candidates.filter((w) => w.id !== t.target.id)).slice(0, 2);
  return shuffle([t.target, ...distractors]);
});

/**  Fisher–Yates 洗牌：每次进题随机抽干扰、随机排图卡，避免孩子靠背位置答题 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const stars = computed(() => (wrongCount.value === 0 ? 3 : wrongCount.value <= 2 ? 2 : 1));

watch(total, () => emit("total", total.value), { immediate: true });

/** 进题自动朗读完整句（与听音选图同节奏），350ms 延迟避免与上题朗读打架。
 *  句柄必须可清理：重进题先掐上一条，组件卸载时清掉——否则退出玩法后
 *  会在新页面上凭空把下一句读出来（TalkView 同款问题的教训）。 */
let readTimer: number | null = null;
watch(
  idx,
  () => {
    if (readTimer !== null) clearTimeout(readTimer);
    if (!cur.value) return;
    readTimer = window.setTimeout(() => {
      readTimer = null;
      if (cur.value) speak(cur.value.en, { lessonId: props.lesson.id });
    }, 350);
  },
  { immediate: true }
);
onScopeDispose(() => {
  if (readTimer !== null) clearTimeout(readTimer);
});

function playSentence() {
  if (cur.value) speak(cur.value.en, { lessonId: props.lesson.id });
}

function pick(w: Word) {
  if (lock.value || solved.value || !cur.value) return;
  if (w.id === cur.value.target.id) {
    lock.value = true;
    solved.value = true;
    sfxCorrect();
    void speak(cur.value.en, { lessonId: props.lesson.id });
  } else {
    wrongCount.value++;
    errKey.value = w.id;
    sfxWrong();
    // 点错也念一下孩子点到的词，让他知道自己指的是什么
    void speak(w.en, { lessonId: props.lesson.id, wordId: w.id });
    setTimeout(() => (errKey.value = null), 500);
  }
}

/* ---------- 拖动路径（2026-11-09） ----------
 * 点击仍是主路径（低龄最稳），拖动是补充手感：按下后移动超过 8px 才算拖，
 * 松手落在空槽上就判定，落在别处则静默收回（不计错、不朗读）。
 * 统一用 pointer 事件：手机触摸和鼠标同一套逻辑，键盘 Enter/Space 仍走 click。 */
const dragWord = ref<Word | null>(null);
const dragPos = ref({ x: 0, y: 0 });
const dropHot = ref(false);
let startX = 0;
let startY = 0;
let moved = false;
let activeWord: Word | null = null;
/** 拖完会补发一次 click，用时间戳压掉，避免同一次操作判两遍 */
let ignoreClickUntil = 0;

/** 手指当前位置下是不是那个空槽（jsdom 没有 elementFromPoint，兜底 false） */
function slotUnder(x: number, y: number): boolean {
  if (typeof document.elementFromPoint !== "function") return false;
  const el = document.elementFromPoint(x, y);
  return !!el && !!el.closest(".pic-slot");
}

function onCardDown(e: PointerEvent, w: Word) {
  if (lock.value || solved.value) return;
  activeWord = w;
  startX = e.clientX;
  startY = e.clientY;
  moved = false;
  (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
}

function onCardMove(e: PointerEvent) {
  if (!activeWord) return;
  if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) > 8) {
    moved = true;
    dragWord.value = activeWord;
  }
  if (!moved) return;
  dragPos.value = { x: e.clientX, y: e.clientY };
  dropHot.value = slotUnder(e.clientX, e.clientY);
}

function onCardUp(e: PointerEvent) {
  const w = activeWord;
  activeWord = null;
  if (!w) return;
  const wasDrag = moved;
  moved = false;
  dragWord.value = null;
  dropHot.value = false;
  if (!wasDrag) return; // 没移动 = 点按，交给 click
  ignoreClickUntil = Date.now() + 400;
  if (slotUnder(e.clientX, e.clientY)) {
    sfxTap();
    pick(w);
  }
}

function onCardCancel() {
  activeWord = null;
  moved = false;
  dragWord.value = null;
  dropHot.value = false;
}

function onCardClick(w: Word) {
  if (Date.now() < ignoreClickUntil) return;
  sfxTap();
  pick(w);
}

/** 兜底：孩子卡住时直接把正确图填进去（不计错、不降星），保证能继续 */
function revealAnswer() {
  if (lock.value || solved.value || !cur.value) return;
  lock.value = true;
  solved.value = true;
  sfxCorrect();
  void speak(cur.value.en, { lessonId: props.lesson.id });
}

function nextSentence() {
  emit("progress", Math.round(((idx.value + 1) / total.value) * 100));
  if (idx.value + 1 >= total.value) {
    emit("done", stars.value);
    return;
  }
  idx.value++;
  solved.value = false;
  lock.value = false;
  errKey.value = null;
}

function finishEmpty() {
  emit("progress", 100);
  emit("done", 0);
}
</script>

<template>
  <div class="order view">
    <StageHead class="order-head" :right-text="`${idx + 1} / ${total}`">
      <template #tip>
        <span class="tip-ico">🧩</span>
        点一下图卡，或把它拖进空槽
      </template>
    </StageHead>

    <div v-if="cur" class="board view-body">
      <button class="listen-btn" @click="playSentence" aria-label="Listen">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
        <span>Listen</span>
      </button>

      <!-- 句子：框架文字 + 中间一个图空槽（l12 安静书走 segments：句中嵌校车图、
           拟声以彩色图形呈现——与实拍书页同构） -->
      <div class="sentence">
        <template v-if="cur.segments">
          <template v-for="(seg, i) in cur.segments" :key="i">
            <span v-if="seg.type === 'text'" class="frame">{{ seg.text }}</span>
            <span
              v-else-if="seg.type === 'pic' && seg.word.id === cur.target.id"
              class="pic-slot"
              :class="{ filled: solved, hot: dropHot && !solved }"
            >
              <template v-if="solved">
                <img :src="seg.word.image!" :alt="seg.word.en" />
                <span class="slot-word">{{ seg.word.en }}</span>
              </template>
            </span>
            <span v-else-if="seg.type === 'pic'" class="pic-static">
              <img :src="seg.word.image!" :alt="seg.word.en" />
            </span>
            <span v-else class="ono" :class="`ono-${seg.ono.tone}`">
              <span class="ono-emoji">{{ seg.ono.emoji }}</span>
              <span class="ono-text">{{ seg.ono.text }}</span>
            </span>
          </template>
        </template>
        <template v-else>
          <span class="frame">{{ cur.before }}</span>
          <span class="pic-slot" :class="{ filled: solved, hot: dropHot && !solved }">
            <template v-if="solved">
              <img :src="cur.target.image!" :alt="cur.target.en" />
              <span class="slot-word">{{ cur.target.en }}</span>
            </template>
          </span>
          <span class="frame">{{ cur.after }}</span>
        </template>
      </div>

      <button
        v-if="!solved"
        class="answer-btn"
        :disabled="lock"
        data-haptic
        aria-label="显示正确答案"
        @click="revealAnswer"
      >
        看答案
      </button>

      <!-- 底部词图卡：图 + 单词标签（混合卡），点击或拖到空槽都算作答 -->
      <div v-if="!solved" class="bank">
        <button
          v-for="o in options"
          :key="o.id"
          class="pic-card"
          :class="{ wrong: errKey === o.id }"
          data-haptic
          @pointerdown="onCardDown($event, o)"
          @pointermove="onCardMove($event)"
          @pointerup="onCardUp($event)"
          @pointercancel="onCardCancel"
          @click="onCardClick(o)"
        >
          <img :src="o.image!" :alt="o.en" />
          <span class="pic-word">{{ o.en }}</span>
        </button>
      </div>

      <!-- 拖动中的浮层：跟着手指走，点击穿透（落点判定靠 elementFromPoint） -->
      <div
        v-if="dragWord"
        class="drag-ghost"
        :style="{ left: dragPos.x + 'px', top: dragPos.y + 'px' }"
        aria-hidden="true"
      >
        <img :src="dragWord.image!" alt="" />
      </div>

      <button v-if="solved" class="next-btn" @click="nextSentence" data-haptic>
        {{ idx + 1 >= total ? "Finish ✓" : "Next →" }}
      </button>
    </div>

    <!-- 本课没有可填空的图（词表没图）：直接放行，不白屏卡死 -->
    <div v-else class="board view-body">
      <button class="next-btn" @click="finishEmpty" data-haptic>完成</button>
    </div>
  </div>
</template>

<style scoped>
.order-head { margin-bottom: var(--gap-s); }
.tip-ico { font-size: var(--fs-title); }

.board {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--gap-l, 24px);
  padding: var(--gap-s);
}

/* 句子条：框架文字大而居中，中间一个虚线方槽等图 */
.sentence {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
  max-width: 100%;
  padding: var(--gap-m) var(--gap-l, 24px);
  background: var(--card-bg);
  border: 2px solid var(--line);
  border-radius: var(--radius);
}
.frame {
  font-size: var(--fs-title);
  font-weight: var(--fw-mid);
  color: var(--ink);
}
.pic-slot {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  width: 84px;
  height: 84px;
  border: 3px dashed var(--ink-faint);
  border-radius: var(--radius);
  background: var(--card-bg);
  transition: border-color 0.15s, background 0.15s;
}
/* 拖动经过时的落点高亮：告诉孩子"松手就填这里" */
.pic-slot.hot {
  border-color: var(--brand);
  background: var(--brand-soft);
}
.pic-slot.filled {
  border-style: solid;
  border-color: var(--ok);
  background: var(--state-ok-bg);
}
.pic-slot img {
  width: 100%;
  min-height: 0;
  flex: 1;
  object-fit: contain;
  border-radius: var(--radius-s);
}
.slot-word {
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  line-height: 1;
  color: var(--ink);
}

/* 句中嵌图（校车）：与图卡同风格的小方图，恒定填充不参与填空 */
.pic-static {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border: 2px solid var(--line);
  border-radius: var(--radius);
  background: var(--media-bg);
  overflow: hidden;
}
.pic-static img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* 拟声图形段：彩色词 + 表情图形（对应安静书实拍页），不参与填空 */
.ono {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.ono-emoji { font-size: var(--fs-title); }
.ono-text { font-size: var(--fs-title); font-weight: var(--fw-strong); }
.ono-red { color: var(--red); }
.ono-blue { color: var(--c-blue); }
.ono-green { color: var(--c-green); }
.ono-orange { color: var(--c-orange); }
.ono-purple { color: var(--c-purple); }
.ono-gold { color: var(--c-gold); }
.ono-faint { color: var(--ink-soft); }

/* 底部词图卡（图 + 单词混合卡） */
.bank {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: center;
  max-width: 100%;
}
.pic-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 112px;
  height: 120px;
  padding: 6px 6px 4px;
  background: var(--card-bg);
  border: 2px solid var(--line);
  border-radius: var(--radius);
  cursor: pointer;
  /* 拖动判定需要 pointermove 不被浏览器拿去滚页面 */
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transition: transform 0.1s, border-color 0.1s;
}
.pic-card img {
  width: 100%;
  flex: 1;
  min-height: 0;
  object-fit: contain;
  pointer-events: none;
}
.pic-word {
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  line-height: 1.1;
  color: var(--ink);
  pointer-events: none;
}
.pic-card:active { transform: scale(0.95); }
.pic-card.wrong {
  border-color: var(--red);
  background: var(--state-bad-bg);
  animation: shake 0.4s;
}

/* 拖动浮层：跟着手指，不拦截命中测试 */
.drag-ghost {
  position: fixed;
  z-index: 999;
  width: 88px;
  height: 88px;
  margin: -44px 0 0 -44px;
  padding: 6px;
  background: var(--card-bg);
  border: 2px solid var(--brand);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  pointer-events: none;
  opacity: 0.92;
}
.drag-ghost img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}

.listen-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: none;
  border-radius: 999px;
  background: var(--brand-soft);
  color: var(--brand);
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
  cursor: pointer;
}
.listen-btn:active { transform: scale(0.95); }

.answer-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 18px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--btn-plain-bg);
  color: var(--ink-soft);
  font-weight: var(--fw-mid);
  font-size: var(--fs-small);
  cursor: pointer;
}
.answer-btn:active { transform: scale(0.95); }
.answer-btn:disabled {
  background: var(--btn-off-bg);
  color: var(--btn-off-ink);
  cursor: default;
}

.next-btn {
  display: block;
  margin: 0 auto;
  padding: 14px 40px;
  border: none;
  border-radius: 999px;
  background: var(--brand);
  color: var(--on-tone);
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
  cursor: pointer;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--brand) 35%, transparent);
}
.next-btn:active { transform: scale(0.95); }

/* 手机矮横屏（≤480px 高）：压缩纵向链条——槽与图卡缩小、间距收紧，
 * 头部 + Listen + 句子条 + 看答案 + 三张图卡要一屏装下
 * （layout-audit 实测 phone SE/14 横屏图卡被底边裁掉 40-48px）
 * 注：SE 横屏仍有 2px 的 #app 内部滚动，HEAD 旧版同样存在，与本轮混合卡无关 */
@media (max-height: 480px) {
  .order-head { margin-bottom: var(--gap-xs); }
  .board { gap: var(--gap-xs); padding: var(--gap-xs) var(--gap-s); }
  .listen-btn { padding: 5px 12px; font-size: var(--fs-small); }
  .sentence { padding: var(--gap-xs) var(--gap-m); }
  .frame { font-size: var(--fs-body); }
  .pic-slot { width: 60px; height: 60px; }
  .pic-static { width: 56px; height: 56px; }
  .ono-emoji { font-size: var(--fs-body); }
  .ono-text { font-size: var(--fs-body); }
  /* 混合卡带单词标签，矮横屏下压到 80×88 才能一屏装下 */
  .pic-card { width: 80px; height: 88px; padding: 4px 4px 2px; gap: 0; }
  .pic-word { font-size: var(--fs-small); line-height: 1; }
  .answer-btn { padding: 5px 12px; }
  .next-btn { padding: 9px 28px; }
}
</style>
