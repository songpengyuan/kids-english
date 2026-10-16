<script setup lang="ts">
defineProps<{ open: boolean; title?: string; dark?: boolean }>();
const emit = defineEmits<{ (e: "close"): void }>();
</script>

<template>
  <Transition name="drawer">
    <div v-if="open" class="drawer-mask" @click.self="emit('close')">
      <div class="drawer" :class="{ dark }">
        <div v-if="title || $slots.header" class="drawer-head">
          <slot name="header">
            <p class="drawer-title">{{ title }}</p>
            <button class="drawer-close" @click="emit('close')">✕</button>
          </slot>
        </div>
        <div class="drawer-body">
          <slot />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.drawer-mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-drawer);
  background: var(--mask-bg-soft);
  display: flex;
  align-items: flex-end;
}
.drawer {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  background: var(--card-bg);
  border-radius: var(--radius) var(--radius) 0 0;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
}
.drawer.dark {
  background: var(--player-surface);
}
.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--gap-m) var(--gap-m) var(--gap-s);
  border-bottom: 1px solid var(--line);
}
.drawer.dark .drawer-head {
  border-bottom-color: var(--mask-control);
}
.drawer-title {
  margin: 0;
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
  color: var(--ink);
}
.drawer.dark .drawer-title {
  color: var(--player-text);
}
.drawer-close {
  width: var(--tap-min);
  height: var(--tap-min);
  border-radius: var(--radius-pill);
  /* 以前这里写的是 var(--tint)——这个变量在 tokens.css 里**根本不存在**，
   * 于是关闭按钮一直是"没有底色"的（只在按下时才显形）。改用中性控件底色。 */
  background: var(--btn-plain-bg);
  color: var(--ink-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-title);
  flex: none;
  transition: background var(--dur-fast);
}
.drawer-close:active {
  background: var(--btn-plain-deep);
}
.drawer.dark .drawer-close {
  background: var(--mask-control);
  color: var(--mask-ink);
}
.drawer-body {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity var(--dur-base);
}
.drawer-enter-active .drawer,
.drawer-leave-active .drawer {
  transition: transform var(--dur-base) var(--ease-out);
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from .drawer,
.drawer-leave-to .drawer {
  transform: translateY(100%);
}
</style>
