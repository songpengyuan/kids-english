/**
 * 听音选图会话状态机（从 QuizView 抽出的逻辑层）。
 *
 * 规则（多邻国式）：
 * - 答错不推进：错的选项短暂标红后消失，不揭示答案、不自动读答案，孩子继续选；
 * - 答对锁定本题，底部出现"继续"，由小朋友自己点进下一题；
 * - 星级 = **首次答对率**（见 utils/quizSession）。
 *
 * 副作用（音效/朗读/掌握度落库）由调用方通过 hooks 注入 —— 逻辑层保持可单测。
 */
import { computed, ref, watch } from "vue";
import { buildQuizQuestions, starsForFirstTry, type QuizWord } from "../utils/quizSession";

export interface QuizSessionHooks<T> {
  /** 答对一题（firstTry = 这一题是不是第一下就选对） */
  onCorrect?: (word: T, firstTry: boolean) => void;
  /** 选错一个选项 */
  onWrong?: (picked: T, target: T) => void;
  /** 进度上报（顶栏进度条） */
  onProgress?: (percent: number) => void;
  /** 选错标红停留时长（毫秒） */
  wrongFlashMs?: number;
  /**
   * 已答对后再点"其他选项"。
   * 5 岁孩子答对后常想再点点别的图听发音 —— 只朗读，不改判定、不计错、不推进。
   */
  onExplore?: (word: T) => void;
  /** 干扰项来源（默认同 words；复习页传全词库） */
  distractors?: () => T[];
  /** 词的唯一键（默认 id；复习页用 "lessonId:id"，跨课同 id 不串） */
  keyOf?: (word: T) => string;
}

export function useQuizSession<T extends QuizWord>(
  words: () => T[],
  hooks: QuizSessionHooks<T> = {}
) {
  const wrongFlashMs = hooks.wrongFlashMs ?? 600;
  const keyOf = hooks.keyOf ?? ((w: T) => w.id);

  const questions = computed(() =>
    buildQuizQuestions(words(), Math.random, hooks.distractors?.() ?? words(), keyOf)
  );
  const idx = ref(0);
  /** 答对时锁定为正确项 id；答错保持 null（可继续选） */
  const picked = ref<string | null>(null);
  /** 选错的选项集合：只标红，不揭示正确答案 */
  const wrongPicks = ref<Set<string>>(new Set());
  /** 第一下就选对的题数（星级依据） */
  const firstTryRight = ref(0);
  /** 本题是否已经错过（用于判定"首次答对"） */
  const missedThisQuestion = ref(false);

  const timers = new Set<ReturnType<typeof setTimeout>>();
  function later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  }

  const q = computed(() => questions.value[Math.min(idx.value, Math.max(0, questions.value.length - 1))]);
  const total = computed(() => questions.value.length);
  const locked = computed(() => picked.value !== null);
  const isLast = computed(() => idx.value >= total.value - 1);
  const percent = computed(() =>
    total.value ? Math.round((idx.value / total.value) * 100) : 0
  );
  const stars = computed(() => starsForFirstTry(firstTryRight.value, total.value));

  watch(percent, (p) => hooks.onProgress?.(p), { immediate: true });

  function pick(opt: T): "correct" | "wrong" | "explore" | "ignored" {
    if (!q.value) return "ignored";
    const key = keyOf(opt);
    // 已答对：其他选项仍可点 —— 只朗读该词（孩子想再听听别的词），
    // 不改判定、不计错、不影响星级，也不推进题目
    if (locked.value) {
      if (key === keyOf(q.value.target)) return "ignored";
      hooks.onExplore?.(opt);
      return "explore";
    }
    if (wrongPicks.value.has(key)) return "ignored";
    if (key === keyOf(q.value.target)) {
      picked.value = key;
      const firstTry = !missedThisQuestion.value;
      if (firstTry) firstTryRight.value++;
      hooks.onCorrect?.(opt, firstTry);
      return "correct";
    }
    missedThisQuestion.value = true;
    hooks.onWrong?.(opt, q.value.target);
    wrongPicks.value = new Set([...wrongPicks.value, key]);
    later(() => {
      if (!wrongPicks.value.has(key)) return;
      const s = new Set(wrongPicks.value);
      s.delete(key);
      wrongPicks.value = s;
    }, wrongFlashMs);
    return "wrong";
  }

  /** 点"继续"：最后一题 → 结束（返回星级），否则进入下一题 */
  function next(): { done: boolean; stars: number } {
    if (!locked.value) return { done: false, stars: stars.value };
    if (isLast.value) return { done: true, stars: stars.value };
    idx.value++;
    picked.value = null;
    missedThisQuestion.value = false;
    wrongPicks.value = new Set();
    return { done: false, stars: stars.value };
  }

  /** 组件卸载时清掉标红定时器 */
  function cleanup() {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
  }

  /** 重开一轮（复习页"再练一次"）：清空作答状态，题目按当前词表重新生成 */
  function reset() {
    cleanup();
    idx.value = 0;
    picked.value = null;
    wrongPicks.value = new Set();
    missedThisQuestion.value = false;
    firstTryRight.value = 0;
  }

  return {
    q,
    total,
    idx,
    picked,
    wrongPicks,
    locked,
    isLast,
    percent,
    stars,
    firstTryRight,
    pick,
    next,
    reset,
    cleanup,
  };
}
