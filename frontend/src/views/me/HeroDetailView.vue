<script setup lang="ts">
/**
 * 奥特曼详情页（/me/treasure/hero/:id，从宝藏罐点已收集角色进入）。
 *
 * ── 这个文件只做「编排」 ──
 * 2026-10 设计系统统一时做过一次拆分：原文件 1289 行，把四块各自独立的东西
 * 拆了出去，页面层只留状态编排：
 *
 *   HeroPoseStage    正面大图 + 多姿势轮播（含箭头/小点/放大入口）
 *   HeroFormThumbs   形态缩略切换条（页面内 / 全屏查看器两种底色）
 *   HeroInfoPanel    背面资料（简介/小档案/技能/常用语 + 朗读交互）
 *   HeroZoomViewer   全屏图片查看器
 *
 * 页面自己负责的只剩四件事，都是"跨组件共享"的状态：
 *   1. 从路由解析当前英雄与形态（深链 ?form= 优先）
 *   2. 当前姿势下标（主图区与全屏查看器共用同一份，避免两处不同步）
 *   3. 角色名/形态名的朗读（顶栏与查看器都要触发）
 *   4. 翻转与放大两个开关，以及切形态时要打断朗读
 *
 * 交互要点（沿用原设计）：
 *   · 朗读可听清、可停止：点正在读的条目即停止，条目高亮 + 声波动画；
 *   · 英文名读完再读中文名（串联播报，不固定延时掐断）；
 *   · 切换形态时停朗读并回到第一张姿势（避免"读着 A 看 B"）。
 */
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { HEROES, formById, introOf, type FlatForm } from "../../data/heroes";
import { useRewardsStore } from "../../stores/rewards";
import { speak, speakZh, stopSpeaking } from "../../services/speech";
import { sfxTap } from "../../services/effects";
import PageShell from "../../components/ui/PageShell.vue";
import PathIcon from "../../components/PathIcon.vue";
import SpeakWave from "../../components/ui/SpeakWave.vue";
import HeroPoseStage from "../../components/treasure/HeroPoseStage.vue";
import HeroFormThumbs from "../../components/treasure/HeroFormThumbs.vue";
import HeroInfoPanel from "../../components/treasure/HeroInfoPanel.vue";
import HeroZoomViewer from "../../components/treasure/HeroZoomViewer.vue";
import { ZoomIn } from "@lucide/vue";

const route = useRoute();
const router = useRouter();
const rewards = useRewardsStore();

const hero = computed(() => HEROES.find((h) => h.id === route.params.id) || null);

/** 当前展示形态（深链 ?form= 优先，否则角色第一个形态） */
const currentFormId = ref("");
watch(
  () => [route.params.id, route.query.form],
  () => {
    const h = hero.value;
    if (!h) return;
    const f = typeof route.query.form === "string" ? formById(route.query.form) : null;
    currentFormId.value = f && h.forms.some((x) => x.id === f.id) ? f.id : h.forms[0].id;
  },
  { immediate: true }
);

const currentForm = computed<FlatForm | null>(() =>
  currentFormId.value ? formById(currentFormId.value) : null
);

/** 详情资料（随 ROSTER 维护，见 data/heroes.ts） */
const detail = computed(() => hero.value?.detail ?? null);

/** 形态缩略（转 FlatForm：带 image/fallback/heroId） */
const formThumbs = computed<FlatForm[]>(() =>
  hero.value
    ? hero.value.forms.map((f) => formById(f.id)).filter((x): x is FlatForm => !!x)
    : []
);

/** 加载失败的图片地址（主图区与查看器共用，记录一次两处都不再试） */
const imgFailed = ref<Record<string, boolean>>({});

/** 当前形态的所有姿势图（跳过加载失败的）；主图全失败则退回单张占位图 */
const poses = computed<string[]>(() => {
  const f = currentForm.value;
  if (!f) return [];
  const list = f.images.filter((u) => !imgFailed.value[u]);
  return list.length ? list : [f.fallback];
});

/** 当前姿势下标：主图区与全屏查看器共用，两份索引迟早会不同步 */
const poseIndex = ref(0);

/** 形态切换：轮播回到第一张（新形态的姿势数量不同，停在旧下标会错位） */
watch(
  () => currentForm.value?.id,
  () => {
    poseIndex.value = 0;
  }
);

function onPoseError(src: string) {
  if (!src) return;
  imgFailed.value[src] = true;
  // 下标越界由 HeroPoseStage 内部夹回（它才知道新列表长度）
}

/* ---------- 朗读（单声道：一次只读一条，可停止） ---------- */
/** 'hero'=角色名 / 'form'=形态名（其余条目由 HeroInfoPanel 自己管） */
const speaking = ref<string | null>(null);

function stopSpeech() {
  stopSpeaking();
  speaking.value = null;
}

