<script setup lang="ts">
/**
 * 静音开关：一键关/开"音效 + 中文提示语"（单词与童谣发音不受影响，见 services/sound.ts）。
 * 公共场合/睡前刚需；家长也能在"我的"页切换。
 */
import { soundOn, toggleSound } from "../../services/sound";
import { hapticTap } from "../../services/haptics";
import { Volume2, VolumeX } from "@lucide/vue";

function onToggle() {
  hapticTap();
  toggleSound();
}
</script>

<template>
  <button
    class="sound-toggle"
    :class="{ off: !soundOn }"
    :aria-label="soundOn ? '关闭音效与提示语' : '打开音效与提示语'"
    :aria-pressed="!soundOn"
    :title="soundOn ? '音效开（点一下静音）' : '已静音（点一下打开音效）'"
    @click="onToggle"
  >
    <VolumeX v-if="!soundOn" class="k-ico" />
    <Volume2 v-else class="k-ico" />
  </button>
</template>

<style scoped>
.sound-toggle {
  background: var(--card-bg);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-hard);
  width: var(--tap-min);
  height: var(--tap-min);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(18px, min(3.4vh, 2.8vw), 26px);
  color: var(--ink-soft);
  flex: none;
}
.sound-toggle.off {
  color: var(--ink-faint);
}
.sound-toggle:active {
  transform: translateY(calc(var(--press) - 1px));
}
</style>
