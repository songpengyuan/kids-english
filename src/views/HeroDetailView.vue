<script setup lang="ts">
/**
 * 奥特曼详情页（宝藏库点击已收集角色进入）——2026-09-27 交互重设计。
 *
 * 设计要点（交互设计师视角）：
 * 1. **大图可放大**：点击形象图打开全屏查看器（深色底、图片最大化、多形态可点图切换），
 *    解决"孩子想看清奥特曼细节但小图看不清"的核心诉求；放大入口用"🔍 放大看"胶囊提示可发现性。
 * 2. **朗读可听清、可停止**：
 *    - 中文 TTS 按语言选音色（修复此前写死英文音色导致中文怪音/无声）；
 *    - 英文名读完再读中文名（串联播报，不再固定延时掐断）；
 *    - 正在朗读的条目高亮 + 声波动画，再点一下立即停止（儿童可主动控制）。
 * 3. **形态切换有反馈**：切换时大图淡入淡出，换形态自动停止朗读（避免张冠李戴）。
 * 4. 简介/技能/常用语朗读属"学习内容"，不再受全局音效静音开关影响（静音只管提示音/庆祝语）。
 */
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { HEROES, formById, introOf, type FlatForm } from "../data/heroes";
import { useRewardsStore } from "../stores/rewards";
import { speak, speakZh, stopSpeaking } from "../services/speech";
import { sfxTap } from "../services/effects";
import HeaderBar from "../components/layout/HeaderBar.vue";
import PathIcon from "../components/PathIcon.vue";
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

/** 详情资料（随 ROSTER 维护，见 data/heroes.ts；缺省时给占位文案） */
const detail = computed(() => hero.value?.detail ?? null);

/** 形态缩略（转 FlatForm：带 image/fallback/heroId） */
const formThumbs = computed<FlatForm[]>(() =>
  hero.value
    ? hero.value.forms.map((f) => formById(f.id)).filter((x): x is FlatForm => !!x)
    : []
);

const imgFailed = ref<Record<string, boolean>>({});

function srcOf(f: FlatForm) {
  return imgFailed.value[f.id] ? f.fallback : f.image;
}

/* ---------- 朗读（单声道：一次只读一条，可停止） ---------- */
/** 当前朗读条目 key（'hero' / 'bio' / `sk-${s}` / `q-${p}` / `form`） */
const speaking = ref<string | null>(null);

/** 点正在读的 → 停止；点新的 → 打断旧的开始新的 */
async function sayZh(key: string, text: string) {
  sfxTap();
  if (speaking.value === key) {
    stopSpeaking();
    speaking.value = null;
    return;
  }
  stopSpeaking();
  speaking.value = key;
  await speakZh(text, 1, { bypassMute: true });
  if (speaking.value === key) speaking.value = null;
}

/** 角色名：英文读完再接中文（串联不掐断；中途被其它朗读打断则放弃后半段） */
async function sayHero() {
  const h = hero.value;
  if (!h) return;
  sfxTap();
  if (speaking.value === "hero") {
    stopSpeaking();
    speaking.value = null;
    return;
  }
  stopSpeaking();
  speaking.value = "hero";
  await speak(h.en, { ttsOnly: true });
  if (speaking.value !== "hero") return; // 用户已切换/点了别的
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
    stopSpeaking();
    speaking.value = null;
    return;
  }
  stopSpeaking();
  speaking.value = "form";
  await speak(intro.en);
  if (speaking.value !== "form") return;
  await speakZh(intro.zh, 1, { bypassMute: true });
  if (speaking.value === "form") speaking.value = null;
}

/** 切换形态：停止朗读避免"读着 A 看 B" */
function pick(f: FlatForm) {
  sfxTap();
  currentFormId.value = f.id;
}
watch(currentFormId, () => {
  stopSpeaking();
  speaking.value = null;
});

onBeforeUnmount(stopSpeaking);

/* ---------- 全屏图片查看器 ---------- */
const zoomOpen = ref(false);
const zoomLeaving = ref(false);

function openZoom() {
  sfxTap();
  zoomOpen.value = true;
  zoomLeaving.value = false;
}

function closeZoom() {
  if (zoomLeaving.value) return;
  zoomLeaving.value = true;
  window.setTimeout(() => {
    zoomOpen.value = false;
    zoomLeaving.value = false;
  }, 160);
}

/** 多形态时点大图切换下一个形态（循环）；单形态点图不响应 */
function nextForm() {
  if (formThumbs.value.length <= 1) return;
  const idx = formThumbs.value.findIndex((f) => f.id === currentFormId.value);
  const next = formThumbs.value[(idx + 1) % formThumbs.value.length];
  if (next) pick(next);
}

function goBack() {
  router.push("/treasure");
}
</script>

