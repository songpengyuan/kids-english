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
 *
 * TTS 语言选择（2026-09-27 修复）：speakWithTTS 按 lang 匹配对应语言的系统音色
 * （zh → zh-CN/zh-TW/zh，en → en-US/en），匹配不到就不指定音色、交给浏览器按 lang
 * 用默认音色读。此前写死英文音色导致中文朗读要么怪音要么无声。
 */
import { lessons } from "../data/lessons";
import { soundEnabled } from "./sound";

/* ---------- 预生成发音注册表 ---------- */
const wordAudioByKey: Record<string, string> = {}; // "lessonId:wordId" -> url
const wordAudioByEn: Record<string, string> = {}; // en -> url（兜底）

for (const l of lessons) {
  for (const w of l.words) {
    if (w.audio) {
      const key = `${l.id}:${w.id}`;
      if (!wordAudioByKey[key]) wordAudioByKey[key] = w.audio;
      if (!wordAudioByEn[w.en]) wordAudioByEn[w.en] = w.audio;
    }
  }
}

let curAudio: HTMLAudioElement | null = null;

/** 播放音频文件；成功结束返回 true，出错返回 false（让调用方回退 TTS） */
function playAudio(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (curAudio) {
      curAudio.pause();
      curAudio = null;
    }
    let settled = false;
    const done = (ok: boolean) => {
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
    // 兜底：被 stopSpeaking 掐断时 onended/onerror 可能都不触发，超时放行避免调用方 await 挂死
    window.setTimeout(() => done(true), 10000);
  });
}

/* ---------- 浏览器 TTS（回退通道）---------- */
/** 当前 utterance（用于 stopSpeaking 掐断 / 结束事件） */
let curUtter: SpeechSynthesisUtterance | null = null;

/**
 * TTS 发声版本号（Chrome 竞态修复的核心）：
 * Chrome 的 speechSynthesis.cancel() 是异步的——cancel 后立刻 speak()，新内容经常被吞，
 * 或旧内容没停干净继续读，造成"点了 A 却听到 B"。
 * 做法：每次请求取一个递增 seq；cancel 后延迟 60ms 再真正 speak，且只有 seq 仍最新才发声；
 * 期间若来了新请求（seq 已变），旧请求直接放弃，绝不发出旧内容。
 */
let ttsSeq = 0;
/** 当前挂起的 TTS Promise 的结算函数（stopSpeaking 掐断时立即结算，不等 12s 超时兜底） */
let settleTts: ((ok: boolean) => void) | null = null;

/** 按语言匹配系统音色；匹配不到返回 null（交给浏览器按 lang 默认读） */
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const prefix = lang.split("-")[0].toLowerCase(); // "zh" / "en"
  const byPrefix = voices.filter((v) => (v.lang || "").toLowerCase().startsWith(prefix));
  if (!byPrefix.length) return null;
  // 优先"自然/高级"音色（Google / Neural / Natural / 系统合成），其次任意该语言音色
  return (
    byPrefix.find((v) => /google|neural|natural|premium|samantha|tingting|meijia|xiaoxiao|yunxi/i.test(v.name)) ||
    byPrefix[0]
  );
}

// 音色列表是异步加载的，提前触发一次（voice 不缓存：切语言/装语音包后实时匹配）
if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    /* 触发 getVoices 刷新；pickVoice 不缓存，无需额外动作 */
    window.speechSynthesis.getVoices();
  };
}

