/**
 * 连一连（match）的会话逻辑：分组/棋盘列布局/配对判定/记分——与手势、DOM 测量解耦。
 *
 * 抽出来的原因：MatchView（948 行）script 里状态机、音效、进度 store、DOM 测量
 * 一锅炖；手势的多指隔离是易碎逻辑留在组件里，纯逻辑下沉到这（参照 useQuizSession
 * 的健康样本，可单测）。棋盘测量/连线端点也留组件（依赖元素引用）。
 *
 * 颜色配对（l11）：colorPairs 传入时切到"颜色圆 ↔ 动物图"模式——左列是颜色伪卡
 * （id = `c-<wordId>`，matchId 指回动物 id），分组只取参与配对的词。
 */
import { computed, reactive, ref, watch, type Ref } from "vue";
import { buildMatchGroups, matchGroupRange, matchStars } from "../utils/matchBoard";
import { shuffleWith } from "../utils/quizSession";

export interface MatchWord {
  id: string;
  en: string;
  lessonId: string;
  /** 颜色配对模式下，颜色伪卡通过 matchId 指回动物 id */
  matchId?: string;
  color?: string | null;
}
export interface MatchColorPair {
  color: string;
  wordId: string;
}

export interface UseMatchSessionOptions {
  /** 配对成功（组件里配音效/朗读/记词） */
  onMatched?: (w: MatchWord) => void;
  /** 配对失败（组件里标红两侧卡片 + 记错词）；a 是先按下的那张 */
  onWrong?: (a: { id: string; side: "img" | "word" }, b: { id: string; side: "img" | "word" }) => void;
}

