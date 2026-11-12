import { asset, type Word } from "../data/lessons";

/**
 * 亲子口语句子的配图规则。
 *
 * 优先级：
 *  1. 句子里出现本课具体名词（动物/乐器/身体部位/公交部件）→ 直接用已有词图，
 *     图和词同源，孩子一眼能把句子和词对上；
 *  2. 纯提问/抽象句 → 用一组通用 3D 拟物对话图（问号、望远镜、音符…），
 *     风格与课程封面、单词图一致，不依赖操作系统 emoji。
 *
 * 返回 null 时播放器仍落到原来的对话气泡占位。
 */
const PHRASE_COVERS = {
  ask: asset("/phrases/ask.webp"),
  look: asset("/phrases/look.webp"),
  play: asset("/phrases/play.webp"),
  brave: asset("/phrases/brave.webp"),
  night: asset("/phrases/night.webp"),
  zoo: asset("/phrases/zoo.webp"),
  wave: asset("/phrases/wave.webp"),
  color: asset("/covers/1f3a8.webp"),
} as const;

type CoverKey = keyof typeof PHRASE_COVERS;

function cover(key: CoverKey): string | null {
  return PHRASE_COVERS[key];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 句子里是否以独立单词出现（避免 sea 命中 see） */
function mentionsWord(text: string, word: string): boolean {
  const pattern = new RegExp(`\\b${escapeRegExp(word.trim())}\\b`, "i");
  return pattern.test(text);
}

const COLOR_WORDS = [
  "brown", "red", "yellow", "blue", "green", "orange",
  "pink", "purple", "white", "black",
];

export function phraseCoverUrl(
  en: string,
  words: readonly Pick<Word, "en" | "image">[] = [],
): string | null {
  const text = en.toLowerCase();

  // 情绪/场景句优先于名词匹配：Good night 是月亮，不是大猩猩
  if (/good\s+night/.test(text)) return cover("night");
  if (/not\s+afraid/.test(text)) return cover("brave");

  // 问颜色 / It's brown：颜色词图是平面色块，这里统一用调色盘保持 3D 家族
  if (/what\s+color/.test(text)) return cover("color");
  if (new RegExp(`it'?s\\s+(${COLOR_WORDS.join("|")})\\b`).test(text)) return cover("color");

  // 具体名词：按词长降序，优先匹配 wheels 而不是 bus
  const hit = [...words]
    .filter((word) => word.image)
    .sort((a, b) => b.en.length - a.en.length)
    .find((word) => mentionsWord(text, word.en));
  if (hit?.image) return hit.image;

  if (/can\s+(you\s+)?play/.test(text)) return cover("play");
  if (/see|what'?s\s+that|where\s+is|what\s+animal/.test(text)) return cover("look");
  if (/zoo/.test(text)) return cover("zoo");
  if (/wave\s+goodbye/.test(text)) return cover("wave");
  if (/what|who|how|can\s+you\s+do/.test(text)) return cover("ask");

  return null;
}
