<script setup lang="ts">
/**
 * 课时菜单：统一卡片网格，自适应列数
 * iPhone 竖屏 2 列，宽屏/iPad 自动多列
 */
import { computed } from "vue";
import { Star, Music, BookOpen } from "@lucide/vue";
import type { QuestAct } from "../../composables/useQuest";

const props = defineProps<{
  activities: (QuestAct & { stars?: number })[];
  progress: number;
}>();
const emit = defineEmits<{
  openSong: [];
  openLearn: [];
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
}

const cards = computed<MenuCard[]>(() => {
  const list: MenuCard[] = [
    { key: "song", name: "学童谣", desc: "听歌看MV", tone: "green", icon: Music, stars: songStars.value },
    { key: "learn", name: "学单词", desc: "看图听发音", tone: "orange", icon: BookOpen, stars: learnStars.value },
  ];
  for (const a of props.activities) {
    if (["song", "learn"].includes(a.key)) continue;
    list.push({ key: a.key, name: a.name, tone: a.tone, icon: a.icon, stars: a.stars });
  }
  return list;
});

function onClick(c: MenuCard) {
  if (c.key === "song") emit("openSong");
  else if (c.key === "learn") emit("openLearn");
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
        class="tile anim-fade-up"
        :class="['tone-' + c.tone]"
        :style="{ animationDelay: (i * 0.06) + 's' }"
        @click="onClick(c)"
      >
        <component :is="c.icon" class="tile-ico" />
        <span class="tile-name">{{ c.name }}</span>
        <span v-if="c.desc" class="tile-desc">{{ c.desc }}</span>
        <span v-if="c.stars" class="tile-badge"><Star class="k-ico star-fill" />{{ c.stars }}</span>
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

/* 玩法瓷片。
 *
 * 类名刻意叫 .tile 而**不是** .card —— 两者会打架：
 *   · 全局 .card 是"中性白卡"（background: var(--card-bg) + --shadow-hard）
 *   · 全局 .tone-* 是"彩色卡"（background-color: var(--tone) + --on-tone 文字色）
 * 特异性同为 (0,1,0)，而 .card 在 base.css 里排在色调板**之后**，于是它的
 * background 简写把 tone 的底色整个重置掉；可 color: var(--on-tone)（白）不是
 * .card 声明的，活了下来 —— 白底白字，整块瓷片看上去是空的。
 * （74020dc 五层重构加入全局 .card 时静默引入，金卡因为 --on-tone 被 tone-gold
 *   改成深棕 --on-gold 而侥幸可见，所以只有它看起来是正常的。）
 * 结论：.card 与 .tone-* 互斥，永不混用。 */
.tile {
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
.tile:active { transform: scale(0.96); }
.tile-ico { font-size: clamp(28px, 5vh, 40px); }
.tile-name { font-size: clamp(14px, 2.5vh, 18px); font-weight: var(--fw-strong); }
.tile-desc { font-size: clamp(11px, 1.8vh, 13px); font-weight: var(--fw-mid); opacity: 0.8; }
.tile-badge {
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
/* 手机横屏（tiny）：玩法入口在 390px 高里排不下时允许内部滚动兜底 ——
 * 宁可滚，不能藏。 */
@media (max-height: 480px) {
  .menu {
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }
  .bar {
    height: 6px;
  }
  .tile {
    min-height: 72px;
    padding: var(--gap-xs) var(--gap-s);
    gap: 2px;
  }
  .tile-ico {
    font-size: 20px;
  }
  .tile-name {
    font-size: var(--fs-small);
  }
}
</style>
