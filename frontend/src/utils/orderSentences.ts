/**
 * 拼句子（order）题目句生成器：按本课单词产出 2–4 词的亲子式陈述句。
 *
 * 背景（2026-10-26 用户反馈「拼句子太难，要类似亲子口语里的简单句」）：
 * 旧实现直接把 `phrases.en`（教材童谣整句）逐词排序——l12 是 9 词长歌词、
 * 还含特殊疑问句，对约 5 岁孩子过难。这里改为「一词一句」的短陈述句，句型与
 * 亲子对话（TalkView）同一难度档：
 *   颜色 It's X. ｜ 动词 I can X. ｜ 形容词 I'm X.
 *   复数 I see X. ｜ 不可数 I see the X. ｜ 单数可数 It's a/an X.
 * 不产出问句、不产出 5 词以上长句。
 *
 * 纯函数、不依赖 Vue，便于单测；`useOrderSession` 仍是通用排序状态机，
 * 本文件只负责「给它喂什么题」，不改动排序/星级契约。
 */
import type { Lesson, Word } from "../data/lessons";

export interface OrderSentence {
  en: string;
  /** OrderView 当前不渲染中文；留空串保持 OrderPhrase 形状，后续若展示再补 */
  zh: string;
}

/** 幼儿可排序的句长区间（词数） */
const MIN_WORDS = 2;
const MAX_WORDS = 4;

/** 动作词：用 I can X.（避免把 listen 名词化成 It's a listen.） */
const VERBS = new Set(["listen", "look", "run", "jump", "sing", "dance", "clap", "point", "wave", "walk"]);
/** 形容词（颜色词由上方颜色分支优先接住）：用 I'm X. */
const ADJECTIVES = new Set(["afraid", "happy", "sad", "big", "small", "tall", "hot", "cold"]);
/** 颜色形容词：无 color 字段、未归 colors 组时也能识别（如 l4 的 blue） */
const COLOR_ADJECTIVES = new Set([
  "blue", "red", "green", "yellow", "brown", "black", "white",
  "pink", "purple", "orange", "gray", "grey", "gold", "silver",
]);
/** 不可数 / 集合名词：用 I see the X. */
const UNCOUNTABLE = new Set(["sea", "jungle", "water", "milk", "bread", "rain"]);
/**
 * 复数名词白名单 + ies 规则。
 * 不靠「词尾 s」猜测（会把 bus / mantis / octopus 误判成复数）；
 * 现有词表封闭，新增复数词时在此补登记即可。
 */
const PLURAL_NOUNS = new Set([
  "wheels", "wipers", "people", "babies", "mommies", "daddies",
  "children", "feet", "teeth", "men", "women", "mice", "geese",
]);

function wordCount(en: string): number {
  return en.replace(/[?.!,“”"]/g, "").trim().split(/\s+/).filter(Boolean).length;
}

function isPluralNoun(w: Word): boolean {
  const low = w.en.toLowerCase();
  return PLURAL_NOUNS.has(low) || low.endsWith("ies");
}

function startsWithVowel(en: string): boolean {
  return /^[aeiou]/i.test(en);
}

/** 单个单词 → 一句亲子短句；无法安全造句时返回 null（调用方跳过） */
function sentenceForWord(w: Word): string | null {
  const en = w.en.trim();
  if (!en || en.includes(" ")) return null; // 多词头衔（如 Music Man）不硬造冠词句
  const low = en.toLowerCase();

  if (w.color || w.group === "colors" || COLOR_ADJECTIVES.has(low)) return `It's ${en}.`;
  if (VERBS.has(low)) return `I can ${en}.`;
  if (ADJECTIVES.has(low)) return `I'm ${en}.`;
  if (UNCOUNTABLE.has(low)) return `I see the ${en}.`;
  if (isPluralNoun(w)) return `I see ${en}.`;
  return startsWithVowel(en) ? `It's an ${en}.` : `It's a ${en}.`;
}

/**
 * 生成一课的拼句子题目。
 * 主路径：遍历词表逐词造句；去重、过滤句长与问句。
 * 兜底：词表生成不足时，从教材 phrases 里捞 ≤4 词、非问句的陈述句保底，避免白屏无题。
 */
export function orderSentences(
  lesson: Pick<Lesson, "words" | "phrases">
): OrderSentence[] {
  const out: OrderSentence[] = [];
  const seen = new Set<string>();

  const push = (en: string) => {
    const key = en.toLowerCase();
    if (seen.has(key)) return;
    if (en.includes("?")) return;
    const n = wordCount(en);
    if (n < MIN_WORDS || n > MAX_WORDS) return;
    seen.add(key);
    out.push({ en, zh: "" });
  };

  for (const w of lesson.words || []) {
    const s = sentenceForWord(w);
    if (s) push(s);
  }

  if (out.length === 0) {
    for (const p of lesson.phrases || []) push(p.en);
  }

  return out;
}
