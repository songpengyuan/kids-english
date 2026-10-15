<script setup>
/**
 * 应用入口口令页（#/gate）。
 *
 * 备案域名下进入学习应用的前置门禁：
 *  - 首次：家长设置口令（输入两次一致）→ 设置即解锁进入；
 *  - 之后：输入口令 → 验证通过解锁进入；
 *  - 已解锁设备的访问会被路由守卫直接跳过本页（进 /learn）。
 * 管理（修改/关闭）在「家长中心 → 设置 → 应用口令」。
 */
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useGateStore } from "../stores/gate";

const router = useRouter();
const gate = useGateStore();

const pass = ref("");
const confirm = ref("");
const error = ref("");
const busy = ref(false);
const firstTime = computed(() => !gate.isSetup);

async function submit() {
  error.value = "";
  if (busy.value) return;
  const p = pass.value.trim();
  if (p.length < 4) {
    error.value = "口令至少 4 位";
    return;
  }
  busy.value = true;
  try {
    if (firstTime.value) {
      if (p !== confirm.value.trim()) {
        error.value = "两次输入不一致";
        return;
      }
      await gate.setup(p);
    } else {
      const ok = await gate.verify(p);
      if (!ok) {
        error.value = "口令不对，再试一次";
        return;
      }
    }
    router.replace("/learn");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="view gate-view">
    <div class="gate-card">
      <div class="gate-lock">🔒</div>
      <h1 class="gate-title">丞丞ABC</h1>
      <p class="gate-tip">
        {{ firstTime ? "第一次使用，请设置家长口令" : "请输入家长口令" }}
      </p>
      <input
        v-model="pass"
        class="gate-input"
        type="password"
        :placeholder="firstTime ? '设置口令（可用家长手机号，至少 4 位）' : '家长口令（手机号）'"
        maxlength="20"
        inputmode="numeric"
        autocomplete="off"
        @keyup.enter="submit"
      />
      <input
        v-if="firstTime"
        v-model="confirm"
        class="gate-input"
        type="password"
        placeholder="再输一遍确认"
        maxlength="20"
        inputmode="numeric"
        autocomplete="off"
        @keyup.enter="submit"
      />
      <p v-if="error" class="gate-error">{{ error }}</p>
      <button class="gate-btn" :disabled="busy" @click="submit">
        {{ busy ? "请稍候…" : firstTime ? "设置并进入" : "进入" }}
      </button>
      <p class="gate-foot">口令由家长设置，常用家长手机号；解锁后 7 天内免输。</p>
    </div>
  </div>
</template>

<style scoped>
.gate-view {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg, #f5f3ee);
}
.gate-card {
  width: min(360px, 100%);
  background: var(--card-bg, #fff);
  border-radius: 20px;
  padding: 36px 28px 28px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  text-align: center;
}
.gate-lock {
  font-size: 44px;
  line-height: 1;
}
.gate-title {
  font-size: 22px;
  margin: 12px 0 6px;
  letter-spacing: 2px;
}
.gate-tip {
  font-size: 14px;
  color: var(--ink-soft, #666);
  margin-bottom: 20px;
}
.gate-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--line, #e5e2db);
  border-radius: 12px;
  font-size: 16px;
  margin-bottom: 12px;
  box-sizing: border-box;
  background: var(--input-bg, #fff);
  color: inherit;
}
.gate-input:focus {
  outline: none;
  border-color: var(--accent, #8a5a2b);
}
.gate-error {
  color: #d33;
  font-size: 13px;
  margin: -4px 0 10px;
}
.gate-btn {
  width: 100%;
  padding: 13px;
  border: 0;
  border-radius: 12px;
  background: var(--accent, #8a5a2b);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
.gate-btn:disabled {
  opacity: 0.6;
}
.gate-foot {
  margin-top: 16px;
  font-size: 12px;
  color: var(--ink-soft, #999);
}
</style>
