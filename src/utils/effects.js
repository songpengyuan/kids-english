import confetti from "canvas-confetti";
import {
  hapticCelebrate,
  hapticMatch,
  hapticSuccess,
  hapticTap,
  hapticWrong
} from "./haptics";

/**
 * 礼花配色：直接读 CSS 变量，跟着主题走。
 * 之前把亮色主题的高饱和色写死，暗色模式下礼花会亮得突兀（和降过亮的界面不在一个调上）。
 */
function tokenColor(name, fallback) {
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
    confetti({ particleCount: 5, angle: 60, spread: 60, origin: { x: 0 }, color: gold });
    confetti({ particleCount: 5, angle: 120, spread: 60, origin: { x: 1 }, color: blue });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

let ctx;
function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  return ctx;
}

function tone(freq, start, dur, type = "sine", gain = 0.15) {
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
