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
  endPress();
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

/* ---------- 点选 / 拖动（2026-11-12 重做命中归属） ----------
 * 孩子点卡时手指会晃、会压在卡片边缘、会两只手一起按 —— 旧实现三个坑：
 * 1) 位移只要 >8px 就算拖拽，松手没落进空槽就被整段吞掉；孩子以为没点上，
 *    再点一次常常落到旁边那张 → 表现为「选中的词和点的不一致」；
 * 2) 拖完用 400ms 时间窗压 click，把紧随其后的正常点按也一起吞了；
 * 3) activeWord 是组件级单份，第二根手指（手掌/另一只手）会把判定改到它按的卡。
 * 现在：位移 >12px 才算拖；松手时仍压在自己按下的那张卡上就按点按判定，
 * 晃到别处则静默放弃（绝不判到邻卡）；拖动结果用一次性 click 抑制；
 * 只认第一个按下的指针。键盘 Enter/Space 没有 pointer 事件，仍走 click。
 * 拖动期间在 window 上跟踪 move/up/cancel（不再依赖 setPointerCapture：
 * 触摸指针的捕获在部分环境不可靠，手指拖出卡片后收不到 up，状态会卡死，
 * 下一次点按就被当成"还有手指在按"直接丢弃）。 */
const DRAG_THRESHOLD = 12;
const dragWord = ref<Word | null>(null);
const dragPos = ref({ x: 0, y: 0 });
const dropHot = ref(false);
let pressPointerId: number | null = null;
let pressWord: Word | null = null;
let pressEl: HTMLElement | null = null;
let startX = 0;
let startY = 0;
let moved = false;
/** 一次手势只压掉浏览器紧跟 pointerup 补发的那一次 click（不再用时间窗） */
let swallowClick = false;

function hitTest(x: number, y: number): Element | null {
  if (typeof document.elementFromPoint !== "function") return null;
  return document.elementFromPoint(x, y);
}

/** 手指当前位置下是不是那个空槽（jsdom 没有 elementFromPoint，兜底 false） */
function slotUnder(x: number, y: number): boolean {
  const el = hitTest(x, y);
  return !!el && !!el.closest(".pic-slot");
}

/** 手指当前位置下是哪张图卡（取不到命中测试时返回 null） */
function cardUnder(x: number, y: number): HTMLElement | null {
  const el = hitTest(x, y);
  return el ? ((el.closest(".pic-card") as HTMLElement | null) ?? null) : null;
}

/** 手势期间在 window 上跟踪（捕获阶段）：手指拖出卡片也能收到 move/up */
function bindGestureListeners() {
  window.addEventListener("pointermove", onCardMove, true);
  window.addEventListener("pointerup", onCardUp, true);
  window.addEventListener("pointercancel", onCardCancel, true);
}
function unbindGestureListeners() {
  window.removeEventListener("pointermove", onCardMove, true);
  window.removeEventListener("pointerup", onCardUp, true);
  window.removeEventListener("pointercancel", onCardCancel, true);
}

function endPress() {
  unbindGestureListeners();
  pressPointerId = null;
  pressWord = null;
  pressEl = null;
  startX = 0;
  startY = 0;
  moved = false;
  dragWord.value = null;
  dropHot.value = false;
}

function onCardDown(e: PointerEvent, w: Word) {
  if (lock.value || solved.value) return;
  if (pressPointerId !== null) return; // 已经有一根手指在按：多指/手掌误触不算新选择
  pressPointerId = e.pointerId ?? 0; // jsdom 等环境派发的合成 PointerEvent 没有 pointerId
  pressWord = w;
  pressEl = (e.currentTarget as HTMLElement | null) ?? null;
  startX = e.clientX;
  startY = e.clientY;
  moved = false;
  swallowClick = false;
  bindGestureListeners();
}

function onCardMove(e: PointerEvent) {
  if (pressPointerId !== (e.pointerId ?? 0) || !pressWord) return;
  if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) > DRAG_THRESHOLD) {
    moved = true;
    dragWord.value = pressWord;
  }
  if (!moved) return;
  dragPos.value = { x: e.clientX, y: e.clientY };
  dropHot.value = slotUnder(e.clientX, e.clientY);
}

function onCardUp(e: PointerEvent) {
  if (pressPointerId !== (e.pointerId ?? 0)) return;
  const w = pressWord;
  const wasDrag = moved;
  const downEl = pressEl;
  const overSlot = wasDrag && slotUnder(e.clientX, e.clientY);
  endPress();
  if (!w) return;
  // 拖完浏览器可能补发一次 click：无论有没有落进空槽都压掉，避免同一次操作判两遍
  swallowClick = true;
  if (wasDrag) {
    if (overSlot) {
      sfxTap();
      pick(w);
    }
    return;
  }
  // 点按：松手时还在自己按下的这张卡上才算数。
  // 取不到命中测试（jsdom / 极端旧环境）时按"仍在原卡"处理，保证点击可用。
  const upEl = cardUnder(e.clientX, e.clientY);
  if (upEl && downEl && upEl !== downEl) return; // 手指晃到了别的卡上：放弃本次，不判邻卡
  sfxTap();
  pick(w);
}

