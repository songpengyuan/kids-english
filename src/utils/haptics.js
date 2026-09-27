/**
 * ===== 触觉反馈 =====
 *
 * 两条通路：
 * 1) **Android（Chrome / Edge / Samsung Internet）** — 直接用 `navigator.vibrate()`。
 *
 * 2) **Safari（iOS / iPadOS / macOS）** — Safari 从未实现 Vibration API（WebKit
 *    官方立场是反对该标准，Apple 平台不可能落地），网页里唯一能触发原生触感的
 *    机制是 WebKit 的 `<input type="checkbox" switch>`：当**用户的手指真的点在这个
 *    开关上**时，系统会给出原生触感（iOS 17.4+）。
 *    所以做法是：给**显式标注 `data-haptic` 的元素**叠一个完全透明的 switch，
 *    手指落在开关上 → 系统震一下 → 点击事件继续冒泡给宿主元素，业务逻辑照常。
 *
 * 【为什么是白名单（2026-09-27 决策）】
 *    早期版本对所有按钮默认叠加、靠 EXCLUDE 黑名单逐个排除关键导航。但实测
 *    透明 switch 在 iOS 真实触摸下会**吞掉宿主点击**（返回按钮、底部导航
 *    "学习/游戏/我的"均中招：按钮有按压动画但路由不跳转）。黑名单是"事后
 *    打补丁"——每个新按钮默认危险，漏排一个就出一个 bug。
 *    反转为**白名单**后：新元素默认安全，只有显式 `data-haptic` 的元素承担
 *    风险；触感是增强体验，宁可少震一处、不可吞一次点击。
 *
 * 【标注规则】只有"反馈型交互"标注 `data-haptic`：
 *    ✓ 点图/点词听发音、连线卡片、答题选项、宝箱、唱歌按钮等
 *      ——点不中只是少个反馈、可重试，触感收益 > 点击风险；
 *    ✗ 导航（返回/底部 tab/课程卡入口）、状态开关（音效/主题）、
 *      "提交/继续/完成"类功能按钮——承载核心功能，点击被吞 = 功能故障，绝不标注。
 *
 * 【限制（Apple 侧行为，非本实现问题）】
 *    - 必须由真实手指点中开关才会震，脚本模拟点击无效（iOS 26.5 起彻底封掉）；
 *    - 每次点击只给一下震动（我们的交互本来就是"点一下震一下"，正合适）；
 *    - 需在系统设置里打开"触感反馈 / System Haptics"。
 *
 * 3) 其余环境（桌面浏览器、旧版系统）静默跳过，不影响任何功能。
 *
 * 调试：控制台执行 `__kidsHaptics()` 可查看当前走的是哪条通路、叠了几个开关。
 */

const NAV = typeof navigator !== "undefined" ? navigator : null;
const DOC = typeof document !== "undefined" ? document : null;

/* ---------- 环境判断 ---------- */

/** 原生 Vibration API 是否可用（安卓系） */
export const hasNativeVibrate = !!NAV && typeof NAV.vibrate === "function";

/**
 * 是否支持 WebKit 的 switch 触感（iOS/iPadOS 17.4+、macOS Safari 17.4+）。
 * 用 UA 判断：Safari 没有暴露任何可直接探测该能力的 API。
 */
export function supportsSwitchHaptics() {
  if (hasNativeVibrate || !NAV) return false;
  const ua = NAV.userAgent || "";
  if (!/AppleWebKit/.test(ua)) return false; // 非 WebKit 内核
  // iOS / iPadOS：UA 里是 "OS 17_4" / "OS 18_0"；桌面 Safari：Safari 段 "Version/17.4"
  const m = ua.match(/(?:iPhone OS|CPU OS) (\d+)[._](\d+)/) || ua.match(/Version\/(\d+)\.(\d+)/);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return major > 17 || (major === 17 && minor >= 4);
}

const switchHaptics = supportsSwitchHaptics();

/* ---------- 原生通路 ---------- */

function vibrate(pattern) {
  try {
    NAV.vibrate(pattern);
  } catch {
    /* 非用户手势里调用部分浏览器会抛错，静默即可 */
  }
}

/* ---------- Safari 开关叠加层 ---------- */

const OVERLAY_ATTR = "data-haptic-switch";
/** 白名单：只有显式标注 data-haptic 的元素才叠 switch（其余按钮/元素默认安全） */
const TARGET_SELECTOR = "[data-haptic]";
const OVERLAY_ICON = "input[" + OVERLAY_ATTR + "]";
/**
 * 兜底豁免（白名单模式下极少用到）：万一某元素被标了 data-haptic 但属于关键
 * 导航/功能按钮，在这里豁免并清理残留，保证点击直达。
 */
const EXCLUDE_SELECTOR = ".back, .bottom-nav button, .lesson-card, .q-link, .treasure-badge";

let styleReady = false;
let observer = null;
let scanRaf = 0;

