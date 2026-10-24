/**
 * 拼句子（order）的会话逻辑：槽位/词库/判定/星级——与 Vue 模板、音效解耦。
 *
 * 抽出来的原因：OrderView 的 script 曾是"状态机 + 音效 + TTS + DOM"一锅炖；
 * 抽出纯逻辑后（参照 QuizView/useQuizSession 的健康样本），组件只剩胶水与样式。
 * 星级按拼错次数算（曾经 emit 写死 3 星，拼错多次也满分）。
 */
import { computed, ref, type Ref, watch } from "vue";
import { shuffleWith } from "../utils/quizSession";

export interface OrderPhrase {
  en: string;
  zh: string;
}

export interface UseOrderSessionOptions {
  /** 拼错整句标红回滚时（组件里配音效） */
  onWrong?: () => void;
  /** 拼对整句时（组件里配音效 + 朗读句子） */
  onSolved?: (phrase: OrderPhrase) => void;
}

export function useOrderSession(phrases: Ref<OrderPhrase[]>, options: UseOrderSessionOptions = {}) {
  const sentenceIdx = ref(0);
  /** 底部待选单词块（打乱后） */
  const bank = ref<string[]>([]);
  /** 已放入句子槽的单词 */
  const slots = ref<string[]>([]);
  const lock = ref(false);
  const wrongCount = ref(0);
  /** 拼对后是否显示"继续"按钮 */
  const solved = ref(false);

  const total = computed(() => phrases.value.length);
  const cur = computed(() => phrases.value[sentenceIdx.value]);
  const targetWords = computed(() =>
    cur.value ? cur.value.en.replace(/[?.!,]/g, "").trim().split(/\s+/) : []
  );
  /** 星级按拼错次数算：0 错 3 星，≤2 错 2 星，更多 1 星 */
  const stars = computed(() => (wrongCount.value === 0 ? 3 : wrongCount.value <= 2 ? 2 : 1));
  /** 还空着的槽位数 = 目标句单词数 − 已放入数（每个词位画一条横线） */
  const emptyCount = computed(() => Math.max(0, targetWords.value.length - slots.value.length));

  /** 打乱，避免和正确顺序一样（至少换一次位） */
  function buildSentence() {
    if (!cur.value) return;
    const target = targetWords.value;
    let shuffled = shuffleWith(target);
    if (shuffled.join(" ") === target.join(" ") && target.length > 1) {
      [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
    }
    bank.value = shuffled;
    slots.value = [];
    lock.value = false;
  }

  watch(phrases, buildSentence, { immediate: true });

  async function checkComplete() {
    if (slots.value.length !== targetWords.value.length) return;
    if (slots.value.join(" ") !== targetWords.value.join(" ")) {
      // 拼错：整组标红后弹回
      lock.value = true;
      wrongCount.value++;
      options.onWrong?.();
      await new Promise((r) => setTimeout(r, 800));
      buildSentence();
      return;
    }
    // 拼对
    lock.value = true;
    solved.value = true;
    options.onSolved?.(cur.value!);
  }

  function pick(word: string) {
    if (lock.value || !cur.value) return;
    // 点底部单词 → 放到槽里
    bank.value = bank.value.filter((w) => w !== word);
    slots.value.push(word);
    void checkComplete();
  }

  function takeBack(i: number) {
    if (lock.value) return;
    const w = slots.value[i];
    slots.value = slots.value.filter((_, idx) => idx !== i);
    bank.value.push(w);
  }

  /** 进入下一句；最后一句返回 true（组件据此 emit done） */
  function next(): boolean {
    solved.value = false;
    if (sentenceIdx.value + 1 >= total.value) return true;
    sentenceIdx.value++;
    buildSentence();
    return false;
  }

  return {
    sentenceIdx,
    bank,
    slots,
    lock,
    solved,
    wrongCount,
    total,
    cur,
    targetWords,
    stars,
    emptyCount,
    pick,
    takeBack,
    next,
  };
}
