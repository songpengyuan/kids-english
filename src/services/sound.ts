/**
 * 声音开关（音效与提示语）。
 *
 * 为什么需要：这是给 5 岁孩子用的应用，音效 + 中文提示语在公共场合/睡前会打扰别人。
 * 家长可以从首页顶栏或"我的"页一键静音。
 *
 * **静音范围**：游戏音效（叮咚/错误音/开箱音）与中文提示语（"关卡完成，太棒了"）。
 * **不受影响**：单词发音、童谣音视频、亲子对话句——那些是学习内容本身，静音就没法练了。
 *
 * 偏好独立存 kids-english-sound-v1，与进度/奖励/连击解耦。
 */
import { ref } from "vue";

const KEY = "kids-english-sound-v1";

function read(): boolean {
  try {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

/** 音效/提示语是否开启（响应式，供开关按钮绑定） */
export const soundOn = ref(read());

export function setSoundOn(on: boolean) {
  soundOn.value = on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* 无痕模式写入失败，忽略（本次会话内仍生效） */
  }
}

export function toggleSound(): boolean {
  setSoundOn(!soundOn.value);
  return soundOn.value;
}

/** 非组件代码（effects/speech）用的同步判定 */
export function soundEnabled(): boolean {
  return soundOn.value;
}
