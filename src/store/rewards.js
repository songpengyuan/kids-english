/**
 * 奖励系统（贝壳 + 贴纸收藏）——localStorage 独立键存储。
 *
 * - 独立于进度键 kids-english-progress-v1（历史键名禁止改动，此处另开新键）。
 * - 为后续"游戏模式"预留：贝壳 = 通用货币，贴纸 = 收藏图鉴；
 *   游戏模式上线时直接复用同一 store，无需迁移。
 * - 奖励发放入口统一走 grant()，组件不直接改 state，保证数据流单向。
 */
import { reactive } from "vue";

const KEY = "kids-english-rewards-v1";

/** 贴纸池：第一版用课程主题 emoji（水手/音乐/海洋/颜色），后续可替换成 SVG 贴纸图鉴 */
export const stickerPool = ["🐙", "🐬", "⭐", "🎺", "🎵", "🌊", "🚢", "🦀", "🌈", "🦄"];

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

const saved = load();

const state = reactive({
  /** 贝壳数（通用货币） */
  shells: Number(saved.shells) || 0,
  /** 已收集贴纸（emoji 列表，去重） */
  stickers: Array.isArray(saved.stickers) ? saved.stickers : [],
  /** 累计开箱次数 */
  chestsOpened: Number(saved.chestsOpened) || 0
});

/** 随机整数 [min, max] */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 开箱结果：固定给贝壳，贴纸从池里抽一张"还没收集"的；
 * 全收集完就不再出贴纸（只给贝壳）。
 * @returns {{ shells: number, sticker: string|null }}
 */
export function rollChest() {
  const shells = randInt(3, 6);
  let sticker = null;
  if (state.stickers.length < stickerPool.length) {
    // 从未收集的贴纸里随机挑一张（避免重复）
    const missing = stickerPool.filter((s) => !state.stickers.includes(s));
    sticker = missing[randInt(0, missing.length - 1)];
  }
  return { shells, sticker };
}

/** 发放奖励（幂等：贴纸去重，重复开出的同款贴纸只算一次） */
export function grant(roll) {
  state.shells += roll.shells;
  if (roll.sticker && !state.stickers.includes(roll.sticker)) {
    state.stickers.push(roll.sticker);
  }
  state.chestsOpened += 1;
  save();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ shells: state.shells, stickers: state.stickers, chestsOpened: state.chestsOpened }));
  } catch {
    /* 无痕模式写入失败，忽略 */
  }
}

/** 贴纸总数（用于图鉴进度展示） */
export const stickerTotal = stickerPool.length;

/** 当前是否集齐全部贴纸 */
export function allStickers() {
  return state.stickers.length >= stickerPool.length;
}

export default state;
