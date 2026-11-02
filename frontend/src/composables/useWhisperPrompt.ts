/**
 * cards 点读卡「轻跟读」——可选、鼓励向的张口练习（不接自动评测、不计对错惩罚）。
 *
 * 流程：点一次 → 先播示范（词发音）→ 短延迟避开 TTS 人声 → 浏览器 ASR 收一轮 →
 * 正向鼓励（perfect/good）或温和提示（retry/no-speech）→ 自动回空闲，全程不阻塞点读、
 * 不影响点读覆盖率星级、不改变完成门槛。
 *
 * 与 useSpeechSession（跟我读/亲子对话的完整会话）区分：
 *  - 不做通过/打回、不记首次通过率、不切录音降级模式；
 *  - 计数副作用（今日开口次数）经 onAttempt 注入，逻辑层不直接依赖 store，便于单测。
 *
 * 不可用设备（iOS Safari / 桌面 Safari / 无 SpeechRecognition）由 visible=false 整体隐藏，
 * cards 主流程（点读卡 + Pager + 完成键）零变化。
 */
import { computed, onBeforeUnmount, ref, type ComputedRef, type MaybeRef, unref } from "vue";
import {
  asrSupported,
  createWordRecognizer,
  scorePronunciation,
  gradeScore,
} from "../utils/speechScore";
import { speak, stopSpeaking } from "../services/speech";
import type { Word } from "../data/lessons";

export type WhisperPhase = "idle" | "demo" | "listening" | "praise";
/** good=读到了正向鼓励；soft=没读准/没出声，温和提示再试 */
export type WhisperPraise = "good" | "soft";

/** 示范起声后再开麦，避免把 TTS 示范声录进识别结果 */
const DEMO_GAP_MS = 650;
/** 单轮最长收音（与 ASR 主路径一致 3.5s） */
const LISTEN_MS = 3500;
/** 鼓励语停留后自动回 idle，不卡住点读 */
const PRAISE_MS = 1500;

export function useWhisperPrompt(
  words: MaybeRef<Word[]>,
  hooks: { onAttempt?: () => void } = {}
) {
  const supported = asrSupported();
  const phase = ref<WhisperPhase>("idle");
  const praiseKind = ref<WhisperPraise | null>(null);
  const target = ref<Word | null>(null);
  /** 本会话已尝试跟读过的词（用于轮换选词，避免总卡在同一个难词） */
  const spokenIds = ref<Set<string>>(new Set());
  /** 运行期环境不可用（network / 权限拒绝 / 无 SR）→ 隐藏入口 */
  const hidden = ref(false);

  let recognizer: ReturnType<typeof createWordRecognizer> | null = null;
  let demoTimer: ReturnType<typeof setTimeout> | null = null;
  let listenTimer: ReturnType<typeof setTimeout> | null = null;
  let praiseTimer: ReturnType<typeof setTimeout> | null = null;

  const visible: ComputedRef<boolean> = computed(() => supported && !hidden.value);
  const listening = computed(() => phase.value === "listening");

  function clearTimers() {
    if (demoTimer) clearTimeout(demoTimer);
    if (listenTimer) clearTimeout(listenTimer);
    if (praiseTimer) clearTimeout(praiseTimer);
    demoTimer = listenTimer = praiseTimer = null;
  }

  function releaseRecognizer(abort: boolean) {
    if (!recognizer) return;
    if (abort) recognizer.abort();
    recognizer = null;
  }

  function backToIdle() {
    phase.value = "idle";
    praiseKind.value = null;
    target.value = null;
  }

  /** 优先挑还没跟过的词；全部试过则回绕第一个 */
  function pickTarget(): Word | null {
    const list = unref(words);
    if (!list.length) return null;
    return list.find((w) => !spokenIds.value.has(w.id)) ?? list[0];
  }

  /** 落定反馈：kind=鼓励层级；count=是否计一次开口尝试；wordId=记入已尝试集合 */
  function settlePraise(kind: WhisperPraise, count: boolean, wordId?: string) {
    praiseKind.value = kind;
    phase.value = "praise";
    if (count) hooks.onAttempt?.();
    if (wordId) spokenIds.value = new Set([...spokenIds.value, wordId]);
    if (praiseTimer) clearTimeout(praiseTimer);
    praiseTimer = setTimeout(() => {
      releaseRecognizer(true);
      backToIdle();
    }, PRAISE_MS);
  }

  function beginListen(t: Word) {
    let my: ReturnType<typeof createWordRecognizer>;
    try {
      my = createWordRecognizer(t.en);
    } catch {
      hidden.value = true;
      backToIdle();
      return;
    }
    recognizer = my;
    phase.value = "listening";
    my.onFinish((err: string | null, alternatives: string[]) => {
      if (recognizer !== my) return; // 资格校验：迟到/被替换的旧结果一律丢弃
      recognizer = null;
      if (err === "not-allowed" || err === "service-not-allowed" || err === "network") {
        hidden.value = true;
        backToIdle();
        return;
      }
      if (err === "no-speech") {
        settlePraise("soft", false, undefined); // 没出声：不计数，温和提示
        return;
      }
      const { score } = scorePronunciation(t.en, alternatives);
      const g = gradeScore(score);
      // retry 也是一次真实张口尝试：鼓励向计数；反馈走 soft，不判错、不卡关
      settlePraise(g === "retry" ? "soft" : "good", true, t.id);
    });
    my.start();
    if (listenTimer) clearTimeout(listenTimer);
    listenTimer = setTimeout(() => {
      if (recognizer === my) my.stop();
    }, LISTEN_MS);
  }

  function start() {
    if (!supported || hidden.value) return;
    const t = pickTarget();
    if (!t) return;
    clearTimers();
    releaseRecognizer(true);
    target.value = t;
    phase.value = "demo";
    praiseKind.value = null;
    stopSpeaking(); // 先掐断既有 TTS/音频，避免示范与人声叠加、避免录进上一条声音
    speak(t.en, { lessonId: t.lessonId, wordId: t.id });
    if (demoTimer) clearTimeout(demoTimer);
    demoTimer = setTimeout(() => beginListen(t), DEMO_GAP_MS);
  }

  function stop() {
    // 示范进行中：取消本轮，回到空闲，不产生识别结果
    if (demoTimer) {
      clearTimeout(demoTimer);
      demoTimer = null;
      releaseRecognizer(true);
      backToIdle();
      return;
    }
    // 收音中：stop 触发 onend → 走正常结果结算（说完即停，计一次尝试）
    if (recognizer) recognizer.stop();
  }

  function toggle() {
    if (phase.value === "demo" || phase.value === "listening") stop();
    else start();
  }

  function cleanup() {
    clearTimers();
    releaseRecognizer(true);
    backToIdle();
  }

  onBeforeUnmount(cleanup);

  return {
    supported,
    visible,
    phase,
    praiseKind,
    target,
    listening,
    toggle,
    cleanup,
  };
}
