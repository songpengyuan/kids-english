/**
 * 奥特曼卡片收集系统
 *
 * 通关课程 → 随机获得一张卡片（N/R/SR/SSR 稀有度概率）
 * 同一张卡可重复获得（用于展示收集进度）
 */
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export type Rarity = "N" | "R" | "SR" | "SSR";

export interface Card {
  id: string;
  name: string;
  rarity: Rarity;
  emoji: string;
}

/** 奥特曼角色池（MVP 先用 emoji，后面换图） */
const CARD_POOL: Card[] = [
  { id: "ultraman-tiga", name: "迪迦奥特曼", rarity: "N", emoji: "🟡" },
  { id: "ultraman-zero", name: "赛罗奥特曼", rarity: "R", emoji: "🔵" },
  { id: "ultraman-orb", name: "欧布奥特曼", rarity: "R", emoji: "🟢" },
  { id: "ultraman-geed", name: "捷德奥特曼", rarity: "SR", emoji: "🟣" },
  { id: "ultraman-taiga", name: "泰迦奥特曼", rarity: "SR", emoji: "🟠" },
  { id: "ultraman-regulos", name: "雷古洛思", rarity: "SSR", emoji: "✨" },
  { id: "ultraman-decker", name: "德凯奥特曼", rarity: "N", emoji: "🟡" },
  { id: "ultraman-trigger", name: "特利迦", rarity: "R", emoji: "🔵" },
  { id: "ultraman-z", name: "泽塔奥特曼", rarity: "SR", emoji: "🟣" },
  { id: "ultraman-belial", name: "贝利亚", rarity: "SSR", emoji: "✨" }
];

/** 稀有度概率 */
const RARITY_WEIGHT: Record<Rarity, number> = {
  N: 50,
  R: 30,
  SR: 15,
  SSR: 5
};

function drawRarity(): Rarity {
  const total = Object.values(RARITY_WEIGHT).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [rarity, weight] of Object.entries(RARITY_WEIGHT)) {
    r -= weight;
    if (r <= 0) return rarity as Rarity;
  }
  return "N";
}

export function drawCard(): Card {
  const rarity = drawRarity();
  const pool = CARD_POOL.filter((c) => c.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

const KEY = "kids-cards";

export const useCardsStore = defineStore("cards", () => {
  /** 已收集卡片 id 列表（含重复次数） */
  const owned = ref<Record<string, number>>(
    JSON.parse(localStorage.getItem(KEY) || "{}")
  );

  /** 最近抽到的卡（用于结算页展示） */
  const lastCard = ref<Card | null>(null);

  /** 新增一张卡片，返回获得的卡 */
  function collect(): Card {
    const card = drawCard();
    owned.value[card.id] = (owned.value[card.id] ?? 0) + 1;
    lastCard.value = card;
    localStorage.setItem(KEY, JSON.stringify(owned.value));
    return card;
  }

  /** 收集到的不重复卡片数 */
  const uniqueCount = computed(() => Object.keys(owned.value).length);
  /** 总收集数（含重复） */
  const totalCount = computed(() =>
    Object.values(owned.value).reduce((a, b) => a + b, 0)
  );
  /** 全部卡片 */
  const allCards = computed(() => CARD_POOL);

  return { owned, lastCard, collect, uniqueCount, totalCount, allCards };
});
