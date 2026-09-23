import confetti from "canvas-confetti";
import {
  hapticCelebrate,
  hapticMatch,
  hapticSuccess,
  hapticTap,
  hapticWrong
} from "./haptics";

/** 答对：撒花 + 上行音 */
export function celebrate() {
  hapticCelebrate();
  confetti({
    particleCount: 80,
    spread: 75,
    startVelocity: 38,
    origin: { y: 0.6 },
    colors: ["#58cc02", "#1cb0f6", "#ffc800", "#ce82ff", "#ff5b5b"]
  });
}

/** 过关：更盛大的双侧礼花 */
export function bigCelebrate() {
  hapticCelebrate();
  const end = Date.now() + 900;
  (function frame() {
    confetti({ particleCount: 5, angle: 60, spread: 60, origin: { x: 0 }, color: "#ffc800" });
    confetti({ particleCount: 5, angle: 120, spread: 60, origin: { x: 1 }, color: "#1cb0f6" });
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
