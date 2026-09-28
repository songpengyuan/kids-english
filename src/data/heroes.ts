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
 * 完整名录（41 位角色 / 81 个形态）。加角色只需在这里追加一条 —— 它是唯一数据源。
 * 占位图由 scripts/gen-hero-art.py 按同一份 id 表生成（--check 会校验齐全）。
 */
const ROSTER: HeroSeed[] = [
  /* ---------------- ROSTER（唯一数据源）：加角色只改这一处 ----------------
     * 每条目含 detail（简介/技能/口头禅）——已并入，勿再单开 heroDetails 文件。 */
  {
    id: "zoffy",
    name: "佐菲",
    en: "Zoffy",
    era: "showa",
    color: "#c0392b",
    forms: [["zoffy-base", "基础形态", "Base Form"]],
    detail: {
      bio: "宇宙警备队的队长，奥特兄弟的大哥，总是在最危险的时候赶来支援。",
      skills: ["M87光线", "佐菲射线"],
      phrases: ["为了宇宙的和平！"],
    },
  },
  {
    id: "ultraman",
    name: "初代奥特曼",
    en: "Ultraman",
    era: "showa",
    color: "#b8b8c8",
    forms: [["ultraman-base", "基础形态", "Base Form"]],
    detail: {
      bio: "第一位来到地球的光之巨人，来自M78星云的光之国，是奥特曼系列的起点。",
      skills: ["斯派修姆光线", "八分光轮", "奥特束缚光线"],
      phrases: ["光之巨人，初代奥特曼！"],
    },
  },
  {
    id: "seven",
    name: "赛文",
    en: "Ultraseven",
    era: "showa",
    color: "#d94f3d",
    forms: [["seven-base", "基础形态", "Base Form"]],
    detail: {
      bio: "头上戴着锋利头镖的战士，用奥特眼镜变身，是赛罗的父亲。",
      skills: ["艾梅利姆光线", "集束射线", "奥特头镖"],
      phrases: ["为了人类的未来！"],
    },
  },
  {
    id: "jack",
    name: "杰克",
    en: "Ultraman Jack",
    era: "showa",
    color: "#e0703a",
    forms: [["jack-base", "基础形态", "Base Form"]],
    detail: {
      bio: "被称作“归来的奥特曼”的格斗高手，手腕上的奥特手镯能变化出各种武器。",
      skills: ["斯派修姆光线", "奥特手镯", "奥特回旋飞踢"],
      phrases: ["不放弃，就能赢！"],
    },
  },
  {
    id: "ace",
    name: "艾斯",
    en: "Ultraman Ace",
    era: "showa",
    color: "#d1372e",
    forms: [["ace-base", "基础形态", "Base Form"]],
    detail: {
      bio: "奥特兄弟中光线技的大师，擅长把怪兽切成两半的切割技能。",
      skills: ["梅塔利姆光线", "垂直切割", "奥特断头刀"],
      phrases: ["光之力，无穷无尽！"],
    },
  },
  {
    id: "taro",
    name: "泰罗",
    en: "Ultraman Taro",
    era: "showa",
    color: "#e8453c",
    forms: [["taro-base", "基础形态", "Base Form"]],
    detail: {
      bio: "奥特之父和奥特之母的儿子，被称为“奥特兄弟最强”的体术高手。",
      skills: ["斯特利姆光线", "奥特炸弹", "奥特之角"],
      phrases: ["燃烧吧，奥特心脏！"],
    },
  },
  {
    id: "leo",
    name: "雷欧",
    en: "Ultraman Leo",
    era: "showa",
    color: "#d9a13b",
    forms: [["leo-base", "基础形态", "Base Form"]],
    detail: {
      bio: "来自狮子座L77星云的格斗之王，在地球学会用拳头保护大家。",
      skills: ["雷欧飞踢", "L字型光线", "雷欧飞刀"],
      phrases: ["宇宙拳法，保护地球！"],
    },
  },
  {
    id: "astra",
    name: "阿斯特拉",
    en: "Astra",
    era: "showa",
    color: "#c98a2e",
    forms: [["astra-base", "基础形态", "Base Form"]],
    detail: {
      bio: "雷欧的弟弟，从马格马星人手里逃出来后一直戴着铁锁链。",
      skills: ["阿斯特拉飞踢", "铁链拳", "双人合体光线"],
      phrases: ["哥哥，我们一起战斗！"],
    },
  },
  {
    id: "eighty",
    name: "爱迪",
    en: "Ultraman 80",
    era: "showa",
    color: "#e0453c",
    forms: [["eighty-base", "基础形态", "Base Form"]],
    detail: {
      bio: "在地球上当小学老师的奥特曼，文武双全的全能型战士。",
      skills: ["沙库修姆光线", "奥特月面镜", "阿克修姆光刃"],
      phrases: ["笑着面对每一天！"],
    },
  },
  {
    id: "yullian",
    name: "尤莉安",
    en: "Yullian",
    era: "showa",
    color: "#e07aa8",
    forms: [["yullian-base", "基础形态", "Base Form"]],
    detail: {
      bio: "光之国的公主，爱迪的好搭档，温柔又勇敢。",
      skills: ["尤莉安光线", "治愈光波"],
      phrases: ["温柔也是力量！"],
    },
  },
  {
    id: "father",
    name: "奥特之父",
    en: "Father of Ultra",
    era: "showa",
    color: "#a8322a",
    forms: [["father-base", "基础形态", "Base Form"]],
    detail: {
      bio: "光之国的大统领，守护着整个奥特一族，拥有万年的智慧。",
      skills: ["父亲光线", "奥特月镜", "宇宙奇迹光线"],
      phrases: ["年轻人们，看你们的了！"],
    },
  },
  {
    id: "mother",
    name: "奥特之母",
    en: "Mother of Ultra",
    era: "showa",
    color: "#e59ab8",
    forms: [["mother-base", "基础形态", "Base Form"]],
    detail: {
      bio: "光之国银十字军队长，用治愈之光照顾受伤的战士们。",
      skills: ["母亲光线", "治愈能量"],
      phrases: ["伤好了，再出发！"],
    },
  },
  {
    id: "tiga",
    name: "迪迦",
    en: "Ultraman Tiga",
    era: "heisei",
    color: "#e8453c",
    forms: [ ["tiga-multi", "复合型", "Multi Type"], ["tiga-power", "强力型", "Power Type"], ["tiga-sky", "空中型", "Sky Type"], ],
    detail: {
      bio: "沉睡了三千万年的光之巨人，能切换力量、速度、天空三种形态。",
      skills: ["哉佩利敖光线", "迪迦切割", "迪迦手掌光弹"],
      phrases: ["光之巨人，迪迦！"],
    },
  },
  {
    id: "dyna",
    name: "戴拿",
    en: "Ultraman Dyna",
    era: "heisei",
    color: "#e0453c",
    forms: [ ["dyna-flash", "闪亮型", "Flash Type"], ["dyna-miracle", "奇迹型", "Miracle Type"], ["dyna-strong", "强壮型", "Strong Type"], ],
    detail: {
      bio: "迪迦之后出现的“奇迹之光”，性格开朗，被称为奇迹的战士。",
      skills: ["索尔捷特光线", "立波留姆光波", "戴拿切割"],
      phrases: ["奇迹一定会发生！"],
    },
  },
  {
    id: "gaia",
    name: "盖亚",
    en: "Ultraman Gaia",
    era: "heisei",
    color: "#d1372e",
    forms: [ ["gaia-v1", "V1 形态", "V1"], ["gaia-v2", "V2 形态", "V2"], ["gaia-supreme", "至高型", "Supreme Version"], ],
    detail: {
      bio: "由地球大地之光诞生的巨人，与人类科学家我梦一心同体。",
      skills: ["光子流线", "光子之刃", "量子流线"],
      phrases: ["守护地球的意志！"],
    },
  },
  {
    id: "agul",
    name: "阿古茹",
    en: "Ultraman Agul",
    era: "heisei",
    color: "#2f7df6",
    forms: [ ["agul-v1", "V1 形态", "V1"], ["agul-v2", "V2 形态", "V2"], ],
    detail: {
      bio: "由海洋之光诞生的巨人，一开始与盖亚对立，后来成为战友。",
      skills: ["光子粉碎", "阿古茹光刃", "海洋射线"],
      phrases: ["大海不会输！"],
    },
  },
  {
    id: "cosmos",
    name: "高斯",
    en: "Ultraman Cosmos",
    era: "heisei",
    color: "#3f8ef0",
    forms: [ ["cosmos-luna", "月神模式", "Luna Mode"], ["cosmos-corona", "日冕模式", "Corona Mode"], ["cosmos-eclipse", "日蚀模式", "Eclipse Mode"], ],
    detail: {
      bio: "被称为最温柔的奥特曼，他相信和平，尽量不与对手战斗。",
      skills: ["满月光波", "高斯谬姆光线", "高斯防护"],
      phrases: ["温柔的力量最强大！"],
    },
  },
  {
    id: "justice",
    name: "杰斯提斯",
    en: "Ultraman Justice",
    era: "heisei",
    color: "#8c98a8",
    forms: [ ["justice-standard", "标准模式", "Standard Mode"], ["justice-crusher", "粉碎模式", "Crusher Mode"], ],
    detail: {
      bio: "代表宇宙正义的战士，冷静而强大，有时会和温柔的宇宙斯合体。",
      skills: ["达格流光线", "杰斯提斯光刃"],
      phrases: ["正义必须贯彻到底！"],
    },
  },
  {
    id: "nexus",
    name: "奈克瑟斯",
    en: "Ultraman Nexus",
    era: "heisei",
    color: "#8c98a8",
    forms: [ ["nexus-anphans", "幼年形态", "Anphans"], ["nexus-red", "红色青年", "Junis Red"], ["nexus-blue", "蓝色青年", "Junis Blue"], ],
    detail: {
      bio: "不断进化变强的神秘奥特曼，和人类一起成长。",
      skills: ["十字风暴", "粒子之羽", "进化光线"],
      phrases: ["光，还在成长！"],
    },
  },
  {
    id: "max",
    name: "麦克斯",
    en: "Ultraman Max",
    era: "heisei",
    color: "#d1372e",
    forms: [["max-base", "基础形态", "Base Form"]],
    detail: {
      bio: "被称为“最快最强”的奥特曼，速度和光线都很出色。",
      skills: ["马库修姆光线", "麦克斯银河", "麦克斯切割"],
      phrases: ["最快最强，麦克斯！"],
    },
  },
  {
    id: "mebius",
    name: "梦比优斯",
    en: "Ultraman Mebius",
    era: "heisei",
    color: "#e8453c",
    forms: [ ["mebius-base", "基础形态", "Base Form"], ["mebius-burning", "燃烧勇气", "Burning Brave"], ["mebius-infinity", "无限形态", "Infinity"], ],
    detail: {
      bio: "年轻的未来战士，在地球和GUYS队员成为好伙伴。",
      skills: ["梦比姆光线", "梦比姆骑士光剑", "梦比姆爆裂"],
      phrases: ["伙伴们，一起战斗！"],
    },
  },
  {
    id: "zero",
    name: "赛罗",
    en: "Ultraman Zero",
    era: "heisei",
    color: "#2f7df6",
    forms: [ ["zero-base", "基础形态", "Base Form"], ["zero-corona", "强力日冕", "Strong Corona"], ["zero-luna", "月神奇迹", "Luna Miracle"], ["zero-ultimate", "究极赛罗", "Ultimate Zero"], ],
    detail: {
      bio: "赛文的儿子，骄傲又强大的新生代传奇，赛罗的训练让他更强。",
      skills: ["赛罗双光线", "等离子火花斩", "赛罗头镖"],
      phrases: ["我还真了不起啊！"],
    },
  },
  {
    id: "noa",
    name: "诺亚",
    en: "Ultraman Noa",
    era: "heisei",
    color: "#b8b8c8",
    forms: [["noa-base", "基础形态", "Base Form"]],
    detail: {
      bio: "传说中的神秘巨人，被称为“光的诺亚”，力量深不可测。",
      skills: ["诺亚之翼", "诺亚闪电", "诺亚光线"],
      phrases: ["希望之光，永不熄灭！"],
    },
  },
  {
    id: "legend",
    name: "雷杰多",
    en: "Ultraman Legend",
    era: "heisei",
    color: "#e0a63a",
    forms: [["legend-base", "基础形态", "Base Form"]],
    detail: {
      bio: "宇宙斯与杰斯提斯合体而成的传说巨人，拥有开天辟地的力量。",
      skills: ["火花传说", "奥拉古拉光线"],
      phrases: ["光与正义，合为一体！"],
    },
  },
  {
    id: "ginga",
    name: "银河",
    en: "Ultraman Ginga",
    era: "newgen",
    color: "#2f7df6",
    forms: [ ["ginga-base", "基础形态", "Base Form"], ["ginga-strium", "银河斯特利姆", "Ginga Strium"], ],
    detail: {
      bio: "来自未来的奥特曼，借助火花人偶的力量战斗。",
      skills: ["银河闪电击", "银河切割", "银河斯特利姆光线"],
      phrases: ["银河的光，闪耀吧！"],
    },
  },
  {
    id: "victory",
    name: "维克特利",
    en: "Ultraman Victory",
    era: "newgen",
    color: "#d1372e",
    forms: [ ["victory-base", "基础形态", "Base Form"], ["victory-knight", "骑士形态", "Knight"], ],
    detail: {
      bio: "地底世界维克特利姆的战士，能召唤怪兽的力量。",
      skills: ["维克特利姆射线", "奥特钻孔", "维克特利姆切割"],
      phrases: ["大地之力，觉醒吧！"],
    },
  },
  {
    id: "x",
    name: "艾克斯",
    en: "Ultraman X",
    era: "newgen",
    color: "#3f8ef0",
    forms: [ ["x-base", "基础形态", "Base Form"], ["x-gomora", "哥莫拉装甲", "Gomora Armor"], ["x-beta", "贝塔火花装甲", "Beta Spark Armor"], ],
    detail: {
      bio: "和人类防卫队XIO队员大空大地一心同体，可以穿上怪兽装甲。",
      skills: ["扎纳帝姆光线", "艾克斯切割", "哥莫拉装甲"],
      phrases: ["一体化，艾克斯！"],
    },
  },
  {
    id: "orb",
    name: "欧布",
    en: "Ultraman Orb",
    era: "newgen",
    color: "#e05a2b",
    forms: [ ["orb-origin", "原生形态", "Origin"], ["orb-zeperion", "斯派利翁", "Spacium Zeperion"], ["orb-burn", "燃烧炸弹", "Burnmite"], ["orb-hurricane", "飓风切割", "Hurricane Slash"], ],
    detail: {
      bio: "能借用前辈奥特曼的力量融合变身的战士，为了追查黑暗而来。",
      skills: ["斯派利翁光线", "欧布斩击", "欧布原生气流"],
      phrases: ["光之力量，借我一用！"],
    },
  },
  {
    id: "geed",
    name: "捷德",
    en: "Ultraman Geed",
    era: "newgen",
    color: "#d1372e",
    forms: [ ["geed-primitive", "原始形态", "Primitive"], ["geed-solid", "坚固燃烧", "Solid Burning"], ["geed-acro", "敏捷冲击", "Acro Smasher"], ["geed-royal", "威严皇冠", "Royal Mega Master"], ],
    detail: {
      bio: "黑暗巨人贝利亚的儿子，但他选择用自己的方式守护和平。",
      skills: ["斯特鲁姆光线", "捷德切割", "捷德之爪"],
      phrases: ["命运由我自己决定！"],
    },
  },
  {
    id: "rosso",
    name: "罗索",
    en: "Ultraman Rosso",
    era: "newgen",
    color: "#e8453c",
    forms: [ ["rosso-flame", "火焰型", "Flame"], ["rosso-wind", "风型", "Wind"], ],
    detail: {
      bio: "来自O-50星云的红色战士，是布鲁的哥哥。",
      skills: ["罗索尼姆光线", "罗索切割", "罗索火焰"],
      phrases: ["兄弟同心，其利断金！"],
    },
  },
  {
    id: "blu",
    name: "布鲁",
    en: "Ultraman Blu",
    era: "newgen",
    color: "#2f7df6",
    forms: [ ["blu-aqua", "水型", "Aqua"], ["blu-ground", "地型", "Ground"], ],
    detail: {
      bio: "罗索的弟弟，蓝色的战士，和哥哥一起并肩作战。",
      skills: ["布鲁尼姆光线", "布鲁切割", "布鲁水波"],
      phrases: ["和哥哥一起上！"],
    },
  },
  {
    id: "grigio",
    name: "格丽乔",
    en: "Ultraman Grigio",
    era: "newgen",
    color: "#ff6b9d",
    forms: [["grigio-base", "基础形态", "Base Form"]],
    detail: {
      bio: "罗索和布鲁的妹妹，温柔的女战士，能治愈伙伴。",
      skills: ["格丽乔光线", "治愈光波", "格丽乔护盾"],
      phrases: ["大家都要好好的！"],
    },
  },
  {
    id: "taiga",
    name: "泰迦",
    en: "Ultraman Taiga",
    era: "newgen",
    color: "#ff9f43",
    forms: [ ["taiga-base", "基础形态", "Base Form"], ["taiga-photon", "光子大地", "Photon Earth"], ],
    detail: {
      bio: "泰罗的儿子，年轻的热血战士，与泰塔斯、风马组成小队。",
      skills: ["泰迦光线", "三重斯特利姆", "泰迦火花"],
      phrases: ["三重光之力，出发！"],
    },
  },
  {
    id: "titas",
    name: "泰塔斯",
    en: "Ultraman Titas",
    era: "newgen",
    color: "#d1372e",
    forms: [["titas-base", "基础形态", "Base Form"]],
    detail: {
      bio: "被称为“力之贤者”的壮汉战士，力量惊人。",
      skills: ["泰塔斯燃烧拳", "普兰尼姆爆裂", "泰塔斯飞踢"],
      phrases: ["力量就是正义！"],
    },
  },
  {
    id: "fuma",
    name: "风马",
    en: "Ultraman Fuma",
    era: "newgen",
    color: "#34c759",
    forms: [["fuma-base", "基础形态", "Base Form"]],
    detail: {
      bio: "轻盈的风之战士，速度极快，擅长手里剑技。",
      skills: ["极星光波手里剑", "风马螺旋", "风马切割"],
      phrases: ["随风而行！"],
    },
  },
  {
    id: "z",
    name: "泽塔",
    en: "Ultraman Z",
    era: "newgen",
    color: "#8c98a8",
    forms: [ ["z-original", "原生形态", "Original"], ["z-alpha", "阿尔法装甲", "Alpha Edge"], ["z-beta", "贝塔进攻", "Beta Smash"], ["z-gamma", "伽马未来", "Gamma Future"], ["z-delta", "德尔塔天爪", "Delta Rise Claw"], ],
    detail: {
      bio: "赛罗的徒弟，热血又有点冒失，但战斗时非常可靠。",
      skills: ["泽塔光线", "阿尔法装甲", "泽塔升华"],
      phrases: ["泽塔，出发！"],
    },
  },
  {
    id: "trigger",
    name: "特利迦",
    en: "Ultraman Trigger",
    era: "newgen",
    color: "#a05bd6",
    forms: [ ["trigger-multi", "复合型", "Multi Type"], ["trigger-power", "强力型", "Power Type"], ["trigger-sky", "空中型", "Sky Type"], ["trigger-eternity", "永恒闪耀", "Eternity Glitter"], ],
    detail: {
      bio: "令和时代的“光之巨人”，继承了迪迦的闪耀之光。",
      skills: ["泽佩利敖光线", "特利迦切割", "特利迦圆环守护"],
      phrases: ["闪耀吧，新时代的光！"],
    },
  },
  {
    id: "decker",
    name: "德凯",
    en: "Ultraman Decker",
    era: "newgen",
    color: "#e8453c",
    forms: [ ["decker-flash", "闪亮型", "Flash Type"], ["decker-strong", "强力型", "Strong Type"], ["decker-miracle", "奇迹型", "Miracle Type"], ],
    detail: {
      bio: "继特利迦之后守护地球的新战士，敢于挑战不可能。",
      skills: ["泽佩利敖光线·德凯", "德凯切割", "德凯闪裂"],
      phrases: ["新的光，新的希望！"],
    },
  },
  {
    id: "blazar",
    name: "布莱泽",
    en: "Ultraman Blazar",
    era: "newgen",
    color: "#e05a2b",
    forms: [ ["blazar-base", "基础形态", "Base Form"], ["blazar-firdran", "法德兰装甲", "Firdran Armor"], ],
    detail: {
      bio: "来自遥远星云的野性战士，靠直觉战斗，喜欢吼叫。",
      skills: ["螺旋光矛", "布莱泽光线", "野性之爪"],
      phrases: ["野性的力量，爆发！"],
    },
  },
  {
    id: "reiga",
    name: "令迦",
    en: "Ultraman Reiga",
    era: "newgen",
    color: "#e0a63a",
    forms: [["reiga-base", "基础形态", "Base Form"]],
    detail: {
      bio: "新生代奥特曼全体合体而成的“传说之星”，集合了大家的力量。",
      skills: ["令迦爆破", "令迦射线", "全员合体之力"],
      phrases: ["全体集合，合体！"],
    },
  },
  {
    id: "arc",
    name: "亚克",
    en: "Ultraman Arc",
    era: "reiwa",
    color: "#2f7df6",
    forms: [["arc-base", "基础形态", "Base Form"]],
    detail: {
      bio: "来自未来的新英雄，用画笔一样的“创光”画出力量战斗。",
      skills: ["亚克光线", "亚克切割", "创光之笔"],
      phrases: ["新的传奇，从现在开始！"],
    },
  },
];

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
