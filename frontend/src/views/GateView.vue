<script setup>
/**
 * 应用入口口令页（#/gate）—— DeepSeek 风格极简
 */
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useGateStore } from "../stores/gate";
import { useAuthStore } from "../stores/auth";
import { useContentStore } from "../stores/content";
import { useProgressStore } from "../stores/progress";

const router = useRouter();
const gate = useGateStore();
const auth = useAuthStore();
const content = useContentStore();
const progress = useProgressStore();

const pass = ref("");
const error = ref("");
const busy = ref(false);

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
    const ok = await gate.verify(p);
    if (!ok) {
      error.value = "口令不对，再试一次";
      return;
    }
    await auth.restore();
    if (auth.family) {
      content.loadFromServer();
      await progress.flushReport();
      progress.syncFromServer();
    }
    router.replace("/course");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="gate">
    <div class="gate-inner">
      <!-- 居中 logo 区 -->
      <div class="brand">
        <span class="brand-mark">📚</span>
        <h1 class="brand-name">丞丞学英语</h1>
        <p class="brand-slogan">每天 10 分钟 · 快乐学英语</p>
      </div>

      <!-- 输入区 -->
      <div class="input-box">
        <input
          v-model="pass"
          class="gate-input"
          type="password"
          placeholder="请输入家长口令"
          maxlength="20"
          inputmode="numeric"
          autocomplete="off"
          @keyup.enter="submit"
        />
        <button class="gate-btn" :disabled="busy" @click="submit">
          {{ busy ? "进入中…" : "进入" }}
        </button>
      </div>

      <p v-if="error" class="gate-error">{{ error }}</p>
      <p class="gate-foot">本设备 7 天内免重复输入</p>
    </div>
  </div>
</template>

<style scoped>
.gate {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  padding: 24px;
}
.gate-inner {
  width: 100%;
  max-width: 340px;
  text-align: center;
}

/* 品牌区 */
.brand {
  margin-bottom: 48px;
}
.brand-mark {
  font-size: 48px;
  line-height: 1;
}
.brand-name {
  margin: 16px 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: #1a1a1a;
  letter-spacing: 1px;
}
.brand-slogan {
  margin: 0;
  font-size: 14px;
  color: #999;
}

/* 输入区 */
.input-box {
  display: flex;
  gap: 8px;
  background: #f5f5f5;
  border-radius: 16px;
  padding: 6px;
}
.gate-input {
  flex: 1;
  border: 0;
  background: transparent;
  padding: 12px 14px;
  font-size: 15px;
  outline: none;
  color: #1a1a1a;
}
.gate-input::placeholder {
  color: #aaa;
}
.gate-btn {
  flex: none;
  border: 0;
  border-radius: 12px;
  padding: 12px 22px;
  background: #1cb0f6;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.gate-btn:disabled {
  opacity: 0.5;
}

.gate-error {
  color: #e53e3e;
  font-size: 13px;
  margin-top: 12px;
}
.gate-foot {
  margin-top: 32px;
  font-size: 12px;
  color: #bbb;
}
</style>
