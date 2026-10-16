<script setup lang="ts">
/**
 * HeroInfoPanel —— 英雄资料面板（设计系统第 ④ 层，领域组件）
 *
 * 从 HeroDetailView 拆出的第四块，也是拆得最"值"的一块：翻转卡片的**背面**
 * 全部内容（简介 / 小档案 / 招牌技能 / 常用语）+ 一整套朗读交互。
 *
 * 为什么把朗读状态放在组件内部：
 *   原来 speaking / skillReading 两个 ref 在页面里，但要同时服务页面标题、
 *   全屏查看器和这块面板三处。拆开后按"谁的文字谁负责"划清——
 *   'bio' / 'facts' / 'sk-*' / 'q-*' 这些 key 只在背面出现，就该由背面持有。
 *   页面侧要打断朗读时，只需要把 `resetToken` 递增（换形态 / 翻面），
 *   不必知道面板内部有几个状态。
 *
 * 无障碍：每张可朗读的卡片都是 role=button + tabindex + Enter 触发，
 * 并带"点一点听…/再点一下停止"的文字提示（孩子看不懂纯图标的变化）。
 */
import { computed, ref, watch } from "vue";
import { speakZh, stopSpeaking } from "../../services/speech";
import { sfxTap } from "../../services/effects";
import PathIcon from "../PathIcon.vue";
import SpeakWave from "../ui/SpeakWave.vue";
import type { HeroDetail } from "../../data/heroes";

const props = defineProps<{
  detail: HeroDetail | null;
  /** 递增即打断朗读（换形态 / 翻面时由父级 bump） */
  resetToken: number;
}>();

const emit = defineEmits<{ back: [] }>();

/* ---------- 单条朗读（单声道：一次只读一条，可停止） ---------- */
/** 当前朗读条目 key：'bio' / 'facts' / `sk-${s}` / `q-${p}` */
const speaking = ref<string | null>(null);

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

/* ---------- 招牌技能：点整卡依次读完所有技能（孩子少点几下） ---------- */
const skillReading = ref<string | null>(null);

async function sayAllSkills() {
  const list = props.detail?.skills ?? [];
  if (!list.length) return;
  sfxTap();
  if (skillReading.value) {
    stopSpeaking();
    skillReading.value = null;
    return;
  }
  stopSpeaking();
  // 先占住状态，再逐条读——读之前就退出的话（被别的朗读打断）不该启动
  skillReading.value = list[0] ?? null;
  for (const s of list) {
    if (!skillReading.value) return; // 用户点了停止 / 被其它朗读打断
    skillReading.value = s;
    await speakZh(s, 1, { bypassMute: true });
  }
  skillReading.value = null;
}

/** chip 点击：打断整卡朗读，只读当前技能 */
function onChipClick(s: string) {
  if (skillReading.value) {
    stopSpeaking();
    skillReading.value = null;
  }
  sayZh(`sk-${s}`, s);
}

/* ---------- 小档案 ---------- */
/** 把有值的字段拼成一句孩子听得懂的话（朗读用） */
function factsText(): string {
  const d = props.detail;
  if (!d) return "";
  const parts: string[] = [];
  if (d.origin) parts.push(`来自${d.origin}`);
  if (d.height) parts.push(`身高${d.height}`);
  if (d.weight) parts.push(`体重${d.weight}`);
  if (d.debut) parts.push(`首次登场是${d.debut}`);
  return parts.join("。");
}

/** 小档案是否有内容（决定卡片显不显示） */
const hasFacts = computed(() => {
  const d = props.detail;
  return !!d && !!(d.origin || d.height || d.weight || d.debut);
});

/* ---------- 打断 ---------- */
watch(
  () => props.resetToken,
  () => {
    stopSpeaking();
    speaking.value = null;
    skillReading.value = null;
  }
);
</script>

