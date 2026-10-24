<script setup lang="ts">
/**
 * StageHead —— 玩法页顶部信息行（设计系统第 ④ 层）。
 *
 * 抽出来的原因：亲子对话的进度原本画在**顶栏里**（一条细进度条 + 右侧"第 N/M 轮"），
 * 而跟我读画在**页内顶部**（`1 / 7` + 右侧模式胶囊）—— 同一件事两种位置，
 * 孩子玩完一个玩法换下一个时，眼睛得重新找一遍"我做到哪儿了"。
 * 现在逐项推进的玩法共用这一个组件，"位置一致"是结构保证的，不是靠两处 CSS 对齐。
 *
 * 三种形态（覆盖现有全部玩法头部）：
 *   ① 进度左 + 标签右（Speak/Talk/Quiz）
 *      <StageHead :text="progressText" tag="小耳朵打分" :icon="Mic" />
 *   ② 提示左 + 计数右（Order/Memory）
 *      <StageHead right-text="2 / 4"><template #tip>✏️ 按顺序点词…</template></StageHead>
 *   ③ 提示左 + 自定义控件与计数右（Match 的看词/听音切换）
 *      <StageHead right-text="第 1 / 2 组 · 0/4">
 *        <template #tip>…</template><template #extra>…switch…</template>
 *      </StageHead>
 */
import type { Component } from "vue";

defineProps<{
  /** 左侧进度文本，如 "3 / 7"；给了 #tip 插槽时被取代 */
  text?: string;
  /** 右侧玩法标签胶囊；不传则不显示 */
  tag?: string;
  /** 标签前的图标（跟随文字色与字号） */
  icon?: Component;
  /** 右侧计数文本（tip 形态用：提示在左、计数在右） */
  rightText?: string;
}>();
</script>

<template>
  <div class="stage-head">
    <span v-if="$slots.tip" class="tip">
      <slot name="tip" />
    </span>
    <span v-else class="prog">{{ text }}</span>
    <span class="side">
      <slot name="extra" />
      <span v-if="rightText" class="prog">{{ rightText }}</span>
      <span v-if="tag" class="mode-tag">
        <component :is="icon" v-if="icon" class="k-ico" />{{ tag }}
      </span>
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
  min-width: 0;
}
.stage-head > :first-child {
  min-width: 0;
}
.prog {
  font-weight: var(--fw-strong);
  color: var(--ink-soft);
  flex: none;
}
/* #tip 形态：左侧长提示（可换行），权重比进度数字轻。
 * flex: 1 1 0 —— 空间不足时先保证右侧簇（切换/计数）完整，提示语自己折行 */
.tip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: var(--fw-mid);
  color: var(--ink-soft);
  flex: 1 1 0;
  min-width: 0;
}
.side {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  min-width: 0;
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
  flex: none;
}
</style>
