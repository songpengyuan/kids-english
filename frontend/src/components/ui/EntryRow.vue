<script setup lang="ts">
/**
 * EntryRow —— 入口行（设计系统第 ③ 层）
 *
 * 「图标 + 主文案 + 副文案 + 右侧补充 + 箭头」这一行，在全站被重复实现了 6 次以上
 * （闯关 / 复习 / 家长中心 / 日历 / 宝藏 / 报告），而且每处的圆角、内边距、
 * 箭头颜色都不一样。统一成一个组件后，入口行的观感在全站是同一条。
 *
 * 两种视觉档位：
 *   - 默认：白底卡片（次要入口）
 *   - primary：品牌蓝实底（**一页只允许一个**，用来承载"下一步该干嘛"）
 *
 * 用法：
 *   <EntryRow title="闯关挑战" desc="打完单词，赢英雄卡" to="/game">
 *     <template #icon><IconTile tone="purple"><Gamepad class="k-ico" /></IconTile></template>
 *   </EntryRow>
 */
import { ChevronRight } from "@lucide/vue";
import { useRouter } from "vue-router";

const props = withDefaults(
  defineProps<{
    title: string;
    desc?: string;
    /** 右侧补充说明（如"3 个词"） */
    extra?: string;
    /** 传入则点击直接跳路由 */
    to?: string;
    /** 主行动变体：品牌蓝实底 */
    primary?: boolean;
    arrow?: boolean;
  }>(),
  { arrow: true }
);

const emit = defineEmits<{ click: [] }>();
const router = useRouter();

function onClick() {
  if (props.to) router.push(props.to);
  emit("click");
}
</script>

<template>
  <button
    type="button"
    class="entry-row"
    :class="{ 'entry-row--primary': primary }"
    @click="onClick"
  >
    <slot name="icon" />
    <span class="entry-row__body">
      <span class="entry-row__title">{{ title }}</span>
      <span v-if="desc || $slots.desc" class="entry-row__desc">
        <slot name="desc">{{ desc }}</slot>
      </span>
    </span>
    <span v-if="extra" class="entry-row__extra">{{ extra }}</span>
    <slot name="right" />
    <ChevronRight v-if="arrow" class="k-ico entry-row__arrow" />
  </button>
</template>
