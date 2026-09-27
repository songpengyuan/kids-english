<script setup lang="ts">
/**
 * 奥特曼详情页（宝藏库点击已收集角色进入）。
 *
 * 内容：放大形象图（多形态可切换）+ 简介 + 招牌技能 + 常用语；
 * 文字均可点击发音（角色名 speak、中文内容 speakZh），儿童不识字也能听。
 */
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { HEROES, formById, type FlatForm } from "../data/heroes";
import { HERO_DETAILS } from "../data/heroDetails";
import { useRewardsStore } from "../stores/rewards";
import { speak, speakZh } from "../utils/speech";
import { sfxTap } from "../utils/effects";
import HeaderBar from "../components/layout/HeaderBar.vue";
import PathIcon from "../components/PathIcon.vue";

const route = useRoute();
const router = useRouter();
const rewards = useRewardsStore();

const hero = computed(() =>
  HEROES.find((h) => h.id === route.params.id) || null
);

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

/** 详情资料（缺省时给占位文案） */
const detail = computed(() =>
  hero.value ? HERO_DETAILS[hero.value.id] ?? null : null
);

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

/** 切换形态 */
function pick(f: FlatForm) {
  sfxTap();
  currentFormId.value = f.id;
}

/** 朗读角色名（英文 + 中文） */
function sayHero() {
  const h = hero.value;
  if (!h) return;
  sfxTap();
  speak(h.en, { ttsOnly: true });
  setTimeout(() => speakZh(h.name), 1300);
}

/** 朗读一段中文 */
function say(text: string) {
  sfxTap();
  speakZh(text);
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
          role="button"
          tabindex="0"
          aria-label="朗读角色名"
          @click="sayHero"
          @keydown.enter.prevent="sayHero"
          >{{ hero.name }}<span class="hd-en">{{ hero.en }}</span></span
        >
      </template>
    </HeaderBar>

    <div class="hd-body">
      <!-- 放大形象图 -->
      <div class="hero-stage" :style="{ '--tone': currentForm.color }">
        <img
          class="hero-big"
          :class="{ sil: !rewards.isOwned(currentForm.id) }"
          :src="srcOf(currentForm)"
          :alt="`${hero.name}${currentForm.name}`"
          @error="imgFailed[currentForm.id] = true"
        />
        <span class="form-tag">{{ currentForm.name }}</span>
      </div>

      <!-- 多形态缩略切换 -->
      <div v-if="hero.forms.length > 1" class="form-thumbs" role="tablist" :aria-label="`${hero.name}的形态`">
        <button
          v-for="f in formThumbs"
          :key="f.id"
          class="thumb"
          :class="{ on: f.id === currentForm.id, sil: !rewards.isOwned(f.id) }"
          :aria-label="f.name"
          @click="pick(f)"
        >
          <img :src="srcOf(f)" :alt="f.name" @error="imgFailed[f.id] = true" />
        </button>
      </div>

      <!-- 简介 -->
      <section v-if="detail" class="hd-card intro" role="button" tabindex="0" @click="say(detail.bio)" @keydown.enter.prevent="say(detail.bio)">
        <h2 class="hd-h2">介绍</h2>
        <p class="bio">{{ detail.bio }}</p>
        <span class="tap-hint"><PathIcon name="volume" />点一点听介绍</span>
      </section>

      <!-- 招牌技能 -->
      <section v-if="detail" class="hd-card">
        <h2 class="hd-h2">招牌技能</h2>
        <div class="chips">
          <button v-for="s in detail.skills" :key="s" class="chip" @click="say(s)">
            <PathIcon name="sparkles" />{{ s }}
          </button>
        </div>
      </section>

      <!-- 常用语 -->
      <section v-if="detail" class="hd-card">
        <h2 class="hd-h2">常用语</h2>
        <div class="quotes">
          <button v-for="p in detail.phrases" :key="p" class="quote" @click="say(p)">
            <span class="q-mark">“</span>{{ p }}<span class="q-mark">”</span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.hero-detail {
  gap: 0;
}
.hd-title {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  cursor: pointer;
  border-radius: 6px;
  padding: 2px 6px;
  margin: -2px -6px;
}
.hd-title:active {
  background: rgba(127, 127, 127, 0.14);
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

/* 大图舞台 */
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

/* 形态缩略 */
.form-thumbs {
  display: flex;
  gap: 10px;
  padding: 2px;
  overflow-x: auto;
  max-width: 100%;
}
.thumb {
  width: 58px;
  height: 58px;
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

/* 信息卡 */
.hd-card {
  width: 100%;
  max-width: 520px;
  border-radius: var(--radius, 16px);
  background: var(--card);
  padding: var(--gap-s, 12px) 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.hd-h2 {
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
  transition: transform 0.1s;
}
.chip:active {
  transform: scale(0.96);
}

.quotes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.quote {
  text-align: left;
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--line, rgba(127, 127, 127, 0.14));
  color: var(--ink);
  font-weight: 700;
  font-size: 16px;
  cursor: pointer;
  transition: transform 0.1s;
}
.quote:active {
  transform: scale(0.98);
}
.q-mark {
  color: var(--gold, #f0b429);
  font-weight: 900;
}
</style>
