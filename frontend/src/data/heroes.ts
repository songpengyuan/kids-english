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
 *      应用"png 优先、失败回退 svg"自动切换；
 *   3. 多姿势（轮播）：额外图命名为 `<formId>-2.png`、`<formId>-3.png`（scripts/fetch-hero-art.py
 *      `--multi 3` 自动抓取），详情页顶部大图左右滑动轮播；缺的姿势运行时加载失败自动跳过。
 *
 * ⚠️ 命名与版权（使用者自决）：角色名/形态名由使用者（家长）指定，属私人数据；
 *    仓库内不包含任何受版权保护的角色形象，图片由使用者自行放入并仅供家庭内部使用。
 */
import { asset } from "./lessons";
import rosterData from "./heroes.json";

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
  /** 详情资料（简介/技能/口头禅） */
  detail: HeroDetail;
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

export interface HeroDetail {
  /** 一句话简介 */
  bio: string;
  /** 招牌技能（中文名） */
  skills: string[];
  /** 常用语 / 口头禅（中文） */
  phrases: string[];
  /** 身高（官方设定，如"53 米"）——没有可靠出处的字段留空，不编造 */
  height?: string;
  /** 体重（官方设定，如"45000 吨"） */
  weight?: string;
  /** 出身地 / 来历（官方设定，如"M78 星云·光之国"） */
  origin?: string;
  /** 首次登场（如"1966 年《奥特曼》"） */
  debut?: string;
}

interface HeroSeed {
  id: string;
  name: string;
  en: string;
  era: HeroEra;
  /** 角色主色（形态卡的主色由它派生） */
  color: string;
  forms: FormSeed[];
  /** 详情资料（简介/技能/口头禅，随角色一起维护，见 ROSTER 注释） */
  detail: HeroDetail;
}

/**
 * 完整名录（41 位角色 / 81 个形态）——数据本体在 heroes.json（本文件只留类型与派生逻辑）。
 * 加角色/形态/详情只改 heroes.json；运营改数据不再淹没代码 diff，
 * 生成脚本（gen-hero-art.py / fetch-hero-art.py）也直接读同一份 JSON。
 * 占位图由 scripts/gen-hero-art.py 按同一份 id 表生成（--check 会校验齐全）。
 */
const ROSTER = rosterData as HeroSeed[];

/** 展开成图鉴用的正式结构（形态主色/稀有度由序号派生） */
export const HEROES: Hero[] = ROSTER.map((h) => ({
  id: h.id,
  name: h.name,
  en: h.en,
  era: h.era,
  detail: h.detail,
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
  /** 主图（png 优先；加载失败回退 fallback） */
  image: string;
  /** 网格/缩略条用的小图（thumbs/<id>.webp 256px，gen-hero-thumbs.py 生成）。
   *  图鉴一屏 81 张，原图 500KB 级一次 20-30MB；原图只留给姿势舞台/全屏查看。 */
  thumb: string;
  /** 多姿势图（轮播用）：约定 <id>.png 主图 + <id>-2.png … <id>-N.png；
   *  缺失的文件由组件加载失败时跳过（运行时探测，无需改数据）。 */
  images: string[];
  /** 内置原创占位图（png 缺失时回退） */
  fallback: string;
}

export const ALL_FORMS: FlatForm[] = HEROES.flatMap((h) =>
  h.forms.map((f) => {
    const image = asset(`/heroes/${f.id}.png`) as string;
    return {
      ...f,
      heroId: h.id,
      heroName: h.name,
      heroEn: h.en,
      era: h.era,
      price: RARITY_INFO[f.rarity].price,
      image,
      thumb: asset(`/heroes/thumbs/${f.id}.webp`) as string,
      images: [
        image,
        asset(`/heroes/${f.id}-2.png`),
        asset(`/heroes/${f.id}-3.png`),
      ].filter(Boolean) as string[],
      fallback: asset(`/heroes/${f.id}.svg`) as string,
    };
  })
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
