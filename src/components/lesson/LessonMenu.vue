<script setup lang="ts">
/**
 * 课时菜单（从 LessonView 拆出的视图组件，2026-09-28 P1-4）。
 *
 * 职责：一课内的玩法入口网格——进度条 + 玩法卡片（图标/名称/描述/已获星徽章）。
 * 数据与测量都在 useLessonFlow（actsStyle 按可用空间算列数，actsEl 是网格 DOM 引用），
 * 这里只负责渲染与点击上报，不持有任何课程状态。
 */
import type { Ref } from "vue";
import { Star } from "@lucide/vue";
import type { QuestAct } from "../../composables/useQuest";

const props = defineProps<{
  /** 玩法清单（含图标/tone/名称/描述，由课时页组装） */
  activities: (QuestAct & { stars?: number })[];
  /** 网格排布（--cols/--grid-gap），由 useLessonFlow 按可用空间计算 */
  actsStyle: Record<string, string | number>;
  /** 网格 DOM 引用（供 useLessonFlow 测量列数） */
  actsEl?: Ref<HTMLElement | null>;
  /** 课程进度 0-100（顶栏课程进度条） */
  progress: number;
}>();
const emit = defineEmits<{ open: [a: QuestAct] }>();
</script>

<template>
  <div class="menu view-body">
    <div class="bar"><div class="bar-fill" :style="{ width: props.progress + '%' }"></div></div>
    <div class="acts" :ref="actsEl" :style="props.actsStyle">
      <button
        v-for="(a, i) in props.activities"
        :key="a.key"
        class="act anim-fade-up"
        :class="'tone-' + a.tone"
        :style="{ animationDelay: i * 0.08 + 's' }"
        @click="emit('open', a)"
      >
        <component :is="a.icon" class="k-ico ico" />
        <span class="nm">{{ a.name }}</span>
        <span class="ds">{{ a.desc }}</span>
        <span v-if="a.stars" class="mini-stars">
          <Star class="k-ico star-fill" />{{ a.stars }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.menu {
  display: flex;
  flex-direction: column;
  align-items: center;
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

/* 剩余空间全部给卡片网格，列数由 useLessonFlow 按可用尺寸算出 */
.acts {
  display: grid;
  grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr));
  gap: var(--grid-gap, 12px);
  width: 100%;
  flex: 1;
  min-height: 0;
}
/* 底色 / 立体投影 / 文字色由 .tone-* 统一注入（见 base.css），这里只管排布 */
.act {
  position: relative;
  border-radius: var(--radius);
  padding: var(--gap-xs) 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  transition: transform 0.08s;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.act .ico {
  font-size: var(--fs-emoji-l);
}
.act .nm {
  font-size: clamp(14px, min(2.5vh, 2vw), 22px);
  font-weight: 800;
  white-space: nowrap;
}
.act .ds {
  font-size: clamp(10px, min(1.6vh, 1.3vw), 14px);
  opacity: 0.92;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.mini-stars {
  position: absolute;
  top: 6px;
  right: 8px;
  background: var(--overlay);
  color: var(--gold);
  border-radius: var(--radius-pill);
  padding: 2px 8px;
  font-size: clamp(10px, 1.7vh, 14px);
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

/* 桌面鼠标 hover：玩法卡轻微上浮 */
@media (hover: hover) and (pointer: fine) {
  .act:hover {
    transform: translateY(-2px) scale(1.02);
    filter: brightness(1.04);
  }
}

/* 卡片太矮时，副标题会成为负担，藏掉换取主标题和图标的空间 */
@media (max-height: 620px) {
  .act .ds {
    display: none;
  }
}
</style>
