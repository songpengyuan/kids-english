/**
 * 触觉反馈（navigator.vibrate）。
 * 支持：Android Chrome / Edge 等主流安卓浏览器；
 * 不支持：iOS Safari（没有暴露该 API，调用会被安全跳过，不影响功能）。
 * 所有震动都是"轻"级别——给幼儿的反馈点到为止，不吓到孩子。
 */

const supported = typeof navigator !== "undefined" && "vibrate" in navigator;

export function haptic(pattern) {
  if (!supported) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* 某些浏览器在非用户手势里会抛错，静默即可 */
  }
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
