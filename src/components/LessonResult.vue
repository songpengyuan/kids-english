<script setup lang="ts">
/**
 * 结算页（阶段 1-3：闯关/自由练习两套结算统一）。
 *
 * - 星星展示（1~3 星渐次弹出）；
 * - 闯关模式：第 N 关完成大徽章 + 玩法名 + 重玩提示；
 * - 今日目标首次达成：连击火焰横幅；
 * - 开宝箱（ChestReward）统一挂载；
 * - 底部动作：返回地图/下一关（quest）、再选玩法/下一课（free），由父组件处理。
 */
import { Star } from "@lucide/vue";
import PathIcon from "./PathIcon.vue";
import ChestReward from "./ChestReward.vue";

defineProps<{
  mode: "quest" | "free";
  stars: number;
  streakJustHit: boolean;
  streakDays: number;
  questLevel?: number;
  actName?: string;
  nextLevel?: { actKey: string; name: string } | null;
  nextLesson?: { id: string; title: string } | null;
}>();

const emit = defineEmits<{
  backToMap: [];
  goNextLevel: [];
  toMenu: [];
  goNextLesson: [];
}>();
</script>

<template>
  <div class="result view-body view-center">
    <!-- 闯关：关卡完成大画面 -->
    <template v-if="mode === 'quest'">
      <div class="quest-done-badge anim-pop">第 {{ questLevel }} 关完成！</div>
      <div class="stars">
        <span
          v-for="n in 3"
          :key="n"
          class="star anim-pop"
          :class="{ dim: n > stars }"
          :style="{ animationDelay: n * 0.2 + 's' }"
        >
          <Star class="k-ico star-fill" />
        </span>
      </div>
      <h2>{{ actName }} · 获得 {{ stars }} 颗星</h2>
      <p v-if="stars < 3" class="quest-total-stars">重玩可拿满 3 星</p>
      <!-- 今日目标首次达成：连击火焰横幅 -->
      <div v-if="streakJustHit" class="streak-banner anim-pop">
        <PathIcon name="flame" class="k-ico flame-ico" /> 今日目标达成！已连续 {{ streakDays }} 天
      </div>
      <ChestReward />
      <div class="btn-row">
        <button class="k-btn gray" @click="emit('backToMap')">返回闯关地图</button>
        <button v-if="nextLevel" class="k-btn" @click="emit('goNextLevel')">
          下一关：<PathIcon :name="nextLevel.actKey" /> {{ nextLevel.name }} →
        </button>
      </div>
    </template>

    <!-- 自由练习 -->
    <template v-else>
      <div class="stars">
        <span
          v-for="n in 3"
          :key="n"
          class="star anim-pop"
          :class="{ dim: n > stars }"
          :style="{ animationDelay: n * 0.2 + 's' }"
        >
          <Star class="k-ico star-fill" />
        </span>
      </div>
      <h2>真棒！获得 {{ stars }} 颗星</h2>
      <div v-if="streakJustHit" class="streak-banner anim-pop">
        <PathIcon name="flame" class="k-ico flame-ico" /> 今日目标达成！已连续 {{ streakDays }} 天
      </div>
      <ChestReward />
      <div class="btn-row">
        <button class="k-btn" @click="emit('toMenu')">再选一个玩法</button>
        <button v-if="nextLesson" class="k-btn gray" @click="emit('goNextLesson')">
          下一课：<PathIcon :name="nextLesson.id" /> {{ nextLesson.title }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.stars {
  display: flex;
  gap: 6px;
  justify-content: center;
}
.star {
  width: 56px;
  height: 56px;
  color: var(--star-gold);
}
.star.dim {
  color: var(--star-dim);
}
.quest-done-badge {
  font-weight: 800;
  font-size: var(--fs-big);
  color: var(--ink);
  background: var(--card-bg);
  padding: 10px 22px;
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-hard);
}
.quest-total-stars {
  font-weight: 700;
  font-size: var(--fs-small);
  color: var(--ink-faint);
}
.streak-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  color: #b45309;
  background: #fef3c7;
  border-radius: var(--radius-pill);
  padding: 8px 16px;
}
.flame-ico {
  color: #ea580c;
}
</style>
