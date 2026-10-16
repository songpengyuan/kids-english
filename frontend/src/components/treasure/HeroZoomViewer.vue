<script setup lang="ts">
/**
 * HeroZoomViewer —— 全屏图片查看器（设计系统第 ④ 层，领域组件）
 *
 * 从 HeroDetailView 拆出的第三块。存在的理由：孩子想"看清奥特曼细节"，
 * 小图不够用，需要一块能把形象图放到最大的沉浸层。
 *
 * 关闭动画（160ms 淡出）由组件自己管：父级只负责 v-if 挂载/卸载，
 * 不需要知道"先播放动画再卸载"这件事——这类时序细节留在组件内才不会外溢。
 *
 * 姿势索引与主图区共用（v-model:index）——两份索引迟早会不同步。
 */
import { ref } from "vue";
import PathIcon from "../PathIcon.vue";
import HeroFormThumbs from "./HeroFormThumbs.vue";
import type { FlatForm } from "../../data/heroes";
import SpeakWave from "../ui/SpeakWave.vue";

const props = defineProps<{
  poses: string[];
  index: number;
  tone: string;
  heroName: string;
  formName: string;
  forms: FlatForm[];
  currentId: string;
  silhouette: boolean;
  /** 正在朗读形态名（声波指示） */
  speaking: boolean;
}>();

const emit = defineEmits<{
  close: [];
  "update:index": [n: number];
  pick: [f: FlatForm];
  sayName: [];
  imageError: [src: string];
}>();

/** 关闭动画进行中（防止连点重复触发） */
const leaving = ref(false);

function requestClose() {
  if (leaving.value) return;
  leaving.value = true;
  window.setTimeout(() => emit("close"), 160);
}

/** 多姿势时换下一张（循环） */
function stepPose(d: number) {
  if (props.poses.length < 2) return;
  const n = props.poses.length;
  emit("update:index", (props.index + d + n) % n);
}
</script>

<template>
  <div
    class="zoom-mask"
    :class="{ leaving }"
    @click.self="requestClose"
  >
    <div class="zoom-card" role="dialog" :aria-label="`${heroName}${formName}大图`">
      <button class="zoom-close" aria-label="关闭大图" @click="requestClose">
        <PathIcon name="close" />
      </button>

      <div class="zoom-stage" :style="{ '--tone': tone }">
        <Transition name="form-fade" mode="out-in">
          <img
            :key="poses[index]"
            class="zoom-img"
            :class="{ sil: silhouette }"
            :src="poses[index]"
            :alt="`${heroName}${formName}放大图${poses.length > 1 ? ' 姿势' + (index + 1) : ''}`"
            @error="emit('imageError', poses[index] ?? '')"
          />
        </Transition>
        <button
          v-if="poses.length > 1"
          class="zoom-arrow prev"
          aria-label="上一张"
          @click="stepPose(-1)"
        >
          <PathIcon name="chevron-left" />
        </button>
        <button
          v-if="poses.length > 1"
          class="zoom-arrow next"
          aria-label="下一张"
          @click="stepPose(1)"
        >
          <PathIcon name="chevron-right" />
        </button>
      </div>

      <p
        class="zoom-name"
        role="button"
        tabindex="0"
        aria-label="朗读形态名"
        @click="emit('sayName')"
        @keydown.enter.prevent="emit('sayName')"
      >
        {{ heroName }} · {{ formName }} <PathIcon name="volume" />
        <SpeakWave v-if="speaking" />
      </p>

      <HeroFormThumbs
        :forms="forms"
        :current-id="currentId"
        :hero-name="heroName"
        variant="overlay"
        @pick="emit('pick', $event)"
      />

      <p v-if="forms.length > 1" class="zoom-tip">左右箭头换姿势，下方缩略图换形态</p>
    </div>
  </div>
</template>

<style scoped>
.zoom-mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-mask);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--mask-bg);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  transition: opacity 0.16s ease;
}
.zoom-mask.leaving {
  opacity: 0;
}
.zoom-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: min(94vw, 640px);
  animation: zoom-in 0.22s var(--ease-pop);
}
.zoom-mask.leaving .zoom-card {
  animation: none;
  transform: scale(0.96);
  transition: transform 0.16s ease;
}
@keyframes zoom-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
.zoom-close {
  position: absolute;
  top: -8px;
  right: -6px;
  z-index: 2;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--overlay);
  color: var(--ink);
  font-size: 22px;
  box-shadow: var(--shadow-chip);
  cursor: pointer;
  transition: transform var(--dur-fast);
}
.zoom-close:active {
  transform: scale(0.92);
}
.zoom-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1 / 1;
  max-height: 64vh;
  border-radius: var(--radius);
  background:
    radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--tone) 30%, transparent), transparent 68%),
    rgba(255, 255, 255, 0.08);
}
/* 查看器内姿势箭头（比页面内的大一号，远距离也点得中） */
.zoom-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: var(--overlay);
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-chip);
  cursor: pointer;
  font-size: 22px;
  transition: transform var(--dur-fast);
}
.zoom-arrow:active {
  transform: translateY(-50%) scale(0.94);
}
.zoom-arrow.prev {
  left: 10px;
}
.zoom-arrow.next {
  right: 10px;
}
.zoom-img {
  width: 84%;
  height: 84%;
  object-fit: contain;
  filter: drop-shadow(0 10px 26px rgba(0, 0, 0, 0.5));
}
.zoom-img.sil {
  filter: brightness(0.22) drop-shadow(0 10px 26px rgba(0, 0, 0, 0.5));
}
.zoom-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--on-tone);
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
  cursor: pointer;
  border-radius: var(--radius-s);
  padding: 4px 10px;
}
.zoom-name:active {
  background: rgba(255, 255, 255, 0.14);
}
.zoom-tip {
  margin: 0;
  font-size: var(--fs-small);
  color: rgba(255, 255, 255, 0.55);
}

/* 形态切换淡入淡出（查看器内大图，幅度比主图区大） */
.form-fade-enter-active,
.form-fade-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}
.form-fade-enter-from {
  opacity: 0;
  transform: scale(0.94);
}
.form-fade-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>
