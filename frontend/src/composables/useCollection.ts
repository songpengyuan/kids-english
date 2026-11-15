/**
 * 收藏册派生数据（2026-11-15 收集生长 v1）。
 *
 * 设计要点：**零新存储**。课贴纸的解锁状态完全从已有数据派生——
 * 贴纸解锁 = 本课全部玩法关 completed（与 LessonLevelList 宝箱门同一口径，
 * 不含 chest；chest 是奖励节点不是玩法）。英雄收集度直接读 rewards store
 * 的 ownedCount/albumPct。新课加进 lessons.json 后贴纸墙自动多一格。
 */
import { computed } from "vue";
import { lessons, type Lesson } from "../data/lessons";
import { FORM_TOTAL } from "../data/heroes";
import { lessonLevels } from "../data/pathLevels";
import { useProgressStore } from "../stores/progress";
import { useRewardsStore } from "../stores/rewards";
import { emojiCoverUrl } from "../utils/emojiCover";

export interface LessonSticker {
  lesson: Lesson;
  /** 全部玩法关完成 → 贴纸解锁（chest 不算玩法） */
  unlocked: boolean;
  /** 已完成玩法数 / 总玩法数（锁定卡的进度提示） */
  done: number;
  total: number;
  /** 自托管封面图（资产集外回退 null，调用方显示 emoji 文本） */
  cover: string | null;
}

export function useCollection() {
  const progress = useProgressStore();
  const rewards = useRewardsStore();

  const stickers = computed<LessonSticker[]>(() =>
    lessons.map((lesson) => {
      const levels = lessonLevels(lesson).filter((l) => l.actKey !== "chest");
      const completed =
        (progress.progress[lesson.id]?.completed as string[] | undefined) ?? [];
      const done = levels.filter((l) => completed.includes(l.actKey)).length;
      return {
        lesson,
        unlocked: levels.length > 0 && done === levels.length,
        done,
        total: levels.length,
        cover: emojiCoverUrl(lesson.emoji),
      };
    })
  );

  const stickersUnlocked = computed(() => stickers.value.filter((s) => s.unlocked).length);
  const stickersTotal = computed(() => stickers.value.length);

  return {
    stickers,
    stickersUnlocked,
    stickersTotal,
    /** 英雄图鉴（rewards store 透传；总数来自 data/heroes 的 FORM_TOTAL） */
    heroesOwned: computed(() => rewards.ownedCount),
    heroesTotal: FORM_TOTAL,
    heroesPct: computed(() => rewards.albumPct),
  };
}
