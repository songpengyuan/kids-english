<script setup>
import { ref, onMounted } from "vue";
import { initTheme, toggleTheme, currentTheme } from "../utils/theme";
import { hapticTap } from "../utils/haptics";
import { Moon, Sun } from "@lucide/vue";

const mode = ref("light");
onMounted(() => {
  mode.value = initTheme();
});
function onToggle() {
  hapticTap();
  mode.value = toggleTheme();
}
</script>

<template>
  <button
    class="theme-toggle"
    :aria-label="mode === 'dark' ? '切换到亮色模式' : '切换到暗色模式'"
    :title="mode === 'dark' ? '切换到亮色' : '切换到暗色'"
    @click="onToggle"
  >
    <Sun v-if="mode === 'dark'" class="k-ico" />
    <Moon v-else class="k-ico" />
  </button>
</template>

<style scoped>
.theme-toggle {
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
  transition: transform 0.1s;
}
.theme-toggle:active {
  transform: translateY(2px) scale(0.96);
}
</style>
