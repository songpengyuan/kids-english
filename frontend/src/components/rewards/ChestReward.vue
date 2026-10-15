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
import BaseButton from "../ui/BaseButton.vue";

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
/** 中间展示区剩余贝壳数（开箱后 = 本次掉落数；收取时逐个 -1，与右上 +1 对应） */
const panelShown = ref(0);
/** 展示区贝壳元素（飞行源点：每轮取"将要消失"的那枚的坐标） */
const shellEls = ref([]);
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
  panelShown.value = 0; // 开箱瞬间先清空，入账后填充展示区
  sfxChestOpen();
  bigCelebrate();
  const r = rewards.rollChest();
  rewards.grant(r);
  reward.value = r;
  panelShown.value = r.shells; // 展示区出现对应的贝壳/海螺（宝箱替换成奖励）
  sfxCoin();
  if (r.formId) sfxSticker();
  // 650ms：金光/光柱足够看完，又不让性急的孩子干等（原 1s 偏拖）
  later(() => {
    phase.value = "reward";
  }, 650);
}

function tapChest() {
  if (phase.value === "flying" || phase.value === "collected") return;
  // 奖励展示阶段点宝箱 = 收取（孩子开箱后会继续戳宝箱，别给"没反应"的死区）
  if (phase.value === "reward") {
    collect();
    return;
  }
  if (taps.value >= 3) return; // 开箱瞬间（open 阶段）不再响应
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
  const dst = badgeEl.value?.getBoundingClientRect();
  if (!dst) {
    phase.value = "collected";
    emit("done");
    return;
  }
  const to = { x: dst.left + dst.width / 2, y: dst.top + dst.height / 2 };
  // 展示区的贝壳逐个飞向右上角徽标：右上 +1、展示区 -1，飞完对齐余额
  while (panelShown.value > 0) {
    const src = shellEls.value[panelShown.value - 1]?.getBoundingClientRect();
    if (!src) break;
    const from = { x: src.left + src.width / 2, y: src.top + src.height / 2 };
    const apex = Math.max(140, Math.abs(from.y - to.y) * 0.55); // 上抛弧度随距离增大
    await flyOne(from, to, apex);
    shown.value = Math.min(shown.value + 1, rewards.shells); // 右上数量 +1
    panelShown.value -= 1; // 展示区数量 -1（贝壳少一枚）
    sfxCoin(); // 落地：硬币"叮"
    pulseTick.value++; // 徽标接收脉冲
    if (panelShown.value > 0) await sleep(160); // 逐个小间隔（收紧节奏，重复开箱不拖）
  }
  // 最后一枚飞完：稍作停留（徽标数字生长 + 叮声看完）再收尾，避免秒切页面
  await sleep(650);
  phase.value = "collected";
  emit("done");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 单个宝石/贝壳沿抛物线飞行（rAF，丝滑 560ms） */
function flyOne(from, to, apex) {
  return new Promise((resolve) => {
    const el = flyEl.value;
    if (!el) return resolve();
    el.style.opacity = "1";
    el.style.left = from.x + "px";
    el.style.top = from.y + "px";
    const t0 = performance.now();
    const dur = 560;
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

/**
 * 本次掉落总数（开箱后固定）。收取过程固定渲染全部贝壳、已飞走的原地隐藏——
 * 剩余贝壳保持原位不动，不会因数量减少重新排列。
 */
const totalShells = computed(() => reward.value?.shells ?? 0);

/**
 * 贝壳山形排布：顶层 1 枚，逐层 +1（金字塔），直到放完。
 * 基于固定总数计算，收取过程中布局不变。
 * 6 枚 → 3-2-1；5 枚 → 2-2-1；4 枚 → 2-1-1；3 枚 → 2-1。
 */
const shellRows = computed(() => {
  const n = totalShells.value;
  const rows = [];
  let rem = n;
  let level = 1;
  while (rem > 0) {
    const cur = Math.min(level, rem);
    rows.push(cur);
    rem -= cur;
    level++;
  }
  return rows;
});
/** 第 ri 行首个贝壳的全局序号（0-based 偏移） */
function rowOffset(ri) {
  let acc = 0;
  for (let i = 0; i < ri; i++) acc += shellRows.value[i];
  return acc;
}
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
    <div ref="badgeEl" class="shell-badge" :class="{ pulsing: phase === 'flying' }">
      <span class="shell-emoji b-ico"><ShellIcon /></span>
      <span class="b-num" :key="'num-' + pulseTick">{{ shown }}</span>
      <!-- 每枚贝壳入账：从徽标位置"长出"新数字（放大弹出 + 上飘淡出，真实感） -->
      <span v-if="pulseTick" :key="'pop-' + pulseTick" class="b-pop" aria-hidden="true">{{ shown }}</span>
    </div>

    <!-- 跳过动画（整个敲击阶段都可见，敲到一半也能跳）：奖励照常入账 -->
    <button v-if="phase === 'closed'" class="skip-btn" @click="skip">
      跳过
    </button>

    <!-- 开盖瞬间：全屏金光一闪 -->
    <div v-if="phase === 'open' || phase === 'reward' || phase === 'flying'" class="flash"></div>
    <div v-if="phase === 'open' || phase === 'reward'" class="glow"></div>

    <div
      v-if="phase === 'closed' || phase === 'open'"
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

    <!-- 三个向上箭头（未开箱阶段就显示）：点一下屏幕高亮一个，点满 3 次开箱；开盖后进入收取页不再显示 -->
    <div v-if="phase === 'closed' || phase === 'open'" class="tap-hints">
      <button
        v-for="i in 3"
        :key="i"
        class="arrow"
        :class="{ on: taps >= i, locked: taps < i - 1 }"
        :disabled="taps >= i"
        :style="{ animationDelay: (i - 1) * 0.1 + 's' }"
        :aria-label="`敲第 ${i} 下`"
        @click.stop="tapChest"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 19V5" />
          <path d="M5 12l7-7 7 7" />
        </svg>
      </button>
    </div>

    <p v-if="cap && phase !== 'reward' && phase !== 'flying'" class="cap">{{ cap }}</p>

    <!-- 奖励展示 + 收取：flying 阶段面板保留，贝壳逐个飞走、数量逐个减少 -->
    <div v-if="(phase === 'reward' || phase === 'flying') && reward" class="reward">
      <p class="got">获得</p>
      <div class="rewards">
        <!-- 宝箱替换出现对应的贝壳/海螺：山形（金字塔）排列，收取时逐枚飞走 -->
        <div class="shell-rows" aria-label="本次获得的贝壳">
          <div v-for="(row, ri) in shellRows" :key="'r' + ri" class="shell-row">
            <span
              v-for="(j, ci) in row"
              :key="'sh' + (rowOffset(ri) + ci + 1)"
              :ref="(el) => { if (el) shellEls[rowOffset(ri) + ci] = el; }"
              class="shell-item anim-pop"
              :class="{ gone: rowOffset(ri) + ci + 1 > panelShown }"
              :style="{ '--i': rowOffset(ri) + ci }"
            ><ShellIcon /></span>
          </div>
        </div>
      </div>
      <!-- 掉到形态：新形态单独高光展示（图片 + 角色·形态名） -->
      <div v-if="wonForm" class="won anim-pop" :style="{ '--tone': wonForm.color }">
        <span class="won-tag">{{ reward.isNew ? "新形态！" : "升星！" }}</span>
        <img class="won-img" :src="wonImg" :alt="wonForm.heroName + wonForm.name" @error="wonImgFailed = true" />
        <p class="won-name">{{ wonForm.heroName }} · {{ wonForm.name }}</p>
        <p class="won-en">{{ wonForm.heroEn }}, {{ wonForm.en }}</p>
      </div>
      <BaseButton variant="green" :disabled="phase === 'flying'" @click="collect">
        {{ phase === 'flying' ? '收取中…' : '收取' }}
        <span class="shell-emoji"><ShellIcon /></span>
        <span class="cnt">×{{ panelShown }}</span>
      </BaseButton>
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
/* 入账数字生长：从徽标中心放大弹出、上飘淡出（贝壳飞入时"长出"新数字） */
.b-pop {
  position: absolute;
  left: 50%;
  top: 2px;
  transform: translateX(-50%);
  font-weight: 900;
  font-size: clamp(20px, 4.4vh, 30px);
  color: var(--yellow, #ffd87a);
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
  pointer-events: none;
  white-space: nowrap;
  animation: b-pop 0.7s cubic-bezier(0.22, 1.4, 0.36, 1) forwards;
}
@keyframes b-pop {
  0% {
    opacity: 0;
    transform: translateX(-50%) scale(0.3) translateY(6px);
  }
  30% {
    opacity: 1;
    transform: translateX(-50%) scale(1.25) translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateX(-50%) scale(1) translateY(-14px);
  }
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
  /* 入场弹一下 + 未开箱时循环轻微摇摆（"我还能点"的活性提示，防止静止死区） */
  animation: chest-bump 0.42s cubic-bezier(0.34, 1.4, 0.64, 1),
    chest-idle 2.4s ease-in-out 1s infinite;
}
/* 未开箱：每次敲击晃动 */
@keyframes chest-bump {
  0%, 100% { transform: rotate(0); }
  25% { transform: rotate(-7deg) translateY(-4px); }
  55% { transform: rotate(6deg) translateY(-6px); }
  80% { transform: rotate(-3deg) translateY(-2px); }
}
/* 待机摇摆：幅度刻意小，是"呼吸感"不是"求关注" */
@keyframes chest-idle {
  0%, 100% { transform: rotate(0) scale(1); }
  30% { transform: rotate(-2.4deg) scale(1.015); }
  65% { transform: rotate(2.4deg) scale(1.02); }
}
/* 点我涟漪：未开箱时绕宝箱一圈圈扩散，第一次敲击前最强引导 */
.chest:not(.opened)::after {
  content: "";
  position: absolute;
  inset: -10px;
  border-radius: 28px;
  border: 3px solid rgba(255, 200, 90, 0.8);
  opacity: 0;
  pointer-events: none;
  animation: tap-ring 1.8s ease-out 1.4s infinite;
}
@keyframes tap-ring {
  0% { opacity: 0.85; transform: scale(0.94); }
  70%, 100% { opacity: 0; transform: scale(1.14); }
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

/* ---------- 三个向上箭头 ---------- */
.tap-hints {
  display: flex;
  gap: var(--gap-m);
  margin-top: 2px;
}
.arrow {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--card-bg);
  border: 3px solid var(--line);
  color: var(--ink-faint);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
  animation: arrow-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}
.arrow svg {
  width: 26px;
  height: 26px;
}
.arrow.on {
  border-color: var(--c-orange);
  background: linear-gradient(180deg, #fff3d6, #ffe3a8);
  color: var(--c-orange);
  transform: translateY(-6px);
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.12), 0 0 16px 2px rgba(255, 200, 90, 0.5);
}
.arrow:disabled {
  cursor: default;
}
@keyframes arrow-pop {
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
  /* 与开箱阶段的黄色宝箱氛围区分：收取页用绿色"收获"边框 */
  border: 3px solid var(--green, #2eaf5a);
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
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
/* 贝壳山形：纵向堆叠、每层居中，底层最宽呈小山 */
.shell-rows {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.shell-row {
  display: flex;
  justify-content: center;
  gap: 6px;
}
/* 收取按钮上的 ×N 计数（随收取递减） */
.cnt {
  font-weight: 900;
  font-size: var(--fs-body);
  color: #6b4e00;
  background: linear-gradient(160deg, #ffd87a, #f0a63a);
  padding: 1px 8px;
  border-radius: 999px;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.18);
}
.shell-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.25s ease;
  width: clamp(30px, 6.5vh, 42px);
  height: clamp(30px, 6.5vh, 42px);
  border-radius: 50%;
  background: linear-gradient(160deg, #ffd87a, #f0a63a);
  color: #6b4e00;
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.18), inset 0 2px 0 rgba(255, 255, 255, 0.45);
  font-size: clamp(18px, 3.4vh, 24px);
  animation-delay: calc(var(--i, 0) * 0.05s);
}
/* 已飞走的贝壳：原地缩小消失，不改变 flex 布局 → 剩余贝壳保持原位 */
.shell-item.gone {
  opacity: 0;
  animation: shell-gone 0.3s ease forwards;
}
@keyframes shell-gone {
  to {
    opacity: 0;
    transform: scale(0.15);
  }
}
.shell-item:last-child { animation-delay: 0.15s; }

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

/* 减少动态偏好：关掉装饰性大动画，保留开盖过渡与信息本身 */
@media (prefers-reduced-motion: reduce) {
  .chest, .chest::after, .flash, .glow, .beam, .spark, .reward, .hint {
    animation: none !important;
  }
}
</style>
