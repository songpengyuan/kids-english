<script setup>
import { ref, onMounted } from "vue";
import { initTheme, toggleTheme, currentTheme } from "../utils/theme";
import { hapticTap } from "../utils/haptics";

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
  <button class="theme-toggle" :title="mode === 'dark' ? '切换到亮色' : '切换到暗色'" @click="onToggle">
    <span class="icon">{{ mode === "dark" ? "☀️" : "🌙" }}</span>
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
  flex: none;
  transition: transform 0.1s;
}
.theme-toggle:active {
  transform: translateY(2px) scale(0.96);
}
.icon {
  line-height: 1;
}
</style>
