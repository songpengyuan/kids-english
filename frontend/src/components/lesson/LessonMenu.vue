<script setup lang="ts">
/**
 * 课时菜单：统一卡片网格，自适应列数
 * iPhone 竖屏 2 列，宽屏/iPad 自动多列
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

interface MenuCard {
  key: string;
  name: string;
  desc?: string;
  tone: string;
  icon: any;
  stars?: number;
  quest?: boolean;
  questText?: string;
}

const cards = computed<MenuCard[]>(() => {
  const list: MenuCard[] = [
    { key: "song", name: "学童谣", desc: "听歌看MV", tone: "green", icon: Music, stars: songStars.value },
    { key: "learn", name: "学单词", desc: "看图听发音", tone: "orange", icon: BookOpen, stars: learnStars.value },
  ];
  for (const a of props.activities) {
    if (["song", "learn", "quest"].includes(a.key)) continue;
    list.push({ key: a.key, name: a.name, tone: a.tone, icon: a.icon, stars: a.stars });
  }
  list.push({
    key: "quest", name: "闯关挑战", tone: "gold", icon: Swords, quest: true,
    desc: props.questDone >= props.questTotal ? "已通关" : `${props.questTotal}关`,
    questText: `${props.questDone}/${props.questTotal}`,
  });
  return list;
});

function onClick(c: MenuCard) {
  if (c.key === "song") emit("openSong");
  else if (c.key === "learn") emit("openLearn");
  else if (c.key === "quest") emit("openQuest");
  else emit("openActivity", props.activities.find((a) => a.key === c.key)!);
}
</script>

<template>
  <div class="menu view-body">
    <div class="bar"><div class="bar-fill" :style="{ width: progress + '%' }"></div></div>

    <div class="grid">
      <button
        v-for="(c, i) in cards"
        :key="c.key"
        class="card anim-fade-up"
        :class="['tone-' + c.tone, { quest: c.quest }]"
        :style="{ animationDelay: (i * 0.06) + 's', gridColumn: c.quest ? 'span 2' : 'span 1' }"
        @click="onClick(c)"
      >
        <component :is="c.icon" class="card-ico" />
        <span class="card-name">{{ c.name }}</span>
        <span v-if="c.desc" class="card-desc">{{ c.desc }}</span>
        <span v-if="c.stars" class="card-badge"><Star class="k-ico star-fill" />{{ c.stars }}</span>
        <span v-if="c.questText" class="card-badge quest-badge">{{ c.questText }}</span>
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
  background: var(--brand);
  transition: width 0.5s;
}

/* 自适应网格：iPhone 2列，宽屏自动 3-4 列 */
.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--gap-s);
}
@media (min-width: 600px) {
  .grid { grid-template-columns: repeat(3, 1fr); }
}
@media (min-width: 900px) {
  .grid { grid-template-columns: repeat(4, 1fr); }
}

.card {
  border-radius: var(--radius);
  padding: var(--gap-m) var(--gap-s);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  position: relative;
  min-height: 110px;
  justify-content: center;
  transition: transform 0.08s;
}
.card:active { transform: scale(0.96); }
.card-ico { font-size: clamp(28px, 5vh, 40px); }
.card-name { font-size: clamp(14px, 2.5vh, 18px); font-weight: var(--fw-strong); }
.card-desc { font-size: clamp(11px, 1.8vh, 13px); font-weight: var(--fw-mid); opacity: 0.8; }
.card-badge {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 11px;
  font-weight: var(--fw-strong);
  background: var(--overlay);
  color: var(--gold);
  border-radius: var(--radius-pill);
  padding: 2px 8px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.quest-badge { color: var(--gold); background: rgba(240, 180, 41, 0.15); }

.card.quest {
  border: 3px solid var(--c-gold);
}
</style>
