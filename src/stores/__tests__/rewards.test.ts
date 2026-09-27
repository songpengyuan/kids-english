// @vitest-environment jsdom
/**
 * 奖励 store 测试（贝壳 → 英雄形态）：
 * 兑换/升级/满级、开箱掉落、全收集后的行为、老贴纸数据折算、持久化读回。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { CHEST_FORM_CHANCE, LEGACY_STICKER_REFUND, MAX_FORM_STARS, useRewardsStore } from "../rewards";
import { ALL_FORMS, FORM_TOTAL } from "../../data/heroes";

const KEY = "kids-english-rewards-v1";

/** 可控随机序列（按次返回），用于断言开箱结果 */
function seq(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("rewards store · 兑换与升级", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("初始：没有贝壳也没有形态", () => {
    const r = useRewardsStore();
    expect(r.shells).toBe(0);
    expect(r.ownedCount).toBe(0);
    expect(r.albumPct).toBe(0);
  });

  it("贝壳不够 → poor，且不改任何状态", () => {
    const r = useRewardsStore();
    expect(r.buyForm("tiga-multi")).toBe("poor");
    expect(r.shells).toBe(0);
    expect(r.isOwned("tiga-multi")).toBe(false);
  });

  it("兑换 → 1★ 并扣款；重复兑换 → 升级；到 3★ → maxed 且不再扣款", () => {
    const r = useRewardsStore();
    r.grant({ shells: 200, formId: null, isNew: false });
    const price = ALL_FORMS.find((f) => f.id === "tiga-multi")!.price;
    expect(r.buyForm("tiga-multi")).toBe("bought");
    expect(r.starsOf("tiga-multi")).toBe(1);
    expect(r.shells).toBe(200 - price);
    expect(r.buyForm("tiga-multi")).toBe("upgraded");
    expect(r.starsOf("tiga-multi")).toBe(2);
    expect(r.buyForm("tiga-multi")).toBe("upgraded");
    expect(r.starsOf("tiga-multi")).toBe(MAX_FORM_STARS);
    const left = r.shells;
    expect(r.buyForm("tiga-multi")).toBe("maxed");
    expect(r.shells).toBe(left); // 满级后不再扣款
  });

  it("非法形态 id → invalid", () => {
    const r = useRewardsStore();
    r.grant({ shells: 100, formId: null, isNew: false });
    expect(r.buyForm("not-a-form")).toBe("invalid");
    expect(r.shells).toBe(100);
  });

  it("稀有度决定价格：常见 20 / 稀有 60 / 传说 120", () => {
    const r = useRewardsStore();
    r.grant({ shells: 500, formId: null, isNew: false });
    const before = r.shells;
    expect(r.buyForm("tiga-multi")).toBe("bought"); // common
    expect(before - r.shells).toBe(20);
    const b2 = r.shells;
    expect(r.buyForm("tiga-sky")).toBe("bought"); // rare
    expect(b2 - r.shells).toBe(60);
    const b3 = r.shells;
    expect(r.buyForm("z-delta")).toBe("bought"); // legend
    expect(b3 - r.shells).toBe(120);
  });
});

describe("rewards store · 开箱", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("贝壳 3~6；命中掉落时给一个还没收集的形态", () => {
    const r = useRewardsStore();
    // rng 依次：贝壳(0 → 3)、掉落判定(0.1 < 25% 命中)、挑形态(0 → 第一个未收集)
    const roll = r.rollChest(seq([0, 0.1, 0]));
    expect(roll.shells).toBe(3);
    expect(roll.formId).toBe(ALL_FORMS[0].id);
    expect(roll.isNew).toBe(true);
    r.grant(roll);
    expect(r.shells).toBe(3);
    expect(r.starsOf(ALL_FORMS[0].id)).toBe(1);
    expect(r.chestsOpened).toBe(1);
  });

  it("没命中掉落时只给贝壳", () => {
    const r = useRewardsStore();
    // rng 依次：贝壳(0.99 → 6)、掉落判定(超过 25% → 不掉)
    const roll = r.rollChest(seq([0.99, CHEST_FORM_CHANCE + 0.01]));
    expect(roll.shells).toBe(6);
    expect(roll.formId).toBeNull();
  });

  it("集齐全部形态后不再掉新形态，改为给已收集形态升星", () => {
    const r = useRewardsStore();
    for (const f of ALL_FORMS) r.grant({ shells: 0, formId: f.id, isNew: true });
    expect(r.ownedCount).toBe(FORM_TOTAL);
    expect(r.allOwned()).toBe(true);
    expect(r.albumPct).toBe(100);
    const roll = r.rollChest(seq([0, 0.1, 0]));
    expect(roll.isNew).toBe(false);
    expect(roll.formId).not.toBeNull();
  });

  it("形态全部满星后开箱不再掉形态（只给贝壳）", () => {
    const r = useRewardsStore();
    for (let i = 0; i < MAX_FORM_STARS; i++) {
      for (const f of ALL_FORMS) r.grant({ shells: 0, formId: f.id, isNew: i === 0 });
    }
    expect(r.totalStars).toBe(FORM_TOTAL * MAX_FORM_STARS);
    const roll = r.rollChest(seq([0, 0.1, 0]));
    expect(roll.formId).toBeNull();
  });
});

describe("rewards store · 老数据迁移与持久化", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("老的 emoji 贴纸按原价折算成贝壳（不让孩子白攒）", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ shells: 10, stickers: ["🐙", "🐬", "⭐"], chestsOpened: 4 })
    );
    setActivePinia(createPinia());
    const r = useRewardsStore();
    expect(r.shells).toBe(10 + 3 * LEGACY_STICKER_REFUND);
    expect(r.chestsOpened).toBe(4);
    // 迁移结果落盘：再读一次不会重复折算
    setActivePinia(createPinia());
    expect(useRewardsStore().shells).toBe(10 + 3 * LEGACY_STICKER_REFUND);
  });

  it("形态与星级读回（模拟应用重启）", () => {
    const r = useRewardsStore();
    r.grant({ shells: 50, formId: "zero-base", isNew: true });
    setActivePinia(createPinia());
    const r2 = useRewardsStore();
    expect(r2.shells).toBe(50);
    expect(r2.starsOf("zero-base")).toBe(1);
  });

  it("损坏数据按新号处理，不崩溃", () => {
    localStorage.setItem(KEY, "{oops");
    const r = useRewardsStore();
    expect(r.shells).toBe(0);
    expect(r.ownedCount).toBe(0);
  });
});
