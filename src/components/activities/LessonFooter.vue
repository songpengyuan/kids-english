<script setup lang="ts">
/**
 * 玩法页统一底部区（多邻国式）：反馈胶囊 + 主操作按钮。
 *
 * 所有玩法（听音选图 / 跟我读 / 亲子对话…）共用，保证：
 * - 底部间距一致（按钮离屏幕底边有足够距离，选项区有更多呼吸空间）
 * - 成功反馈统一为绿色边框大胶囊，答错为红色提示
 * - 主按钮样式统一（绿色大胶囊按钮）
 *
 * 用法：
 *   <LessonFooter
 *     feedback="success"
 *     feedback-text="太棒了！"
 *     button-text="继续"
 *     :button-disabled="false"
 *     @button="onNext" />
 *
 *   有额外按钮（如"再听一遍"）时放默认插槽，会排在反馈胶囊和主按钮之间：
 *   <LessonFooter feedback="error" feedback-text="再听一次哦～" button-text="检查" :button-disabled="!selected" @button="onCheck">
 *     <button class="extra">…</button>
 *   </LessonFooter>
 */
import { ChevronRight } from "@lucide/vue";

const props = defineProps<{
  /** 反馈类型：success 绿色胶囊 / error 红色文字 / null 不显示（占位撑高） */
  feedback?: "success" | "error" | null;
  feedbackText?: string;
  buttonText: string;
  buttonDisabled?: boolean;
  /** 主按钮右侧是否显示箭头（默认继续类显示，检查类不显示） */
  showArrow?: boolean;
}>();

const emit = defineEmits<{ button: [] }>();
</script>

<template>
  <div class="lf">
    <!-- 反馈胶囊：success 绿色边框 / error 红色文字 / 无反馈时占位撑高防跳 -->
    <div class="lf-feedback">
      <p v-if="feedback === 'success'" class="lf-pill success anim-pop">
        <slot name="feedback-icon">
          <svg class="lf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
        </slot>
        {{ feedbackText || "太棒了！" }}
      </p>
      <p v-else-if="feedback === 'error'" class="lf-pill error anim-pop">
        {{ feedbackText || "再试一次哦～" }}
      </p>
      <p v-else class="lf-pill placeholder" aria-hidden="true">占位</p>
    </div>

    <!-- 额外按钮行（可选：再听一遍 / 再试一次 等） -->
    <div v-if="$slots.default" class="lf-extras">
      <slot />
    </div>

    <!-- 主按钮 -->
    <button
      class="lf-btn anim-pop"
      :disabled="buttonDisabled"
      @click="emit('button')"
    >
      <slot name="button-content">
        {{ buttonText }}
        <ChevronRight v-if="showArrow !== false" class="lf-arrow" />
      </slot>
    </button>
  </div>
</template>

<style scoped>
.lf {
  margin-top: auto;
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-s);
  padding: var(--gap-l) var(--gap-m) max(28px, env(safe-area-inset-bottom));
  flex: none;
}

/* ---------- 反馈胶囊 ---------- */
.lf-feedback {
  display: flex;
  justify-content: center;
  min-height: 0;
}
.lf-pill {
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 800;
  text-align: center;
}
.lf-pill.success {
  font-size: var(--fs-title);
  color: var(--green-dark);
  background: var(--state-ok-bg);
  border: 2px solid var(--green);
  padding: 8px 20px;
  border-radius: var(--radius-pill);
}
.lf-pill.error {
  font-size: var(--fs-body);
  color: var(--red);
}
.lf-pill.placeholder {
  visibility: hidden;
}
.lf-ico {
  width: 1.1em;
  height: 1.1em;
}

/* ---------- 额外按钮行 ---------- */
.lf-extras {
  display: flex;
  gap: var(--gap-s);
  flex-wrap: wrap;
  justify-content: center;
}

/* ---------- 主按钮 ---------- */
.lf-btn {
  width: 100%;
  min-height: calc(var(--tap-min) + 12px);
  font-size: var(--fs-btn);
  font-weight: 800;
  color: var(--on-tone);
  background: var(--green);
  border: none;
  border-radius: var(--radius-pill);
  box-shadow: 0 var(--press) 0 var(--green-dark);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform var(--dur-fast), box-shadow var(--dur-fast);
}
.lf-btn:active:not(:disabled) {
  transform: translateY(calc(var(--press) - 1px)) scale(0.98);
  box-shadow: 0 1px 0 var(--green-dark);
}
.lf-btn:disabled {
  background: var(--ink-faint);
  box-shadow: 0 var(--press) 0 var(--ink-faint);
  cursor: default;
  opacity: 0.85;
}
.lf-arrow {
  width: 1.1em;
  height: 1.1em;
}

/* 横屏矮屏：收紧上下间距 */
@media (max-height: 480px) {
  .lf {
    padding: var(--gap-s) var(--gap-m) max(12px, env(safe-area-inset-bottom));
    gap: var(--gap-xs);
  }
  .lf-pill.success {
    font-size: var(--fs-body);
    padding: 4px 14px;
  }
  .lf-btn {
    min-height: var(--tap-min);
  }
}
</style>
