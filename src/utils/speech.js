/**
 * 语音工具：优先朗读英文单词（en-US 音色），带浏览器兼容处理。
 * 若系统没有英文音色则交给默认音色，孩子仍可听到发音。
 */
let cachedVoice = null;

function pickVoice() {
  if (!("speechSynthesis" in window)) return null;
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  cachedVoice =
    voices.find((v) => v.lang === "en-US" && /google|natural|premium|samantha/i.test(v.name)) ||
    voices.find((v) => v.lang === "en-US") ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    null;
  return cachedVoice;
}

// 音色列表是异步加载的，提前触发一次
if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
    pickVoice();
  };
}

export function speak(text, { rate = 0.85, lang = "en-US" } = {}) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel(); // 打断上一条，避免连点重叠
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.lang = lang;
  u.rate = rate; // 放慢一点，适合幼儿
  u.pitch = 1.1;
  window.speechSynthesis.speak(u);
}

export function speakZh(text, rate = 1) {
  speak(text, { rate, lang: "zh-CN" });
}