function injectStyle() {
  if (styleReady || !DOC) return;
  styleReady = true;
  const style = DOC.createElement("style");
  style.textContent = `
/* 宿主元素需要定位上下文（原来 static 的会被 JS 补上 relative） */
.haptic-host { position: relative !important; }
${OVERLAY_ICON} {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  /* 完全透明但仍在命中测试内：视觉无感，手指点中的是它 */
  opacity: 0;
  z-index: 20;
  -webkit-appearance: switch;
  appearance: switch;
  /* 避免在开关上滑动时触发页面滚动，保证拖拽类玩法不受影响 */
  touch-action: none;
  pointer-events: auto;
}
`;
  DOC.head.appendChild(style);
}

/** 给单个元素挂上透明开关（幂等） */
function attach(el) {
  if (!el || !el.querySelectorAll) return;
  // 排除的关键导航（返回按钮等）：不叠开关，并清掉之前版本已叠的，保证点击直达
  if (el.matches && el.matches(EXCLUDE_SELECTOR)) {
    el.querySelectorAll(":scope > " + OVERLAY_ICON).forEach((i) => i.remove());
    return;
  }
  if (el.querySelector(":scope > " + OVERLAY_ICON)) return;
  // 已经挂过但被框架重渲染吞掉的，重新挂
  const input = DOC.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.setAttribute(OVERLAY_ATTR, "");
  input.setAttribute("tabindex", "-1");
  input.setAttribute("aria-hidden", "true");
  // 每次点完复位，保证下一次点击仍是"未选中 → 选中"，触感稳定复现
  input.addEventListener("click", () => {
    input.checked = false;
  });
  if (getComputedStyle(el).position === "static") el.classList.add("haptic-host");
  el.appendChild(input);
}

/** 全量扫描：清理残留（宿主不在白名单上的旧开关）→ 给白名单元素补齐叠加层 */
function scan() {
  if (!switchHaptics || !DOC) return;
  injectStyle();
  // 白名单模式：清掉所有"宿主不在名单上"的残留开关——历史版本默认全叠
  // 留下的、以及 Vue 重渲染后宿主已失去 data-haptic 的，一律移除，保证
  // 未标注元素永远不受影响（"增强默认安全"的最后一道保险）。
  DOC.querySelectorAll(OVERLAY_ICON).forEach((input) => {
    const host = input.parentElement;
    if (host && !host.matches(TARGET_SELECTOR)) input.remove();
  });
  DOC.querySelectorAll(TARGET_SELECTOR).forEach(attach);
}

function scheduleScan() {
  if (!switchHaptics || !DOC || scanRaf) return;
  scanRaf = requestAnimationFrame(() => {
    scanRaf = 0;
    scan();
  });
}

/** 启动（幂等）：启动后 SPA 里新出现的 data-haptic 元素也会自动被覆盖 */
export function initHaptics() {
  if (!switchHaptics || observer || !DOC) return;
  scan();
  observer = new MutationObserver(scheduleScan);
  observer.observe(DOC.body, {
    childList: true,
    subtree: true,
    characterData: true, // 文案变化（如按钮从"先听完"变成可点）会伴随 disabled 变化
    attributes: true,
    attributeFilter: ["disabled"]
  });
}

/* ---------- 对外 API ---------- */

/**
 * 触发一次触觉反馈。
 * @param {number|number[]} pattern 原生通路的震动模式（毫秒）
 */
export function haptic(pattern) {
  if (hasNativeVibrate) {
    vibrate(pattern);
    return;
  }
  // Safari：触感由叠加的 switch 在"手指按下"那一刻自动产生，
  // 这里不需要（也无法）额外做任何事 —— 保持接口统一即可。
}

/** 轻点：按卡片 / 按钮 */
export const hapticTap = () => haptic(12);

/** 答对：轻快双击 */
export const hapticSuccess = () => haptic([25, 40, 25]);

/** 答错：略重的短促一下 */
export const hapticWrong = () => haptic(60);

/** 连线成功 / 小奖励 */
export const hapticMatch = () => haptic([15, 30, 15]);

/** 过关庆祝：三连节奏 */
export const hapticCelebrate = () => haptic([30, 50, 30, 50, 80]);

/** 宝箱开盖：低重音一下（模拟木箱"咚"） */
export const hapticChestOpen = () => haptic([70, 50, 90]);

/** 金币/贝壳落袋：轻快两下 */
export const hapticCoin = () => haptic([18, 40, 30]);

/** 自检信息（控制台 `__kidsHaptics()` 可看） */
export function hapticsInfo() {
  return {
    原生震动: hasNativeVibrate,
    Safari开关触感: switchHaptics,
    已叠加开关数: DOC ? DOC.querySelectorAll(OVERLAY_ICON).length : 0,
    说明: hasNativeVibrate
      ? "安卓原生震动通路"
      : switchHaptics
        ? "Safari：白名单透明 switch 通路（需系统触感反馈已开启）"
        : "当前浏览器没有可用的触觉反馈，功能不受影响"
  };
}
