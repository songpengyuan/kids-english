<script setup lang="ts">
/**
 * EmojiTile —— 内容 emoji 的圆角贴纸底座（设计系统第 ③ 层）
 *
 * 和 IconTile 的分工（两者都产出"圆角彩色方块"，但用途不同，别混用）：
 *  · IconTile  → **界面装饰**。装饰一律用 lucide 图标，因为 emoji 跨平台渲染差异大
 *                且不跟主题变色（🎴 在部分机型是红色扑克牌）。
 *  · EmojiTile → **内容本身**就是 emoji 的场合（歌曲 / 课程 / 卡片封面）。
 *                这些 emoji 是数据，不能替换成图标，但同样需要一个统一底座：
 *                尺寸跟流体字号走、配色取 .tone-* 色板、暗黑模式自动适配。
 *
 * 尺寸：底座 = emoji 字号的 1.75 倍（保持 emoji 四周留白比例恒定，
 *      所以只写比例不写像素，整块会随 --fs-emoji-l 一起缩放）。
 *
 * 用法：
 *   <EmojiTile :emoji="s.emoji" :tone="s.tone" />
 *   <EmojiTile emoji="🎵" tone="gold" size="lg" />
 */
import type { Tone } from "../../types";

withDefaults(
  defineProps<{
    emoji: string;
    /** 取自 base.css 的 .tone-* 色调板，是全站唯一允许的彩色来源 */
    tone?: Tone;
    /** md=列表行内 / lg=封面、头部这类主视觉位 / xl=播放页大封面 */
    size?: "md" | "lg" | "xl";
  }>(),
  { tone: "blue", size: "md" }
);
</script>

<template>
  <span class="emoji-tile" :class="[`tone-${tone}`, `emoji-tile--${size}`]" aria-hidden="true">
    {{ emoji }}
  </span>
</template>

<style scoped>
.emoji-tile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 1.75em;
  height: 1.75em;
  border-radius: var(--radius-s);
  font-size: var(--fs-emoji-l);
  line-height: 1;
}
.emoji-tile--lg {
  width: 1.6em;
  height: 1.6em;
  font-size: var(--fs-emoji-xl);
}
/* xl：播放页封面（页面主角）。底座相对 emoji 收紧到 1.25 倍、
 * 圆角升到 --radius —— 越大越要紧一点，否则大尺寸下会散成一块"贴纸"。 */
.emoji-tile--xl {
  width: 1.25em;
  height: 1.25em;
  border-radius: var(--radius);
  font-size: var(--fs-emoji-hero);
}
</style>
