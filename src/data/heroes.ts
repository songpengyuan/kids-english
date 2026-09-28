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
      bio: "宇宙警备队队长，奥特兄弟的大哥。他总是第一个冲进最危险的战场，被大家称为“无敌的佐菲”。当别的战士倒下时，佐菲会带来M78星云的光和勇气。",
      skills: ["M87光线", "斯派修姆光线", "奥特屏障", "Z光线", "奥特斩击"],
      phrases: ["光之国交给我来守护！", "伙伴们，撤退！这里交给我！"],
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
      bio: "第一位来到地球的光之巨人，来自M78星云的光之国，是奥特曼系列的起点。他化身为地球人早田进，和科学特搜队一起守护地球。他教会了大家：光的意志永远不会熄灭。",
      skills: ["斯派修姆光线", "八分光轮", "奥特束缚光线", "空中撞击战术", "超能光线"],
      phrases: ["为了地球的和平！", "光之巨人，初代奥特曼！"],
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
      bio: "头上戴着锋利头镖的战士，用奥特眼镜变身，是赛罗的父亲。他是奥特兄弟中最冷静的战术大师，多次独自深入敌人腹地执行任务。",
      skills: ["艾梅利姆光线", "头镖切割", "奥特念力", "宽屏光线", "奥特飞镖"],
      phrases: ["我的头镖可不是装饰品！", "相信伙伴，就能创造奇迹！"],
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
      bio: "被称作“归来的奥特曼”的格斗高手，手腕上的奥特手镯能变化出各种武器。他与乡秀树一起成长，用勇气和毅力证明了地球人也能成为光之战士。",
      skills: ["斯派修姆光线", "奥特手镯", "杰克火花", "手镯飞镖", "奥特屏障"],
      phrases: ["奥特手镯，变形！", "只要还有勇气，就不会输！"],
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
      bio: "奥特兄弟中光线技的大师，擅长把怪兽切成两半的切割技能。他心地善良，收养了地球孤儿北斗星司和南夕子，教会他们用爱心战斗。",
      skills: ["梅塔利姆光线", "垂直切割", "奥特之光", "空间Z光线", "艾斯之刃"],
      phrases: ["用光线切开黑暗！", "守护孩子们的笑脸！"],
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
      bio: "奥特之父和奥特之母的儿子，被称为“奥特兄弟最强”的体术高手。他拥有奥特之角的火焰力量，也能使用各种超强光线。",
      skills: ["斯特利姆光线", "奥特之角火焰", "泰罗投技", "奥特炸弹", "王者闪光"],
      phrases: ["燃烧吧，泰罗之魂！", "我是奥特兄弟的骄傲！"],
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
      bio: "来自狮子座L77星云的格斗之王，在地球学会用拳头保护大家。故乡被毁灭后，他在赛文的指导下苦练体术，成为最强的格斗战士。",
      skills: ["雷欧飞踢", "能量光线", "狮子搏击", "雷欧拳击", "奥特双重闪光"],
      phrases: ["我的拳头为和平而战！", "狮子不会认输！"],
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
      bio: "雷欧的弟弟，从马格马星人手里逃出来后一直戴着铁锁链。他身手敏捷，腿法凌厉，和哥哥并肩作战时默契十足。",
      skills: ["阿斯特拉飞踢", "闪光切割", "锁链挣脱", "奥特旋转投", "宇宙光线"],
      phrases: ["哥哥，我们一起上！", "这条锁链是我的勋章！"],
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
      bio: "在地球上当小学老师的奥特曼，文武双全的全能型战士。他白天教书育人，晚上守护地球，用温柔和耐心感化了许多敌人。",
      skills: ["萨克修姆光线", "蒙萨尔特飞踢", "爱迪光线", "拳击组合", "奥特屏障"],
      phrases: ["上课啦，同学们！", "温柔也是一种力量！"],
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
      bio: "光之国的公主，爱迪的好搭档，温柔又勇敢。她拥有治愈的光线，也曾在关键时刻挺身而出保护伙伴。",
      skills: ["尤莉安光线", "治愈之光", "公主飞踢", "奥特屏障", "星光闪光"],
      phrases: ["大家一起，就是最强大的光！", "温柔也要勇敢！"],
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
      bio: "光之国的大统领，守护着整个奥特一族，拥有万年的智慧。他经历过无数次大战，是奥特一族的精神支柱。",
      skills: ["奥特之父光线", "父亲之拳", "宇宙之光", "治愈火炬", "真之力光线"],
      phrases: ["光之国永远团结！", "孩子们，勇敢前行！"],
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
      bio: "光之国银十字军队长，用治愈之光照顾受伤的战士们。她是所有奥特战士的母亲，温柔而伟大。",
      skills: ["母亲之光", "治愈光线", "银十字光线", "奥特屏障", "星光祝福"],
      phrases: ["受伤了就到妈妈这里来！", "爱是最大的力量！"],
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
      bio: "沉睡了三千万年的光之巨人，能切换力量、速度、天空三种形态。他与人类队员大古一心同体，当人们相信光的时候，迪迦就会重新闪耀。",
      skills: ["哉佩利敖光线", "迪迦光刃", "奥特念力", "兰帕尔特光弹", "闪耀形态光线"],
      phrases: ["当人们相信光的时候，光就会回应！", "加油，大古！"],
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
      bio: "迪迦之后出现的“奇迹之光”，性格开朗，被称为奇迹的战士。他与飞鸟信一心同体，即使面对再大的困难也从不放弃。",
      skills: ["索尔捷特光线", "戴拿切刀", "奇迹光弹", "闪光拳", "奥特屏障"],
      phrases: ["奇迹会眷顾不放弃的人！", "上吧，飞鸟！"],
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
      bio: "由地球大地之光诞生的巨人，与人类科学家我梦一心同体。他代表大地的力量，为守护所有生命而战斗。",
      skills: ["光子流线", "量子流线", "盖亚光刃", "盖亚重拳", "至高飞踢"],
      phrases: ["大地在呼唤我！", "守护地球上的每一个生命！"],
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
      bio: "由海洋之光诞生的巨人，一开始与盖亚对立，后来成为战友。他冷静强大，代表海洋的深邃力量。",
      skills: ["光子粉碎机", "阿古茹光刃", "海洋屏障", "阿古茹飞踢", "光子重拳"],
      phrases: ["海洋的意志由我来传达！", "我们一起守护地球吧！"],
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
      bio: "被称为最温柔的奥特曼，他相信和平，尽量不与对手战斗。他用“满月光波”感化怪兽，是让敌人也能微笑的和平使者。",
      skills: ["满月光波", "月光净化", "高斯光线", "净化之光", "月神飞踢"],
      phrases: ["让我们成为朋友吧！", "温柔不是软弱！"],
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
      bio: "代表宇宙正义的战士，冷静而强大，有时会和温柔的宇宙斯合体。他坚信宇宙的法则，为正义而战。",
      skills: ["达格利光线", "杰斯提斯光刃", "正义拳", "奥特屏障", "宇宙光线"],
      phrases: ["正义由我来执行！", "光与正义同在！"],
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
      bio: "不断进化变强的神秘奥特曼，和人类一起成长。他化身为适能者，在一次次战斗中进化出更强的形态。",
      skills: ["进化光线", "奈克瑟斯风暴", "光之拳", "奥特屏障", "终极进化光线"],
      phrases: ["我会和你一起战斗！", "进化，永不停歇！"],
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
      bio: "被称为“最快最强”的奥特曼，速度和光线都很出色。他来自M78星云，以光速飞行的速度让敌人望尘莫及。",
      skills: ["马库修姆光线", "麦克斯银河", "光速切割", "超高速拳", "奥特屏障"],
      phrases: ["最快最强的战士！", "光速出击！"],
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
      bio: "年轻的未来战士，在地球和GUYS队员成为好伙伴。他从懵懂的见习战士成长为独当一面的英雄，继承了奥特兄弟的意志。",
      skills: ["梦比姆射线", "梦比姆光刃", "梦比姆炸弹", "骑士射线", "奥特屏障"],
      phrases: ["伙伴们，一起上！", "GUYS，我们来守护！"],
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
      bio: "赛文的儿子，骄傲又强大的新生代传奇。他经历了严格的训练，拥有多种强大形态，是新生代奥特曼的领军人物。",
      skills: ["赛罗双光线", "等离子火花斩", "赛罗头镖", "奥特赛罗飞踢", "终极赛罗光线"],
      phrases: ["我还真了不起啊！", "赛罗，出发！"],
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
      bio: "传说中的神秘巨人，被称为“光的诺亚”，力量深不可测。他跨越时空守护着宇宙的平衡，是奥特曼中的最强传说之一。",
      skills: ["诺亚之翼", "诺亚光线", "闪电超杀", "次元屏障", "诺亚火花"],
      phrases: ["光，会指引我们！", "诺亚的传说永不落幕！"],
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
      bio: "宇宙斯与杰斯提斯合体而成的传说巨人，拥有开天辟地的力量。他只在宇宙面临最大危机时出现。",
      skills: ["火花传说", "雷杰多光线", "宇宙风暴", "次元切割", "传说之光"],
      phrases: ["传说，由光创造！", "宇宙的意志，交给我！"],
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
      bio: "来自未来的奥特曼，借助火花人偶的力量战斗。他与礼堂光一心同体，把星光的力量带给伙伴。",
      skills: ["银河穿击光线", "银河光刃", "火花人偶变身", "银河飞踢", "星光光线"],
      phrases: ["星光，点燃！", "和伙伴一起闪耀！"],
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
      bio: "地底世界维克特利姆的战士，能召唤怪兽的力量。他与翔一起守护地底与地面的和平。",
      skills: ["维克特利光线", "怪兽之力装甲", "维克特利重拳", "地底飞踢", "奥特屏障"],
      phrases: ["维克特利姆的力量！", "地底与地面的和平！"],
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
      bio: "和人类防卫队XIO队员大空大地一心同体，可以穿上怪兽装甲。他相信人类与怪兽也能和平共处。",
      skills: ["艾克斯光线", "怪兽装甲", "贝姆斯坦加农", "艾克斯头镖", "超音速拳"],
      phrases: ["XIO，出动！", "大地，一起上！"],
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
      bio: "能借用前辈奥特曼的力量融合变身的战士，为了追查黑暗而来。他化身为红凯，在旅途中不断寻找光明。",
      skills: ["欧布光线", "斯派修姆哉佩利敖", "欧布切割", "融合光弹", "欧布圣剑"],
      phrases: ["光与暗，都由我来承担！", "我的旅程还会继续！"],
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
      bio: "黑暗巨人贝利亚的儿子，但他选择用自己的方式守护和平。他面对身世的沉重，依然选择成为光。",
      skills: ["捷德光线", "十字粉碎", "捷德爪击", "奥特屏障", "巨大化光线"],
      phrases: ["我不会继承父亲的黑暗！", "我选择成为光！"],
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
      bio: "来自O-50星云的红色战士，是布鲁的哥哥。他和弟弟在地球上过着平凡的生活，在需要时变身守护。",
      skills: ["罗索光线", "火焰拳", "罗索斩击", "大地飞踢", "兄弟合体光线"],
      phrases: ["哥哥来保护你们！", "弟弟，我们一起上！"],
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
      bio: "罗索的弟弟，蓝色的战士，和哥哥一起并肩作战。他性格活泼，擅长水与风的力量。",
      skills: ["布鲁光线", "水流拳", "布鲁切割", "疾风飞踢", "兄弟合体光线"],
      phrases: ["哥哥，跟上我的节奏！", "兄弟同心！"],
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
      bio: "罗索和布鲁的妹妹，温柔的女战士，能治愈伙伴。她是三兄妹中最小的，却拥有最温暖的光。",
      skills: ["格丽乔治愈光线", "格丽乔闪光", "治愈之光", "星光屏障", "三兄妹合体光线"],
      phrases: ["让我来治愈大家！", "哥哥们，我们一起加油！"],
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
      bio: "泰罗的儿子，年轻的热血战士，与泰塔斯、风马组成小队。他继承父亲的火焰之力，是新生代的希望之星。",
      skills: ["泰迦光线", "斯特利姆爆冲", "泰迦之刃", "三重小队合体", "奥特炸弹"],
      phrases: ["泰迦小队，集结！", "燃烧吧，年轻的光！"],
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
      bio: "被称为“力之贤者”的壮汉战士，力量惊人。他来自U40星球，用强大的体术守护伙伴。",
      skills: ["泰塔斯重拳", "贤者之光", "泰塔斯投技", "力量炸弹", "奥特屏障"],
      phrases: ["力量与智慧并存！", "让我用拳头开路！"],
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
      bio: "轻盈的风之战士，速度极快，擅长手里剑技。他是泰迦小队中速度担当，来去如风。",
      skills: ["风马手里剑", "疾风光弹", "风马旋风", "瞬身术", "疾风飞踢"],
      phrases: ["风一样快！", "影子都没看清就结束啦！"],
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
      bio: "赛罗的徒弟，热血又有点冒失，但战斗时非常可靠。他崇拜赛罗，总说“请多多指教”，却总能在关键时刻创造奇迹。",
      skills: ["泽斯蒂姆光线", "阿尔法装甲", "泽塔切割", "德尔塔天爪", "奥特屏障"],
      phrases: ["请多多指教！", "奥特曼赛罗的徒弟，泽塔！"],
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
      bio: "令和时代的“光之巨人”，继承了迪迦的闪耀之光。他与真中剑悟一心同体，为了让大家露出笑容而战斗。",
      skills: ["特利迦光线", "复合型哉佩利敖", "特利迦光刃", "闪耀之光", "天空形态光线"],
      phrases: ["让大家都露出笑容！", "光的力量，由我来传递！"],
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
      bio: "继特利迦之后守护地球的新战士，敢于挑战不可能。他与明日见奏大一心同体，用勇气回应大家的期待。",
      skills: ["德凯光线", "德凯重拳", "奇迹光弹", "德凯切割", "奥特屏障"],
      phrases: ["挑战不可能！", "大家的期待，我不会辜负！"],
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
      bio: "来自遥远星云的野性战士，靠直觉战斗，喜欢吼叫。他化身为比留间弦人队长，用原始的力量对抗怪兽。",
      skills: ["布莱泽光线", "雷鸣剑", "野性拳击", "布莱泽咆哮", "光之爪击"],
      phrases: ["吼——！", "凭直觉战斗！"],
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
      bio: "新生代奥特曼全体合体而成的“传说之星”，集合了大家的力量。他诞生于众位英雄的友情与羁绊。",
      skills: ["令迦光线", "新生代合体光线", "宇宙星光", "传说飞踢", "终极闪光"],
      phrases: ["大家的力量，合为一体！", "这就是新生代的光！"],
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
      bio: "来自未来的新英雄，用画笔一样的“创光”画出力量战斗。他坚信想象力能改变世界，守护人们的梦想。",
      skills: ["创光光线", "亚克画笔", "想象光刃", "亚克飞踢", "梦想闪光"],
      phrases: ["想象力，就是力量！", "画出我们的未来！"],
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
