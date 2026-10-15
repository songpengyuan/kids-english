<script setup lang="ts">
import { computed, ref, watch, onMounted } from "vue";
import WordCard from "./WordCard.vue";
import Pager from "./Pager.vue";
import { celebrate, bigCelebrate, sfxCorrect } from "../../services/effects";
import { useLearnSession } from "../../composables/useLearnSession";
import { speak } from "../../services/speech";
import type { Word, Phrase } from "../../data/lessons";
import { Check, MousePointerClick, Volume2 } from "@lucide/vue";
import BaseButton from "../ui/BaseButton.vue";
import SafeBottom from "../layout/SafeBottom.vue";

/**
 * 看图学词（点读）—— 逻辑在 composables/useLearnSession，这里只做渲染与音效。
 *
 * 两种玩法样式（lesson.stageStyle）：
 *  - cards（默认）：多邻国式网格点读，分页按可用空间动态计算；星级 = 点读覆盖率。
 *  - dialog（l10 亲子口语对话卡）：大动物 + 妈妈问「What's that?」/ 孩子答「It's a ...」
 *    对话气泡，点动物/词条听发音；星级规则不变（全部点过发音 = 3 星）。
 */
const props = defineProps<{
  words: Word[];
  /** dialog 模式：亲子口语对话卡（l10） */
  dialog?: boolean;
  phrases?: Phrase[];
}>();
const emit = defineEmits(["done", "progress", "total"]);

const {
  stageEl,
  gridStyle,
  page,
  total,
  items,
  isLast,
  gotoNext,
  gotoPrev,
  gotoPage,
  markTapped,
  tapped,
  tappedCount,
  stars,
} = useLearnSession(computed(() => props.words));

/** 页进度 → 顶栏进度条（多邻国式：学单词逐页有进度）；页总数同步上报显示 x/y */
watch(
  [page, total],
  () => {
    emit("total", total.value);
    emit("progress", Math.round(((page.value + 1) / total.value) * 100));
  },
  { immediate: true }
);

/** 本课全部词都点过发音（完成前置条件） */
const allTapped = computed(() => props.words.length > 0 && tappedCount.value >= props.words.length);
/** 还差几个词没点（提示用） */
const remaining = computed(() => Math.max(0, props.words.length - tappedCount.value));
/** 完成按钮可点 = 最后一页 && 全部点过（dialog 模式不分页，恒为最后一页） */
const canFinish = computed(() => (props.dialog || isLast.value) && allTapped.value);

function finish() {
  if (!canFinish.value) return;
  sfxCorrect();
  bigCelebrate();
  celebrate();
  // 星级 = 点读覆盖率（都点过发音才 3 星），交给 useLessonFlow 记录
  emit("done", stars.value);
}

/* ================= dialog 亲子口语对话卡 ================= */
/** 当前展示的大动物（默认第一个词） */
const current = ref<Word>(props.words[0]);
/** 妈妈问句：What's that?（对话卡第一句） */
const questionPhrase = computed<Phrase | null>(() => props.phrases?.[0] ?? null);
/** 当前动物的答句：It's a frog. 等（找不到则回退词音） */
const answerPhrase = computed<Phrase | null>(() => {
  const en = current.value.en.toLowerCase();
  const p = (props.phrases ?? []).find(
    (x) => !x.en.includes("?") && x.en.toLowerCase().includes(en)
  );
  return p ?? null;
});
/** 已点读覆盖（dialog 模式下进度 = 点读覆盖率，不分页） */
watch(
  tappedCount,
  () => {
    emit("total", 1);
    emit("progress", Math.round((tappedCount.value / props.words.length) * 100));
  },
  { immediate: true }
);

/** 进页自动播第一个动物发音（不算点读，星星仍要手动点） */
onMounted(() => {
  if (props.dialog && props.words[0]) {
    speak(props.words[0].en, {
      lessonId: props.words[0].lessonId,
      wordId: props.words[0].id,
    });
  }
});

