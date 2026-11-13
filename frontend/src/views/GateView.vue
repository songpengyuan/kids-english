<script setup lang="ts">
/**
 * 应用入口口令页（#/gate）—— 备案域名下的家长口令门禁。
 *
 * 视觉（2026-11 与对外落地页统一）：与 public/index.html 落地页同一家族——
 * 深空夜色贴纸风（深海军蓝星空底 + 青绿/紫极光 + 星点）、巨嘴鸟品牌标、
 * teal 主按钮、毛玻璃贴纸卡。对外品牌统一为「闲思杂记」，不再出现孩子真名
 * （备案审核/任意访客直达 /gate 时都不应暴露未成年人姓名）。
 * 本站字体已全站引入站酷快乐体，无需额外 @font-face。
 */
import { nextTick, ref } from "vue";
import { useRouter } from "vue-router";
import { Eye, EyeOff } from "@lucide/vue";
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

/**
 * 口令明文查看：家长多半是手输 6 位数字，中间错一位就得全删重来，
 * 小眼睛让他们先看一眼再提交（不需要懂"为什么看不见"）。
 * 只是显示态，不影响真正提交的值。
 */
const showPass = ref(false);
const passInput = ref<HTMLInputElement | null>(null);

function toggleShow() {
  showPass.value = !showPass.value;
  // 切换 type 后部分浏览器会把焦点/光标重置，这里等 DOM 更新完再还原，
  // 免得家长"看一眼"之后还要重新点一次输入框才能接着输
  nextTick(() => {
    const el = passInput.value;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange?.(len, len);
  });
}

/** 共通收尾：恢复会话、拉内容、同步进度、进应用 */
async function afterEnter() {
  await auth.restore();
  if (auth.family) {
    content.loadFromServer();
    await progress.flushReport();
    progress.syncFromServer();
  }
  router.replace("/course");
}

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
    await afterEnter();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <PageShell bare center>
    <div class="gate">
      <div class="gate__inner">
      <!-- 品牌区（与落地页顶栏一致：巨嘴鸟 mark + 中性站名，不出现孩子真名） -->
      <div class="gate__brand">
        <span class="gate__mark" aria-hidden="true">
          <!-- 巨嘴鸟（原创·夜色剪影）：深蓝剪影 + 琥珀喙 + 白点眼 -->
          <svg viewBox="0 0 24 24" fill="none">
            <defs>
              <linearGradient id="gateBeak" x1="14.5" y1="7.5" x2="23.5" y2="12.5" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="#FFD34D" />
                <stop offset="1" stop-color="#FF9F1C" />
              </linearGradient>
            </defs>
            <path d="M9.9 7.2 C13.5 7.2 15.6 10 15.6 13.5 C15.6 17.3 13 20 9.8 20 C6.6 20 4.2 17.3 4.2 13.6 C4.2 10 6.3 7.2 9.9 7.2 Z" fill="#0d1330" />
            <path d="M5 17.6 L2.6 20 L6.2 18.9 Z" fill="#0d1330" />
            <path d="M14.4 7.6 C18.4 5.4 23.2 6.2 23.6 9.2 C23.9 11.5 21.8 13.4 17.9 14 L14.1 12.5 Z" fill="url(#gateBeak)" />
            <circle cx="12.4" cy="9.7" r=".8" fill="#FFFFFF" />
          </svg>
        </span>
        <p class="gate__slogan">请输入家长口令进入</p>
      </div>

      <!-- 激活（老路径） -->
      <form class="gate__form" @submit.prevent="submit">
        <div class="gate__field">
          <input
            ref="passInput"
            v-model="pass"
            class="gate__input"
            :type="showPass ? 'text' : 'password'"
            placeholder="请输入家长口令"
            maxlength="20"
            inputmode="numeric"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
          <!-- 小眼睛：切换明文，只改显示不改提交值 -->
          <button
            type="button"
            class="gate__eye"
            :aria-label="showPass ? '隐藏口令' : '显示口令'"
            :aria-pressed="showPass"
            @mousedown.prevent
            @click="toggleShow"
          >
            <EyeOff v-if="showPass" class="k-ico" aria-hidden="true" />
            <Eye v-else class="k-ico" aria-hidden="true" />
          </button>
        </div>
        <button class="gate__btn" type="submit" :disabled="busy">
          {{ busy ? "进入中…" : "进入" }}
        </button>
        <p v-if="error" class="gate__error">{{ error }}</p>
      </form>

      <p class="gate__foot">本设备 7 天内免重复输入</p>

      <!-- ICP 备案（管局抽查可能直达 /app/ 任意路由，不能只挂在根落地页） -->
      <a
        class="gate__beian"
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noopener"
      >豫ICP备2026054893号</a>
      </div>
    </div>
  </PageShell>
</template>

