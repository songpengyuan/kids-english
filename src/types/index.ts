/**
 * ===== 全局共享类型 =====
 * 跨组件复用的 Props / Emits / 枚举类型放这里，避免每个文件重复定义。
 */

/** 卡片色调（与 tokens.css 6 色一一对应） */
export type Tone = "blue" | "green" | "orange" | "purple" | "pink" | "teal";

/** 按钮变体 */
export type ButtonVariant = "green" | "blue" | "orange" | "gray";

/** 播放循环模式 */
export type RepeatMode = "off" | "all" | "one";

/** 磨耳朵子 tab */
export type ListenSubTab = "songs" | "videos";

/** 答题反馈类型 */
export type FeedbackType = "correct" | "wrong" | null;

/** 录音评分 */
export type SpeakGrade = "perfect" | "good" | "retry";

/** 卡片稀有度 */
export type CardRarity = "N" | "R" | "SR" | "SSR";

/** 孩子档案（后端返回） */
export interface Child {
  id: number;
  name: string;
  avatar?: string | null;
}

/** 课程概要（内容 API 列表项） */
export interface LessonSummary {
  id: string;
  order_no: number;
  title: string;
  title_zh: string;
  emoji: string;
  tone: string;
  type: string;
  date?: string | null;
}