function playWord(w: Word) {
  speak(w.en, { lessonId: w.lessonId, wordId: w.id });
}
/** 点大图/词条：切换展示 + 发音 + 记为已点读 */
function tapWord(w: Word) {
  current.value = w;
  playWord(w);
  markTapped(w);
}
/** 点妈妈问句气泡：播放 What's that? */
function tapQuestion() {
  if (questionPhrase.value) speak(questionPhrase.value.en);
}
/** 点孩子答句气泡：优先播对应句，否则播词音；记为已点读 */
function tapAnswer() {
  const p = answerPhrase.value;
  if (p) speak(p.en);
  else playWord(current.value);
  markTapped(current.value);
}
/** 当前动物已点读过（对话气泡角标） */
const currentTapped = computed(() => tapped.value.has(current.value.id));
</script>

<template>
  <div class="learn view">
    <!-- ===== dialog：亲子口语对话卡（l10） ===== -->
    <template v-if="dialog">
      <p class="hint anim-fade-up">
        <MousePointerClick class="k-ico" />点动物听发音，点对话再听一遍
      </p>

      <div class="dlg-stage">
        <!-- 丛林场景：妈妈问 → 大动物 → 孩子答 -->
        <div class="dlg-scene">
          <div class="trees left">🌴</div>
          <div class="trees right">🌴</div>

          <button class="dlg-bubble q" aria-label="妈妈问：What's that？" @click="tapQuestion">
            <span class="dlg-who">妈妈问</span>
            <span class="dlg-text">What's that?</span>
            <Volume2 class="dlg-vol k-ico" />
          </button>

          <button class="dlg-animal" aria-label="点动物听发音" @click="tapWord(current)">
            <span class="dlg-emoji">{{ current.emoji }}</span>
            <span class="dlg-en">{{ current.en }}</span>
            <span class="dlg-zh">{{ current.zh }}</span>
            <span v-if="currentTapped" class="dlg-done">✓</span>
          </button>

          <button class="dlg-bubble a" aria-label="孩子答：It's a ..." @click="tapAnswer">
            <span class="dlg-who">孩子答</span>
            <span class="dlg-text">It's a {{ current.en }}.</span>
            <Volume2 class="dlg-vol k-ico" />
          </button>

          <div class="dlg-kid">🧒</div>
        </div>

        <!-- 底部词条：点选切换大动物 -->
        <div class="dlg-strip">
          <button
            v-for="w in words"
            :key="w.id"
            class="dlg-chip"
            :class="{ on: w.id === current.id, heard: tapped.has(w.id) }"
            @click="tapWord(w)"
          >
            <span class="dlg-chip-emoji">{{ w.emoji }}</span>
            <span class="dlg-chip-en">{{ w.en }}</span>
          </button>
        </div>
      </div>
    </template>

    <!-- ===== cards：网格点读（默认，其余课） ===== -->
    <template v-else>
      <p class="hint anim-fade-up">
        <MousePointerClick class="k-ico" />点图片听发音，点单词再听一遍
        <span v-if="total > 1" class="hint-page">（共 {{ total }} 页）</span>
      </p>

      <!-- 内容区：尺寸被实测，用于反推每页容量 -->
      <div class="stage" ref="stageEl">
        <div class="grid" :style="gridStyle">
          <WordCard
            v-for="(w, i) in items"
            :key="w.id"
            :word="w"
            :enter-index="i"
            :marked="tapped.has(w.id)"
            @tap="markTapped"
          />
        </div>
      </div>
    </template>

    <!-- 贴底操作区：统一底部安全容器（Home 条防遮挡 + 呼吸间距） -->
    <SafeBottom class="next-zone" :gap="24">
      <Pager v-if="!dialog" :page="page" :total="total" hide-dots @prev="gotoPrev" @next="gotoNext" @go="gotoPage" />
      <BaseButton class="next" variant="green" :disabled="!canFinish" @click="finish">
        <template v-if="canFinish"><Check class="k-ico" />我都会啦</template>
        <template v-else-if="!dialog && !isLast">看完所有图才能完成哦</template>
        <template v-else>还有 {{ remaining }} 个词没点过哦</template>
      </BaseButton>
    </SafeBottom>
  </div>
