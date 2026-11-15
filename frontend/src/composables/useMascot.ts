/**
 * 吉祥物「乐乐鸟」全局状态 —— 单例，speech.ts 模式（模块级 ref 导出）。
 *
 * 双形态出场（2026-11-15 吉祥物 v1，方案经用户批准）：
 *  - dock 常驻：三个主 tab + 课程详情页，左下角常驻一只乐鸟（可见性由
 *    MascotToucan 按路由判定，状态归这里）；
 *  - popup 事件驱动：玩法页不常驻，答错/开箱/结算瞬间飞入，TTL 自动离场，
 *    像活物"窜出来反应"，而不是贴在角落的摆件。
 *
 * 双通道反馈（先例：LessonLevelList 宝箱锁定提示 = 语音 + 浮动文案）：
 * 每次出场 = 气泡文案 + speakZh 语音（自动继承音效开关与磨耳朵音乐门）。
 * 例外：结算庆祝只出气泡（voice:false）——结算页报星（4d5cb86）已接管语音，
 * 两句中文 TTS 背靠背会互相打断。
 */
import { ref } from "vue";
import { speakZh } from "../services/speech";
import { MASCOT_LINES, pickMascotLine } from "../data/mascotLines";

export type MascotMood = "idle" | "cheer" | "oops";

/**
 * 乐乐鸟的角色音色（2026-11-15 用户口径：小鸟说话要有独有的音色）。
 * 全站中文 TTS 默认 pitch 1.1，鸟抬高到 1.4 + 略快语速 = 亮一点、急一点，
 * 一耳朵就能认出"是鸟在说话"。定版走局域网试听页（public/voice-lab.html，
 * 未入库）：孩子听完拍板后改这一处即可全站生效。
 */
export const MASCOT_VOICE = { rate: 1.05, pitch: 1.4 } as const;

/** 气泡文案（空 = 无气泡） */
const bubble = ref("");
const mood = ref<MascotMood>("idle");
/** 事件出场中（玩法页等无 dock 的界面靠它临时显示） */
const popupActive = ref(false);

/** 气泡驻留时长：对齐 LessonLevelList chestHint 的 2.6s 先例 */
const BUBBLE_TTL = 2600;
let bubbleTimer: number | null = null;

export interface MascotSayOptions {
  mood?: MascotMood;
  ttl?: number;
  /** 事件出场（dock 常驻页的问候/闲聊传 false，只出气泡不触发飞入） */
  popup?: boolean;
  /** 是否朗读（结算庆祝传 false，语音让给结算页报星） */
  voice?: boolean;
}

function say(text: string, opts: MascotSayOptions = {}) {
  const { mood: m = "cheer", ttl = BUBBLE_TTL, popup = true, voice = true } = opts;
  if (!text) return;
  bubble.value = text;
  mood.value = m;
  if (popup) popupActive.value = true;
  if (voice) void speakZh(text, MASCOT_VOICE.rate, { pitch: MASCOT_VOICE.pitch });
  if (bubbleTimer !== null) clearTimeout(bubbleTimer);
  bubbleTimer = window.setTimeout(() => {
    bubble.value = "";
    mood.value = "idle";
    popupActive.value = false;
    bubbleTimer = null;
  }, ttl);
}

/** 完成庆祝（开箱等事件）：随机 cheer 池 */
function cheer() {
  say(pickMascotLine(MASCOT_LINES.cheer, bubble.value), { mood: "cheer" });
}

/** 答错打气：随机 oops 池（只打气，不否定孩子） */
function oops() {
  say(pickMascotLine(MASCOT_LINES.oops, bubble.value), { mood: "oops" });
}

/** 宝箱打开：随机 chest 池（稍长驻留，开箱画面信息多） */
function chest() {
  say(pickMascotLine(MASCOT_LINES.chest, bubble.value), { mood: "cheer", ttl: 3000 });
}

/** 会话首访问候：不触发 popup（可能落在 dock 页，也可能深链进玩法页不该打扰） */
function greet() {
  say(pickMascotLine(MASCOT_LINES.greet, bubble.value), { mood: "cheer", popup: false });
}

/** 点乐鸟闲聊：随机 tap 池 */
function idleChatter() {
  say(pickMascotLine(MASCOT_LINES.tap, bubble.value), { mood: "idle" });
}

/** 结算庆祝：文案照旧（"关卡完成/满分/继续加油"），只出气泡与动效；
 *  语音让给结算页报星，避免两句话背靠背互相打断。 */
function resultCheer(text: string) {
  say(text, { voice: false });
}

/** 进收藏册问候：dock 已在页上，只出气泡不触发飞入 */
function collectionGreet() {
  say(pickMascotLine(MASCOT_LINES.collection, bubble.value), { mood: "cheer", popup: false });
}

export function useMascot() {
  return {
    bubble,
    mood,
    popupActive,
    say,
    cheer,
    oops,
    chest,
    greet,
    idleChatter,
    resultCheer,
    collectionGreet,
  };
}

/** 仅测试用：重置模块单例状态（vitest 里模块状态跨用例存活） */
export function __resetMascotState() {
  if (bubbleTimer !== null) {
    clearTimeout(bubbleTimer);
    bubbleTimer = null;
  }
  bubble.value = "";
  mood.value = "idle";
  popupActive.value = false;
}
