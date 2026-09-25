<script setup>
/**
 * 开宝箱奖励组件。
 *
 * - 自包含：开箱动画（CSS）、撒花（复用 effects 礼花）、奖励生成与入账（rewards store）都在内部，
 *   父组件只需挂载并监听 done 决定下一步。
 * - 状态机：closed（可点）→ shaking（摇晃+发光）→ opening（开盖+闪光+冲击波+奖励喷出+入账）→ reward（展示奖励）→ collected（已收下）。
 * - 反馈三路齐备：CSS 动画（金光/粒子/弹性面板）+ WebAudio 音效（开盖低音/金币叮/星光）+ 触感震动（开盖重震/入袋轻震）。
 * - 不引入额外动画库：canvas-confetti 已有，其余全 CSS，体积与可控性兼顾。
 */
import { ref } from "vue";
import {
  bigCelebrate,
  sfxChestOpen,
  sfxCoin,
  sfxCollect,
  sfxSticker,
  sfxTap
} from "../utils/effects";
import { grant, rollChest } from "../store/rewards";

const emit = defineEmits(["done"]);

const phase = ref("closed"); // closed | shaking | opening | reward | collected
const reward = ref(null); // { shells, sticker }

let timers = [];
function later(fn, ms) {
  timers.push(setTimeout(fn, ms));
}

function openChest() {
  if (phase.value !== "closed") return;
  sfxTap(); // 撬动：轻点音 + 触感
  phase.value = "shaking";
  later(() => {
    phase.value = "opening";
    // 开盖瞬间：低重音"咚"+金光上行音阶（自带重震）+ 双侧撒花
    sfxChestOpen();
    bigCelebrate();
    // 奖励生成并入账（幂等，贴纸去重）
    const r = rollChest();
    grant(r);
    reward.value = r;
    // 奖励落袋音效：贝壳"叮"，再抽到贴纸补一段星光
    sfxCoin();
    if (r.sticker) sfxSticker();
    later(() => {
      phase.value = "reward";
    }, 1300);
  }, 700);
}

function collect() {
  sfxCollect(); // 收尾双响
  phase.value = "collected";
  emit("done");
}
</script>

<template>
  <div class="chest-wrap" :class="'ph-' + phase">
    <!-- 开盖瞬间：全屏金光一闪（聚光到宝箱） -->
    <div v-if="phase === 'opening'" class="flash"></div>
    <!-- 全屏暖光晕：把注意力聚到宝箱上 -->
    <div v-if="phase === 'opening' || phase === 'reward'" class="glow"></div>

    <div
      class="chest"
      data-haptic="true"
      @click="openChest"
      :aria-label="phase === 'closed' ? '开宝箱' : '宝箱'"
    >
      <!-- 摇晃阶段：宝箱底部金色光晕脉动（"在发光"的视觉） -->
      <div v-if="phase === 'shaking'" class="chest-glow"></div>

      <!-- 金光柱：开盖瞬间从箱口射出 -->
      <div v-if="phase === 'opening' || phase === 'reward'" class="light">
        <span class="beam"></span>
        <span class="beam b2"></span>
        <span class="beam b3"></span>
      </div>
      <!-- 迸出的星星粒子 -->
      <span v-for="n in 8" :key="'s' + n" class="spark" :style="{ '--d': n * 0.07 + 's', '--x': (n % 4) * 26 - 39 + 'px' }"></span>
      <!-- 奖励喷出：贝壳/金星从箱口飞向四周 -->
      <span
        v-for="n in 8"
        :key="'p' + n"
        class="pay"
        :style="{
          '--dx': ((n % 5) - 2) * 30 + 'px',
          '--dy': -(44 + (n % 3) * 28) + 'px',
          '--d': (n % 4) * 0.06 + 's',
          '--r': (n % 2 ? 1 : -1) * (50 + (n % 3) * 30) + 'deg'
        }"
      >{{ n % 3 === 0 ? "🐚" : "✦" }}</span>

      <!-- 冲击波：开盖瞬间从箱口扩散两圈 -->
      <span v-if="phase === 'opening'" class="shock"></span>
      <span v-if="phase === 'opening'" class="shock s2"></span>

      <div class="lid">
        <div class="lid-knob"></div>
      </div>
      <div class="body">
        <div class="lock"></div>
      </div>
      <div class="keyhole"></div>
    </div>

    <p v-if="phase === 'closed'" class="cap">完成啦！点一下开宝箱</p>
    <p v-else-if="phase === 'shaking'" class="cap">宝箱在发光……</p>
    <p v-else-if="phase === 'opening'" class="cap">哇——</p>

    <!-- 奖励展示 -->
    <div v-if="phase === 'reward' && reward" class="reward">
      <p class="got">获得</p>
      <div class="rewards">
        <span class="shells anim-pop">🐚 ×{{ reward.shells }}</span>
        <span v-if="reward.sticker" class="stick anim-pop" :style="{ animationDelay: '0.12s' }">{{ reward.sticker }} 贴纸</span>
      </div>
      <button class="k-btn take" @click="collect">收下，继续玩！</button>
    </div>

    <!-- 已收下 -->
    <p v-if="phase === 'collected'" class="cap collected">🎁 已收进宝藏罐！</p>
  </div>
