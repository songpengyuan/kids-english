<script setup lang="ts">
/**
 * 课时菜单：3 个大入口卡片
 *   🎵 学童谣 / 📖 学单词 / ⚔️ 闯关挑战
 *
 * 闯关挑战 = quiz→match→speak→talk 线性串联，通关后给卡片奖励。
 */
import { computed } from "vue";
import { Star, Music, BookOpen, Swords } from "@lucide/vue";
import type { QuestAct } from "../../composables/useQuest";

const props = defineProps<{
  /** 全部玩法（含 stars 徽章） */
  activities: (QuestAct & { stars?: number })[];
  /** 课程进度 0-100 */
  progress: number;
  /** 闯关完成度：已通关数 / 总数 */
  questDone: number;
  questTotal: number;
}>();
const emit = defineEmits<{
  openSong: [];
  openLearn: [];
  openQuest: [];
}>();

/* 计算各入口数据 */
const songStars = computed(() => props.activities.find((a) => a.key === "song")?.stars ?? 0);
const learnStars = computed(() => props.activities.find((a) => a.key === "learn")?.stars ?? 0);

/* 闯关包含的玩法（去掉 song 和 learn，剩下的就是闯关关卡） */
const questActs = computed(() =>
  props.activities.filter((a) => !["song", "learn"].includes(a.key))
);
</script>

<template>
  <div class="menu view-body">
    <!-- 顶部进度条 -->
    <div class="bar"><div class="bar-fill" :style="{ width: progress + '%' }"></div></div>

    <div class="cards">
      <!-- 学童谣 -->
      <button class="big-card tone-green anim-fade-up" @click="emit('openSong')">
        <span class="bk-ico"><Music class="k-ico" /></span>
        <span class="bk-body">
          <span class="bk-name">学童谣</span>
          <span class="bk-desc">听歌看MV</span>
        </span>
        <span v-if="songStars" class="mini-stars"><Star class="k-ico star-fill" />{{ songStars }}</span>
      </button>

      <!-- 学单词 -->
      <button class="big-card tone-orange anim-fade-up" style="animation-delay: 0.08s" @click="emit('openLearn')">
        <span class="bk-ico"><BookOpen class="k-ico" /></span>
        <span class="bk-body">
          <span class="bk-name">学单词</span>
          <span class="bk-desc">看图听发音</span>
        </span>
        <span v-if="learnStars" class="mini-stars"><Star class="k-ico star-fill" />{{ learnStars }}</span>
      </button>

      <!-- 闯关挑战（最醒目） -->
      <button class="big-card quest tone-gold anim-fade-up" style="animation-delay: 0.16s" @click="emit('openQuest')">
        <span class="bk-ico"><Swords class="k-ico" /></span>
        <span class="bk-body">
          <span class="bk-name">⚔️ 闯关挑战</span>
          <span class="bk-desc">
            <template v-if="questDone >= questTotal">🎉 已通关，再玩一次！</template>
            <template v-else>{{ questActs.length }}关 → 得奥特曼卡片</template>
          </span>
        </span>
        <span class="quest-progress">{{ questDone }}/{{ questTotal }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.menu {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
}

.bar {
  width: 100%;
  height: clamp(6px, 1.2vh, 14px);
  background: var(--line);
  border-radius: var(--radius-pill);
  overflow: hidden;
  flex: none;
}
.bar-fill {
  height: 100%;
  background: var(--green);
  transition: width 0.5s;
}

.cards {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
  flex: 1;
  min-height: 0;
  justify-content: center;
}

.big-card {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  border-radius: var(--radius);
  padding: clamp(16px, 3vh, 28px) var(--gap-s);
  position: relative;
  transition: transform 0.08s;
}
.big-card:active {
  transform: scale(0.98);
}
@media (hover: hover) and (pointer: fine) {
  .big-card:hover { transform: translateY(-2px); }
}

.bk-ico {
  font-size: clamp(36px, 7vh, 56px);
  line-height: 1;
  flex: none;
}
.bk-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}
.bk-name {
  font-size: clamp(18px, 3.5vh, 28px);
  font-weight: 900;
}
.bk-desc {
  font-size: clamp(12px, 2vh, 16px);
  opacity: 0.9;
  font-weight: 700;
}

/* 闯关卡片：金色边框 + 闪光 */
.quest {
  border: 3px solid var(--gold, #f0b429);
  box-shadow: 0 4px 20px rgba(240, 180, 41, 0.3);
}
.quest-progress {
  margin-left: auto;
  font-size: clamp(16px, 3vh, 24px);
  font-weight: 900;
  color: var(--gold, #f0b429);
  background: rgba(240, 180, 41, 0.15);
  border-radius: var(--radius-pill);
  padding: 4px 14px;
  flex: none;
}

.mini-stars {
  margin-left: auto;
  background: var(--overlay);
  color: var(--gold);
  border-radius: var(--radius-pill);
  padding: 4px 12px;
  font-size: clamp(12px, 2vh, 16px);
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
}
</style>
