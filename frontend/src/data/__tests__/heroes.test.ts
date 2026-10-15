/**
 * 英雄图鉴数据自检：结构（角色 → 形态）、id 唯一、价格与稀有度一致、
 * 每个形态都有可回退的占位图、发音介绍文案齐全。
 *
 * 这些断言是"加角色/加形态时不会漏东西"的护栏（漏图/漏英文名/价格写错都会红）。
 */
import { describe, expect, it } from "vitest";
import {
  ALL_FORMS,
  ERA_ORDER,
  FORM_TOTAL,
  HEROES,
  HERO_TOTAL,
  RARITY_INFO,
  formById,
  heroesByEra,
  introOf,
  mixHex,
  rarityByIndex,
} from "../heroes";

describe("英雄图鉴数据", () => {
  it("每个角色至少 1 个形态，且形态合计等于 FORM_TOTAL", () => {
    for (const h of HEROES) expect(h.forms.length).toBeGreaterThan(0);
    expect(HEROES.flatMap((h) => h.forms)).toHaveLength(FORM_TOTAL);
    expect(ALL_FORMS).toHaveLength(FORM_TOTAL);
  });

  it("形态 id 全局唯一（图鉴/掉落/图片文件名都靠它）", () => {
    const ids = ALL_FORMS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("每个形态都有真实的占位图文件（加了形态忘记跑生成脚本会红）", () => {
    // 用 Vite 的 glob 列出 public/heroes 下的占位图（避免引入 node 类型依赖）
    const files = import.meta.glob("../../../public/heroes/*.svg");
    const onDisk = new Set(
      Object.keys(files).map((p) => p.split("/").pop()!.replace(/\.svg$/, ""))
    );
    const missing = ALL_FORMS.filter((f) => !onDisk.has(f.id)).map((f) => f.id);
    expect(missing).toEqual([]);
  });

  it("名录覆盖四个世代，且每个世代都有角色", () => {
    const groups = heroesByEra();
    expect(groups.map((g) => g.era)).toEqual(ERA_ORDER.filter((e) => groups.some((g) => g.era === e)));
    expect(groups).toHaveLength(4);
    for (const g of groups) expect(g.heroes.length).toBeGreaterThan(0);
    expect(HERO_TOTAL).toBe(41);
    expect(FORM_TOTAL).toBe(81);
  });

  it("稀有度按形态顺序自动分级，且主色逐形态微调", () => {
    expect(rarityByIndex(0)).toBe("common");
    expect(rarityByIndex(1)).toBe("rare");
    expect(rarityByIndex(3)).toBe("legend");
    const zero = HEROES.find((h) => h.id === "zero")!;
    expect(zero.forms.map((f) => f.rarity)).toEqual(["common", "rare", "rare", "legend"]);
    expect(new Set(zero.forms.map((f) => f.color)).size).toBeGreaterThan(1);
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("价格完全由稀有度决定", () => {
    for (const f of ALL_FORMS) {
      expect(f.price).toBe(RARITY_INFO[f.rarity].price);
    }
  });

  it("每个形态都有 png（可替换）+ svg（内置原创占位）路径", () => {
    for (const f of ALL_FORMS) {
      expect(f.image).toMatch(new RegExp(`/heroes/${f.id}\\.png$`));
      expect(f.fallback).toMatch(new RegExp(`/heroes/${f.id}\\.svg$`));
    }
  });

  it("名字/英文名都非空（发音介绍要念）", () => {
    for (const h of HEROES) {
      expect(h.name.length).toBeGreaterThan(0);
      expect(h.en.length).toBeGreaterThan(0);
      for (const f of h.forms) {
        expect(f.name.length).toBeGreaterThan(0);
        expect(f.en.length).toBeGreaterThan(0);
      }
    }
  });

  it("发音介绍 = 英文（角色+形态）+ 中文（角色，形态）", () => {
    const intro = introOf("tiga-multi")!;
    expect(intro.en).toBe("Ultraman Tiga, Multi Type");
    expect(intro.zh).toBe("迪迦，复合型");
    expect(introOf("nope")).toBeNull();
    expect(formById("tiga-multi")?.heroName).toBe("迪迦");
  });

  it("同一个角色的多个形态归在同一角色下（孩子按角色收集）", () => {
    const tiga = HEROES.find((h) => h.id === "tiga")!;
    expect(tiga.forms.map((f) => f.name)).toEqual(["复合型", "强力型", "空中型"]);
    // 形态最多的角色（泽塔的 5 个形态）
    const z = HEROES.find((h) => h.id === "z")!;
    expect(z.forms.map((f) => f.name)).toEqual([
      "原生形态",
      "阿尔法装甲",
      "贝塔进攻",
      "伽马未来",
      "德尔塔天爪",
    ]);
    // 形态 id 命名统一为 `<角色id>-<形态>`（图片文件名靠它定位，防手写错）
    const bad = HEROES.flatMap((h) => h.forms.filter((f) => !f.id.startsWith(`${h.id}-`)).map((f) => f.id));
    expect(bad).toEqual([]);
  });

  it("稀有度分布：常见最多、传说最少（保证孩子先拿到便宜的）", () => {
    const count = (r: string) => ALL_FORMS.filter((f) => f.rarity === r).length;
    expect(count("common")).toBeGreaterThan(count("rare"));
    expect(count("rare")).toBeGreaterThanOrEqual(count("legend"));
    expect(count("legend")).toBeGreaterThan(0);
  });
});
