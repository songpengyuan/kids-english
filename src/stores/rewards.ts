/**
 * 奖励 store（贝壳 + 贴纸收藏）——Pinia + TS，localStorage 独立键存储。
 *
 * - 独立于进度键 kids-english-progress-v1（历史键名禁止改动，此处另开新键）。
 * - 为"游戏模式"预留：贝壳 = 通用货币，贴纸 = 收藏图鉴。
 * - 奖励发放入口统一走 grant()，组件不直接改 state，保证数据流单向。
 *
 * 说明：从 src/store/rewards.js 迁移而来（存储键与行为完全一致），统一进 Pinia。
 */
import { defineStore } from "pinia";
import { ref } from "vue";

/** 贴纸池：第一版用课程主题 emoji（水手/音乐/海洋/颜色），后续可替换成 SVG 贴纸图鉴 */
export const stickerPool = ["🐙", "🐬", "⭐", "🎺", "🎵", "🌊", "🚢", "🦀", "🌈", "🦄"];

/** 贴纸总数（图鉴进度展示用） */
export const stickerTotal = stickerPool.length;

/** 一次开箱的结果 */
export interface ChestRoll {
  shells: number;
  sticker: string | null;
}

const KEY = "kids-english-rewards-v1";

function load(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export const useRewardsStore = defineStore("rewards", () => {
  const saved = load();
  /** 贝壳数（通用货币） */
  const shells = ref<number>(Number(saved.shells) || 0);
  /** 已收集贴纸（emoji 列表，去重） */
  const stickers = ref<string[]>(Array.isArray(saved.stickers) ? (saved.stickers as string[]) : []);
  /** 累计开箱次数 */
  const chestsOpened = ref<number>(Number(saved.chestsOpened) || 0);

  /** 随机整数 [min, max] */
  function randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function save() {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ shells: shells.value, stickers: stickers.value, chestsOpened: chestsOpened.value })
      );
    } catch {
      /* 无痕模式写入失败，忽略 */
    }
  }

  /**
   * 开箱结果：固定给贝壳，贴纸从池里抽一张"还没收集"的；
   * 全收集完就不再出贴纸（只给贝壳）。
   */
  function rollChest(): ChestRoll {
    const s = randInt(3, 6);
    let sticker: string | null = null;
    if (stickers.value.length < stickerPool.length) {
      const missing = stickerPool.filter((x) => !stickers.value.includes(x));
      sticker = missing[randInt(0, missing.length - 1)];
    }
    return { shells: s, sticker };
  }

  /** 发放奖励（幂等：贴纸去重，重复开出的同款贴纸只算一次） */
  function grant(roll: ChestRoll) {
    shells.value += roll.shells;
    if (roll.sticker && !stickers.value.includes(roll.sticker)) {
      stickers.value.push(roll.sticker);
    }
    chestsOpened.value += 1;
    save();
  }

  /** 当前是否集齐全部贴纸 */
  function allStickers(): boolean {
    return stickers.value.length >= stickerPool.length;
  }

  return { shells, stickers, chestsOpened, rollChest, grant, allStickers };
});