<template>
  <div class="hero-detail view" v-if="hero && currentForm">
    <HeaderBar show-back back-label="返回宝藏库" @back="goBack">
      <template #title>
        <span
          class="hd-title"
          :class="{ speaking: speaking === 'hero' }"
          role="button"
          tabindex="0"
          aria-label="朗读角色名"
          @click="sayHero"
          @keydown.enter.prevent="sayHero"
        >
          <PathIcon name="volume" class="hd-vol" />
          {{ hero.name }}<span class="hd-en">{{ hero.en }}</span>
          <span v-if="speaking === 'hero'" class="wave" aria-hidden="true"><i></i><i></i><i></i></span>
        </span>
      </template>
      <template #right>
        <!-- 右上角操作：放大查看大图（内容区同类按钮保留，孩子两手都够得到） -->
        <button
          class="hd-zoom"
          aria-label="放大查看图片"
          title="放大查看"
          @click="openZoom"
        >
          <ZoomIn class="k-ico" />
        </button>
      </template>
    </HeaderBar>

    <div class="hd-body">
      <!-- 形象大图：点击全屏放大；多形态缩略可切换 -->
      <div class="hero-stage" :style="{ '--tone': currentForm.color }">
        <Transition name="form-fade" mode="out-in">
          <img
            :key="currentForm.id"
            class="hero-big"
            :class="{ sil: !rewards.isOwned(currentForm.id) }"
            :src="srcOf(currentForm)"
            :alt="`${hero.name}${currentForm.name}`"
            @error="imgFailed[currentForm.id] = true"
          />
        </Transition>
        <button class="zoom-hint" aria-label="放大查看图片" @click="openZoom">
          🔍 放大看
        </button>
        <span class="form-tag">{{ currentForm.name }}</span>
      </div>

      <!-- 多形态缩略切换 -->
      <div v-if="hero.forms.length > 1" class="form-thumbs" role="tablist" :aria-label="`${hero.name}的形态`">
        <button
          v-for="f in formThumbs"
          :key="f.id"
          class="thumb"
          :class="{ on: f.id === currentForm.id, sil: !rewards.isOwned(f.id) }"
          role="tab"
          :aria-selected="f.id === currentForm.id"
          :aria-label="f.name"
          @click="pick(f)"
        >
          <img :src="srcOf(f)" :alt="f.name" @error="imgFailed[f.id] = true" />
        </button>
      </div>

      <!-- 简介：点卡朗读；朗读中高亮 -->
      <section
        v-if="detail"
        class="hd-card intro"
        :class="{ speaking: speaking === 'bio' }"
        role="button"
        tabindex="0"
        @click="sayZh('bio', detail.bio)"
        @keydown.enter.prevent="sayZh('bio', detail.bio)"
      >
        <h2 class="hd-h2">
          <PathIcon name="volume" />介绍
          <span v-if="speaking === 'bio'" class="wave" aria-hidden="true"><i></i><i></i><i></i></span>
        </h2>
        <p class="bio">{{ detail.bio }}</p>
        <span class="tap-hint">
          <PathIcon name="volume" />{{ speaking === "bio" ? "再点一下停止" : "点一点听介绍" }}
        </span>
      </section>

      <!-- 招牌技能：点 chip 朗读；朗读中高亮 -->
      <section v-if="detail" class="hd-card">
        <h2 class="hd-h2">招牌技能</h2>
        <div class="chips">
          <button
            v-for="s in detail.skills"
            :key="`sk-${s}`"
            class="chip"
            :class="{ speaking: speaking === `sk-${s}` }"
            @click="sayZh(`sk-${s}`, s)"
          >
            <PathIcon name="sparkles" />{{ s }}
            <span v-if="speaking === `sk-${s}`" class="wave mini" aria-hidden="true"><i></i><i></i><i></i></span>
          </button>
        </div>
      </section>

      <!-- 常用语：点句朗读；朗读中高亮 -->
      <section v-if="detail" class="hd-card">
        <h2 class="hd-h2">常用语</h2>
        <div class="quotes">
          <button
            v-for="p in detail.phrases"
            :key="`q-${p}`"
            class="quote"
            :class="{ speaking: speaking === `q-${p}` }"
            @click="sayZh(`q-${p}`, p)"
          >
            <span class="q-mark">“</span>{{ p }}<span class="q-mark">”</span>
            <span v-if="speaking === `q-${p}`" class="wave mini" aria-hidden="true"><i></i><i></i><i></i></span>
          </button>
        </div>
      </section>
    </div>

    <!-- 全屏图片查看器 -->
    <div v-if="zoomOpen" class="zoom-mask" :class="{ leaving: zoomLeaving }" @click.self="closeZoom">
      <div class="zoom-card" role="dialog" :aria-label="`${hero.name}${currentForm.name}大图`">
        <button class="zoom-close" aria-label="关闭大图" @click="closeZoom">
          <PathIcon name="close" />
        </button>

        <div class="zoom-stage" :style="{ '--tone': currentForm.color }" @click="nextForm">
          <Transition name="form-fade" mode="out-in">
            <img
              :key="currentForm.id"
              class="zoom-img"
              :class="{ sil: !rewards.isOwned(currentForm.id) }"
              :src="srcOf(currentForm)"
              :alt="`${hero.name}${currentForm.name}放大图`"
              @error="imgFailed[currentForm.id] = true"
            />
          </Transition>
        </div>

        <p
          class="zoom-name"
          role="button"
          tabindex="0"
          aria-label="朗读形态名"
          @click="sayFormName"
          @keydown.enter.prevent="sayFormName"
        >
          {{ hero.name }} · {{ currentForm.name }} <PathIcon name="volume" />
          <span v-if="speaking === 'form'" class="wave" aria-hidden="true"><i></i><i></i><i></i></span>
        </p>

        <div v-if="formThumbs.length > 1" class="form-thumbs zoom-thumbs" role="tablist" :aria-label="`${hero.name}的形态`">
          <button
            v-for="f in formThumbs"
            :key="f.id"
            class="thumb"
            :class="{ on: f.id === currentForm.id, sil: !rewards.isOwned(f.id) }"
            role="tab"
            :aria-selected="f.id === currentForm.id"
            :aria-label="f.name"
            @click="pick(f)"
          >
            <img :src="srcOf(f)" :alt="f.name" @error="imgFailed[f.id] = true" />
          </button>
        </div>

        <p v-if="formThumbs.length > 1" class="zoom-tip">点一下大图切换形态</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero-detail {
  gap: 0;
}

