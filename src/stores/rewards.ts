/**
 * 奖励 store（贝壳 + 英雄图鉴）—— Pinia + TS，localStorage 独立键存储。
 *
 * 玩法闭环：
 *   完成玩法 → 开宝箱 → 得贝壳（3~6）→ 攒够贝壳去"英雄图鉴"兑换形态
 *   开箱另有 25% 概率直接掉一个**还没收集的形态**（惊喜感，不用等攒够）
 *
 * 形态可以**升级**：重复兑换同一形态 +1★（上限 3★），给贝壳一个长期去处，
 * 也避免"集齐了就没有目标"（旧贴纸体系的问题）。
 *
 * 存储键 kids-english-rewards-v1 保持不变（历史键名禁止改动）。
 * 老数据（sticksers 贴纸）在 load() 时按原价折算成贝壳，不让孩子白攒。
 */
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { ALL_FORMS, FORM_TOTAL, formById, type FlatForm } from "../data/heroes";

/** 形态最高星级 */
export const MAX_FORM_STARS = 3;
/** 旧贴纸的回收价（贝壳）：按当年售价折算，老数据不亏 */
export const LEGACY_STICKER_REFUND = 20;
/** 开箱直接掉落未收集形态的概率 */
export const CHEST_FORM_CHANCE = 0.25;

/** 一次开箱的结果 */
export interface ChestRoll {
  shells: number;
  /** 掉落的形态 id（没掉到就是 null） */
  formId: string | null;
  /** 掉到的形态是不是新的（用于"新形态登场"高光） */
  isNew: boolean;
}

const KEY = "kids-english-rewards-v1";

interface SavedState {
  shells?: number;
  /** 形态 → 星级（1..3） */
  forms?: Record<string, number>;
  chestsOpened?: number;
  /** 老数据：emoji 贴纸（迁移后不再写入） */
  stickers?: string[];
}

function load(): SavedState {
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
  /** 已收集形态：id → 星级（1..3） */
  const forms = ref<Record<string, number>>(
    saved.forms && typeof saved.forms === "object" ? { ...saved.forms } : {}
  );
  /** 累计开箱次数 */
  const chestsOpened = ref<number>(Number(saved.chestsOpened) || 0);

  /* ---------- 老数据迁移：emoji 贴纸 → 贝壳 ---------- */
  const legacyStickers = Array.isArray(saved.stickers) ? saved.stickers : [];
  if (legacyStickers.length > 0) {
    shells.value += legacyStickers.length * LEGACY_STICKER_REFUND;
  }

  /** 随机整数 [min, max] */
  function randInt(min: number, max: number, rng: () => number): number {
    return Math.floor(rng() * (max - min + 1)) + min;
  }

  function save() {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ shells: shells.value, forms: forms.value, chestsOpened: chestsOpened.value })
      );
    } catch {
      /* 无痕模式写入失败，忽略 */
    }
  }
  // 迁移结果要落盘（否则每次启动都重复折算）
  if (legacyStickers.length > 0) save();

  /** 该形态星级（0 = 还没收集） */
  function starsOf(formId: string): number {
    return forms.value[formId] || 0;
  }
  function isOwned(formId: string): boolean {
    return starsOf(formId) > 0;
  }
  const ownedCount = computed(
    () => Object.values(forms.value).filter((n) => n > 0).length
  );
  /** 是否已集齐全部形态 */
  function allOwned(): boolean {
    return ownedCount.value >= FORM_TOTAL;
  }
  /** 图鉴完成度（0..100） */
  const albumPct = computed(() =>
    FORM_TOTAL ? Math.round((ownedCount.value / FORM_TOTAL) * 100) : 0
  );
  const totalStars = computed(() =>
    Object.values(forms.value).reduce((sum, n) => sum + Math.min(MAX_FORM_STARS, n || 0), 0)
  );

  /**
   * 开箱：固定给贝壳，另有 CHEST_FORM_CHANCE 概率掉形态。
   * 优先掉"还没收集"的；全收集后改为给随机已收集形态升星（满了就不再掉）。
   */
  function rollChest(rng: () => number = Math.random): ChestRoll {
    const shellsWon = randInt(3, 6, rng);
    let formId: string | null = null;
    let isNew = false;
    if (rng() < CHEST_FORM_CHANCE) {
      const missing = ALL_FORMS.filter((f) => !isOwned(f.id));
      if (missing.length > 0) {
        const picked = missing[randInt(0, missing.length - 1, rng)];
        formId = picked.id;
        isNew = true;
      } else {
        const upgradable = ALL_FORMS.filter((f) => starsOf(f.id) < MAX_FORM_STARS);
        if (upgradable.length > 0) {
          formId = upgradable[randInt(0, upgradable.length - 1, rng)].id;
        }
      }
    }
    return { shells: shellsWon, formId, isNew };
  }

  /** 发放奖励（贴纸时代的 grant 语义保留：只加不减） */
  function grant(roll: ChestRoll) {
    shells.value += roll.shells;
    if (roll.formId) {
      const cur = starsOf(roll.formId);
      forms.value[roll.formId] = Math.min(MAX_FORM_STARS, cur + 1);
    }
    chestsOpened.value += 1;
    save();
  }

  /**
   * 兑换 / 升级一个形态（贝壳消费出口）。
   * - 没收集过 → 解锁（"bought"）
   * - 已收集但没满星 → 升一星（"upgraded"）
   * - 已满星 / 贝壳不够 / id 非法 → 不改任何状态
   */
  function buyForm(formId: string): "bought" | "upgraded" | "maxed" | "poor" | "invalid" {
    const form: FlatForm | null = formById(formId);
    if (!form) return "invalid";
    const cur = starsOf(formId);
    if (cur >= MAX_FORM_STARS) return "maxed";
    if (shells.value < form.price) return "poor";
    shells.value -= form.price;
    forms.value[formId] = cur + 1;
    save();
    return cur === 0 ? "bought" : "upgraded";
  }

  function reset() {
    shells.value = 0;
    forms.value = {};
    chestsOpened.value = 0;
    localStorage.removeItem(KEY);
  }

  return {
    shells,
    forms,
    chestsOpened,
    ownedCount,
    albumPct,
    totalStars,
    starsOf,
    isOwned,
    allOwned,
    rollChest,
    grant,
    buyForm,
    reset,
  };
});
