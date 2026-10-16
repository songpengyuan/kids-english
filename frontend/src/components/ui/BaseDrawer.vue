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
  position: fixed; inset: 0; z-index: 95;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: flex-end;
}
.drawer {
  width: 100%; max-width: 480px; margin: 0 auto;
  background: var(--card-bg);
  border-radius: 20px 20px 0 0;
  max-height: 70vh;
  display: flex; flex-direction: column;
}
.drawer.dark { background: var(--player-surface); }
.drawer-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--line);
}
.drawer.dark .drawer-head { border-bottom-color: rgba(255,255,255,0.1); }
.drawer-title { margin: 0; font-weight: var(--fw-strong); font-size: 16px; color: var(--ink); }
.drawer.dark .drawer-title { color: var(--player-text); }
.drawer-close {
  width: 44px; height: 44px; border-radius: 50%;
  background: var(--tint); color: var(--ink-soft);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; flex: none;
  transition: background 0.15s;
}
.drawer-close:active { background: var(--line); }
.drawer.dark .drawer-close { background: rgba(255,255,255,0.15); color: #fff; }
.drawer-body { overflow-y: auto; -webkit-overflow-scrolling: touch; }

.drawer-enter-active, .drawer-leave-active { transition: opacity 0.25s; }
.drawer-enter-active .drawer, .drawer-leave-active .drawer { transition: transform 0.25s ease-out; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .drawer, .drawer-leave-to .drawer { transform: translateY(100%); }
</style>
