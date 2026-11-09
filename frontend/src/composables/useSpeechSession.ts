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
import { computed, nextTick, onBeforeUnmount, ref, type Ref } from "vue";
import { speak, stopSpeaking } from "../services/speech";
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
  /**
   * 完成一次真实张口尝试（ASR 正常结果 perfect/good/retry；record 拿到非空录音）。
   * 鼓励向旁路：不判对错、不影响首次通过率星级；no-speech/network/权限拒绝/家长二次判定不触发。
   */
  onSpeakAttempt?: (word: Word) => void;
}

export interface SpeechSessionOptions {
  /**
   * ASR 自动打分模式是否也并行录下孩子声音、用于本机回放（不上传、不入库）。
   * 默认 false：亲子对话 TalkView 不传，保持"仅 record 降级模式录音"的现状；
   * 跟我读 SpeakView 传 true，让桌面/Android 等支持识别的设备也能自动重放 + 手动重放。
   * record 降级模式无论此开关如何都照常录音（家长判定本身依赖回放）。
   */
  captureVoice?: boolean;
  /**
   * 孩子的录音播完之后再播一次标准音（"先听自己、再听老师"，让孩子自己听出差别）。
   * 自动回放与手动「再听一遍」都走这条；由调用方决定播什么
   * （跟我读播单词、亲子对话播整句答句）。
   */
  afterReplay?: () => void;
}

