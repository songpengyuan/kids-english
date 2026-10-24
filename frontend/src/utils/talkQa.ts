/**
 * 亲子对话按词选问答（TalkView 用）。
 *
 * 过去把 phrases[0] 当全课固定问句、答句按问句类型套模板，词性多样的课上会
 * 产出错误英文：l11 动物词落到颜色模板（"It's duck." 缺冠词，且动物图配着
 * 「What color is it?」的问句——数据里现成的 "What animal is it?" 没用上）；
 * l9 的 nose/finger 命中祈使句 "Put it on your nose."；问句里的示例词
 * （"Where is your finger?"）也从不跟词走。这里改成逐词选问答：
 *
 *  1. 精确匹配：答句 phrase 含该词（限孩子口吻：含 my/me/I/it's 等第一人称
 *     标记，祈使句 "Put it on your nose." 被排除）；问句取该答句**前面最近的
 *     一个问句**（l11 bear → "What animal is it?"）；
 *  2. 填空模板：答句以 "..." 结尾（l4 "I see a ..."）→ 填入本词；
 *  3. 同组替换：词带 group 且课配 wordGroups → 找含同组其他词的答句，把那个
 *     词换成本词（l11 duck → "It's a bear." → "It's a duck."，冠词天然正确；
 *     red → "It's brown." → "It's red."）；
 *  4. 问句类型模板兜底（与旧逻辑一致的分支）；
 *  5. 最后兜底：只说词本身（永远成立，ASR 目标也是它）。
 *
 * 问句里的示例词按词边界替换成本轮词（l9 "Where is your finger?" 第 2 轮
 * 变成 "Where is your nose?"），问句才和图对得上。
 */
import type { Lesson, Phrase, Word } from "../data/lessons";

export interface TalkQa {
  /** 家长问句（本轮；可能为空串 = 数据里没有问句） */
  q: string;
  /** 孩子答句（本轮） */
  a: string;
}

/** 孩子口吻的陈述句标记：答句必须是"孩子说自己"的话，祈使句/指令不算 */
const FIRST_PERSON = /\b(my|me|i|i'm|it's|its)\b/i;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 按词边界包含（大小写不敏感） */
function hasWord(haystack: string, needle: string): boolean {
  return new RegExp(`\\b${escapeRe(needle)}\\b`, "i").test(haystack);
}

/** 把 text 里的 sample 词换成本轮词（大小写不敏感定位，替换成 word.en 原样） */
function swapWord(text: string, sample: string, word: string): string {
  return text.replace(new RegExp(`\\b${escapeRe(sample)}\\b`, "i"), word);
}

function isQuestion(p: Phrase): boolean {
  return p.en.includes("?");
}

/** 孩子口吻的答句候选（非问句 + 第一人称标记） */
function answerable(phrases: Phrase[]): Phrase[] {
  return phrases.filter((p) => !isQuestion(p) && FIRST_PERSON.test(p.en));
}

/**
 * 问句里的示例词 → 本轮词（l9："Where is your finger?" 对 nose 这一轮
 * 换成 "Where is your nose?"）。只换第一个命中的课内示例词。
 */
function withSampleSwapped(question: string, words: Word[], word: Word): string {
  for (const w of words) {
    if (w.en.toLowerCase() === word.en.toLowerCase()) continue;
    if (hasWord(question, w.en)) return swapWord(question, w.en, word.en);
  }
  return question;
}

/** 答句对应的问句：取它前面最近的一个问句；没有则取全课第一个问句 */
function pairedQuestion(
  phrases: Phrase[],
  answerIdx: number,
  words: Word[],
  word: Word
): string {
  for (let i = answerIdx - 1; i >= 0; i--) {
    if (isQuestion(phrases[i])) return withSampleSwapped(phrases[i].en, words, word);
  }
  const first = phrases.find(isQuestion);
  return first ? withSampleSwapped(first.en, words, word) : "";
}

/** 问句类型模板兜底（与旧 answerText 的分支一致） */
function templateAnswer(question: string, word: Word): string {
  if (question.includes("What can you play")) return `I can play the ${word.en}.`;
  if (question.includes("What color")) return `It's ${word.en}.`;
  if (question.includes("What letter")) return `It's letter ${word.en.toUpperCase()}.`;
  if (question.includes("How many")) return `${word.en}.`;
  if (question.includes("Where is your")) return `This is my ${word.en}.`;
  if (question.includes("What do you see")) return `I see the ${word.en}.`;
  if (question.includes("What's that")) return `It's a ${word.en}.`;
  return word.en;
}

/** 按词选本轮问答，规则见文件头 */
export function talkQa(
  word: Word,
  lesson: Pick<Lesson, "phrases" | "words" | "wordGroups">
): TalkQa {
  const phrases = lesson.phrases ?? [];
  const words = lesson.words ?? [];
  const answers = answerable(phrases);
  const en = word.en.toLowerCase().trim();

  // 1) 精确匹配：现成答句含本词
  const hitIdx = answers.findIndex((p) => hasWord(p.en.toLowerCase(), en));
  if (hitIdx >= 0) {
    const idx = phrases.indexOf(answers[hitIdx]);
    return { q: pairedQuestion(phrases, idx, words, word), a: answers[hitIdx].en };
  }

  // 2) 填空模板："I see a ..." → "I see a seahorse."
  //（数据里 "..." 往往连句尾标点一起省略，填完补上句号）
  const clozeIdx = answers.findIndex((p) => p.en.includes("..."));
  if (clozeIdx >= 0) {
    const p = answers[clozeIdx];
    const idx = phrases.indexOf(p);
    const filled = p.en.replace("...", word.en);
    return {
      q: pairedQuestion(phrases, idx, words, word),
      a: /[.!?]$/.test(filled) ? filled : `${filled}.`,
    };
  }

  // 3) 同组替换：把答句里的同组示例词换成本词
  if (word.group) {
    const peers = words.filter((w) => w.group === word.group && w.id !== word.id);
    for (const p of answers) {
      const peer = peers.find((w) => hasWord(p.en, w.en));
      if (peer) {
        const idx = phrases.indexOf(p);
        return {
          q: pairedQuestion(phrases, idx, words, word),
          a: swapWord(p.en, peer.en, word.en),
        };
      }
    }
  }

  // 4) 按问句类型套模板
  const question = phrases.find(isQuestion);
  const q = question ? withSampleSwapped(question.en, words, word) : "";
  return { q, a: templateAnswer(q, word) };
}
