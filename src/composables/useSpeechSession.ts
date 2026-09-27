/**
 * 跟我读会话（从 SpeakView 抽出的逻辑层）。
 *
 * 双模式：
 *  - asr    浏览器语音识别自动打分（默认尝试）
 *  - record 降级：录音回放 + 家长判定（识别不可用/无网络/无权限时切换）
 *
 * 组件只负责渲染与音效；这里的副作用（掌握度落库、音效）通过 hooks 注入，
 * 便于单测与复用。
 */
import { computed, onBeforeUnmount, ref, type Ref } from "vue";
import { speak } from "../services/speech";
import {
  asrSupported,
  createRecorder,
  createWordRecognizer,
  gradeScore,
  recorderSupported,
  scorePronunciation,
} from "../utils/speechScore";
import { speakStars } from "../utils/speakSession";
import type { Word } from "../data/lessons";

export type SpeechMode = "asr" | "record";
export type SpeechStatus = "idle" | "listening" | "feedback";
export type SpeechGrade = "" | "perfect" | "good" | "retry";

export interface SpeechSessionHooks {
  /** 一句话读对（首次通过才计入星级） */
  onCorrect?: (word: Word, firstTry: boolean) => void;
  /** 读错 / 没听清 */
  onWrong?: (word: Word) => void;
  /** ASR 不可用降级到录音模式 */
  onFallback?: (reason: string) => void;
  /** 麦克风不可用 */
  onMicError?: () => void;
}