</template>

<style scoped>
.chest-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-s);
  padding: var(--gap-s);
}

/* ---------- 开盖瞬间：全屏金光一闪 ---------- */
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

/* 全屏暖光晕 */
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
}
.ph-closed .chest:hover { transform: translateY(-4px); }
.ph-shaking .chest { animation: chest-shake 0.55s ease-in-out; }
.ph-opening .chest, .ph-reward .chest { animation: chest-bounce 0.5s ease-out; }

@keyframes chest-shake {
  0%, 100% { transform: rotate(0); }
  20% { transform: rotate(-7deg) translateY(-3px); }
  40% { transform: rotate(7deg) translateY(-6px); }
  60% { transform: rotate(-6deg) translateY(-4px); }
  80% { transform: rotate(5deg) translateY(-2px); }
}
@keyframes chest-bounce {
  0% { transform: scale(1); }
  35% { transform: scale(1.06) translateY(-6px); }
  70% { transform: scale(0.98); }
  100% { transform: scale(1); }
}

/* 摇晃阶段：宝箱底部金色光晕脉动 */
.chest-glow {
  position: absolute;
  left: 50%;
  bottom: 6%;
  transform: translateX(-50%);
  width: 140%;
  height: 45%;
  background: radial-gradient(ellipse at center, rgba(255, 214, 110, 0.75), transparent 70%);
  filter: blur(6px);
  z-index: 0;
  pointer-events: none;
  animation: glow-pulse 0.6s ease-in-out infinite alternate;
}
@keyframes glow-pulse {
  from { transform: translateX(-50%) scale(0.85); opacity: 0.55; }
  to { transform: translateX(-50%) scale(1.15); opacity: 0.95; }
}

/* 盖子：开盖时向上掀 + 旋转 */
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
.ph-opening .lid, .ph-reward .lid {
  transform: translateY(-46%) rotate(-24deg);
  opacity: 0.92;
}

/* 箱体 */
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
/* 金属锁扣 */
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
/* 锁孔（开箱后出现小光点） */
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
.ph-opening .keyhole, .ph-reward .keyhole {
  background: rgba(255, 235, 160, 0.95);
  box-shadow: 0 0 12px 4px rgba(255, 220, 120, 0.8);
}

/* ---------- 金光柱 ---------- */
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

/* ---------- 星星粒子 ---------- */
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
}
.ph-opening .spark, .ph-reward .spark {
  animation: spark-fly 1.1s ease-out var(--d) forwards;
}
@keyframes spark-fly {
  0% { opacity: 0; transform: translate(0, 0) scale(0.4); }
  15% { opacity: 1; }
  60% { transform: translate(var(--x), -120px) scale(1); opacity: 1; }
  100% { transform: translate(calc(var(--x) * 0.6), -190px) scale(0.5); opacity: 0; }
}

/* ---------- 奖励喷出：贝壳/金星 ---------- */
.pay {
  position: absolute;
  bottom: 40%;
  left: 50%;
  font-size: clamp(14px, 2.6vh, 20px);
  line-height: 1;
  opacity: 0;
  z-index: 2;
  pointer-events: none;
}
.ph-opening .pay, .ph-reward .pay {
  animation: pay-fly 1.15s cubic-bezier(0.2, 0.7, 0.35, 1) var(--d) forwards;
}
@keyframes pay-fly {
  0% { opacity: 0; transform: translate(0, 0) rotate(0) scale(0.3); }
  12% { opacity: 1; transform: translate(0, -14px) rotate(var(--r)) scale(1); }
  70% { transform: translate(var(--dx), var(--dy)) rotate(var(--r)) scale(1); opacity: 1; }
  100% { transform: translate(calc(var(--dx) * 0.7), calc(var(--dy) * 0.6)) rotate(calc(var(--r) * 1.4)) scale(0.4); opacity: 0; }
}

/* ---------- 冲击波：开盖扩散圆环 ---------- */
.shock {
  position: absolute;
  left: 50%;
  bottom: 40%;
  width: 46px;
  height: 46px;
  transform: translate(-50%, -50%);
  border: 5px solid rgba(255, 224, 130, 0.95);
  border-radius: 50%;
  opacity: 0;
  z-index: 1;
  pointer-events: none;
  animation: shock-ring 1s ease-out forwards;
}
.shock.s2 { animation-delay: 0.16s; border-color: rgba(255, 200, 80, 0.7); }
@keyframes shock-ring {
  0% { opacity: 0.9; transform: translate(-50%, -50%) scale(0.35); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(3.4); }
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
  /* 弹入：旋转回正 + 弹性过冲；随后金色光晕温柔脉冲 */
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
.shells, .stick {
  font-weight: 800;
  font-size: var(--fs-body);
  color: var(--on-tone);
  padding: var(--gap-xs) var(--gap-m);
  border-radius: var(--radius-pill);
  box-shadow: 0 var(--press) 0 rgba(0, 0, 0, 0.15);
}
.shells { background: var(--c-orange); }
.stick { background: var(--c-purple); }
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
</style>
