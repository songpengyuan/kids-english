/**
 * 吉祥物「乐乐鸟」话术池（全库集中话术的第一份模块）。
 *
 * 口径（2026-11-15，家长观察实证：孩子对叽里呱啦愿意玩、对本 App 玩几次就没耐心）：
 *  - 全部 5 岁口语、短句（TTS 逐字读，长句拖节奏）；
 *  - 绝不否定孩子：答错只打气（"差一点点"），不说"错了/不对"；
 *  - 数量够轮换：随机不与上一条重复，一池至少 4 条。
 */
export const MASCOT_LINES = {
  /** 会话内首访（每次开 App 一次，component 里 sessionStorage 幂等） */
  greet: [
    "嗨，我是乐乐鸟，欢迎回来！",
    "你来啦，今天玩点什么？",
    "嘿嘿，我等你好久啦！",
    "又见面啦，我想你啦！",
  ],
  /** 点乐鸟闲聊 */
  tap: [
    "咯咯咯，好痒呀！",
    "我是乐乐鸟，你的好朋友！",
    "今天想唱歌还是玩游戏呀？",
    "你笑起来的样子真好看！",
    "悄悄告诉你，宝箱里藏着宝贝哦！",
    "我们一起说英语吧！",
  ],
  /** 开箱/庆祝类事件 */
  cheer: ["太棒啦！", "哇，你好厉害呀！", "真棒，继续加油！", "学得真快，我都不好意思啦！"],
  /** 答错打气（只打气，不否定） */
  oops: [
    "没关系，再试一次！",
    "差一点点，再来一次！",
    "别着急，慢慢来！",
    "换个试试，你可以的！",
  ],
  /** 答对英文鼓励（2026-11-15：英语启蒙的答对反馈就该是英语——此前全站
   *  答对只有"叮"音效，孩子听英语的机会全在词/歌本身；乐鸟用角色音色说
   *  一句短英文，陪伴感与英语输入一次到位。全 5 岁能懂的极简句。 */
  cheerEn: [
    "Great job!",
    "Well done!",
    "Awesome!",
    "You did it!",
    "Super!",
    "Amazing!",
    "High five!",
  ],
  /** 宝箱打开瞬间 */
  chest: ["哇，宝箱开啦！", "看看掉出什么宝贝！", "运气真好，宝贝来啦！", "叮！宝贝出来咯！"],
  /** 进收藏册（/me/collection）时的问候 */
  collection: [
    "这是你的宝贝墙！",
    "你的贴纸越来越多啦！",
    "好多宝贝呀，都是你的！",
    "又多了新宝贝，真厉害！",
  ],
} as const;

/** 从池子里随机挑一条，避开 avoid（上一条），保证同池连着两次不重样 */
export function pickMascotLine(pool: readonly string[], avoid?: string): string {
  if (pool.length <= 1) return pool[0] ?? "";
  let line = pool[Math.floor(Math.random() * pool.length)];
  let guard = 0;
  while (line === avoid && guard++ < 8) {
    line = pool[Math.floor(Math.random() * pool.length)];
  }
  return line;
}
