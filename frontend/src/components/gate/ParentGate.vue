<script setup lang="ts">
/**
 * 家长门禁（ParentGate）——双模式壳层的门禁弹层。
 *
 * 亲子模式默认零文字依赖，家长区（家庭账号/报告/设置）进入前弹出本组件：
 *  - 语音引导"这是家长区，答对才能进"；
 *  - 简单加法（和 ≤ 10）数字键盘：答对 haptic 提示 + emit("pass")；
 *  - 答错换新题（防止孩子记住上一题答案）；
 *  - 右上角 ✕ 可关闭（孩子误入时家长可取消，不进入家长区）。
 */
import { onMounted, ref } from "vue";
import { speakZh } from "../../services/speech";
import { hapticTap, hapticWrong } from "../../services/haptics";
import { checkGateAnswer, makeGateQuestion, type GateQuestion } from "../../utils/parentGateMath";

const emit = defineEmits<{ pass: []; close: [] }>();

const q = ref<GateQuestion>(makeGateQuestion());
const input = ref("");
const wrong = ref(false);

function append(d: string) {
  if (input.value.length >= 2) return;
  input.value += d;
  wrong.value = false;
}
function clear() {
  input.value = "";
  wrong.value = false;
}
function confirm() {
  if (!input.value) return;
  if (checkGateAnswer(q.value, input.value)) {
    hapticTap();
    speakZh("答对了，欢迎家长");
    emit("pass");
  } else {
    hapticWrong();
    wrong.value = true;
    speakZh("不对哦，再试一次");
    clear();
    q.value = makeGateQuestion(); // 换题：防止孩子记住答案
  }
}
function close() {
  hapticTap();
  emit("close");
}

onMounted(() => {
  speakZh("这是家长区，答对才能进");
});
</script>

<template>
  <div class="gate-mask">
    <div class="gate-card" role="dialog" aria-label="家长验证">
      <button class="gate-close" aria-label="关闭" @click="close">✕</button>
      <p class="gate-title">家长验证</p>
      <p class="gate-question">请回答：<b>{{ q.a }} + {{ q.b }} = ?</b></p>
      <p class="gate-input" :class="{ wrong }">{{ input || "·" }}</p>
      <div class="gate-pad">
        <button v-for="d in ['1', '2', '3', '4', '5', '6', '7', '8', '9']" :key="d" class="g-key" @click="append(d)">{{ d }}</button>
        <button class="g-key g-ctl" @click="clear">清</button>
        <button class="g-key" @click="append('0')">0</button>
        <button class="g-key g-ok" @click="confirm">确定</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gate-mask {
  position: fixed;
  inset: 0;
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 20, 30, 0.55);
}
.gate-card {
  position: relative;
  width: min(320px, 84vw);
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-l) var(--gap-m) var(--gap-m);
  text-align: center;
}
.gate-close {
  position: absolute;
  top: 10px;
  right: 14px;
  font-size: 18px;
  font-weight: var(--fw-strong);
  color: var(--ink-faint);
}
.gate-title {
  margin: 0 0 4px;
  font-size: var(--fs-body);
  font-weight: var(--fw-strong);
  color: var(--ink-soft);
}
.gate-question {
  margin: 0 0 8px;
  font-weight: var(--fw-strong);
  font-size: 16px;
}
.gate-question b {
  font-size: 20px;
  color: var(--blue);
}
.gate-input {
  height: 34px;
  margin: 0 auto 10px;
  max-width: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: var(--fw-strong);
  border-bottom: 2px solid var(--line);
  color: var(--ink);
}
.gate-input.wrong {
  color: #dc2626;
  border-color: #dc2626;
}
.gate-pad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.g-key {
  height: 46px;
  border-radius: var(--radius-s);
  font-size: 18px;
  font-weight: var(--fw-strong);
  background: var(--line);
  color: var(--ink);
}
.g-key:active {
  transform: translateY(1px);
}
.g-ctl {
  font-size: 15px;
  color: var(--ink-faint);
}
.g-ok {
  background: var(--ok);
  color: #fff;
}
</style>
