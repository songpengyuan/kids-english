/**
 * 英雄图鉴数据（贝壳的消费出口）—— **完整名录**。
 *
 * 三级结构：**世代（era）→ 角色（Hero）→ 形态（HeroForm）**。
 * 孩子熟悉的世界观就是这样：迪迦有复合型/强力型/空中型，每个形态都想要。
 *
 * 素材约定（换图不用改代码）：
 *   1. 形象默认用项目自带的**原创**占位图 `public/heroes/<formId>.svg`
 *      （scripts/gen-hero-art.py 生成，纯几何简笔小人，不含任何受版权保护的角色素材）；
 *   2. 换成自己的图片：命名为 `<formId>.png` 放进 `public/heroes/`，
 *      应用"png 优先、失败回退 svg"自动切换。
 *
 * ⚠️ 命名与版权（使用者自决）：角色名/形态名由使用者（家长）指定，属私人数据；
 *    仓库内不包含任何受版权保护的角色形象，图片由使用者自行放入并仅供家庭内部使用。
 */
import { asset } from "./lessons";

export type HeroEra = "showa" | "heisei" | "newgen" | "reiwa";
export type HeroRarity = "common" | "rare" | "legend";

/** 世代标签（图鉴分段标题） */
export const ERA_INFO: Record<HeroEra, { label: string; en: string; hint: string }> = {
  showa: { label: "昭和", en: "Showa", hint: "1966–1980 的初代们" },
  heisei: { label: "平成", en: "Heisei", hint: "迪迦、戴拿、盖亚……" },
  newgen: { label: "新生代", en: "New Generation", hint: "银河、欧布、泽塔……" },
  reiwa: { label: "令和", en: "Reiwa", hint: "最新的伙伴" },
};
export const ERA_ORDER: HeroEra[] = ["showa", "heisei", "newgen", "reiwa"];

export interface HeroForm {
  /** 形态 id：同时是图片文件名（public/heroes/<id>.png） */
  id: string;
  /** 形态名（孩子看到的） */
  name: string;
  /** 英文形态名（点卡片的发音介绍用；顺便当英语输入） */
  en: string;
  rarity: HeroRarity;
  /** 卡片主色（光晕 / 稀有度描边），与图片无关 */
  color: string;
}

export interface Hero {
  id: string;
  /** 角色名 —— 使用者指定的叫法 */
  name: string;
  /** 英文角色名（发音介绍用） */
  en: string;
  era: HeroEra;
  forms: HeroForm[];
}

/** 稀有度：标签 + 兑换价（贝壳） */
export const RARITY_INFO: Record<HeroRarity, { label: string; price: number }> = {
  common: { label: "常见", price: 20 },
  rare: { label: "稀有", price: 60 },
  legend: { label: "传说", price: 120 },
};

/**
 * 形态的稀有度按"在该角色里的出场顺序"自动定：
 * 第 1 个（基础形态）常见、第 2~3 个稀有、第 4 个起传说（最终形态）。
 * 这样自动保证"最先解锁便宜、最终形态最贵"，加角色/加形态时不用手写稀有度。
 */
export function rarityByIndex(index: number): HeroRarity {
  if (index <= 0) return "common";
  if (index <= 2) return "rare";
  return "legend";
}