<style scoped>
/* 深空夜色：与落地页 .bg 同族——深海军蓝渐变 + 星点 + 青绿/紫极光。
   gate 是备案门面，固定深色，不跟随亮/暗主题（与落地页保持一致）。 */
.gate {
  width: 100%;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--gap-l) var(--gap-m) calc(var(--gap-l) + env(safe-area-inset-bottom));
  background:
    radial-gradient(1.5px 1.5px at 22% 18%, rgba(255, 255, 255, 0.9) 50%, transparent 51%),
    radial-gradient(1px 1px at 68% 9%, rgba(255, 255, 255, 0.7) 50%, transparent 51%),
    radial-gradient(1.2px 1.2px at 84% 30%, rgba(255, 255, 255, 0.55) 50%, transparent 51%),
    radial-gradient(1px 1px at 41% 38%, rgba(255, 255, 255, 0.45) 50%, transparent 51%),
    radial-gradient(1.4px 1.4px at 9% 52%, rgba(255, 255, 255, 0.6) 50%, transparent 51%),
    radial-gradient(ellipse 70% 55% at 85% -10%, rgba(139, 92, 246, 0.22), transparent 70%),
    radial-gradient(ellipse 60% 50% at 8% 0%, rgba(45, 212, 191, 0.16), transparent 70%),
    linear-gradient(180deg, var(--night) 0%, var(--night-2) 52%, var(--night) 100%);
  color: var(--night-ink);
  box-sizing: border-box;
}
.gate__inner {
  width: 100%;
  max-width: 340px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

/* ---------- 品牌区 ---------- */
.gate__brand {
  margin-bottom: var(--gap-l);
}
.gate__mark {
  width: 60px;
  height: 60px;
  display: inline-grid;
  place-items: center;
  border-radius: 18px;
  background: linear-gradient(135deg, var(--night-teal), var(--night-violet));
  box-shadow: 0 6px 22px rgba(45, 212, 191, 0.35);
}
.gate__mark svg {
  width: 34px;
  height: 34px;
}
.gate__slogan {
  margin: var(--gap-s) 0 0;
  font-size: var(--fs-small);
  color: var(--night-ink-faint);
}

/* ---------- 表单：深色毛玻璃贴纸卡 ---------- */
.gate__form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
  padding: 22px 20px;
  background: var(--night-card);
  border: 1.5px solid var(--night-line);
  border-radius: 18px;
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.55);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}
/* 输入框 + 小眼睛共用一层定位容器：眼睛压在输入框右侧内边距里，
   不额外占一行高度（口令页纵向空间本来就紧） */
.gate__field {
  position: relative;
  width: 100%;
}
.gate__input {
  width: 100%;
  /* 右内边距留出小眼睛的点击区，文字不会压到图标下面 */
  padding: 12px 48px 12px 14px;
  font-size: 16px;
  font-family: inherit;
  color: var(--night-ink);
  background: var(--night-input-bg);
  border: 1.5px solid var(--night-input-border);
  border-radius: 14px;
  outline: none;
  transition: border-color 0.18s;
}
.gate__input::placeholder {
  color: var(--night-ink-faint);
}
.gate__input:focus {
  border-color: var(--night-teal);
}
/* 触摸目标按输入框整高铺满，宽 44px（够拇指点，也不是一个小点） */
.gate__eye {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  background: none;
  border: none;
  border-radius: 0 14px 14px 0;
  color: var(--night-ink-faint);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: color 0.18s;
}
.gate__eye .k-ico {
  width: 20px;
  height: 20px;
}
.gate__eye:hover {
  color: var(--night-ink-soft);
}
.gate__eye:active {
  color: var(--night-teal);
}
.gate__btn {
  width: 100%;
  padding: 13px 20px;
  font-size: 16px;
  font-family: inherit;
  font-weight: var(--fw-mid);
  color: var(--night-on-teal);
  background: var(--night-teal);
  border: none;
  border-radius: 14px;
  cursor: pointer;
  box-shadow: 0 5px 0 rgba(20, 184, 166, 0.4), 0 14px 30px rgba(45, 212, 191, 0.28);
  transition: transform 0.18s, box-shadow 0.18s, background 0.18s;
}
.gate__btn:hover:not(:disabled) {
  background: var(--night-teal-soft);
  transform: translateY(-2px);
}
.gate__btn:disabled {
  opacity: 0.7;
  cursor: default;
}
.gate__error {
  margin: 0;
  color: var(--night-danger);
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
}
.gate__foot {
  margin: var(--gap-l) 0 0;
  font-size: var(--fs-small);
  color: var(--night-ink-faint);
}
/* 备案号：与根落地页同号同链接（footer 语义），入口页里保持安静的一行 */
.gate__beian {
  margin: var(--gap-m) 0 0;
  font-size: var(--fs-small);
  color: var(--night-ink-faint);
  text-decoration: none;
}
.gate__beian:hover {
  color: var(--night-ink-soft);
  text-decoration: underline;
}
</style>