/* ---------- 顶栏标题（可点朗读） ---------- */
.hd-zoom {
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
  transition: transform 0.1s;
}
.hd-zoom:active {
  transform: translateY(2px);
}
.hd-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  border-radius: 10px;
  padding: 2px 8px;
  margin: -2px -8px;
  transition: background 0.15s;
}
.hd-title:active {
  background: rgba(127, 127, 127, 0.14);
}
.hd-title.speaking {
  background: color-mix(in srgb, var(--gold, #f0b429) 16%, transparent);
}
.hd-vol {
  flex: none;
  color: var(--gold, #f0b429);
}
.hd-en {
  font-size: 0.62em;
  font-weight: 700;
  opacity: 0.65;
}

.hd-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-s);
  overflow-y: auto;
  padding: var(--gap-s) var(--gap-s) var(--gap-m);
}

/* ---------- 大图舞台 ---------- */
.hero-stage {
  position: relative;
  width: min(72vw, 420px);
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-l, 24px);
  background:
    radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--tone) 26%, transparent), transparent 68%),
    var(--card);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}
.hero-big {
  width: 76%;
  height: 76%;
  object-fit: contain;
  filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.25));
}
.hero-big.sil {
  filter: brightness(0.22) drop-shadow(0 6px 12px rgba(0, 0, 0, 0.3));
}
.form-tag {
  position: absolute;
  left: 12px;
  bottom: 12px;
  padding: 4px 12px;
  border-radius: var(--radius-pill, 999px);
  background: color-mix(in srgb, var(--tone) 22%, var(--bar-bg, #fff));
  font-weight: 800;
  font-size: 13px;
  color: var(--ink);
}
/* 放大入口：显眼但克制，孩子一眼知道大图可点 */
.zoom-hint {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 12px;
  border-radius: var(--radius-pill, 999px);
  background: rgba(255, 255, 255, 0.88);
  color: #3a3a3a;
  font-weight: 800;
  font-size: 13px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16);
  cursor: pointer;
  transition: transform 0.1s;
}
.zoom-hint:active {
  transform: translateY(1px) scale(0.97);
}

/* 形态切换淡入淡出 */
.form-fade-enter-active,
.form-fade-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}
.form-fade-enter-from {
  opacity: 0;
  transform: scale(0.94);
}
.form-fade-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