<template>
  <div class="info-panel">
    <!-- 简介：点卡朗读；朗读中高亮 -->
    <section
      v-if="detail"
      class="card info-card info-card--tap"
      :class="{ speaking: speaking === 'bio' }"
      role="button"
      tabindex="0"
      @click="sayZh('bio', detail.bio)"
      @keydown.enter.prevent="sayZh('bio', detail.bio)"
    >
      <h2 class="info-h2">
        <PathIcon name="volume" />介绍
        <SpeakWave v-if="speaking === 'bio'" />
      </h2>
      <p class="bio">{{ detail.bio }}</p>
      <span class="tap-hint">
        <PathIcon name="volume" />{{ speaking === "bio" ? "再点一下停止" : "点一点听介绍" }}
      </span>
    </section>

    <!-- 小档案：身高/体重/出身地/首次登场（有值才显示，点卡朗读） -->
    <section
      v-if="hasFacts"
      class="card info-card info-card--tap"
      :class="{ speaking: speaking === 'facts' }"
      role="button"
      tabindex="0"
      @click="sayZh('facts', factsText())"
      @keydown.enter.prevent="sayZh('facts', factsText())"
    >
      <h2 class="info-h2">
        <PathIcon name="volume" />小档案
        <SpeakWave v-if="speaking === 'facts'" />
      </h2>
      <dl class="fact-rows">
        <div v-if="detail?.origin" class="fact-row"><dt>出身地</dt><dd>{{ detail?.origin }}</dd></div>
        <div v-if="detail?.height" class="fact-row"><dt>身高</dt><dd>{{ detail?.height }}</dd></div>
        <div v-if="detail?.weight" class="fact-row"><dt>体重</dt><dd>{{ detail?.weight }}</dd></div>
        <div v-if="detail?.debut" class="fact-row"><dt>首次登场</dt><dd>{{ detail?.debut }}</dd></div>
      </dl>
      <span class="tap-hint">
        <PathIcon name="volume" />{{ speaking === "facts" ? "再点一下停止" : "点一点听档案" }}
      </span>
    </section>

    <!-- 招牌技能：点整卡依次朗读全部（当前技能高亮）；点单个 chip 只读它 -->
    <section
      v-if="detail"
      class="card info-card info-card--tap skills-card"
      :class="{ speaking: !!skillReading }"
      @click="sayAllSkills"
    >
      <h2 class="info-h2">
        招牌技能
        <span class="tap-hint">
          <PathIcon name="volume" />{{ skillReading ? "再点一下停止" : "点这里听全部" }}
        </span>
      </h2>
      <div class="chips">
        <button
          v-for="s in detail.skills"
          :key="`sk-${s}`"
          class="chip"
          :class="{ speaking: speaking === `sk-${s}` || skillReading === s }"
          @click.stop="onChipClick(s)"
        >
          <PathIcon name="sparkles" />{{ s }}
          <SpeakWave v-if="speaking === `sk-${s}` || skillReading === s" size="sm" />
        </button>
      </div>
    </section>

    <!-- 常用语：点句朗读；朗读中高亮 -->
    <section v-if="detail" class="card info-card">
      <h2 class="info-h2">常用语</h2>
      <div class="quotes">
        <button
          v-for="p in detail.phrases"
          :key="`q-${p}`"
          class="quote"
          :class="{ speaking: speaking === `q-${p}` }"
          @click="sayZh(`q-${p}`, p)"
        >
          <span class="q-mark">“</span>{{ p }}<span class="q-mark">”</span>
          <SpeakWave v-if="speaking === `q-${p}`" size="sm" />
        </button>
      </div>
    </section>

    <!-- 翻回正面 -->
    <button class="back-btn" @click="emit('back')">
      <PathIcon name="back" />翻回正面
    </button>
  </div>
</template>

<style scoped>
.info-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-s);
}

/* 信息卡：宽度统一收窄到 520px，避免宽屏上一行文字过长难以阅读 */
.info-card {
  width: 100%;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: var(--gap-xs);
  padding: var(--gap-s) var(--gap-m);
  transition: box-shadow var(--dur-base);
}
.info-card--tap {
  cursor: pointer;
}
.info-card--tap:active {
  transform: translateY(1px);
}
/* 朗读中：金色边框 + 底色 tint，条目与"正在读"的对应关系一目了然 */
.info-card.speaking {
  box-shadow:
    0 0 0 2.5px var(--gold),
    var(--shadow-float);
  background: color-mix(in srgb, var(--gold) 8%, var(--card-bg));
}

.info-h2 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-small);
  color: var(--gold);
  margin: 0;
}
.bio {
  margin: 0;
  font-size: var(--fs-body);
  line-height: 1.65;
}
.tap-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-small);
  opacity: 0.55;
}

.fact-rows {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fact-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: var(--fs-body);
  line-height: 1.5;
}
.fact-row dt {
  flex: none;
  min-width: 64px;
  font-weight: var(--fw-strong);
  color: var(--gold);
}
.fact-row dd {
  margin: 0;
  color: var(--ink);
  font-weight: var(--fw-mid);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-s);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  background: var(--line);
  color: var(--ink);
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
  cursor: pointer;
  transition:
    transform var(--dur-fast),
    background var(--dur-base),
    box-shadow var(--dur-base);
}
.chip:active {
  transform: scale(0.96);
}
.chip.speaking {
  background: color-mix(in srgb, var(--gold) 18%, transparent);
  box-shadow: 0 0 0 2px var(--gold);
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
  border-radius: var(--radius-s);
  background: var(--line);
  color: var(--ink);
  font-weight: var(--fw-mid);
  font-size: var(--fs-body);
  cursor: pointer;
  transition:
    transform var(--dur-fast),
    background var(--dur-base),
    box-shadow var(--dur-base);
}
.quote:active {
  transform: scale(0.98);
}
.quote.speaking {
  background: color-mix(in srgb, var(--gold) 14%, transparent);
  box-shadow: 0 0 0 2px var(--gold);
}
.q-mark {
  color: var(--gold);
  font-weight: var(--fw-strong);
}

/* 翻回正面：整页唯一的收尾动作，做成实底胶囊（比次要卡片按钮重一档） */
.back-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: var(--gap-xs) auto var(--gap-m);
  padding: 12px 32px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--card-bg);
  color: var(--ink);
  font-weight: var(--fw-strong);
  font-size: var(--fs-btn);
  box-shadow: var(--shadow-hard);
  cursor: pointer;
  transition: transform var(--dur-fast);
}
.back-btn:active {
  transform: translateY(2px);
}
</style>