/** 角色名：英文读完再接中文（串联不掐断；中途被其它朗读打断则放弃后半段） */
async function sayHero() {
  const h = hero.value;
  if (!h) return;
  sfxTap();
  if (speaking.value === "hero") {
    stopSpeech();
    return;
  }
  stopSpeaking();
  speaking.value = "hero";
  await speak(h.en, { ttsOnly: true });
  if (speaking.value !== "hero") return; // 用户已切换 / 点了别的
  await speakZh(h.name, 1, { bypassMute: true });
  if (speaking.value === "hero") speaking.value = null;
}

/** 当前形态名：先英文（顺便当英语输入）再中文 */
async function sayFormName() {
  if (!currentForm.value) return;
  const intro = introOf(currentForm.value.id);
  if (!intro) return;
  sfxTap();
  if (speaking.value === "form") {
    stopSpeech();
    return;
  }
  stopSpeaking();
  speaking.value = "form";
  await speak(intro.en);
  if (speaking.value !== "form") return;
  await speakZh(intro.zh, 1, { bypassMute: true });
  if (speaking.value === "form") speaking.value = null;
}

/* ---------- 翻转卡片：正面形象 + 名字，背面资料 ---------- */
const flipped = ref(false);

/** 递增即打断朗读，传给 HeroInfoPanel（它有自己的朗读状态，不该被外面翻） */
const resetToken = ref(0);

/** 翻转（开/关）：带提示音；翻转时停朗读，避免"正面读着、背面翻开"串台 */
function toggleFlip(open = !flipped.value) {
  sfxTap();
  flipped.value = open;
  stopSpeech();
  resetToken.value++;
}

/** 切换形态：停朗读 + 通知面板打断（避免"读着 A 看 B"） */
function pick(f: FlatForm) {
  sfxTap();
  currentFormId.value = f.id;
  stopSpeech();
  resetToken.value++;
}

/* ---------- 全屏图片查看器 ---------- */
const zoomOpen = ref(false);

function openZoom() {
  sfxTap();
  zoomOpen.value = true;
}

function goBack() {
  router.push("/me/treasure");
}
</script>

<template>
  <PageShell v-if="hero && currentForm" fill back-label="返回宝藏库" @back="goBack">
    <template #title>
      <span
        class="hero-title"
        :class="{ speaking: speaking === 'hero' }"
        role="button"
        tabindex="0"
        aria-label="朗读角色名"
        @click="sayHero"
        @keydown.enter.prevent="sayHero"
      >
        <PathIcon name="volume" class="hero-title__vol" />
        {{ hero.name }}<span class="hero-title__en">{{ hero.en }}</span>
        <SpeakWave v-if="speaking === 'hero'" />
      </span>
    </template>

    <!-- 右上角放大入口（内容区同类按钮保留，孩子两手都够得到） -->
    <template #right>
      <button class="hero-zoom" aria-label="放大查看图片" title="放大查看" @click="openZoom">
        <ZoomIn class="k-ico" />
      </button>
    </template>

    <div class="flip-scene">
      <div class="flip-card" :class="{ flipped }">
        <!-- 正面：形象 + 名字 + 详情按钮 -->
        <div class="flip-face front">
          <div class="face-scroll">
            <HeroPoseStage
              v-model:index="poseIndex"
              :poses="poses"
              :tone="currentForm.color"
              :form-name="currentForm.name"
              :silhouette="!rewards.isOwned(currentForm.id)"
              :hero-name="hero.name"
              @zoom="openZoom"
              @image-error="onPoseError"
            />

            <HeroFormThumbs
              :forms="formThumbs"
              :current-id="currentForm.id"
              :hero-name="hero.name"
              @pick="pick"
            />

            <!-- 名字：大字可点朗读 -->
            <div
              class="front-name"
              :class="{ speaking: speaking === 'hero' }"
              role="button"
              tabindex="0"
              aria-label="朗读角色名"
              @click="sayHero"
              @keydown.enter.prevent="sayHero"
            >
              <span class="front-name__cn">{{ hero.name }}</span>
              <span class="front-name__en">{{ hero.en }}</span>
              <PathIcon name="volume" class="front-name__vol" />
              <SpeakWave v-if="speaking === 'hero'" />
            </div>

            <button class="detail-btn" @click="toggleFlip(true)">
              <PathIcon name="book" />查看详情
            </button>
          </div>
        </div>

        <!-- 背面：介绍 / 小档案 / 技能 / 常用语 -->
        <div class="flip-face back">
          <div class="back-top">
            <button class="back-front" @click="toggleFlip(false)">
              <PathIcon name="back" />返回
            </button>
            <span class="back-title">{{ hero.name }} · 资料</span>
          </div>
          <div class="face-scroll">
            <HeroInfoPanel
              :detail="detail"
              :reset-token="resetToken"
              @back="toggleFlip(false)"
            />
          </div>
        </div>
      </div>
    </div>

    <HeroZoomViewer
      v-if="zoomOpen"
      :poses="poses"
      :index="poseIndex"
      :tone="currentForm.color"
      :hero-name="hero.name"
      :form-name="currentForm.name"
      :forms="formThumbs"
      :current-id="currentForm.id"
      :silhouette="!rewards.isOwned(currentForm.id)"
      :speaking="speaking === 'form'"
      @update:index="poseIndex = $event"
      @close="zoomOpen = false"
      @pick="pick"
      @say-name="sayFormName"
      @image-error="onPoseError"
    />
  </PageShell>