/* ---------- 形态缩略 ---------- */
.form-thumbs {
  display: flex;
  gap: 10px;
  padding: 2px;
  overflow-x: auto;
  max-width: 100%;
}
.thumb {
  /* 5 岁适龄：手机 66px / 平板 ~81px / 桌面 96px */
  width: clamp(66px, 10vw, 96px);
  height: clamp(66px, 10vw, 96px);
  flex: none;
  border-radius: 14px;
  background: var(--card);
  border: 2.5px solid transparent;
  padding: 4px;
  cursor: pointer;
}
.thumb.on {
  border-color: var(--gold, #f0b429);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.thumb.sil img {
  filter: brightness(0.25);
}

/* ---------- 信息卡 ---------- */
.hd-card {
  width: 100%;
  max-width: 520px;
  border-radius: var(--radius, 16px);
  background: var(--card);
  padding: var(--gap-s, 12px) 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: box-shadow 0.15s;
}
.hd-h2 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  color: var(--gold, #f0b429);
  margin: 0;
}
.intro {
  cursor: pointer;
  transition: transform 0.1s;
}
.intro:active {
  transform: scale(0.99);
}
/* 朗读中：金色边框 + 背景 tint，条目与"正在读"的对应关系一目了然 */
.hd-card.speaking {
  box-shadow: 0 0 0 2.5px var(--gold, #f0b429), 0 6px 18px rgba(0, 0, 0, 0.12);
  background: color-mix(in srgb, var(--gold, #f0b429) 8%, var(--card));
}
.bio {
  margin: 0;
  font-size: 16px;
  line-height: 1.65;
}
.tap-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  opacity: 0.55;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-pill, 999px);
  background: var(--line, rgba(127, 127, 127, 0.16));
  color: var(--ink);
  font-weight: 800;
  font-size: 15px;
  cursor: pointer;
  transition:
    transform 0.1s,
    background 0.15s,
    box-shadow 0.15s;
}
.chip:active {
  transform: scale(0.96);
}
.chip.speaking {
  background: color-mix(in srgb, var(--gold, #f0b429) 18%, transparent);
  box-shadow: 0 0 0 2px var(--gold, #f0b429);
  color: #6b4e00;
}

.quotes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.quote {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-align: left;
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--line, rgba(127, 127, 127, 0.14));
  color: var(--ink);
  font-weight: 700;
  font-size: 16px;
  cursor: pointer;
  transition:
    transform 0.1s,
    background 0.15s,
    box-shadow 0.15s;
}
.quote:active {
  transform: scale(0.98);
}
.quote.speaking {
  background: color-mix(in srgb, var(--gold, #f0b429) 14%, transparent);
  box-shadow: 0 0 0 2px var(--gold, #f0b429);
  color: #6b4e00;
}
.q-mark {
  color: var(--gold, #f0b429);
  font-weight: 900;
}

/* ---------- 声波动画（朗读中） ---------- */
.wave {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
  margin-left: 2px;
}
.wave i {
  width: 3px;
  height: 4px;
  border-radius: 2px;
  background: currentColor;
  animation: wave-bounce 0.7s ease-in-out infinite;
}
.wave i:nth-child(2) {
  animation-delay: 0.14s;
}
.wave i:nth-child(3) {
  animation-delay: 0.28s;
}
.wave.mini {
  height: 10px;
}
@keyframes wave-bounce {
  0%,
  100% {
    height: 4px;
  }
  50% {
    height: 11px;
  }
}

/* ---------- 全屏图片查看器 ---------- */
.zoom-mask {
  position: fixed;
  inset: 0;
  z-index: 120; /* 高于底部导航(40)与顶栏(30)，全屏沉浸 */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(8, 10, 18, 0.92);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  transition: opacity 0.16s ease;
}
.zoom-mask.leaving {
  opacity: 0;
}
.zoom-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: min(94vw, 640px);
  animation: zoom-in 0.22s cubic-bezier(0.34, 1.4, 0.64, 1);
}
.zoom-mask.leaving .zoom-card {
  animation: none;
  transform: scale(0.96);
  transition: transform 0.16s ease;
}
@keyframes zoom-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
.zoom-close {
  position: absolute;
  top: -8px;
  right: -6px;
  z-index: 2;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  color: #222;
  font-size: 22px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  cursor: pointer;
  transition: transform 0.1s;
}
.zoom-close:active {
  transform: scale(0.92);
}
.zoom-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1 / 1;
  max-height: 64vh;
  border-radius: 24px;
  background:
    radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--tone) 30%, transparent), transparent 68%),
    rgba(255, 255, 255, 0.08);
  cursor: pointer;
}
.zoom-img {
  width: 84%;
  height: 84%;
  object-fit: contain;
  filter: drop-shadow(0 10px 26px rgba(0, 0, 0, 0.5));
}
.zoom-img.sil {
  filter: brightness(0.22) drop-shadow(0 10px 26px rgba(0, 0, 0, 0.5));
}
.zoom-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: #fff;
  font-weight: 900;
  font-size: 17px;
  cursor: pointer;
  border-radius: 10px;
  padding: 4px 10px;
}
.zoom-name:active {
  background: rgba(255, 255, 255, 0.14);
}
.zoom-thumbs {
  max-width: 88vw;
}
.zoom-thumbs .thumb {
  background: rgba(255, 255, 255, 0.12);
  border-color: transparent;
}
.zoom-thumbs .thumb.on {
  border-color: var(--gold, #f0b429);
}
.zoom-tip {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}
</style>
