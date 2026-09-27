<script setup>
/**
 * 开宝箱奖励组件（游戏闯关通关结算，多邻国式激励）。
 *
 * 交互（2026-09-26 重设计）：
 *   1. 宝箱初始关闭，下面三个图标（贝壳/贴纸/礼物）灰色待点亮；
 *   2. 点宝箱中间区域 = 敲一下：宝箱晃动 + 音效 + 下方图标逐个高亮（共 3 下）；
 *   3. 第 3 下宝箱打开（开盖 + 金光 + 撒花 + 奖励入账），展示奖励与「收取」按钮；
 *   4. 点「收取」：宝石/贝壳从宝箱位置沿抛物线逐个飞向顶部贝壳徽标，
 *      徽标接收时脉冲 + 数字逐个递增，全部收完动画停止 → done。
 *
 * - 抛物线轨迹为纯函数 `parabola()`（src/utils/flyCurve.ts，TDD 覆盖）。
 * - 反馈齐备：CSS 动画 + WebAudio 音效 + 触感震动；不引入额外动画库。
 */
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import PathIcon from "../PathIcon.vue";
import {
  bigCelebrate,
  sfxChestOpen,
  sfxCoin,
  sfxCollect,
  sfxSticker,
  sfxTap
} from "../../services/effects";
import { useRewardsStore } from "../../stores/rewards";
import { parabola } from "../../utils/flyCurve";
import { formById } from "../../data/heroes";
import ShellIcon from "../ShellIcon.vue";

const rewards = useRewardsStore();

const emit = defineEmits(["done"]);

/** 已敲击次数（0..3；3 = 开箱） */
const taps = ref(0);
/** 阶段：closed(<3 敲击) | open(第 3 下开箱瞬间) | reward(展示+收取) | flying(飞行中) | collected */
const phase = ref("closed");
const reward = ref(null); // { shells, formId, isNew }
/** 本次掉落的形态（角色名 + 图片）；没掉到形态就是 null */
const wonForm = computed(() => (reward.value?.formId ? formById(reward.value.formId) : null));
/** 定制 png 加载失败 → 回退内置原创占位图 */
const wonImgFailed = ref(false);
const wonImg = computed(() => (wonImgFailed.value ? wonForm.value?.fallback : wonForm.value?.image));
/** 顶部徽标当前显示数（收取动画前 = 入账前旧值，收取时逐个 +1 到新值） */
const shown = ref(0);
/** 徽标脉冲重触发计数 */
const pulseTick = ref(0);
/** 宝箱晃动重触发计数 */
const shakeTick = ref(0);

const chestEl = ref(null);
const badgeEl = ref(null);
const flyEl = ref(null);

let timers = [];
function later(fn, ms) {
  timers.push(setTimeout(fn, ms));
}
onBeforeUnmount(() => {
  timers.forEach((t) => clearTimeout(t));
  timers = [];
});

/** 第 3 下：开箱 + 奖励入账（幂等，贴纸去重） */
function openChest() {
  const oldShells = rewards.shells;
  shown.value = oldShells; // 徽标先显示旧余额，收取时递增
  sfxChestOpen();
  bigCelebrate();
  const r = rewards.rollChest();
  rewards.grant(r);
  reward.value = r;
  sfxCoin();
  if (r.formId) sfxSticker();
  later(() => {
    phase.value = "reward";
  }, 1000);
}

function tapChest() {
  if (phase.value === "flying" || phase.value === "collected") return;
  if (taps.value >= 3) return; // 已开箱，点宝箱不再响应
  taps.value++;
  sfxTap(); // 每次敲击：轻点音 + 触感
  shakeTick.value++; // 重触发晃动动画
  if (taps.value === 3) {
    phase.value = "open";
    openChest();
  }
}