</template>

<style scoped>
.hint {
  margin: 0;
  font-size: var(--fs-small);
  color: var(--ink-soft);
  font-weight: 700;
  flex: none;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35em;
  flex-wrap: wrap;
}
.hint .k-ico {
  color: var(--orange);
}
.hint-page {
  color: var(--green-dark);
}

/* ===== dialog：亲子口语对话卡 ===== */
.dlg-stage {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
}
.dlg-scene {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: var(--gap-s) var(--gap-m);
  background: linear-gradient(180deg, #e8f7e3 0%, #d3f0c9 70%, #bfe8b4 100%);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  overflow: hidden;
}
.trees {
  position: absolute;
  top: 8px;
  font-size: 30px;
  opacity: 0.55;
  user-select: none;
  pointer-events: none;
}
.trees.left { left: 10px; }
.trees.right { right: 10px; }
.dlg-bubble {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 18px;
  font-weight: 900;
  font-size: var(--fs-body);
  color: var(--ink);
  box-shadow: var(--shadow-soft);
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.dlg-bubble.q {
  background: #fff3c2;
  border: 2px solid #f5d97a;
  align-self: flex-start;
  margin-left: 14px;
}
.dlg-bubble.a {
  background: #d9f6ff;
  border: 2px solid #9fe0f5;
  align-self: flex-end;
  margin-right: 14px;
}
.dlg-who {
  font-size: 10px;
  font-weight: 800;
  color: var(--ink-faint);
  display: block;
}
.dlg-text {
  font-size: 15px;
  letter-spacing: 0.02em;
}
.dlg-vol {
  width: 14px;
  height: 14px;
  color: var(--green-dark);
  flex: none;
}
.dlg-animal {
  position: relative;
  width: 148px;
  height: 148px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 6px 0 rgba(0, 0, 0, 0.08), var(--shadow-hard);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  transition: transform 0.1s;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.dlg-animal:active { transform: scale(0.94); }
.dlg-emoji {
  font-size: 64px;
  line-height: 1;
}
.dlg-en {
  font-weight: 900;
  font-size: 20px;
  color: var(--ink);
}
.dlg-zh {
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-faint);
}
.dlg-done {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--green);
  color: #fff;
  font-weight: 900;
  font-size: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(30, 140, 80, 0.4);
}
.dlg-kid {
  position: absolute;
  bottom: 8px;
  left: 12px;
  font-size: 36px;
  opacity: 0.9;
  user-select: none;
  pointer-events: none;
}
.dlg-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding: 4px 2px 6px;
  scrollbar-width: none;
}
.dlg-strip::-webkit-scrollbar { display: none; }
.dlg-chip {
  flex: none;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  border-radius: 999px;
  background: var(--card-bg);
  box-shadow: var(--shadow-hard);
  transition: all 0.15s;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.dlg-chip.on {
  background: var(--green);
  color: #fff;
  transform: translateY(-2px);
}
.dlg-chip.heard:not(.on) {
  box-shadow: inset 0 0 0 2px var(--green-light), var(--shadow-hard);
}
.dlg-chip-emoji { font-size: 18px; }
.dlg-chip-en {
  font-weight: 800;
  font-size: 13px;
}

/* ===== cards：网格点读 ===== */
/* 只负责"占满剩余高度"并可被测量，不随内部网格内容变化 */
.stage {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
}
.grid {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr));
  gap: var(--grid-gap, 12px);
  /* 末页不满时整块居中，而不是把卡片拉满整屏 */
  align-content: center;
}
.next {
  flex: none;
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
}
/* 贴底操作区：SafeBottom 内纵向排列（Pager 与完成按钮保持呼吸间距） */
.next-zone {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
}
</style>
