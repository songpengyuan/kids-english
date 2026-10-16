<script setup lang="ts">
/**
 * PageShell —— 页面骨架（设计系统第 ③ 层，可复用基础组件）
 *
 * 消掉子页面里重复了 13 遍的样板：
 *   <div class="view"><HeaderBar …/><div class="view-body">…</div></div>
 *
 * 这个组件存在的目的不只是省代码，而是**保证所有子页面的骨架完全一致**：
 * 顶栏高度、内容区收缩行为、底部安全区以前都是各页自己写的，
 * 于是出现了"有的页面滚得动有的滚不动""有的被 Home 条挡住"这类不一致。
 *
 * 用法（子页面）：
 *   <PageShell title="我的卡片" icon="me" @back="router.back()">…</PageShell>
 * 用法（首页：无顶栏，可滚动）：
 *   <PageShell bare scroll>…</PageShell>
 * 用法（居中页：空状态 / 结算）：
 *   <PageShell center>…</PageShell>
 */
import HeaderBar from "../layout/HeaderBar.vue";
import PathIcon from "../PathIcon.vue";

withDefaults(
  defineProps<{
    title?: string;
    /** PathIcon 名称，渲染在标题左侧 */
    icon?: string;
    showBack?: boolean;
    backLabel?: string;
    close?: boolean;
    showBadges?: boolean;
    /** 首页模式：不渲染顶栏（/course /listen /me 三个首页用） */
    bare?: boolean;
    /** 内容超过一屏时允许纵向滚动 */
    scroll?: boolean;
    /** 内容垂直 + 水平居中（空状态 / 结算页） */
    center?: boolean;
  }>(),
  { showBack: true }
);

const emit = defineEmits<{ back: [] }>();
</script>

<template>
  <div class="view">
    <HeaderBar
      v-if="!bare"
      :show-back="showBack"
      :back-label="backLabel"
      :close="close"
      :show-badges="showBadges"
      @back="emit('back')"
    >
      <template #title>
        <slot name="title">
          <PathIcon v-if="icon" :name="icon" class="ps-ico" />
          <span v-if="title">{{ title }}</span>
        </slot>
      </template>
      <template #right><slot name="right" /></template>
    </HeaderBar>

    <div
      class="view-body"
      :class="{ 'view-body--scroll': scroll, 'view-center': center }"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.ps-ico {
  color: var(--brand);
}
</style>