</template>

<style scoped>
/* ---------- 翻转舞台 ---------- */
.flip-scene {
  position: relative;
  flex: 1;
  min-height: 0;
  perspective: 1200px;
}
.flip-card {
  position: absolute;
  inset: 0;
}
/* 3D 翻转：两面各自 rotateY，翻转中点（0.275s = 动画一半）切换可见性。
   不依赖 backface-visibility（部分渲染内核不可靠），视觉等效 3D 翻卡。 */
.flip-face {
  position: absolute;
  inset: 0;
  transition:
    transform 0.55s cubic-bezier(0.4, 0.12, 0.2, 1),
    visibility 0s linear 0.275s;
}
.flip-face.back {
  transform: rotateY(180deg);
  visibility: hidden;
}
.flip-card.flipped .flip-face.front {
  transform: rotateY(180deg);
  visibility: hidden;
}
.flip-card.flipped .flip-face.back {
  transform: rotateY(0deg);
  visibility: visible;
}
/* 翻转面自身不设 overflow（否则打断 preserve-3d，backface 失效、两面同时可见）；
   滚动交给内部 .face-scroll */
.flip-face.front,
.flip-face.back {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.flip-face.front {
  padding: var(--gap-s) var(--gap-s) var(--gap-m);
}
.face-scroll {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  align-items: center;
}
/* 正面内容垂直居中 */
.flip-face.front .face-scroll {
  justify-content: center;
}

/* ---------- 背面顶部条 ---------- */
.back-top {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  padding: var(--gap-s) var(--gap-m) 6px;
}
.back-front {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--card-bg);
  color: var(--ink);
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
  box-shadow: var(--shadow-hard);
  cursor: pointer;
  transition: transform var(--dur-fast);
}
.back-front:active {
  transform: translateY(2px);
}
.back-title {
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- 正面：名字 + 详情按钮 ---------- */
.front-name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  border-radius: var(--radius-s);
  padding: 4px 12px;
  margin: -4px -12px;
  transition: background var(--dur-base);
}
.front-name:active {
  background: rgba(127, 127, 127, 0.14);
}
.front-name.speaking {
  background: color-mix(in srgb, var(--gold) 16%, transparent);
}
.front-name__cn {
  font-size: var(--fs-hero);
  font-weight: var(--fw-strong);
  letter-spacing: 0.04em;
}
.front-name__en {
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
  opacity: 0.6;
}
.front-name__vol {
  color: var(--gold);
  font-size: var(--fs-body);
}

/* 详情按钮：正面唯一的行动，用金色立体按钮突出（全页只有这一个） */
.detail-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 30px;
  border: none;
  border-radius: var(--radius-pill);
  background: linear-gradient(180deg, var(--c-gold), var(--c-gold-deep));
  color: #5b4300;
  font-size: var(--fs-body);
  font-weight: var(--fw-strong);
  box-shadow:
    0 4px 0 rgba(160, 110, 10, 0.55),
    var(--shadow-chip);
  cursor: pointer;
  transition:
    transform var(--dur-fast),
    box-shadow var(--dur-fast);
}
.detail-btn:active {
  transform: translateY(3px);
  box-shadow:
    0 1px 0 rgba(160, 110, 10, 0.55),
    var(--shadow-soft);
}
.detail-btn .path-icon {
  font-size: var(--fs-body);
}

/* ---------- 顶栏 ---------- */
.hero-zoom {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--card-bg);
  color: var(--ink);
  box-shadow: var(--shadow-hard);
  font-size: 20px;
  transition: transform var(--dur-fast);
}
.hero-zoom:active {
  transform: translateY(2px);
}
.hero-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  border-radius: var(--radius-s);
  padding: 2px 8px;
  margin: -2px -8px;
  transition: background var(--dur-base);
}
.hero-title:active {
  background: rgba(127, 127, 127, 0.14);
}
.hero-title.speaking {
  background: color-mix(in srgb, var(--gold) 16%, transparent);
}
.hero-title__vol {
  flex: none;
  color: var(--gold);
}
.hero-title__en {
  font-size: 0.62em;
  font-weight: var(--fw-mid);
  opacity: 0.65;
}
</style>