function onCardCancel(e?: PointerEvent) {
  if (e && pressPointerId !== null && (e.pointerId ?? 0) !== pressPointerId) return;
  swallowClick = true; // 取消后浏览器也可能补发 click
  endPress();
}

function onCardClick(w: Word) {
  if (swallowClick) {
    swallowClick = false;
    return;
  }
  if (lock.value || solved.value) return;
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
  transition: transform 0.1s;
}
.pic-word {
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  line-height: 1.1;
  color: var(--ink);
  pointer-events: none;
  transition: transform 0.1s;
}
/* 按压/点错的反馈只动卡里的图与词，卡片自身（也就是手指命中框）不位移、不缩放：
   孩子压着卡片边缘或在抖动期间再点一下，判定仍落在同一张卡上，
   不会因为 transform 把命中测试挪到相邻卡或间隙（2026-11-12 走查修） */
.pic-card:active img,
.pic-card:active .pic-word {
  transform: scale(0.94);
}
.pic-card.wrong {
  border-color: var(--red);
  background: var(--state-bad-bg);
}
.pic-card.wrong img,
.pic-card.wrong .pic-word {
  animation: shake 0.4s;
}

/* 拖动浮层：跟着手指，不拦截命中测试 */
.drag-ghost {
  /* --gh 由宽屏档放大，margin 恒取一半使浮层中心落在手指处 */
  --gh: 88px;
  position: fixed;
  z-index: 999;
  width: var(--gh);
  height: var(--gh);
  margin: calc(var(--gh) / -2) 0 0 calc(var(--gh) / -2);
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

/* 宽屏（iPad 竖/横屏、分屏、桌面）：拼句子元素随视口放大，不再是恒定小尺寸
 *  - 句子条放宽到 920px，框架文字/嵌图/空槽同步放大；词图卡放大到 ~170px，更好点按拖动
 *  - 尺寸用 min(vw,vh) 双侧约束：竖屏由宽度主导、矮横屏由高度主导，放大但不溢出
 *  - 只改「值」不改结构，符合 DESIGN_SYSTEM §11.4「改值用 600」；
 *    手机横屏（844×390 也 ≥600）由下方后置的 max-height:480px 档覆盖回原值 */
@media (min-width: 600px) {
  .board { gap: clamp(20px, 2.4vmin, 34px); }
  .sentence {
    max-width: min(920px, 96%);
    padding: clamp(14px, 2vmin, 26px) clamp(24px, 3vw, 44px);
    gap: clamp(8px, 1.2vmin, 14px);
  }
  .frame, .ono-text { font-size: clamp(22px, min(3.4vh, 3vw), 38px); }
  .ono-emoji { font-size: clamp(26px, min(4.2vh, 3.6vw), 44px); }
  .pic-slot {
    width: clamp(92px, min(13vw, 12vh), 140px);
    height: clamp(92px, min(13vw, 12vh), 140px);
  }
  .pic-slot .slot-word { font-size: clamp(12px, 1.6vh, 18px); }
  .pic-static {
    width: clamp(68px, min(9vw, 8vh), 100px);
    height: clamp(68px, min(9vw, 8vh), 100px);
  }
  .bank { gap: clamp(14px, 2vmin, 22px); max-width: min(1000px, 96%); }
  .pic-card {
    width: clamp(112px, min(15vw, 13vh), 170px);
    height: clamp(120px, min(16vw, 14vh), 182px);
  }
  .pic-word { font-size: clamp(12px, 1.5vh, 17px); }
  .listen-btn {
    padding: clamp(10px, 1.6vmin, 16px) clamp(20px, 2.6vw, 34px);
    font-size: clamp(var(--fs-body), 2.2vh, 20px);
  }
  .answer-btn { padding: clamp(8px, 1.4vmin, 12px) clamp(18px, 2.2vw, 28px); }
  .next-btn {
    padding: clamp(14px, 2vmin, 20px) clamp(40px, 4vw, 64px);
    font-size: clamp(var(--fs-body), 2.4vh, 22px);
  }
  /* 拖动浮层同步放大（--gh 变化时 margin 自动取一半保持手指居中） */
  .drag-ghost { --gh: clamp(96px, 11vw, 128px); }
}

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
  /* 混合卡带单词标签，矮横屏下压到 80×84 才能一屏装下
     （88 时整列超视口 2px，词卡底部被 Home 条裁掉——2026-11-11 走查 #8） */
  .pic-card { width: 80px; height: 84px; padding: 4px 4px 2px; gap: 0; }
  .pic-word { font-size: var(--fs-small); line-height: 1; }
  .answer-btn { padding: 5px 12px; }
  .next-btn { padding: 9px 28px; }
  /* 覆盖上方 600 档的放大值，手机横屏空间紧 */
  .bank { gap: 14px; max-width: 100%; }
  .drag-ghost { --gh: 88px; }
}
</style>
