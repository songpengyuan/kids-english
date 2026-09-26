/**
 * 跟读打分工具
 * 优先使用浏览器内置语音识别（SpeechRecognition）自动判断发音；
 * 若识别不可用（如国内网络无法连 Google 识别服务），调用方应降级为
 * "录音回放 + 家长判定" 模式（本文件同时提供录音工具）。
 */

type SRImpl = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

const SR: (new () => SRImpl) | null =
  typeof window !== "undefined"
    ? (window as unknown as { SpeechRecognition?: new () => SRImpl; webkitSpeechRecognition?: new () => SRImpl }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SRImpl }).webkitSpeechRecognition ||
      null
    : null;

/** 浏览器是否支持语音识别 API（不代表网络一定能用，真正失败在运行时捕获） */
export function asrSupported(): boolean {
  return !!SR;
}

export type RecognitionDone = (err: string | null, alternatives: string[]) => void;

/** 创建一次性的单词识别器。onDone(err, alternatives) */
export function createWordRecognizer(targetWord: string): {
  start: () => void;
  stop: () => void;
  abort: () => void;
  onFinish: (cb: RecognitionDone) => void;
} {
  if (!SR) throw new Error("SpeechRecognition 不可用");
  const rec = new SR();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.continuous = false;
  rec.maxAlternatives = 3;

  let alternatives: string[] = [];
  let done = false;

  rec.onresult = (e) => {
    alternatives = [];
    const res = e.results[0];
    for (let i = 0; i < res.length; i++) alternatives.push(res[i].transcript);
  };
  rec.onend = () => {
    if (!done) {
      done = true;
      onDone && onDone(null, alternatives);
    }
  };
  rec.onerror = (e) => {
    if (done) return;
    done = true;
    onDone && onDone(e.error, alternatives);
  };

  let onDone: RecognitionDone | null = null;
  return {
    start() {
      try {
        rec.start();
      } catch {
        /* 已处于启动状态则忽略 */
      }
    },
    stop() {
      try {
        rec.stop();
      } catch {
        /* 忽略 */
      }
    },
    abort() {
      try {
        rec.abort();
      } catch {
        /* 忽略 */
      }
    },
    /** 设置完成回调：err 为 null 表示识别流程正常结束 */
    onFinish(cb) {
      onDone = cb;
    }
  };
}

/** 文本归一化：小写、去标点 */
function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z' ]/g, "").trim();
}

/** 编辑距离 */
function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * 给一次识别结果打分（宽松标准，适配小朋友）
 * @param target 目标单词
 * @param heardList 识别候选文本数组
 * @returns { score: 0~1, heard: string }
 */
export function scorePronunciation(target: string, heardList: string[]): { score: number; heard: string } {
  const t = norm(target);
  let best = 0;
  let heard = "";
  for (const hRaw of heardList || []) {
    const h = norm(hRaw);
    if (!h) continue;
    let s;
    if (h === t) {
      s = 1;
    } else if (new RegExp(`(^|\\s)${t}($|\\s)`).test(h)) {
      // 识别句子里完整包含目标词
      s = 1;
    } else {
      s = 1 - levenshtein(t, h) / Math.max(t.length, h.length, 1);
    }
    s = Math.max(0, s);
    if (s > best) {
      best = s;
      heard = hRaw;
    }
  }
  return { score: best, heard };
}

/** 评分档位：与 UI 对齐。perfect=很棒 good=不错 retry=再试一次 */
export type ScoreGrade = "perfect" | "good" | "retry";

export function gradeScore(score: number): ScoreGrade {
  if (score >= 0.85) return "perfect";
  if (score >= 0.55) return "good";
  return "retry";
}

/* ================= 降级模式：录音（MediaRecorder） ================= */

export function recorderSupported(): boolean {
  return !!(
    navigator.mediaDevices &&
    !!navigator.mediaDevices.getUserMedia &&
    typeof window.MediaRecorder !== "undefined"
  );
}

/**
 * 创建录音器。用法：await rec.ensureMic() → rec.start() → rec.stop()
 * stop 后 Promise resolve 出一个可回放的 blob URL。
 */
interface RecorderLike {
  ensureMic: () => Promise<MediaStream>;
  start: () => Promise<void>;
  stop: () => Promise<string | null>;
  release: () => void;
}

export function createRecorder(): RecorderLike {
  let stream: MediaStream | null = null;
  let mr: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  return {
    async ensureMic() {
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      return stream;
    },
    async start() {
      await this.ensureMic();
      chunks = [];
      mr = new MediaRecorder(stream!);
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.start();
    },
    stop() {
      return new Promise((resolve) => {
        if (!mr || mr.state === "inactive") return resolve(null);
        mr.onstop = () => {
          const blob = new Blob(chunks, { type: mr!.mimeType || "audio/webm" });
          resolve(URL.createObjectURL(blob));
        };
        mr.stop();
      });
    },
    release() {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  };
}
