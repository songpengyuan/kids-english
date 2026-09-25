/**
 * 语音工具：优先播放预生成的神经网络发音（public/lessons/<id>/audio/<wordId>.mp3），
 * 文件缺失或播放失败时自动回退到浏览器 TTS（Web Speech API）。
 *
 * 预生成音色为 en-US-AnaNeural（微软神经网络童声），比浏览器 TTS 自然得多，
 * 且不再依赖设备上装了什么音色——各端体验一致。
 *
 * 发音定位有两级注册表：
 *   1. 精确键 `lessonId:wordId` —— 同词出现在多课（如 l4/l6 的 blue）时各用各的音频，
 *      不会因"先到先得"串音。
 *   2. 兜底键 `en` —— 只按英文名也能发音（兼容旧调用/未带上下文的场景）。
 */
import { lessons } from "../data/lessons";

/* ---------- 预生成发音注册表 ---------- */
const wordAudioByKey = {}; // "lessonId:wordId" -> url
const wordAudioByEn = {}; // en -> url（兜底）

for (const l of lessons) {
  for (const w of l.words) {
    if (w.audio) {
      const key = `${l.id}:${w.id}`;
      if (!wordAudioByKey[key]) wordAudioByKey[key] = w.audio;
      if (!wordAudioByEn[w.en]) wordAudioByEn[w.en] = w.audio;
    }
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
/**
 * 朗读一个英文词/句。
 * @param text 要朗读的文本（通常是单词的 en）
 * @param opts.rate      语速（TTS 用）
 * @param opts.lang      语言（TTS 用）
 * @param opts.lessonId  词所属课时 id（可选；提供后按精确键查预生成发音）
 * @param opts.wordId    词 id（可选；与 lessonId 成对使用）
 */
export async function speak(
  text,
  { rate = 0.85, lang = "en-US", lessonId = null, wordId = null } = {}
) {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  let src = null;
  if (lessonId && wordId) src = wordAudioByKey[`${lessonId}:${wordId}`];
  if (!src) src = wordAudioByEn[text];
  if (src && (await playAudio(src))) return;
  speakWithTTS(text, { rate, lang });
}

export function speakZh(text, rate = 1) {
  speakWithTTS(text, { rate, lang: "zh-CN" });
}