/** 两个十六进制色按比例混合（用于同一角色的形态主色微调，0 = 取 a，1 = 取 b） */
export function mixHex(a: string, b: string, ratio: number): string {
  const parse = (h: string) => {
    const s = h.replace("#", "");
    return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const ch = (x: number, y: number) =>
    Math.round(x + (y - x) * ratio)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(r1, r2)}${ch(g1, g2)}${ch(b1, b2)}`;
}

/** 形态主色：角色主色 + 按序微调（同一角色的卡不会全是一个色） */
function formColor(base: string, index: number): string {
  if (index === 0) return base;
  if (index === 1) return mixHex(base, "#ffffff", 0.18);
  if (index === 2) return mixHex(base, "#000000", 0.12);
  return mixHex(base, "#000000", 0.26);
}

/** 形态紧凑写法：[id, 中文名, 英文名] */
type FormSeed = [string, string, string];

interface HeroSeed {
  id: string;
  name: string;
  en: string;
  era: HeroEra;
  /** 角色主色（形态卡的主色由它派生） */
  color: string;
  forms: FormSeed[];
}

/**
 * 完整名录（41 位角色 / 81 个形态）。加角色只需在这里追加一条 —— 它是唯一数据源。
 * 占位图由 scripts/gen-hero-art.py 按同一份 id 表生成（--check 会校验齐全）。
 */
const ROSTER: HeroSeed[] = [
  /* ---------------- 昭和：多为单一形态 ---------------- */
  { id: "zoffy", name: "佐菲", en: "Zoffy", era: "showa", color: "#c0392b", forms: [["zoffy-base", "基础形态", "Base Form"]] },
  { id: "ultraman", name: "初代奥特曼", en: "Ultraman", era: "showa", color: "#b8b8c8", forms: [["ultraman-base", "基础形态", "Base Form"]] },
  { id: "seven", name: "赛文", en: "Ultraseven", era: "showa", color: "#d94f3d", forms: [["seven-base", "基础形态", "Base Form"]] },
  { id: "jack", name: "杰克", en: "Ultraman Jack", era: "showa", color: "#e0703a", forms: [["jack-base", "基础形态", "Base Form"]] },
  { id: "ace", name: "艾斯", en: "Ultraman Ace", era: "showa", color: "#d1372e", forms: [["ace-base", "基础形态", "Base Form"]] },
  { id: "taro", name: "泰罗", en: "Ultraman Taro", era: "showa", color: "#e8453c", forms: [["taro-base", "基础形态", "Base Form"]] },
  { id: "leo", name: "雷欧", en: "Ultraman Leo", era: "showa", color: "#d9a13b", forms: [["leo-base", "基础形态", "Base Form"]] },
  { id: "astra", name: "阿斯特拉", en: "Astra", era: "showa", color: "#c98a2e", forms: [["astra-base", "基础形态", "Base Form"]] },
  { id: "eighty", name: "爱迪", en: "Ultraman 80", era: "showa", color: "#e0453c", forms: [["eighty-base", "基础形态", "Base Form"]] },
  { id: "yullian", name: "尤莉安", en: "Yullian", era: "showa", color: "#e07aa8", forms: [["yullian-base", "基础形态", "Base Form"]] },
  { id: "father", name: "奥特之父", en: "Father of Ultra", era: "showa", color: "#a8322a", forms: [["father-base", "基础形态", "Base Form"]] },
  { id: "mother", name: "奥特之母", en: "Mother of Ultra", era: "showa", color: "#e59ab8", forms: [["mother-base", "基础形态", "Base Form"]] },

  /* ---------------- 平成 ---------------- */
  {
    id: "tiga", name: "迪迦", en: "Ultraman Tiga", era: "heisei", color: "#e8453c",
    forms: [
      ["tiga-multi", "复合型", "Multi Type"],
      ["tiga-power", "强力型", "Power Type"],
      ["tiga-sky", "空中型", "Sky Type"],
    ],
  },
  {
    id: "dyna", name: "戴拿", en: "Ultraman Dyna", era: "heisei", color: "#e0453c",
    forms: [
      ["dyna-flash", "闪亮型", "Flash Type"],
      ["dyna-miracle", "奇迹型", "Miracle Type"],
      ["dyna-strong", "强壮型", "Strong Type"],
    ],
  },
  {
    id: "gaia", name: "盖亚", en: "Ultraman Gaia", era: "heisei", color: "#d1372e",
    forms: [
      ["gaia-v1", "V1 形态", "V1"],
      ["gaia-v2", "V2 形态", "V2"],
      ["gaia-supreme", "至高型", "Supreme Version"],
    ],
  },
  {
    id: "agul", name: "阿古茹", en: "Ultraman Agul", era: "heisei", color: "#2f7df6",
    forms: [
      ["agul-v1", "V1 形态", "V1"],
      ["agul-v2", "V2 形态", "V2"],
    ],
  },
  {
    id: "cosmos", name: "高斯", en: "Ultraman Cosmos", era: "heisei", color: "#3f8ef0",
    forms: [
      ["cosmos-luna", "月神模式", "Luna Mode"],
      ["cosmos-corona", "日冕模式", "Corona Mode"],
      ["cosmos-eclipse", "日蚀模式", "Eclipse Mode"],
    ],
  },
  {
    id: "justice", name: "杰斯提斯", en: "Ultraman Justice", era: "heisei", color: "#8c98a8",
    forms: [
      ["justice-standard", "标准模式", "Standard Mode"],
      ["justice-crusher", "粉碎模式", "Crusher Mode"],
    ],
  },
  {
    id: "nexus", name: "奈克瑟斯", en: "Ultraman Nexus", era: "heisei", color: "#8c98a8",
    forms: [
      ["nexus-anphans", "幼年形态", "Anphans"],
      ["nexus-red", "红色青年", "Junis Red"],
      ["nexus-blue", "蓝色青年", "Junis Blue"],
    ],
  },
  { id: "max", name: "麦克斯", en: "Ultraman Max", era: "heisei", color: "#d1372e", forms: [["max-base", "基础形态", "Base Form"]] },
  {
    id: "mebius", name: "梦比优斯", en: "Ultraman Mebius", era: "heisei", color: "#e8453c",
    forms: [
      ["mebius-base", "基础形态", "Base Form"],
      ["mebius-burning", "燃烧勇气", "Burning Brave"],
      ["mebius-infinity", "无限形态", "Infinity"],
    ],
  },
  {
    id: "zero", name: "赛罗", en: "Ultraman Zero", era: "heisei", color: "#2f7df6",
    forms: [
      ["zero-base", "基础形态", "Base Form"],
      ["zero-corona", "强力日冕", "Strong Corona"],
      ["zero-luna", "月神奇迹", "Luna Miracle"],
      ["zero-ultimate", "究极赛罗", "Ultimate Zero"],
    ],
  },
  { id: "noa", name: "诺亚", en: "Ultraman Noa", era: "heisei", color: "#b8b8c8", forms: [["noa-base", "基础形态", "Base Form"]] },
  { id: "legend", name: "雷杰多", en: "Ultraman Legend", era: "heisei", color: "#e0a63a", forms: [["legend-base", "基础形态", "Base Form"]] },

  /* ---------------- 新生代 ---------------- */
  {
    id: "ginga", name: "银河", en: "Ultraman Ginga", era: "newgen", color: "#2f7df6",
    forms: [
      ["ginga-base", "基础形态", "Base Form"],
      ["ginga-strium", "银河斯特利姆", "Ginga Strium"],
    ],
  },
  {
    id: "victory", name: "维克特利", en: "Ultraman Victory", era: "newgen", color: "#d1372e",
    forms: [
      ["victory-base", "基础形态", "Base Form"],
      ["victory-knight", "骑士形态", "Knight"],
    ],
  },
  {
    id: "x", name: "艾克斯", en: "Ultraman X", era: "newgen", color: "#3f8ef0",
    forms: [
      ["x-base", "基础形态", "Base Form"],
      ["x-gomora", "哥莫拉装甲", "Gomora Armor"],
      ["x-beta", "贝塔火花装甲", "Beta Spark Armor"],
    ],
  },
  {
    id: "orb", name: "欧布", en: "Ultraman Orb", era: "newgen", color: "#e05a2b",
    forms: [
      ["orb-origin", "原生形态", "Origin"],
      ["orb-zeperion", "斯派利翁", "Spacium Zeperion"],
      ["orb-burn", "燃烧炸弹", "Burnmite"],
      ["orb-hurricane", "飓风切割", "Hurricane Slash"],
    ],
  },
  {
    id: "geed", name: "捷德", en: "Ultraman Geed", era: "newgen", color: "#d1372e",
    forms: [
      ["geed-primitive", "原始形态", "Primitive"],
      ["geed-solid", "坚固燃烧", "Solid Burning"],
      ["geed-acro", "敏捷冲击", "Acro Smasher"],
      ["geed-royal", "威严皇冠", "Royal Mega Master"],
    ],
  },
  {
    id: "rosso", name: "罗索", en: "Ultraman Rosso", era: "newgen", color: "#e8453c",
    forms: [
      ["rosso-flame", "火焰型", "Flame"],
      ["rosso-wind", "风型", "Wind"],
    ],
  },
  {
    id: "blu", name: "布鲁", en: "Ultraman Blu", era: "newgen", color: "#2f7df6",
    forms: [
      ["blu-aqua", "水型", "Aqua"],
      ["blu-ground", "地型", "Ground"],
    ],
  },
  { id: "grigio", name: "格丽乔", en: "Ultraman Grigio", era: "newgen", color: "#ff6b9d", forms: [["grigio-base", "基础形态", "Base Form"]] },
  {
    id: "taiga", name: "泰迦", en: "Ultraman Taiga", era: "newgen", color: "#ff9f43",
    forms: [
      ["taiga-base", "基础形态", "Base Form"],
      ["taiga-photon", "光子大地", "Photon Earth"],
    ],
  },
  { id: "titas", name: "泰塔斯", en: "Ultraman Titas", era: "newgen", color: "#d1372e", forms: [["titas-base", "基础形态", "Base Form"]] },
  { id: "fuma", name: "风马", en: "Ultraman Fuma", era: "newgen", color: "#34c759", forms: [["fuma-base", "基础形态", "Base Form"]] },
  {
    id: "z", name: "泽塔", en: "Ultraman Z", era: "newgen", color: "#8c98a8",
    forms: [
      ["z-original", "原生形态", "Original"],
      ["z-alpha", "阿尔法装甲", "Alpha Edge"],
      ["z-beta", "贝塔进攻", "Beta Smash"],
      ["z-gamma", "伽马未来", "Gamma Future"],
      ["z-delta", "德尔塔天爪", "Delta Rise Claw"],
    ],
  },
  {
    id: "trigger", name: "特利迦", en: "Ultraman Trigger", era: "newgen", color: "#a05bd6",
    forms: [
      ["trigger-multi", "复合型", "Multi Type"],
      ["trigger-power", "强力型", "Power Type"],
      ["trigger-sky", "空中型", "Sky Type"],
      ["trigger-eternity", "永恒闪耀", "Eternity Glitter"],
    ],
  },
  {
    id: "decker", name: "德凯", en: "Ultraman Decker", era: "newgen", color: "#e8453c",
    forms: [
      ["decker-flash", "闪亮型", "Flash Type"],
      ["decker-strong", "强力型", "Strong Type"],
      ["decker-miracle", "奇迹型", "Miracle Type"],
    ],
  },
  {
    id: "blazar", name: "布莱泽", en: "Ultraman Blazar", era: "newgen", color: "#e05a2b",
    forms: [
      ["blazar-base", "基础形态", "Base Form"],
      ["blazar-firdran", "法德兰装甲", "Firdran Armor"],
    ],
  },
  { id: "reiga", name: "令迦", en: "Ultraman Reiga", era: "newgen", color: "#e0a63a", forms: [["reiga-base", "基础形态", "Base Form"]] },

  /* ---------------- 令和 ---------------- */
  { id: "arc", name: "亚克", en: "Ultraman Arc", era: "reiwa", color: "#2f7df6", forms: [["arc-base", "基础形态", "Base Form"]] },
];

/** 展开成图鉴用的正式结构（形态主色/稀有度由序号派生） */
export const HEROES: Hero[] = ROSTER.map((h) => ({
  id: h.id,
  name: h.name,
  en: h.en,
  era: h.era,
  forms: h.forms.map(([id, name, en], i) => ({
    id,
    name,
    en,
    rarity: rarityByIndex(i),
    color: formColor(h.color, i),
  })),
}));

/** 扁平化的全部形态（图鉴 / 兑换 / 开箱都按它遍历） */
export interface FlatForm extends HeroForm {
  heroId: string;
  heroName: string;
  /** 英文角色名（发音介绍用） */
  heroEn: string;
  era: HeroEra;
  price: number;
  /** 使用者可替换的图（png 优先） */
  image: string;
  /** 内置原创占位图（png 缺失时回退） */
  fallback: string;
}

export const ALL_FORMS: FlatForm[] = HEROES.flatMap((h) =>
  h.forms.map((f) => ({
    ...f,
    heroId: h.id,
    heroName: h.name,
    heroEn: h.en,
    era: h.era,
    price: RARITY_INFO[f.rarity].price,
    image: asset(`/heroes/${f.id}.png`) as string,
    fallback: asset(`/heroes/${f.id}.svg`) as string,
  }))
);

/** 形态总数（图鉴进度 xx/81） */
export const FORM_TOTAL = ALL_FORMS.length;

/** 角色总数 */
export const HERO_TOTAL = HEROES.length;

export function formById(id: string): FlatForm | null {
  return ALL_FORMS.find((f) => f.id === id) || null;
}

/** 一个角色已收集的形态数 */
export function ownedFormsOf(hero: Hero, stars: Record<string, number>): number {
  return hero.forms.filter((f) => (stars[f.id] || 0) > 0).length;
}

/** 按世代分组的角色（图鉴分段渲染用） */
export function heroesByEra(): { era: HeroEra; heroes: Hero[] }[] {
  return ERA_ORDER.map((era) => ({
    era,
    heroes: HEROES.filter((h) => h.era === era),
  })).filter((g) => g.heroes.length > 0);
}

/**
 * 点卡片的"发音介绍"文案：
 * 先英文（角色 + 形态，顺便当英语输入）再中文（孩子听得懂）。
 */
export function introOf(formId: string): { en: string; zh: string } | null {
  const f = formById(formId);
  if (!f) return null;
  return { en: `${f.heroEn}, ${f.en}`, zh: `${f.heroName}，${f.name}` };
}
