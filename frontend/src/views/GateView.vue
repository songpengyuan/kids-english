<script setup>
/**
 * 应用入口口令页（#/gate）。
 *
 * 备案域名下进入学习应用的门禁：必须输入家长约定的固定口令才能进入。
 * 口令即登录凭证：验证成功 = 自动登录，一次输入完成进门 + 云端同步。
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
      error.value = "口令不对或服务暂不可用，再试一次";
      return;
    }
    // gate 验证成功 = 已存 JWT：恢复登录态并拉取云端数据
    await auth.restore();
    if (auth.family) {
      content.loadFromServer();
      progress.syncFromServer();
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
      <p class="gate-tip">请输入家长口令进入</p>
      <input
        v-model="pass"
        class="gate-input"
        type="password"
        placeholder="家长口令（手机号）"
        maxlength="20"
        inputmode="numeric"
        autocomplete="off"
        @keyup.enter="submit"
      />
      <p v-if="error" class="gate-error">{{ error }}</p>
      <button class="gate-btn" :disabled="busy" @click="submit">
        {{ busy ? "请稍候…" : "进入" }}
      </button>
      <p class="gate-foot">口令由家长约定；本设备解锁后 7 天内免输。</p>
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