/** 朗读一段文本（TTS）；完成返回 true，失败/环境不支持返回 false。同一时刻只读一条，自动打断上一条。 */
function speakWithTTS(text: string, { rate = 0.85, lang = "en-US" }: { rate?: number; lang?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window) || typeof window.speechSynthesis.speak !== "function") {
      resolve(false);
      return;
    }
    const seq = ++ttsSeq; // 本请求的版本号：后到的请求会让先到的作废
    let settled = false;
    const done = (ok: boolean) => {
      if (!settled) {
        settled = true;
        if (settleTts === doneRef) settleTts = null;
        resolve(ok);
      }
    };
    const doneRef = done;
    settleTts = done; // 注册结算：stopSpeaking 掐断时立即 resolve，不用等超时

    window.speechSynthesis.cancel(); // 打断上一条（Chrome 异步，真正生效靠下面的延迟 + seq 校验）
    const u = new SpeechSynthesisUtterance(text);
    curUtter = u;
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.lang = lang;
    u.rate = rate; // 放慢一点，适合幼儿
    u.pitch = 1.1;
    u.onend = () => {
      if (seq === ttsSeq) done(true); // 已被新请求覆盖时，旧回调不结算当前状态
    };
    u.onerror = () => {
      if (seq === ttsSeq) done(false);
    };
    // Chrome 竞态规避：cancel 后延迟一拍再 speak；这期间若来了新请求（seq 变了），本请求放弃
    window.setTimeout(() => {
      if (seq !== ttsSeq) {
        done(false);
        return;
      }
      window.speechSynthesis.speak(u);
    }, 60);
    // 兜底：个别环境（Safari 首次、切后台）onend 可能不来，超时放行避免链条卡死
    window.setTimeout(() => done(true), 12000);
  });
}

/** 立即停止一切朗读（mp3 + TTS），供"再点一下停止"类交互使用 */
export function stopSpeaking(): void {
  if (curAudio) {
    curAudio.pause();
    curAudio = null;
  }
  curUtter = null;
  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* 忽略 */
    }
    ttsSeq++; // 使所有挂起的延迟 speak 作废：停止后绝不再冒出新声音
  }
  if (settleTts) {
    const s = settleTts;
    settleTts = null;
    s(false); // 立即结算挂起的朗读 Promise（否则要等 12s 超时）
  }
}

/* ---------- 对外接口 ---------- */
/**
 * 朗读一个英文词/句。
 * @param text 要朗读的文本（通常是单词的 en）
 * @param opts.rate      语速（TTS 用）
 * @param opts.lang      语言（TTS 用）
 * @param opts.lessonId  词所属课时 id（可选；提供后按精确键查预生成发音）
 * @param opts.wordId    词 id（可选；与 lessonId 成对使用）
 * @param opts.ttsOnly   跳过预生成 mp3，直接用系统自带 TTS（适合课程名等整句/短语）
 */
export interface SpeakOptions {
  rate?: number;
  lang?: string;
  lessonId?: string | null;
  wordId?: string | null;
  /** 跳过预生成 mp3，直接用系统自带 TTS（适合课程名等整句/短语，避免误命中单词音频） */
  ttsOnly?: boolean;
}

export async function speak(
  text: string,
  { rate = 0.85, lang = "en-US", lessonId = null, wordId = null, ttsOnly = false }: SpeakOptions = {}
): Promise<void> {
  if (ttsOnly) {
    await speakWithTTS(text, { rate, lang });
    return;
  }
  let src = null;
  if (lessonId && wordId) src = wordAudioByKey[`${lessonId}:${wordId}`];
  if (!src) src = wordAudioByEn[text];
  if (src && (await playAudio(src))) return;
  await speakWithTTS(text, { rate, lang });
}

export interface SpeakZhOptions {
  /**
   * 绕过"音效开关"静音（用于学习内容朗读——简介/技能/常用语/角色名，
   * 它们是"内容"不是"提示语"，静音开关只管提示音与庆祝语）。
   */
  bypassMute?: boolean;
}

/**
 * 朗读一段中文。
 * 默认受音效开关约束（提示语语义：关卡完成/导航标签等，公共场合可一键静音）；
 * 传 { bypassMute: true } 则始终发声（学习内容语义：详情介绍/技能名/常用语）。
 * 返回 Promise（播完 resolve），便于"先英文后中文"串联不掐断。
 */
export async function speakZh(text: string, rate = 1, opts: SpeakZhOptions = {}): Promise<void> {
  if (!opts.bypassMute && !soundEnabled()) return;
  await speakWithTTS(text, { rate, lang: "zh-CN" });
}