/** 点遮罩层任意空白处也算敲一下（按钮/奖励卡除外） */
function onWrapClick(e) {
  if (phase.value !== "closed") return; // 已开箱后空白处不触发
  // 点到按钮或交互元素上不触发（close/skip/take/奖励卡）
  const t = e.target.closest("button, .reward, .fly");
  if (t) return;
  tapChest();
}

/** 跳过开箱动画（奖励照常入账）：直接完成三连击 → 展示奖励 */
function skip() {
  if (phase.value !== "closed") return;
  timers.forEach((t) => clearTimeout(t));
  timers = [];
  taps.value = 3;
  phase.value = "open";
  openChest();
}

/**
 * 关闭 · 无论动画进行到哪一步都能一键退出：
 * 还没开箱（closed）→ 奖励照常入账（与"跳过"一致）；已开箱 → 直接收起。
 * 注意：**已收进宝藏罐（collected）也能关** —— 结算页如果没有接 @done，
 * 这里就是用户唯一的出口（否则会卡在"已收进宝藏罐"这一屏）。
 */
function closeOverlay() {
  if (phase.value === "closed") {
    rewards.grant(rewards.rollChest());
  }
  phase.value = "collected";
  emit("done");
}

/** 逐个抛物线飞入顶部贝壳徽标 */
async function collect() {
  if (phase.value !== "reward" || !reward.value) return;
  phase.value = "flying";
  sfxCollect();
  const src = chestEl.value?.getBoundingClientRect();
  const dst = badgeEl.value?.getBoundingClientRect();
  if (!src || !dst) {
    phase.value = "collected";
    emit("done");
    return;
  }
  const from = { x: src.left + src.width / 2, y: src.top + src.height * 0.45 };
  const to = { x: dst.left + dst.width / 2, y: dst.top + dst.height / 2 };
  const apex = Math.max(140, Math.abs(from.y - to.y) * 0.55); // 上抛弧度随距离增大

  const n = Math.min(reward.value.shells, 5); // 贝壳逐个飞入（最多 5 个节奏感）
  const step = Math.ceil(reward.value.shells / n); // 每次递增步长，最后一次对齐余额
  await nextTick();
  for (let i = 0; i < n; i++) {
    if (i > 0) await sleep(240); // 逐个小间隔
    await flyOne(from, to, apex);
    shown.value = Math.min(shown.value + step, rewards.shells); // 数量随之增加
    sfxCoin(); // 落地：硬币"叮"
    pulseTick.value++; // 徽标接收脉冲
  }
  phase.value = "collected";
  emit("done");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 单个宝石/贝壳沿抛物线飞行（rAF，丝滑 680ms） */
function flyOne(from, to, apex) {
  return new Promise((resolve) => {
    const el = flyEl.value;
    if (!el) return resolve();
    el.style.opacity = "1";
    el.style.left = from.x + "px";
    el.style.top = from.y + "px";
    const t0 = performance.now();
    const dur = 680;
    function step(now) {
      const t = Math.min((now - t0) / dur, 1);
      const p = parabola(from, to, apex, t);
      el.style.left = p.x + "px";
      el.style.top = p.y + "px";
      if (t < 1) requestAnimationFrame(step);
      else {
        el.style.opacity = "0";
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

const opened = computed(() => taps.value >= 3);
const cap = computed(() => {
  if (phase.value === "collected") return "";
  if (taps.value === 0) return "完成啦！点三下开宝箱";
  if (taps.value < 3) return `再点 ${3 - taps.value} 下，宝箱就开啦！`;
  if (phase.value === "flying") return "宝石飞向宝藏罐……";
  return "哇——";
});
</script>

<template>
  <div class="chest-wrap" @click="onWrapClick">
    <!-- 关闭：固定右上角，任何阶段都能点（开箱动画/奖励面板都不拦路） -->
    <button class="chest-close" aria-label="关闭" title="关闭" @click="closeOverlay">
      <PathIcon name="close" class="close-ico" />
    </button>

    <!-- 顶部贝壳徽标：收取动画的目标（fixed 右上，接收时脉冲 + 数字递增） -->
    <div ref="badgeEl" class="shell-badge" :class="{ pulsing: phase === 'flying' }" :key="'pulse-' + pulseTick">
      <span class="shell-emoji b-ico"><ShellIcon /></span>
      <span class="b-num">{{ shown }}</span>
    </div>

    <!-- 跳过动画（三连击前）：奖励照常入账 -->
    <button v-if="phase === 'closed' && taps === 0" class="skip-btn" @click="skip">
      跳过
    </button>

    <!-- 开盖瞬间：全屏金光一闪 -->
    <div v-if="phase === 'open' || phase === 'reward' || phase === 'flying'" class="flash"></div>
    <div v-if="phase === 'open' || phase === 'reward'" class="glow"></div>

    <div
      ref="chestEl"
      class="chest"
      data-haptic="true"
      :class="{ opened: opened }"
      :key="'shake-' + shakeTick"
      :aria-label="taps < 3 ? '敲宝箱' : '宝箱'"
    >
      <div v-if="phase === 'open' || phase === 'reward' || phase === 'flying'" class="light">
        <span class="beam"></span>
        <span class="beam b2"></span>
        <span class="beam b3"></span>
      </div>
      <span v-if="opened" v-for="n in 8" :key="'s' + n" class="spark" :style="{ '--d': n * 0.07 + 's', '--x': (n % 4) * 26 - 39 + 'px' }"></span>
      <div class="lid"><div class="lid-knob"></div></div>
      <div class="body"><div class="lock"></div></div>
      <div class="keyhole"></div>
    </div>

    <!-- 三个点击 icon：敲一次高亮一个 -->
    <div class="tap-hints">
      <span
        v-for="i in 3"
        :key="i"
        class="hint"
        :class="{ on: taps >= i }"
        :style="{ animationDelay: (i - 1) * 0.08 + 's' }"
      >
        <ShellIcon v-if="i === 1" class="h-ico" />
        <PathIcon v-else :name="['sticker', 'gift'][i - 2]" class="h-ico" />
      </span>
    </div>

    <p v-if="cap" class="cap">{{ cap }}</p>

    <!-- 奖励展示 + 收取 -->
    <div v-if="phase === 'reward' && reward" class="reward">
      <p class="got">获得</p>
      <div class="rewards">
        <span class="shells anim-pop"><ShellIcon /> ×{{ reward.shells }}</span>
      </div>
      <!-- 掉到形态：新形态单独高光展示（图片 + 角色·形态名） -->
      <div v-if="wonForm" class="won anim-pop" :style="{ '--tone': wonForm.color }">
        <span class="won-tag">{{ reward.isNew ? "新形态！" : "升星！" }}</span>
        <img class="won-img" :src="wonImg" :alt="wonForm.heroName + wonForm.name" @error="wonImgFailed = true" />
        <p class="won-name">{{ wonForm.heroName }} · {{ wonForm.name }}</p>
        <p class="won-en">{{ wonForm.heroEn }}, {{ wonForm.en }}</p>
      </div>
      <button class="k-btn take" @click="collect">收取 <span class="shell-emoji"><ShellIcon /></span></button>
    </div>
    <p v-if="phase === 'collected'" class="cap collected">
      <PathIcon name="gift" class="gift-ico" /> 已收进宝藏罐！
    </p>

    <!-- 飞行中的宝石/贝壳（fixed，跟随抛物线轨迹） -->
    <span v-if="phase === 'flying'" ref="flyEl" class="fly"><ShellIcon /></span>
  </div>
</template>

<style scoped>
.chest-wrap {
  /* 全屏遮罩：必须**视口固定**。
   * 之前是 position:relative —— 嵌在游戏地图的滚动容器里时，整个开箱界面会被排到
   * 地图内容末尾（实测 y≈4400），孩子在"开宝箱"关卡点开后什么都看不到。
   * 结算页（LessonResult）里看不出问题，所以一直没暴露。 */
  position: fixed;
  inset: 0;
  z-index: 60;
  justify-content: center;
  /* 磨砂遮罩：把地图/页面压到后面，视线聚焦开箱（与全站毛玻璃语言一致） */
  background: color-mix(in srgb, var(--bg) 80%, transparent);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  overflow-y: auto; /* 矮屏/横屏时内容可滚，不会把"收取"挤出屏幕 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-s);
  padding: var(--gap-s);
}

/* ---------- 顶部贝壳徽标（收取目标） ---------- */
.chest-close {
  position: fixed;
  top: 14px;
  left: 14px;
  z-index: 70;
  width: var(--tap-min);
  height: var(--tap-min);
  border: none;
  border-radius: 50%;
  background: var(--card-bg);
  box-shadow: var(--shadow-hard);
  color: var(--ink-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.chest-close .close-ico {
  width: 22px;
  height: 22px;
}
.chest-close:active {
  transform: scale(0.94);
}
.shell-badge {
  position: fixed;
  top: calc(64px + env(safe-area-inset-top));
  right: 14px;
  z-index: 80;
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--card-bg);
  border: 2px solid var(--c-orange);
  color: var(--ink);
  font-weight: 800;
  font-size: var(--fs-small);
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-hard);
  transform-origin: center;
}
.shell-badge .b-ico {
  width: 16px;
  height: 16px;
  font-size: 16px;
}
.shell-badge.pulsing {
  animation: badge-pulse 0.42s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes badge-pulse {
  0% { transform: scale(1); }
  40% { transform: scale(1.35); }
  100% { transform: scale(1); }
}

/* 跳过按钮 */
.skip-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 20;
  background: var(--card-bg);
  color: var(--ink-soft);
  border-radius: var(--radius-pill);
  padding: 6px 12px;
  font-weight: 800;
  font-size: var(--fs-small);
  box-shadow: var(--shadow-hard);
  transition: transform 0.1s;
}
.skip-btn:active { transform: translateY(2px); }

/* ---------- 开盖瞬间全屏效果 ---------- */
.flash {
  position: fixed;
  inset: 0;
  z-index: 15;
  pointer-events: none;
  background: radial-gradient(circle at 50% 45%, rgba(255, 255, 255, 0.95), rgba(255, 230, 140, 0.55) 45%, transparent 72%);
  animation: flash-in 0.55s ease-out forwards;
}
@keyframes flash-in {
  0% { opacity: 0; }
  15% { opacity: 1; }
  100% { opacity: 0; }
}
.glow {
  position: fixed;
  inset: 0;
  z-index: 10;
  background: radial-gradient(circle at 50% 42%, rgba(255, 214, 110, 0.5), rgba(255, 200, 0, 0.08) 55%, transparent 75%);
  animation: glow-in 0.9s ease-out forwards;
  pointer-events: none;
}
@keyframes glow-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ---------- 宝箱本体 ---------- */
.chest {
  position: relative;
  width: clamp(150px, 30vh, 210px);
  height: clamp(120px, 22vh, 160px);
  cursor: pointer;
  touch-action: manipulation;
  z-index: 3;
  animation: chest-bump 0.42s cubic-bezier(0.34, 1.4, 0.64, 1);
}
/* 未开箱：每次敲击晃动 */
@keyframes chest-bump {
  0%, 100% { transform: rotate(0); }
  25% { transform: rotate(-7deg) translateY(-4px); }
  55% { transform: rotate(6deg) translateY(-6px); }
  80% { transform: rotate(-3deg) translateY(-2px); }
}
/* 开箱后：宝箱弹跳一次 */
.chest.opened {
  animation: chest-bounce 0.5s ease-out;
}
@keyframes chest-bounce {
  0% { transform: scale(1); }
  35% { transform: scale(1.06) translateY(-6px); }
  70% { transform: scale(0.98); }
  100% { transform: scale(1); }
}

.lid {
  position: absolute;
  top: 0;
  left: 4%;
  width: 92%;
  height: 42%;
  border-radius: 12px 12px 4px 4px;
  background: linear-gradient(180deg, #d99a4e, #b5792f);
  box-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.35), 0 3px 0 rgba(0, 0, 0, 0.15);
  transform-origin: 50% 100%;
  z-index: 3;
  transition: transform 0.55s cubic-bezier(0.34, 1.4, 0.64, 1), opacity 0.55s;
}
.lid-knob {
  position: absolute;
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  width: 34%;
  height: 16%;
  border-radius: 999px;
  background: linear-gradient(180deg, #ffd87a, #e0a83e);
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.18);
}
.chest.opened .lid {
  transform: translateY(-46%) rotate(-24deg);
  opacity: 0.92;
}
.body {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 62%;
  border-radius: 6px 6px 16px 16px;
  background: linear-gradient(180deg, #c98a3d, #8b5a2b);
  box-shadow: inset 0 4px 0 rgba(255, 255, 255, 0.3), 0 6px 0 rgba(0, 0, 0, 0.18);
}
.lock {
  position: absolute;
  top: -14%;
  left: 50%;
  transform: translateX(-50%);
  width: 22%;
  height: 30%;
  border-radius: 6px;
  background: linear-gradient(180deg, #ffe9a8, #d9a73e);
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.2);
  z-index: 4;
}
.keyhole {
  position: absolute;
  top: 16%;
  left: 50%;
  transform: translateX(-50%);
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255, 220, 120, 0);
  z-index: 5;
  transition: background 0.3s;
}
.chest.opened .keyhole {
  background: rgba(255, 235, 160, 0.95);
  box-shadow: 0 0 12px 4px rgba(255, 220, 120, 0.8);
}

/* 金光柱 */
.light { position: absolute; inset: -8% -20% auto; z-index: 1; pointer-events: none; }
.beam {
  position: absolute;
  bottom: 34%;
  left: 50%;
  width: 18%;
  height: 120%;
  transform: translateX(-50%);
  background: linear-gradient(180deg, rgba(255, 236, 160, 0), rgba(255, 214, 110, 0.95), rgba(255, 236, 160, 0));
  border-radius: 999px;
  animation: beam-up 1s ease-out forwards;
  filter: blur(2px);
}
.beam.b2 { transform: translateX(-50%) rotate(16deg); animation-delay: 0.12s; opacity: 0.7; }
.beam.b3 { transform: translateX(-50%) rotate(-16deg); animation-delay: 0.2s; opacity: 0.7; }
@keyframes beam-up {
  from { opacity: 0; transform-origin: 50% 100%; transform: translateX(-50%) scaleY(0.1); }
  30% { opacity: 1; }
  to { opacity: 0; transform: translateX(-50%) scaleY(1.25); }
}

/* 星星粒子 */
.spark {
  position: absolute;
  bottom: 38%;
  left: 50%;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--yellow);
  box-shadow: 0 0 8px 2px rgba(255, 214, 110, 0.9);
  opacity: 0;
  z-index: 2;
  pointer-events: none;
  animation: spark-fly 1.1s ease-out var(--d) forwards;
}
@keyframes spark-fly {
  0% { opacity: 0; transform: translate(0, 0) scale(0.4); }
  15% { opacity: 1; }
  60% { transform: translate(var(--x), -120px) scale(1); opacity: 1; }
  100% { transform: translate(calc(var(--x) * 0.6), -190px) scale(0.5); opacity: 0; }
}

/* ---------- 三个点击 icon ---------- */
.tap-hints {
  display: flex;
  gap: var(--gap-m);
  margin-top: 2px;
}
.hint {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--card-bg);
  border: 3px solid var(--line);
  color: var(--ink-faint);
  transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
  animation: hint-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}
.hint .h-ico {
  width: 24px;
  height: 24px;
}
.hint.on {
  border-color: var(--c-orange);
  background: linear-gradient(180deg, #fff3d6, #ffe3a8);
  color: var(--c-orange);
  transform: translateY(-3px) scale(1.08);
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.12), 0 0 14px 2px rgba(255, 200, 90, 0.4);
}
@keyframes hint-pop {
  from { transform: scale(0.3); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

/* ---------- 文案与奖励 ---------- */
.cap {
  margin: 0;
  font-weight: 800;
  font-size: var(--fs-body);
  color: var(--ink-soft);
  text-align: center;
}
.reward {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-s);
  background: var(--card-bg);
  border: 3px solid var(--yellow);
  border-radius: var(--radius);
  padding: var(--gap-m);
  min-width: min(78vw, 300px);
  z-index: 12;
  animation:
    reward-in 0.55s cubic-bezier(0.34, 1.56, 0.64, 1),
    reward-glow 1.8s ease-in-out 0.6s infinite;
}
@keyframes reward-in {
  0% { transform: scale(0.2) rotate(10deg); opacity: 0; }
  60% { transform: scale(1.08) rotate(-2deg); opacity: 1; }
  100% { transform: scale(1) rotate(0); }
}
@keyframes reward-glow {
  0%, 100% { box-shadow: 0 6px 0 rgba(0, 0, 0, 0.18), 0 0 0 0 rgba(255, 214, 110, 0); }
  50% { box-shadow: 0 6px 0 rgba(0, 0, 0, 0.18), 0 0 26px 5px rgba(255, 214, 110, 0.45); }
}
.got {
  margin: 0;
  font-weight: 800;
  color: var(--ink);
  font-size: var(--fs-title);
}
.rewards {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--gap-s);
}
.shells {
  font-weight: 800;
  font-size: var(--fs-body);
  color: var(--on-tone);
  padding: var(--gap-xs) var(--gap-m);
  border-radius: var(--radius-pill);
  box-shadow: 0 var(--press) 0 rgba(0, 0, 0, 0.15);
}
.shells { background: var(--c-orange); }

/* 掉到的形态：一张带主色描边的小卡（新形态高光） */
.won {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: color-mix(in srgb, var(--tone) 16%, var(--card-bg));
  border: 3px solid color-mix(in srgb, var(--tone) 55%, transparent);
  border-radius: var(--radius);
  padding: var(--gap-s) var(--gap-m);
}
.won-tag {
  position: absolute;
  top: -12px;
  background: var(--c-orange);
  color: var(--on-tone);
  font-size: var(--fs-small);
  font-weight: 900;
  padding: 2px 10px;
  border-radius: var(--radius-pill);
}
.won-img {
  width: clamp(64px, 12vh, 96px);
  height: clamp(64px, 12vh, 96px);
  object-fit: contain;
}
.won-name {
  margin: 0;
  font-weight: 900;
  font-size: var(--fs-body);
  color: var(--ink);
}
.won-en {
  margin: 0;
  font-size: var(--fs-small);
  font-weight: 700;
  color: var(--ink-soft);
}
.take {
  width: 100%;
  max-width: 260px;
  font-size: var(--fs-body);
}
.collected {
  color: var(--green-dark);
  font-weight: 800;
  animation: pop-in 0.3s ease-out;
}

/* ---------- 飞行中的宝石/贝壳 ---------- */
.fly {
  position: fixed;
  z-index: 45;
  width: 26px;
  height: 26px;
  margin-left: -13px;
  margin-top: -13px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  transition: opacity 0.12s;
  filter: drop-shadow(0 3px 3px rgba(0, 0, 0, 0.25));
}
.fly-ico {
  width: 22px;
  height: 22px;
  color: var(--c-orange);
}
.r-ico, .gift-ico {
  width: 1.1em;
  height: 1.1em;
  vertical-align: -0.2em;
}
.shells .r-ico { color: var(--on-tone); }
.take .r-ico { color: var(--on-tone); }
.collected .gift-ico { color: var(--green-dark); }
</style>
