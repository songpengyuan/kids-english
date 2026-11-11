<script setup lang="ts">
/**
 * 设置区的一节课离线包下载行（家长中心用）。
 * 每个实例持有自己的下载状态，7 节课可以各自独立下载，互不影响。
 */
import { computed } from "vue";
import { Download, CheckCircle2, AlertCircle } from "@lucide/vue";
import { useLessonDownload } from "../../composables/useLessonDownload";
import type { Lesson } from "../../data/lessons";

const props = defineProps<{ lesson: Lesson }>();
const emit = defineEmits<{ (e: "finished"): void }>();

const dl = useLessonDownload();
const state = computed(() => dl.state.value);
const label = computed(() => {
  if (state.value === "downloading") return `${dl.loaded.value}/${dl.total.value}`;
  if (state.value === "done") return "已离线";
  if (state.value === "error") return "重试";
  return "下载";
});

async function start() {
  if (state.value === "downloading") return;
  await dl.start(props.lesson);
  emit("finished");
}
</script>

<template>
  <div class="dl-row" :class="{ done: state === 'done', error: state === 'error' }">
    <span class="dl-title">
      <span class="dl-emoji" aria-hidden="true">{{ lesson.emoji }}</span>
      {{ lesson.titleZh }}
    </span>
    <button
      type="button"
      class="dl-btn"
      :disabled="state === 'downloading' || state === 'done'"
      :aria-label="`${lesson.titleZh} ${label}`"
      @click="start"
    >
      <CheckCircle2 v-if="state === 'done'" class="dl-ico" />
      <AlertCircle v-else-if="state === 'error'" class="dl-ico" />
      <Download v-else class="dl-ico" />
      {{ label }}
    </button>
  </div>
</template>

<style scoped>
.dl-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-top: 1px solid var(--line);
}
.dl-row:first-of-type {
  border-top: none;
  padding-top: 4px;
}
.dl-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
  color: var(--ink-soft);
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dl-emoji {
  flex: none;
  font-size: 18px;
  line-height: 1;
}
.dl-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  border: 1px solid var(--line);
  background: var(--card-bg);
  color: var(--ink-soft);
  border-radius: 999px;
  padding: 6px 13px;
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  font-variant-numeric: tabular-nums;
  transition: color 0.2s, border-color 0.2s;
}
.dl-btn:hover:not(:disabled) {
  color: var(--brand);
  border-color: var(--brand);
}
.dl-btn:disabled {
  cursor: default;
  opacity: 0.9;
}
.dl-row.done .dl-btn {
  color: var(--ok);
  border-color: color-mix(in srgb, var(--ok) 45%, transparent);
}
.dl-row.error .dl-btn {
  color: var(--orange);
  border-color: color-mix(in srgb, var(--orange) 55%, transparent);
}
.dl-ico {
  width: 14px;
  height: 14px;
}
</style>
