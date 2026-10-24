import confetti from "canvas-confetti";
import {
  hapticCelebrate,
  hapticChestOpen,
  hapticCoin,
  hapticMatch,
  hapticSuccess,
  hapticTap,
  hapticWrong
} from "./haptics";
import { soundEnabled } from "./sound";

/**
 * 礼花配色：直接读 CSS 变量，跟着主题走。
 * 之前把亮色主题的高饱和色写死，暗色模式下礼花会亮得突兀（和降过亮的界面不在一个调上）。
 */
function tokenColor(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** 答对：撒花 + 上行音 */
export function celebrate() {
  hapticCelebrate();
  confetti({
    particleCount: 80,
    spread: 75,
    startVelocity: 38,
    origin: { y: 0.6 },
    colors: ["--c-green", "--c-blue", "--c-orange", "--c-purple", "--c-pink"].map((n) =>
      tokenColor(n, "#ffc800")
    )
  });
}

/** 过关：更盛大的双侧礼花 */
export function bigCelebrate() {
  hapticCelebrate();
  const gold = tokenColor("--yellow", "#ffc800");
  const blue = tokenColor("--blue", "#1cb0f6");
  const end = Date.now() + 900;
  (function frame() {
    // 曾写成单数 color —— 被静默忽略，双侧礼花其实一直在用默认随机色
    confetti({ particleCount: 5, angle: 60, spread: 60, origin: { x: 0 }, colors: [gold] });
    confetti({ particleCount: 5, angle: 120, spread: 60, origin: { x: 1 }, colors: [blue] });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

let ctx: AudioContext | null = null;
function audioCtx(): AudioContext | null {
  if (!ctx) {
    // Safari 老版本的 WebKit 前缀实现
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) ctx = new AC();
  }
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.15) {
  // 静音开关只关"音效"：单词/童谣等教学内容发音不受影响（见 services/sound.ts）
  if (!soundEnabled()) return;
  const c = audioCtx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.connect(g);
  g.connect(c.destination);
  const t = c.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.start(t);
  o.stop(t + dur);
}

/** 正确音效：叮咚上行 */
export function sfxCorrect() {
  hapticSuccess();
  tone(659, 0, 0.12, "triangle");
  tone(880, 0.1, 0.18, "triangle");
}

/** 错误音效：温柔下行（不刺耳，避免打击幼儿） */
export function sfxWrong() {
  hapticWrong();
  tone(392, 0, 0.16, "sine", 0.1);
  tone(311, 0.14, 0.22, "sine", 0.1);
}

/** 点击/翻牌音效 */
export function sfxTap() {
  hapticTap();
  tone(523, 0, 0.07, "square", 0.06);
}

/** 连线成功音效 */
export function sfxMatch() {
  hapticMatch();
  tone(784, 0, 0.1, "triangle");
  tone(1046, 0.08, 0.16, "triangle");
}


/* ---------- 宝箱开箱音效 ---------- */

/**
 * 敲一下宝箱（第 1/2/3 下）：木箱"咚"+ 一下清脆的敲击点。
 *
 * 为什么单独一条而不是复用 `sfxTap()`：sfxTap 是 523Hz / 0.07s / gain 0.06 的方波，
 * 只有 7 毫秒、音量极低 —— 在手机外放上几乎听不见。宝箱是**靠敲击感讲节奏**的
 * 交互（点三下才开），三下都没声音，孩子会以为"点了没反应"（2026-10-17 反馈）。
 * 所以这里给：低频木箱体（triangle，够厚）+ 高频敲击点（square，够脆），
 * 并且**每一下升高一个小三度**，让三下敲击有"越来越近"的期待感。
 *
 * @param step 第几下（1-based，>3 按第 3 下处理）
 */
export function sfxChestTap(step = 1) {
  hapticTap();
  const pitch = [196, 233, 262][Math.min(Math.max(step, 1), 3) - 1];
  tone(pitch, 0, 0.16, "triangle", 0.2); // 木箱体：厚实
  tone(pitch * 4, 0, 0.05, "square", 0.06); // 敲击点：脆亮，给"敲到了"的确认
}

/**
 * 开盖瞬间：低频"咚"（木箱重击）+ 快速上行金光"唰"。
 * 三下上行音阶模拟金光射出，层次感比单音强。
 */
export function sfxChestOpen() {
  hapticChestOpen();
  tone(120, 0, 0.4, "sine", 0.24); // 重低音开盖
  tone(196, 0.06, 0.35, "triangle", 0.13); // 木箱共鸣
  tone(523, 0.18, 0.1, "triangle", 0.1); // 金光上行…
  tone(784, 0.3, 0.12, "triangle", 0.12);
  tone(1046, 0.42, 0.22, "triangle", 0.14);
}

/** 金币/贝壳入袋：清脆"叮"（基音+泛音，明亮不刺耳） */
export function sfxCoin() {
  hapticCoin();
  tone(1318, 0, 0.22, "sine", 0.12);
  tone(1975, 0.03, 0.28, "sine", 0.05);
}

/** 贴纸到手：星光上升三连，比金币更"魔法" */
export function sfxSticker() {
  tone(880, 0, 0.12, "triangle", 0.14);
  tone(1108, 0.08, 0.12, "triangle", 0.14);
  tone(1318, 0.16, 0.26, "triangle", 0.16);
}

/** 收下奖励：轻快双响收尾 */
export function sfxCollect() {
  hapticSuccess();
  tone(1046, 0, 0.1, "triangle", 0.12);
  tone(1318, 0.09, 0.18, "triangle", 0.12);
}
