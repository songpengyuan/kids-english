<script setup lang="ts">
/**
 * 课时菜单：统一卡片网格，自适应列数
 * iPhone 竖屏 2 列，宽屏/iPad 自动多列
 *
 * 词群入口化（2026-10-25）：不再手工前置 song/learn 卡片——
 * activities 里已是完整入口序列（song → 学单词·颜色 → 学单词·动物 →
 * 听音选图·颜色 → …），直接全量渲染，顺序由 activityKeys 决定。
 */
import { computed } from "vue";
import { Star } from "@lucide/vue";
import type { QuestAct } from "../../composables/useQuest";

const props = defineProps<{
  activities: (QuestAct & { stars?: number })[];
  progress: number;
}>();
const emit = defineEmits<{
  openActivity: [a: QuestAct & { stars?: number }];
}>();

interface MenuCard {
  key: string;
  name: string;
  /** 词群入口名的中文半段（含「·」）与词群半段：窄屏折行时保证点是留在第一行，
      不让「·Animals」这种以点开头的残行出现 */
  head: string;
  tail: string;
  desc?: string;
  tone: string;
  icon: any;
  stars?: number;
}

/** 「学单词·Colors」→ head「学单词·」+ tail「Colors」；没有词群后缀时 head 即全名 */
function splitName(name: string): { head: string; tail: string } {
  const at = name.indexOf("·");
  if (at < 0) return { head: name, tail: "" };
  return { head: name.slice(0, at + 1), tail: name.slice(at + 1) };
}

const cards = computed<MenuCard[]>(() =>
  props.activities.map((a) => ({
    key: a.key,
    name: a.name,
    ...splitName(a.name),
    desc: a.desc,
    tone: a.tone,
    icon: a.icon,
    stars: a.stars,
  }))
);

function onClick(c: MenuCard) {
  const a = props.activities.find((x) => x.key === c.key);
  if (a) emit("openActivity", a);
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
        <span class="tile-name"><span class="tile-name__head">{{ c.head }}</span><span v-if="c.tail" class="tile-name__tail">{{ c.tail }}</span></span>
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
/* 4 列：结构档（768 + landscape，批准清单内）——旧值 900px 已收口；
 * 行为差异：768-900 的横屏（如手机横屏 844 宽）从 3 列变 4 列，走查验证过 */
@media (min-width: 768px) and (orientation: landscape) {
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
/* 玩法名允许折行：词群入口名是「学单词·Colors」这类中文+英文混排，
   窄屏（320–360）下比瓷砖内宽还长，单行会左右溢出瓷砖（曾经文字压到卡外）。
   max-width 让溢出的长词在卡内折成两行；· 本身是合法断行点（U+00B7 属 BA 类），
   所以「学单词·」/「Colors」两行读起来仍顺。 */
.tile-name {
  font-size: clamp(14px, 2.5vh, 18px);
  font-weight: var(--fw-strong);
  max-width: 100%;
  line-height: 1.3;
  text-align: center;
  overflow-wrap: anywhere;
}
/* 词群后缀（Colors/Animals）不允许再断词：只接受「学单词·」+「Colors」这种整段换行 */
.tile-name__tail {
  white-space: nowrap;
}
/* 中文半段（含「·」）也不许断：否则浏览器会在「图」和「·」之间断行，
   变成「听音选图」/「·Animals」——点跑到第二行开头，读起来像排版事故 */
.tile-name__head {
  white-space: nowrap;
}
.tile-desc {
  font-size: clamp(11px, 1.8vh, 13px);
  font-weight: var(--fw-mid);
  opacity: 0.8;
  max-width: 100%;
  text-align: center;
  line-height: 1.35;
}
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
