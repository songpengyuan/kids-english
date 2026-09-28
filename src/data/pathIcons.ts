/**
 * 游戏模式矢量图标（lucide 风格 24×24 stroke path）。
 * 统一用矢量 icon 取代 emoji 表情：
 *  - 玩法图标：learn/quiz/match/speak/talk/song
 *  - 课程图标：l4（波浪·水手）/ l5（号角·音乐人）/ l6（彩虹·颜色）
 * 数字课（l7）/ 字母课（l8）用文本图标（"123" / "ABC"，非 emoji）。
 */

export const ICON_PATHS: Record<string, string[]> = {
  // 学单词：打开的书
  learn: [
    "M2 3h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H2z",
    "M22 3h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z",
  ],
  // 听音选图：耳机
  quiz: [
    "M3 18v-6a9 9 0 0 1 18 0v6",
    "M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z",
    "M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z",
  ],
  // 连一连：两个链环相连（Link2 语义，直观表达"连接/匹配"；缩小时仍清晰可辨）
  match: [
    "M9 17H7A5 5 0 0 1 7 7h2",
    "M15 7h2a5 5 0 1 1 0 10h-2",
    "M8 12h8",
  ],
  // 跟我读：麦克风
  speak: [
    "M12 15a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v7a3 3 0 0 0 3 3z",
    "M19 11v1a7 7 0 0 1-14 0v-1",
    "M12 18v4",
  ],
  // 亲子对话：对话气泡
  talk: [
    "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
  ],
  // 唱童谣：音符
  song: [
    "M9 18V5l12-2v13",
    "M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
    "M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  ],
  // 课程：水手出海去（波浪）
  "l4": [
    "M2 9c2.2-2.6 5-2.6 7.2 0s5 2.6 7.2 0 5-2.6 7.2 0",
    "M2 16c2.2-2.6 5-2.6 7.2 0s5 2.6 7.2 0 5-2.6 7.2 0",
  ],
  // 课程：I Am the Music Man（号角）
  "l5": [
    "M5 8h5l8-4v16l-8-4H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z",
    "M18.5 9v6",
  ],
  // 连击火焰（lucide Flame）
  flame: [
    "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",
  ],
  // 课程：A Rainbow of Colors（彩虹）
  "l6": [
    "M3 17a9 9 0 0 1 18 0",
    "M6.5 17a5.5 5.5 0 0 1 11 0",
    "M10 17a2 2 0 0 1 4 0",
  ],
};

/** 课程 → 文本图标（数字/字母课，非 emoji 文字） */
export const ICON_TEXT: Record<string, string> = {
  "l7": "123",
  "l8": "ABC",
};

/* ---------- 应用级通用图标（底部导航 / 我的页等，替代 emoji） ---------- */

export const APP_ICON_PATHS: Record<string, string[]> = {
  // 关闭（✕）：玩法页顶栏退出按钮（多邻国式）
  close: [
    "M18 6 6 18",
    "M6 6l12 12",
  ],
  // 返回箭头（←）：顶栏返回按钮
  back: [
    "m15 18-6-6 6-6",
  ],
  // 学习（原"自由"练习）：书本（闭合）——学习模式入口；与学单词玩法（打开的书）区分
  free: [
    "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20",
  ],
  // 游戏：关卡地图（折页地图）——「游戏」tab 打开的是关卡路径图，用地图比手柄直观
  game: [
    "M14.1 5.6a2 2 0 0 0 1.8 0l3.7-1.8A1 1 0 0 1 21 4.6v12.8a1 1 0 0 1-.6.9l-4.5 2.3a2 2 0 0 1-1.8 0l-4.2-2.1a2 2 0 0 0-1.8 0l-3.7 1.8A1 1 0 0 1 3 19.4V6.6a1 1 0 0 1 .6-.9l4.5-2.3a2 2 0 0 1 1.8 0z",
    "M15 5.8v15",
    "M9 3.2v15",
  ],
  // 音量/朗读：详情页"点一点听介绍"提示、技能发光点
  volume: [
    "M11 5 6 9H2v6h4l5 4V5z",
    "M15.5 8.5a5 5 0 0 1 0 7",
    "M18.5 5.5a9.5 9.5 0 0 1 0 13",
  ],
  // 闪光/星星：详情页"招牌技能"
  sparkles: [
    "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z",
    "M19 15l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z",
  ],
  // 我的：用户
  me: [
    "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2",
    "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  ],
  // 贝壳（扇纹）
  shell: [
    "M12 3a9 9 0 0 1 9 9c0 4-3 8-9 9-6-1-9-5-9-9a9 9 0 0 1 9-9z",
    "M12 3c-1 4 0 7 3 9",
    "M12 12c2 1 3 3 3 6",
  ],
  // 贴纸图鉴
  sticker: [
    "M21 12v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h8",
    "M20.5 8.5 15.5 3.5a1 1 0 0 0-.7-.3H15a1 1 0 0 0-1 1V9a1 1 0 0 0 1 1h5a1 1 0 0 0 .7-1.7z",
  ],
  // 今日时长：时钟
  clock: [
    "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z",
    "M12 7v5l3 3",
  ],
  // 今日玩法：脉冲
  activity: ["M22 12h-4l-3 9L9 3l-3 9H2"],
  // 宝藏罐：礼物
  gift: [
    "M20 12v10H4V12",
    "M2 7h20v5H2z",
    "M12 22V7",
    "M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z",
    "M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z",
  ],
  // 家长报告：柱状图
  chart: ["M3 3v18h18", "M7 16v-5", "M12 16V8", "M17 16v-3"],
  // 错词复习：打开的书
  review: [
    "M12 7v14",
    "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",
  ],
  // 上一张/下一张（lucide ChevronLeft / ChevronRight，轮播用）
  "chevron-left": ["M15 18l-6-6 6-6"],
  "chevron-right": ["M9 6l6 6-6 6"],
  // 锁定（lucide Lock）
  lock: [
    "M7 9V6a5 5 0 0 1 10 0v3",
    "M5 9h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z",
  ],
  // 播放（lucide Play）
  play: ["M6 4l14 8-14 8V4z"],
  // 宝箱关卡：真正的宝箱（梯形箱盖 + 箱身 + 锁扣），与"宝藏罐礼物"（gift 丝带礼盒）区分开
  chest: [
    "M4 9l1.5-5h13L20 9",
    "M3 9h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    "M12 9v6",
    "M12 17h.01",
  ],
  // 课程横幅右侧固定图标：一本课本（合上的书 · lucide Book）。
  // 每课都一样 —— 与"学单词"玩法的打开的书（ICON_PATHS.learn）在语义上区分开。
  book: [
    "M4 19.5A2.5 2.5 0 0 1 6.5 17H20",
    "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  ],
};

/** 取应用级通用图标（canvas 用不到，PathIcon 组件用） */
export function appIconPaths(key: string): string[] {
  return APP_ICON_PATHS[key] || [];
}

/* ---------- Canvas 用：SVG data-URL → HTMLImageElement（支持描边色） ---------- */

let iconCache: Map<string, HTMLImageElement> | undefined;

function iconSrc(key: string, stroke: string): string {
  const d = ICON_PATHS[key].join(" ");
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`
  )}`;
}

/** 取图标 Image（异步加载；canvas rAF 循环每帧重绘，加载完成后自动出现）。
 *  stroke：描边色（默认白色），缓存 key 含颜色，同一 icon 多色不互相污染。 */
export function iconEl(key: string, stroke = "white"): HTMLImageElement | undefined {
  if (!ICON_PATHS[key]) return undefined;
  if (typeof window === "undefined" || typeof Image === "undefined") return undefined;
  if (!iconCache) iconCache = new Map();
  const cacheKey = `${key}:${stroke}`;
  let im = iconCache.get(cacheKey);
  if (!im) {
    im = new Image();
    im.src = iconSrc(key, stroke);
    iconCache.set(cacheKey, im);
  }
  return im;
}
