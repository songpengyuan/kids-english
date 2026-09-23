/**
 * 视口状态（单例）
 *
 * 本应用是「一屏装下、不滚动」的形态，所以布局必须随视口实时变化：
 * 旋转屏幕、iPad 分屏、浏览器地址栏收放都会改变可用空间，需要重新分页。
 *
 * 这里用**模块级单例**而不是每个组件各建一份：全局只挂一个 resize 监听，
 * 组件只做引用计数订阅，避免 N 个组件各写一份监听 + 各自 rAF 抖动。
 *
 * 分档阈值与 src/styles/tokens.css 中注释的断点表保持一致，改动时需同步。
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const hasWindow = typeof window !== "undefined";

/** 有窗口时同步初始化，保证首帧渲染就能拿到正确档位（不会先按默认值闪一下） */
const width = ref(hasWindow ? window.innerWidth : 1024);
const height = ref(hasWindow ? window.innerHeight : 768);

let subscribers = 0;
let raf = null;

function read() {
  width.value = window.innerWidth;
  height.value = window.innerHeight;
}

function schedule() {
  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    raf = null;
    read();
  });
}

function subscribe() {
  if (subscribers === 0) {
    read();
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    // iPad 分屏拖动、地址栏收放不一定触发 resize，用 visualViewport 兜一层
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", schedule, { passive: true });
    }
  }
  subscribers++;
}

function unsubscribe() {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers === 0) {
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener("resize", schedule);
    }
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }
}

export function useViewport() {
  onMounted(subscribe);
  onBeforeUnmount(unsubscribe);

  /** tiny: 手机横屏；compact: 手机竖屏；regular: 平板横屏；roomy: 平板竖屏 */
  const sizeTier = computed(() => {
    const h = height.value;
    if (h < 480) return "tiny";
    if (h < 640) return "compact";
    if (h < 900) return "regular";
    return "roomy";
  });

  return {
    width,
    height,
    sizeTier,
    /** 视口偏窄（手机），决定列数 */
    isNarrow: computed(() => width.value < 600),
    isLandscape: computed(() => width.value > height.value),
    isTiny: computed(() => sizeTier.value === "tiny"),
    isRoomy: computed(() => sizeTier.value === "roomy")
  };
}
