/**
 * 语音工具：优先播放预生成的神经网络发音（public/lessons/<id>/audio/<wordId>.mp3），
 * 文件缺失或播放失败时自动回退到浏览器 TTS（Web Speech API）。
 *
 * 预生成音色为 en-US-AnaNeural（微软神经网络童声），比浏览器 TTS 自然得多，
 * 且不再依赖设备上装了什么音色——各端体验一致。
 */
import { lessons } from "../data/lessons";

/* ---------- 预生成发音注册表：en 单词 → mp3 地址 ---------- */
const wordAudio = {};
for (const l of lessons) {
  for (const w of l.words) {
    if (w.audio && !wordAudio[w.en]) wordAudio[w.en] = w.audio;
  }
}

let curAudio = null;

/** 播放音频文件；成功结束返回 true，出错返回 false（让调用方回退 TTS） */
function playAudio(src) {
  return new Promise((resolve) => {
    if (curAudio) {
      curAudio.pause();
      curAudio = null;
    }
    let settled = false;
    const done = (ok) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    const a = new Audio();
    curAudio = a;
    a.onended = () => done(true);
    a.onerror = () => done(false);
    a.src = src;
    a.play().catch(() => done(false));
  });
}

/* ---------- 浏览器 TTS（回退通道）---------- */
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

function speakWithTTS(text, { rate = 0.85, lang = "en-US" }) {
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

/* ---------- 对外接口 ---------- */
export async function speak(text, { rate = 0.85, lang = "en-US" } = {}) {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  const src = wordAudio[text];
  if (src && (await playAudio(src))) return;
  speakWithTTS(text, { rate, lang });
}

export function speakZh(text, rate = 1) {
  speakWithTTS(text, { rate, lang: "zh-CN" });
}
