/**
 * ===== 暗黑模式 =====
 *
 * 实现方式：在 <html> 上切换 data-theme 属性，
 * tokens.css 里 :root[data-theme="dark"] 会覆盖中性色与色调变量。
 *
 * 优先级：用户手动选择（localStorage）> 系统偏好（prefers-color-scheme）。
 * 系统偏好变化时（如傍晚 iOS 自动切深色），未手动选择过则自动跟随。
 */

const KEY = "kids-english-theme"; // "light" | "dark"
const media = window.matchMedia("(prefers-color-scheme: dark)");

function stored() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null; // 隐私模式等 localStorage 不可用时静默降级
  }
}

function apply(mode) {
  document.documentElement.dataset.theme = mode;
  // 同步状态栏 / Safari 工具栏颜色
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = mode === "dark" ? "#171c2b" : "#fdf6e3";
}

/** 当前主题（模块加载时立即应用，避免刷新闪白） */
export function initTheme() {
  const mode = stored() || (media.matches ? "dark" : "light");
  apply(mode);
  // 未手动选择时跟随系统切换
  media.addEventListener("change", (e) => {
    if (!stored()) apply(e.matches ? "dark" : "light");
  });
  return mode;
}

export function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** 切换明暗并持久化 */
export function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  apply(next);
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* 忽略 */
  }
  return next;
}
