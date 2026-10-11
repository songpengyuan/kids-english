<script setup lang="ts">
/**
 * 课时菜单：
 *   上半：3 个大入口（学童谣/学单词/闯关挑战）
 *   下半：单独玩法小卡片（听音选图/连一连/跟我读/亲子对话）
 */
import { computed } from "vue";
import { Star, Music, BookOpen, Swords } from "@lucide/vue";
import type { QuestAct } from "../../composables/useQuest";

const props = defineProps<{
  activities: (QuestAct & { stars?: number })[];
  progress: number;
  questDone: number;
  questTotal: number;
}>();
const emit = defineEmits<{
  openSong: [];
  openLearn: [];
  openQuest: [];
  openActivity: [a: QuestAct & { stars?: number }];
}>();

const songStars = computed(() => props.activities.find((a) => a.key === "song")?.stars ?? 0);
const learnStars = computed(() => props.activities.find((a) => a.key === "learn")?.stars ?? 0);

/** 单独玩法（闯关包含的） */
const soloActs = computed(() =>
  props.activities.filter((a) => !["song", "learn"].includes(a.key))
);
</script>

<template>
  <div class="menu view-body">
    <div class="bar"><div class="bar-fill" :style="{ width: progress + '%' }"></div></div>

    <div class="top-cards">
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

      <!-- 闯关挑战 -->
      <button class="big-card quest tone-gold anim-fade-up" style="animation-delay: 0.16s" @click="emit('openQuest')">
        <span class="bk-ico"><Swords class="k-ico" /></span>
        <span class="bk-body">
          <span class="bk-name">⚔️ 闯关挑战</span>
          <span class="bk-desc">
            <template v-if="questDone >= questTotal">🎉 已通关，再玩一次！</template>
            <template v-else>{{ questTotal }}关 → 得奥特曼卡片</template>
          </span>
        </span>
        <span class="quest-progress">{{ questDone }}/{{ questTotal }}</span>
      </button>
    </div>

    <!-- 单独玩法：和上面统一大卡片风格 -->
    <div class="top-cards">
      <button
        v-for="(a, i) in soloActs"
        :key="a.key"
        class="big-card anim-fade-up"
        :class="'tone-' + a.tone"
        :style="{ animationDelay: (0.2 + i * 0.06) + 's' }"
        @click="emit('openActivity', a)"
      >
        <span class="bk-ico"><component :is="a.icon" class="k-ico" /></span>
        <span class="bk-body">
          <span class="bk-name">{{ a.name }}</span>
        </span>
        <span v-if="a.stars" class="mini-stars"><Star class="k-ico star-fill" />{{ a.stars }}</span>
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

.top-cards {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
}

.big-card {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  border-radius: var(--radius);
  padding: clamp(12px, 2.5vh, 20px) var(--gap-s);
  position: relative;
  transition: transform 0.08s;
}
.big-card:active { transform: scale(0.98); }
@media (hover: hover) and (pointer: fine) {
  .big-card:hover { transform: translateY(-2px); }
}

.bk-ico { font-size: clamp(28px, 5vh, 40px); flex: none; }
.bk-body { display: flex; flex-direction: column; gap: 2px; text-align: left; }
.bk-name { font-size: clamp(16px, 3vh, 22px); font-weight: 900; }
.bk-desc { font-size: clamp(11px, 1.8vh, 14px); opacity: 0.9; font-weight: 700; }

.quest {
  border: 3px solid var(--gold, #f0b429);
  box-shadow: 0 4px 16px rgba(240, 180, 41, 0.3);
}
.quest-progress {
  margin-left: auto;
  font-size: clamp(14px, 2.5vh, 20px);
  font-weight: 900;
  color: var(--gold, #f0b429);
  background: rgba(240, 180, 41, 0.15);
  border-radius: var(--radius-pill);
  padding: 4px 12px;
  flex: none;
}

.mini-stars {
  margin-left: auto;
  background: var(--overlay);
  color: var(--gold);
  border-radius: var(--radius-pill);
  padding: 3px 10px;
  font-size: clamp(11px, 1.8vh, 14px);
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: none;
}


</style>
