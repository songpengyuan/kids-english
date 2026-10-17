<script setup lang="ts">
/**
 * StageHead —— 玩法页顶部信息行（设计系统第 ④ 层）：左「进度」、右「玩法标签」。
 *
 * 抽出来的原因：亲子对话的进度原本画在**顶栏里**（一条细进度条 + 右侧"第 N/M 轮"），
 * 而跟我读画在**页内顶部**（`1 / 7` + 右侧模式胶囊）—— 同一件事两种位置，
 * 孩子玩完一个玩法换下一个时，眼睛得重新找一遍"我做到哪儿了"。
 * 现在两种玩法共用这一个组件，"位置一致"是结构保证的，不是靠两处 CSS 对齐。
 *
 * 用法：
 *   <StageHead :text="progressText" tag="小耳朵打分" :icon="Mic" />
 *   <StageHead :text="progressText" tag="亲子对话" :icon="MessageCircle" />
 */
import type { Component } from "vue";

defineProps<{
  /** 左侧进度文本，如 "3 / 7" */
  text: string;
  /** 右侧标签；不传则只显示进度 */
  tag?: string;
  /** 标签前的图标（跟随文字色与字号） */
  icon?: Component;
}>();
</script>

<template>
  <div class="stage-head">
    <span class="prog">{{ text }}</span>
    <span v-if="tag" class="mode-tag">
      <component :is="icon" v-if="icon" class="k-ico" />{{ tag }}
    </span>
  </div>
</template>

<style scoped>
.stage-head {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex: none;
  gap: var(--gap-s);
}
.prog {
  font-weight: var(--fw-strong);
  color: var(--ink-soft);
}
.mode-tag {
  background: var(--card-bg);
  border-radius: var(--radius-pill);
  padding: 3px clamp(8px, 1.2vw, 12px);
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
  box-shadow: var(--shadow-soft);
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
}
</style>
