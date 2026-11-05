/**
 * 拼句子（order）题目：看图填空。
 *
 * 2026-11-05 起改为「图片填空」（参考孩子的 The Wheels on the Bus 安静书）：
 * 句子框架（It's / I can / I see the …）印死成文字，只把本课实义名词位置留空，
 * 底部放本课词图卡，孩子点正确的图填进去。不再让孩子点文字单词块排序。
 *
 * 难度档与亲子对话一致（一词一句）：
 *   颜色 It's X. ｜ 动词 I can X. ｜ 形容词 I'm X.
 *   复数 I see X. ｜ 不可数 I see the X. ｜ 单数可数 It's a/an X.
 * 不产出问句、不产出 5 词以上长句。X 一定是一个带图的本课实义词（target），
 * before/after 是 X 两侧印出来的框架文字，OrderView 据此渲染空槽。
 *
 * 纯函数、不依赖 Vue，便于单测。
 */
import type { Lesson, Word } from "../data/lessons";

export interface OrderItem {
  /** 完整句（拼对后朗读用），如 "I see the wipers." */
  en: string;
  /** OrderView 当前不渲染中文；留空串 */
  zh: string;
  /** 空槽之前印出来的框架文字，如 "I see the " */
  before: string;
  /** 空槽之后印出来的框架文字，如 "." */
  after: string;
  /** 要填空的目标词（带词图） */
  target: Word;
}

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

function isPluralNoun(w: Word): boolean {
  const low = w.en.toLowerCase();
  return PLURAL_NOUNS.has(low) || low.endsWith("ies");
}

function startsWithVowel(en: string): boolean {
  return /^[aeiou]/i.test(en);
}

/** 单个单词 → 填空框架（before/after）；无法安全造句时返回 null */
function frameForWord(w: Word): { before: string; after: string } | null {
  const en = w.en.trim();
  if (!en || en.includes(" ")) return null; // 多词头衔（如 Music Man）不硬造冠词句
  const low = en.toLowerCase();

  if (w.color || w.group === "colors" || COLOR_ADJECTIVES.has(low)) return { before: "It's ", after: "." };
  if (VERBS.has(low)) return { before: "I can ", after: "." };
  if (ADJECTIVES.has(low)) return { before: "I'm ", after: "." };
  if (UNCOUNTABLE.has(low)) return { before: "I see the ", after: "." };
  if (isPluralNoun(w)) return { before: "I see ", after: "." };
  return startsWithVowel(en) ? { before: "It's an ", after: "." } : { before: "It's a ", after: "." };
}

/**
 * 生成一课的看图填空题目：逐词造句，每道题 = 框架文字 + 一个带图目标词。
 * 图片填空必须有可点的词图，因此只收词表里造得出句、且带图片的词。
 * 词表不足时不再用教材整句兜底（整句没有对应词图，无法做成图卡填空）。
 */
export function orderSentences(
  lesson: Pick<Lesson, "words" | "phrases">
): OrderItem[] {
  const out: OrderItem[] = [];
  const seen = new Set<string>();

  for (const w of lesson.words || []) {
    const f = frameForWord(w);
    if (!f) continue;
    if (!w.image) continue; // 图卡填空必须有图
    const en = f.before + w.en.trim() + f.after;
    const key = en.toLowerCase();
    if (seen.has(key)) continue;
    if (en.includes("?")) continue;
    seen.add(key);
    out.push({ en, zh: "", before: f.before, after: f.after, target: w });
  }

  return out;
}
