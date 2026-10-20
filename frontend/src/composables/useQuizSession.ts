/**
 * 听音选图会话状态机（从 QuizView 抽出的逻辑层）。
 *
 * 规则（多邻国式 + 错题加赛）：
 * - 答错不推进：错的选项短暂标红后消失，不揭示答案、不自动读答案，孩子继续选；
 * - 答对锁定本题，底部出现"继续"，由小朋友自己点进下一题；
 * - 主线做完后，凡第一遍错过的词自动进入一轮「难词再挑战」（2~N 题），
 *   趁热打铁重考一遍；全会的孩子直接结算，不多做一题。
 * - 星级：一遍过 = 3 星；错过但加赛全对 = 2 星；加赛还错 = 1 星。
 *
 * 副作用（音效/朗读/掌握度落库）由调用方通过 hooks 注入 —— 逻辑层保持可单测。
 */
import { computed, ref, shallowRef, watch } from "vue";
import { buildQuizQuestions, starsForFirstTry, type QuizQuestion, type QuizWord } from "../utils/quizSession";

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

  /** 主线题目：每个词一题 */
  const mainQuestions = computed(() =>
    buildQuizQuestions(words(), Math.random, hooks.distractors?.() ?? words(), keyOf)
  );
  /** 错题加赛题目：主线结束后由错过的词生成 */
  const catchQuestions = shallowRef<QuizQuestion<T>[]>([]);
  /** 当前是否处于错题加赛轮 */
  const inCatchUp = ref(false);

  const idx = ref(0);
  /** 答对时锁定为正确项 id；答错保持 null（可继续选） */
  const picked = ref<string | null>(null);
  /** 选错的选项集合：只标红，不揭示正确答案 */
  const wrongPicks = ref<Set<string>>(new Set());
  /** 第一下就选对的题数（主线星级依据） */
  const firstTryRight = ref(0);
  /** 本题是否已经错过（用于判定"首次答对"） */
  const missedThisQuestion = ref(false);
  /** 主线里第一遍错过的词 key（加赛素材） */
  const missedInMain = ref<Set<string>>(new Set());
  /** 加赛轮里又错过的词 key（最终 1 星依据） */
  const missedInCatch = ref<Set<string>>(new Set());

  const timers = new Set<ReturnType<typeof setTimeout>>();
  function later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  }

  const questions = computed(() =>
    inCatchUp.value ? catchQuestions.value : mainQuestions.value
  );
  const q = computed(() => questions.value[Math.min(idx.value, Math.max(0, questions.value.length - 1))]);
  const total = computed(() => questions.value.length);
  const locked = computed(() => picked.value !== null);
  const isLast = computed(() => idx.value >= total.value - 1);
  const percent = computed(() =>
    total.value ? Math.round((idx.value / total.value) * 100) : 0
  );
  /** 进行中的实时星级（主线 = 首次答对率；加赛轮用加赛进度占位） */
  const stars = computed(() => starsForFirstTry(firstTryRight.value, mainQuestions.value.length));

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
      if (firstTry) {
        firstTryRight.value++;
      } else {
        // 这题第一遍错过：记入对应轮次的 missed 集合
        if (inCatchUp.value) missedInCatch.value.add(key);
        else missedInMain.value.add(key);
      }
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

  /** 主线结束时，若有第一遍错过的词，生成加赛轮 */
  function startCatchUp() {
    const missedWords = words().filter((w) => missedInMain.value.has(keyOf(w)));
    if (missedWords.length === 0) return false;
    catchQuestions.value = buildQuizQuestions(
      missedWords,
      Math.random,
      hooks.distractors?.() ?? words(),
      keyOf
    );
    inCatchUp.value = true;
    idx.value = 0;
    picked.value = null;
    missedThisQuestion.value = false;
    wrongPicks.value = new Set();
    return true;
  }

  /** 最终星级：3=一遍过；2=错过但加赛全对；1=加赛还错 */
  function finalStars(): number {
    if (missedInMain.value.size === 0) return 3;
    if (missedInCatch.value.size === 0) return 2;
    return 1;
  }

  /** 点"继续"：主线最后一题 → 进入加赛或结算；加赛最后一题 → 结算 */
  function next(): { done: boolean; stars: number } {
    if (!locked.value) return { done: false, stars: stars.value };
    if (isLast.value) {
      // 主线最后一题：有错题就开加赛，否则直接结算
      if (!inCatchUp.value && startCatchUp()) {
        return { done: false, stars: stars.value };
      }
      return { done: true, stars: finalStars() };
    }
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
    missedInMain.value = new Set();
    missedInCatch.value = new Set();
    catchQuestions.value = [];
    inCatchUp.value = false;
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
    inCatchUp,
    missedInMain,
    missedInCatch,
    pick,
    next,
    reset,
    cleanup,
  };
}
