<script setup>
/**
 * 应用入口口令页（#/gate）—— 备案域名下的家长口令门禁。
 *
 * 设计（2026-10 统一）：原先是"DeepSeek 极简风"（写死 #fff 白底 + 冷灰阶
 * #1a1a1a/#999/#f5f5f5），与全站的暖色系统完全不同，且**不跟随主题**——
 * 家长在暗色模式下打开会突然闪一片白。现在改为：
 *   · 骨架用 PageShell（bare + center，本页无顶栏、内容垂直居中）；
 *   · 颜色全部走 token（--ink / --ink-soft / --ink-faint / --brand / --card-bg），
 *     亮暗两套自动跟随；
 *   · 输入框用全局 .field，主按钮用全局 .k-btn（全站同一个"进入"按钮）。
 * 版式仍是原来的居中单列（品牌区在卡外、表单在卡内），这是入口页应有的克制。
 */
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useGateStore } from "../stores/gate";
import { useAuthStore } from "../stores/auth";
import { useContentStore } from "../stores/content";
import { useProgressStore } from "../stores/progress";
import PageShell from "../components/ui/PageShell.vue";

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
  <PageShell bare center>
    <div class="gate">
      <!-- 品牌区（卡外，入口页的门面） -->
      <div class="gate__brand">
        <span class="gate__mark">📚</span>
        <h1 class="gate__name">丞丞学英语</h1>
        <p class="gate__slogan">每天 10 分钟 · 快乐学英语</p>
      </div>

      <!-- 表单（卡内） -->
      <form class="card gate__form" @submit.prevent="submit">
        <input
          v-model="pass"
          class="field"
          type="password"
          placeholder="请输入家长口令"
          maxlength="20"
          inputmode="numeric"
          autocomplete="off"
        />
        <button class="k-btn gate__btn" type="submit" :disabled="busy">
          {{ busy ? "进入中…" : "进入" }}
        </button>
        <p v-if="error" class="gate__error">{{ error }}</p>
      </form>

      <p class="gate__foot">本设备 7 天内免重复输入</p>
    </div>
  </PageShell>
</template>

<style scoped>
.gate {
  width: 100%;
  max-width: 340px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  text-align: center;
}

/* ---------- 品牌区 ---------- */
.gate__brand {
  margin-bottom: var(--gap-l);
}
.gate__mark {
  font-size: var(--fs-emoji-xl);
  line-height: 1;
}
.gate__name {
  margin: var(--gap-s) 0 var(--gap-xs);
  font-size: var(--fs-title);
  font-weight: var(--fw-strong);
  color: var(--ink);
  letter-spacing: 1px;
}
.gate__slogan {
  margin: 0;
  font-size: var(--fs-small);
  color: var(--ink-faint);
}

/* ---------- 表单 ---------- */
.gate__form {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
}
.gate__btn {
  width: 100%;
}
.gate__error {
  margin: 0;
  color: var(--red);
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
}
.gate__foot {
  margin: var(--gap-l) 0 0;
  font-size: var(--fs-small);
  color: var(--ink-faint);
}
</style>