export function useMatchSession(
  words: Ref<MatchWord[]>,
  colorPairs: Ref<MatchColorPair[] | null>,
  isNarrow: Ref<boolean>,
  sizeTier: Ref<string>,
  options: UseMatchSessionOptions = {}
) {
  /** 颜色配对模式：左列颜色圆 ↔ 右列动物图（l11 Brown Bear） */
  const colorMode = computed(() => Array.isArray(colorPairs.value) && colorPairs.value.length > 0);

  /** 分组与星级口径见 utils/matchBoard（分组随屏幕大小变化，规则可单测）。
   *  ⚠️ 分组必须**只在这些输入真变时重算**：buildMatchGroups 内含随机洗牌，
   *  若用 computed，任何无关重渲染都可能触发重算 → 游戏途中棋盘重洗、进度清零。 */
  const groupRange = computed(() => matchGroupRange(isNarrow.value, sizeTier.value));
  /** colorMode 时只对"有颜色配对的动物词"分组，其余词不参与 */
  const pairedWords = computed(() => {
    if (!colorMode.value) return words.value;
    const ids = new Set(colorPairs.value!.map((p) => p.wordId));
    return words.value.filter((w) => ids.has(w.id));
  });
  const groupKey = computed(
    () => pairedWords.value.map((w) => w.id).join("|") + `@${groupRange.value.min}-${groupRange.value.max}`
  );
  const groups = ref(buildMatchGroups(pairedWords.value, groupRange.value));
  const groupIdx = ref(0);
  watch(groupKey, () => {
    groups.value = buildMatchGroups(pairedWords.value, groupRange.value);
    groupIdx.value = 0;
  });

  /** colorMode：wordId → color（色值单源是课时数据的 word.color） */
  function colorOf(wordId: string): string | null {
    return colorPairs.value?.find((p) => p.wordId === wordId)?.color ?? null;
  }

  const curGroup = computed(() => groups.value[groupIdx.value] || []);
  const groupCount = computed(() => groups.value.length);
  const totalPairs = computed(() => curGroup.value.length);

  const matched = reactive(new Set<string>()); // 当前组已配对 id
  const matchFrom = reactive<Record<string, "img" | "word">>({}); // id → 该配对的起点侧（决定连线方向）
  /** colorMode：配对对互查（c-bird ↔ bird），两端都在图片列里 */
  const pairMap = reactive<Record<string, string>>({});
  const wrongCount = ref(0); // 跨组累计，用于评分

  /** 已配对**对数**：普通模式同一词的图/词格共用一个 id（Set 去重后即对数）；
   *  colorMode 一对是两个 id（c-duck 色圆 + duck 动物），Set 尺寸是对数的 2 倍——
   *  必须除回来。曾经直接拿 size 当对数，颜色模式配到一半（2 对 = 4 席 ≥ 组阈值）
   *  就误判整组完成、提前进下一组（2026-10-25 用户实测反馈）。 */
  const doneCount = computed(() => (colorMode.value ? matched.size / 2 : matched.size));
  const groupDone = computed(() => totalPairs.value > 0 && doneCount.value >= totalPairs.value);
  /** 头部计数（StageHead 的 rightText）：多组带组号，单组只显示配对进度 */
  const counterText = computed(() =>
    groupCount.value > 1
      ? `第 ${groupIdx.value + 1} / ${groupCount.value} 组 · ${doneCount.value}/${totalPairs.value}`
      : `${doneCount.value} / ${totalPairs.value}`
  );
  const stars = computed(() => matchStars(wrongCount.value));

  /* ---------- 棋盘列布局（组内洗牌后分列） ---------- */
  const leftImgs = ref<MatchWord[]>([]); // 左列图片（colorMode 时是颜色伪卡）
  const rightImgs = ref<MatchWord[]>([]); // 右列图片（colorMode 时是动物图）
  const midWords = ref<MatchWord[]>([]); // 中间单词列（colorMode 无）

  /** 组重置：清配对状态 + 按模式摆列。坐标表/元素表的清空留在组件（那是 DOM 的事） */
  function setupGroup(g: MatchWord[]) {
    matched.clear();
    Object.keys(matchFrom).forEach((k) => delete matchFrom[k]);
    Object.keys(pairMap).forEach((k) => delete pairMap[k]);
    if (colorMode.value) {
      // 颜色配对：左列颜色圆（伪对象），右列动物图，无中间单词列
      const shuffled = shuffleWith(g);
      leftImgs.value = shuffled.map((w) => ({
        id: `c-${w.id}`, en: colorOf(w.id) ?? "", matchId: w.id,
        color: colorOf(w.id), lessonId: w.lessonId,
      }));
      rightImgs.value = shuffled;
      midWords.value = [];
    } else {
      // 两列布局：左列全部图片，右列全部单词/声音（中间连线空间更大）
      leftImgs.value = shuffleWith(g);
      rightImgs.value = [];
      midWords.value = shuffleWith(g);
    }
  }

  /**
   * 配对判定。first/from = 先按下的卡与所在侧（连线起点），other/otherSide = 第二张。
   * 正确：双方入 matched、记录方向与配对对、回调 onMatched；错误：计数 + 回调 onWrong。
   */
  function tryMatch(
    first: MatchWord,
    from: "img" | "word",
    other: MatchWord,
    otherSide: "img" | "word"
  ) {
    if (!first) return;
    // colorMode 时颜色圆.matchId === 动物.id；普通模式 first.id === other.id
    const firstKey = first.matchId || first.id;
    const otherKey = other.matchId || other.id;
    if (firstKey === otherKey) {
      matched.add(first.id);
      matched.add(other.id);
      matchFrom[first.id] = from;
      pairMap[first.id] = other.id;
      pairMap[other.id] = first.id;
      options.onMatched?.(other);
    } else {
      wrongCount.value++;
      options.onWrong?.({ id: first.id, side: from }, { id: other.id, side: otherSide });
    }
  }

  return {
    colorMode,
    colorOf,
    groups,
    groupIdx,
    groupCount,
    curGroup,
    totalPairs,
    matched,
    matchFrom,
    pairMap,
    wrongCount,
    doneCount,
    groupDone,
    counterText,
    stars,
    leftImgs,
    rightImgs,
    midWords,
    setupGroup,
    tryMatch,
  };
}