export function useSpeechSession(
  words: Ref<Word[]>,
  hooks: SpeechSessionHooks = {},
  options: SpeechSessionOptions = {}
) {
  const captureVoice = options.captureVoice === true;
  const afterReplay = options.afterReplay;
  const mode = ref<SpeechMode>(asrSupported() ? "asr" : "record");
  const idx = ref(0);
  const status = ref<SpeechStatus>("idle");
  const grade = ref<SpeechGrade>("");
  const heard = ref("");
  const firstAttemptOk = ref(0);
  const attempts = ref(0);
  const canRecord = recorderSupported();
  /** 麦克风权限被拒/不可用 → 显示跳过按钮 */
  const micBlocked = ref(false);
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

  /* ---------- 本机录音回放资源管理（仅内存 ObjectURL，不入库、不上传） ---------- */
  function ensureRecorder() {
    if (!recorder) recorder = createRecorder();
    return recorder;
  }
  /** 暂停当前回放并释放上一条 ObjectURL */
  function clearRecordingUrl() {
    if (recAudio.value) {
      recAudio.value.pause?.();
      recAudio.value.currentTime = 0;
    }
    if (recUrl.value) {
      URL.revokeObjectURL(recUrl.value);
      recUrl.value = "";
    }
  }
  /** 采用新录音 url：先释放旧的，再挂上本次的 */
  function adoptRecordingUrl(url: string | null) {
    clearRecordingUrl();
    recUrl.value = url ?? "";
  }
  /** 停止并行录音并采用结果 url（非空才保留用于回放） */
  async function stopCaptureRecorder(): Promise<string | null> {
    if (!recorder) return null;
    try {
      const url = await recorder.stop();
      adoptRecordingUrl(url);
      return url;
    } catch {
      return null;
    }
  }
  /** 静默丢弃一次并行录音（没出声 / 降级 / 重试）：停录、清 url，不回放、不计数 */
  async function stopCaptureRecorderSilent() {
    if (!recorder) return;
    try {
      await recorder.stop();
    } catch {
      /* 可能本就未启动，忽略 */
    }
    clearRecordingUrl();
  }

  /* ---------- ASR 主路径 ---------- */
  async function startAsr() {
    if (recognizer) {
      recognizer.abort();
      recognizer = null;
    }
    // 新一轮尝试先清掉上一条回放与残留录音，避免旧声音/旧按钮残留
    await stopCaptureRecorderSilent();
    status.value = "listening";
    grade.value = "";
    heard.value = "";
    try {
      recognizer = createWordRecognizer(cur.value.en);
    } catch {
      fallbackToRecord("语音识别不可用");
      return;
    }
    // captureVoice 开启且设备支持时，与识别并行录一份仅本机回放的声音（不参与打分、不上传）
    if (captureVoice && canRecord) {
      try {
        await ensureRecorder().start();
      } catch {
        /* 录音不可用不阻塞 ASR 打分，只是没有回放源 */
      }
    }
    const my = recognizer;
    my.onFinish(async (err: string | null, alternatives: string[]) => {
      if (recognizer !== my) return; // 已被新的尝试取代（新一轮已自行收尾旧录音）
      recognizer = null;
      if (err === "not-allowed" || err === "service-not-allowed") {
        micBlocked.value = true;
        await stopCaptureRecorderSilent();
        fallbackToRecord("麦克风权限被拒绝");
        return;
      }
      if (err === "network") {
        await stopCaptureRecorderSilent();
        fallbackToRecord("识别服务连不上，已改用录音模式");
        return;
      }
      if (err === "no-speech") {
        status.value = "feedback";
        grade.value = "retry";
        heard.value = "";
        markAttempt(false);
        hooks.onWrong?.(cur.value);
        await stopCaptureRecorderSilent(); // 没出声：丢弃并行录音，不回放、不计数
        return;
      }
      // 正常结束（err 为 null 或 aborted）
      const { score, heard: h } = scorePronunciation(cur.value.en, alternatives);
      heard.value = h;
      const g = gradeScore(score) as SpeechGrade;
      grade.value = g;
      status.value = "feedback";
      // 正常完成一次识别（含 retry）= 一次张口尝试，统一先计鼓励分，再按对错走星级 hook
      hooks.onSpeakAttempt?.(cur.value);
      if (g === "retry") {
        markAttempt(false);
        hooks.onWrong?.(cur.value);
      } else {
        markAttempt(true);
        hooks.onCorrect?.(cur.value, attempts.value === 1);
      }
      // 并行录音收尾：拿到非空声音才挂上回放并自动播一次；空录音不显示回放按钮
      if (captureVoice && recorder) {
        const url = await stopCaptureRecorder();
        if (url) autoReplay();
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
      micBlocked.value = true;
      recordHint.value = "麦克风不可用";
      hooks.onMicError?.();
      return;
    }
    // 最大录音 5 秒自动结束
    if (recTimer) clearTimeout(recTimer);
    recTimer = setTimeout(() => stopRecord(), 5000);
  }

  async function stopRecord() {
    if (recTimer) { clearTimeout(recTimer); recTimer = null; }
    if (!recorder) return;
    const url = await recorder.stop();
    if (!url) return; // 空录音：保持 listening，沿用原语义让孩子再点一次
    // 录到了声音 = 一次张口尝试（家长后续"读对了/再试一次"只是二次确认，不重复计）
    hooks.onSpeakAttempt?.(cur.value);
    adoptRecordingUrl(url);
    grade.value = ""; // 等家长判定
    status.value = "feedback";
    // 停止录音后自动回放一次自己的发音（家长判定前先听一遍）
    autoReplay();
  }

  /** 孩子的录音播完后接标准音：只保留一个监听，避免连点重放时叠着播两遍 */
  let replayEndHandler: (() => void) | null = null;
  function queueAfterReplay() {
    const a = recAudio.value;
    if (!a || !afterReplay) return;
    if (replayEndHandler) a.removeEventListener("ended", replayEndHandler);
    const h = () => {
      a.removeEventListener("ended", h);
      if (replayEndHandler === h) replayEndHandler = null;
      afterReplay();
    };
    replayEndHandler = h;
    a.addEventListener("ended", h);
  }

  /** 自动回放：等 <audio> 元素渲染并挂上 src 后再播一次（先掐断示范 TTS，避免人声叠加） */
  function autoReplay() {
    nextTick(() => {
      const a = recAudio.value;
      if (!a) return;
      stopSpeaking();
      a.currentTime = 0;
      a.play().catch(() => {});
      queueAfterReplay();
    });
  }

  /* ---------- 统一交互：点一下开始，再点一下结束 ----------
   * 曾经写"按住说话，松开停止"，但两处调用方（LearnStage 的 .mic-btn、TalkView 的
   * .input-bar）都只接了 @click —— 键面写着"按住"、实际是点击切换。
   * 键面必须等于行为，所以统一按点击语义描述（对孩子也更友好：长按更难控制）。 */
  function startMic() {
    // 开始说话前先掐断示范 TTS：避免把示范人声录进孩子录音，也避免示范音与回放抢声道
    stopSpeaking();
    if (mode.value === "asr") void startAsr();
    else void startRecord();
  }
  function stopMic() {
    if (mode.value === "asr") {
      if (recognizer) recognizer.stop();
      return;
    }
    void stopRecord();
  }

  /** 复读：重播本词录音（读完不满意再听一遍）；先掐断示范音再从头播，
   *  播完同样接一次标准音（家长可对照听） */
  function replayRec() {
    const a = recAudio.value;
    if (!a) return;
    stopSpeaking();
    a.currentTime = 0;
    a.play().catch(() => {});
    queueAfterReplay();
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
    // 不满意重来：丢弃上一条并行录音与回放，避免旧声音被重播
    void stopCaptureRecorderSilent();
    clearRecordingUrl();
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
    clearRecordingUrl(); // 释放上一条录音 ObjectURL 并停掉回放，不让旧词声音串到下一词
    return false;
  }

  function cleanup() {
    if (asrTimer) clearTimeout(asrTimer);
    asrTimer = null;
    if (recTimer) clearTimeout(recTimer);
    recTimer = null;
    if (recognizer) recognizer.abort();
    clearRecordingUrl();
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
    micBlocked,
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
