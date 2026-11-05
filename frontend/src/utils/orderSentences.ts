/**
 * 拼句子（order）题目：看图填空。
 *
 * 2026-11-05 改为「图片填空」，两套题源：
 *
 * 1) 唱游课专属（The Wheels on the Bus 安静书）：句型固定为
 *      "The [部件] on the bus go [拟声]."
 *    空槽里放部件图（轮子/车门/雨刮/喇叭/乘客/宝宝/妈妈/爸爸），
 *    "on the bus go …" 整段印死；校车 bus 是固定语境，不出题也不当图卡。
 * 2) 其余课通用模板：颜色 It's X. ｜ 动词 I can X. ｜ 形容词 I'm X.
 *    复数 I see X. ｜ 不可数 I see the X. ｜ 单数 It's a/an X.
 *
 * 纯函数、不依赖 Vue，便于单测。
 */
import type { Lesson, Word } from "../data/lessons";

export interface OrderItem {
  /** 完整句（拼对后朗读用），如 "The wheels on the bus go round and round." */
  en: string;
  /** OrderView 当前不渲染中文；留空串 */
  zh: string;
  /** 空槽之前印出来的框架文字，如 "The " */
  before: string;
  /** 空槽之后印出来的框架文字，如 " on the bus go round and round." */
  after: string;
  /** 要填空的目标词（带词图） */
  target: Word;
  /** 本题可选图卡池（已含正确 target）；组件负责洗牌后取前几张 */
  candidates: Word[];
}

/**
 * Wheels on the Bus 安静书：每个部件对应的拟声（实物照里每列最上面那格）。
 * 键 = word.id；只收在这张表里的词才出「The X on the bus go/goes …」题，
 * bus 本身不在表内 → 它是固定语境，不出题也不进图卡池。
 * 动词单复数由部件词决定（door/horn 单数 → goes；wheels/people 等复数 → go），
 * 与儿歌唱法一致（"The horn on the bus goes beep"）。
 */
const BUS_VERSE: Record<string, string> = {
  wheels: "round and round",
  door: "open and shut",
  wipers: "swish, swish, swish",
  horn: "beep, beep, beep",
  people: "up and down",
  babies: "wah, wah, wah",
  mommies: "shh, shh, shh",
  daddies: "shh, shh, shh",
};

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
 * 生成一课的看图填空题目：每道题 = 框架文字 + 一个带图目标词 + 图卡池。
 */
export function orderSentences(
  lesson: Pick<Lesson, "id" | "words" | "phrases">
): OrderItem[] {
  const out: OrderItem[] = [];
  const seen = new Set<string>();
  const words = lesson.words || [];
  const imaged = words.filter((w) => w.image);

  // Wheels on the Bus 安静书：走专属歌词句型 "The [部件] on the bus go/goes [拟声]."
  if (lesson.id === "l12") {
    for (const w of imaged) {
      const ono = BUS_VERSE[w.id];
      if (!ono) continue; // bus 等非映射词不进题
      // 主语单复数决定动词：The wheels … go ｜ The door/horn … goes（与儿歌一致）
      const verb = isPluralNoun(w) ? "go" : "goes";
      const before = "The ";
      const after = ` on the bus ${verb} ${ono}.`;
      const en = before + w.en.trim() + after;
      if (seen.has(en.toLowerCase())) continue;
      seen.add(en.toLowerCase());
      // 图卡池只在部件里选，bus 本身不出现（它是固定语境）
      const candidates = imaged.filter((o) => BUS_VERSE[o.id]);
      out.push({ en, zh: "", before, after, target: w, candidates });
    }
    return out;
  }

  // 其余课：通用封闭模板（It's a X / I see X …）
  for (const w of words) {
    const f = frameForWord(w);
    if (!f) continue;
    if (!w.image) continue;
    const en = f.before + w.en.trim() + f.after;
    const key = en.toLowerCase();
    if (seen.has(key)) continue;
    if (en.includes("?")) continue;
    seen.add(key);
    out.push({ en, zh: "", before: f.before, after: f.after, target: w, candidates: imaged });
  }

  return out;
}
