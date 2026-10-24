<script setup lang="ts">
/**
 * HeroFormThumbs —— 英雄形态缩略切换条（设计系统第 ④ 层，领域组件）
 *
 * 同一个东西在两处出现：
 *   · 详情页正面（图下方，让"这个英雄还有什么形态"直接可见）
 *   · 全屏查看器内（深色底上换形态）
 * 差别只有底色（深色底要用半透明块），所以收进 `variant`，而不是写两遍。
 *
 * 未收集的形态显示剪影——孩子能看见"还有哪些没解锁"，这也是收集动力的来源。
 */
import { ref } from "vue";
import { useRewardsStore } from "../../stores/rewards";
import type { FlatForm } from "../../data/heroes";

withDefaults(
  defineProps<{
    forms: FlatForm[];
    /** 当前选中的形态 id */
    currentId: string;
    /** 无障碍：属于哪个英雄 */
    heroName: string;
    /** inline=页面内 / overlay=全屏查看器（深色底） */
    variant?: "inline" | "overlay";
  }>(),
  { variant: "inline" }
);

const emit = defineEmits<{ pick: [f: FlatForm] }>();

const rewards = useRewardsStore();

/** 家长放的 png 可能缺，缺了就回退内置原创占位图（失败状态收在本组件内，
 *  主图区有自己的失败记录——两处图片互不牵连）。缩略条用 256px 小图，
 *  不拉 500KB 级原图（那是姿势舞台的事）。 */
const failed = ref<Record<string, boolean>>({});
function srcOf(f: FlatForm) {
  return failed.value[f.thumb] ? f.fallback : f.thumb;
}
</script>

<template>
  <div
    v-if="forms.length > 1"
    class="form-thumbs"
    :class="{ 'form-thumbs--overlay': variant === 'overlay' }"
    role="tablist"
    :aria-label="`${heroName}的形态`"
  >
    <button
      v-for="f in forms"
      :key="f.id"
      class="thumb"
      :class="{ on: f.id === currentId, sil: !rewards.isOwned(f.id) }"
      role="tab"
      :aria-selected="f.id === currentId"
      :aria-label="f.name"
      @click="emit('pick', f)"
    >
      <img :src="srcOf(f)" :alt="f.name" loading="lazy" decoding="async" @error="failed[f.thumb] = true" />
    </button>
  </div>
</template>

<style scoped>
.form-thumbs {
  flex: none;
  display: flex;
  gap: 10px;
  padding: 2px;
  overflow-x: auto;
  max-width: 100%;
}
.form-thumbs--overlay {
  max-width: 88vw;
}
.thumb {
  /* 5 岁适龄：手机 66px / 平板 ~81px / 桌面 96px */
  width: clamp(66px, 10vw, 96px);
  height: clamp(66px, 10vw, 96px);
  flex: none;
  border-radius: var(--radius-s);
  background: var(--card-bg);
  border: 2.5px solid transparent;
  padding: 4px;
  cursor: pointer;
}
.thumb.on {
  border-color: var(--gold);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.thumb.sil img {
  filter: brightness(0.25);
}

/* 全屏查看器（深色底）：缩略图块改半透明白，选中框仍是金色 */
.form-thumbs--overlay .thumb {
  background: rgba(255, 255, 255, 0.12);
  border-color: transparent;
}
.form-thumbs--overlay .thumb.on {
  border-color: var(--gold);
}
</style>