export function useSpeechSession(words: Ref<Word[]>, hooks: SpeechSessionHooks = {}) {
  const mode = ref<SpeechMode>(asrSupported() ? "asr" : "record");
  const idx = ref(0);
  const status = ref<SpeechStatus>("idle");
  const grade = ref<SpeechGrade>("");
  const heard = ref("");
  const firstAttemptOk = ref(0);
  const attempts = ref(0);
  const canRecord = recorderSupported();
  const recordHint = ref("");
  const recAudio = ref<HTMLAudioElement | null>(null);
  const recUrl = ref("");
  const imgFailed = ref(false);

  let recognizer: ReturnType<typeof createWordRecognizer> | null = null;
  let recorder: ReturnType<typeof createRecorder> | null = null;
  let asrTimer: ReturnType<typeof setTimeout> | null = null;
  let recTimer: ReturnType<typeof setTimeout> | null = null;

  const cur = computed(() => words.value[idx.value]);
  const total = computed(() => words.value.length);
  const progressText = computed(() => `${idx.value + 1} / ${words.value.length}`);
  /** 星级 = 首次通过率（见 utils/speakSession） */
  const stars = computed(() => speakStars(firstAttemptOk.value, words.value.length));

  function markAttempt(ok: boolean) {
    attempts.value++;
    if (ok && attempts.value === 1) firstAttemptOk.value++;
  }

  /* ---------- ASR 主路径 ---------- */
  function startAsr() {
    if (recognizer) {
      recognizer.abort();
      recognizer = null;
    }
    status.value = "listening";
    grade.value = "";
    heard.value = "";
    try {
      recognizer = createWordRecognizer(cur.value.en);
    } catch {
      fallbackToRecord("语音识别不可用");
      return;
    }
    const my = recognizer;
    my.onFinish((err: string | null, alternatives: string[]) => {
      if (recognizer !== my) return; // 已被新的尝试取代
      recognizer = null;
      if (err === "not-allowed" || err === "service-not-allowed") {
        fallbackToRecord("麦克风权限被拒绝");
        return;
      }
      if (err === "network") {
        fallbackToRecord("识别服务连不上，已改用录音模式");
        return;
      }
      if (err === "no-speech") {
        status.value = "feedback";
        grade.value = "retry";
        heard.value = "";
        markAttempt(false);
        hooks.onWrong?.(cur.value);
        return;
      }
      // 正常结束（err 为 null 或 aborted）
      const { score, heard: h } = scorePronunciation(cur.value.en, alternatives);
      heard.value = h;
      const g = gradeScore(score) as SpeechGrade;
      grade.value = g;
      status.value = "feedback";
      if (g === "retry") {
        markAttempt(false);
        hooks.onWrong?.(cur.value);
      } else {
        markAttempt(true);
        hooks.onCorrect?.(cur.value, attempts.value === 1);
      }
    });
    my.start();
    // 最长 3.5 秒自动收尾
    if (asrTimer) clearTimeout(asrTimer);
    asrTimer = setTimeout(() => my.stop(), 3500);
  }

  function fallbackToRecord(reason: string) {
    if (recognizer) {
      recognizer.abort();
      recognizer = null;
    }
    mode.value = "record";
    recordHint.value = reason ? `已切换录音模式：${reason}` : "已切换录音模式";
    status.value = "idle";
    hooks.onFallback?.(reason);
  }

  /* ---------- 降级路径：录音回放 + 家长判定 ---------- */
  async function startRecord() {
    status.value = "listening";
    try {
      if (!recorder) recorder = createRecorder();
      await recorder.start();
    } catch {
      status.value = "idle";
      recordHint.value = "无法访问麦克风，请检查权限";
      hooks.onMicError?.();
      return;
    }
    // 最大录音 5 秒自动结束
    if (recTimer) clearTimeout(recTimer);
    recTimer = setTimeout(() => stopRecord(), 5000);
  }

  function stopRecord() {
    if (recTimer) { clearTimeout(recTimer); recTimer = null; }
    if (!recorder) return;
    recorder.stop().then((url: string | null) => {
      if (!url) return;
      if (recUrl.value) URL.revokeObjectURL(recUrl.value);
      recUrl.value = url;
      grade.value = ""; // 等家长判定
      status.value = "feedback";
    });
  }

  /* ---------- 统一交互：按住说话，松开停止 ---------- */
  function startMic() {
    if (mode.value === "asr") startAsr();
    else startRecord();
  }
  function stopMic() {
    if (mode.value === "asr") {
      if (recognizer) recognizer.stop();
      return;
    }
    stopRecord();
  }

  /** 复读：重播本词录音（读完不满意再听一遍） */
  function replayRec() {
    const a = recAudio.value;
    if (a) {
      a.currentTime = 0;
      a.play().catch(() => {});
    }
  }

  /** 家长判定（录音模式） */
  function parentJudge(ok: boolean) {
    grade.value = ok ? "perfect" : "retry";
    status.value = "feedback";
    if (ok) {
      markAttempt(true);
      hooks.onCorrect?.(cur.value, attempts.value === 1);
    } else {
      markAttempt(false);
      hooks.onWrong?.(cur.value);
    }
  }

  function retry() {
    status.value = "idle";
    grade.value = "";
  }

  /** 下一个词；返回 true = 本关结束（用 stars 上报） */
  function next(): boolean {
    if (idx.value + 1 >= words.value.length) return true;
    idx.value++;
    attempts.value = 0;
    status.value = "idle";
    grade.value = "";
    heard.value = "";
    imgFailed.value = false;
    if (recUrl.value) {
      URL.revokeObjectURL(recUrl.value);
      recUrl.value = "";
    }
    return false;
  }

  function cleanup() {
    if (asrTimer) clearTimeout(asrTimer);
    asrTimer = null;
    if (recTimer) clearTimeout(recTimer);
    recTimer = null;
    if (recognizer) recognizer.abort();
    if (recUrl.value) URL.revokeObjectURL(recUrl.value);
    if (recorder && recorder.release) recorder.release();
  }
  onBeforeUnmount(cleanup);

  return {
    mode,
    idx,
    status,
    grade,
    heard,
    attempts,
    firstAttemptOk,
    canRecord,
    recordHint,
    recAudio,
    recUrl,
    imgFailed,
    cur,
    total,
    progressText,
    stars,
    hearExample: () => speak(cur.value.en, { lessonId: cur.value.lessonId, wordId: cur.value.id }),
    startMic,
    stopMic,
    replayRec,
    parentJudge,
    retry,
    next,
    cleanup,
  };
}
