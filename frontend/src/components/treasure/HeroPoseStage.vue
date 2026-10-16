<script setup lang="ts">
/**
 * HeroPoseStage —— 英雄详情页的「大图舞台」（设计系统第 ④ 层，领域组件）
 *
 * 从 HeroDetailView（原 1289 行）拆出的第一块：形象大图 + 多姿势轮播。
 *
 * 为什么要单独成组件：
 *   1. 这块自带一套完整的滚动轮播逻辑（snap 定位、箭头/小点跳转、滚动同步、
 *      宽度兜底），是页面里最独立、最"自洽"的部分，混在页面里只让主文件失焦；
 *   2. 轮播对拍的关键是"格子宽度"，只有这一层知道它——对外只暴露语义化的
 *      `poses` / `index`，父级不需要关心 scrollLeft 怎么算。
 *
 * 姿势索引由父级持有（v-model:index），因为全屏查看器要和主图共用同一个
 * 当前姿势——两份索引迟早会不同步。
 */
import { ref, watch } from "vue";
import PathIcon from "../PathIcon.vue";

const props = defineProps<{
  /** 当前形态的所有姿势图（已过滤加载失败的） */
  poses: string[];
  /** 当前姿势下标（v-model:index） */
  index: number;
  /** 形态主题色，用于舞台光晕与选中点 */
  tone: string;
  /** 形态名（左上角标签） */
  formName: string;
  /** 未收集 → 剪影 */
  silhouette: boolean;
  /** 无障碍用的角色名 + 形态名 */
  heroName: string;
}>();

const emit = defineEmits<{
  "update:index": [n: number];
  /** 点了「放大看」 */
  zoom: [];
  /** 某张图加载失败（父级记下来，后续跳过） */
  imageError: [src: string];
}>();

const poseEl = ref<HTMLElement | null>(null);

function cellWidth(): number {
  return poseEl.value?.querySelector<HTMLElement>(".pose-cell")?.offsetWidth ?? 0;
}

/** 滚动时同步下标（用户自己滑的也要让点指示器跟上） */
function syncPose() {
  const w = cellWidth();
  if (!w) return;
  const idx = Math.round((poseEl.value?.scrollLeft ?? 0) / w);
  emit("update:index", Math.max(0, Math.min(idx, props.poses.length - 1)));
}

function jumpPose(i: number) {
  const w = cellWidth();
  const target = Math.max(0, Math.min(i, props.poses.length - 1));
  emit("update:index", target);
  const el = poseEl.value;
  if (!el) return;
  el.scrollTo?.({ left: target * w, behavior: "smooth" });
  // 兜底：个别环境 smooth 动画不触发时直接定位，保证箭头/小点点击后画面一定跟随
  setTimeout(() => {
    if (Math.abs((el.scrollLeft ?? 0) - target * w) > 8) {
      el.scrollLeft = target * w;
    }
  }, 420);
}

function stepPose(d: number) {
  jumpPose(props.index + d);
}

/** 姿势数量变化（换形态 / 有图加载失败）时把下标夹回合法范围 */
watch(
  () => props.poses.length,
  (n) => {
    if (n && props.index >= n) emit("update:index", 0);
  }
);
</script>

<template>
  <div class="hero-stage" :style="{ '--tone': tone }">
    <div class="pose-view">
      <div ref="poseEl" class="pose-strip" @scroll.passive="syncPose">
        <figure
          v-for="(src, i) in poses"
          :key="src"
          class="pose-cell"
          :class="{ sil: silhouette }"
        >
          <img
            :src="src"
            :alt="`${heroName}${formName}${poses.length > 1 ? ' 姿势' + (i + 1) : ''}`"
            @error="emit('imageError', src)"
          />
        </figure>
      </div>
    </div>

    <button
      v-if="poses.length > 1"
      class="pose-arrow prev"
      aria-label="上一张"
      @click="stepPose(-1)"
    >
      <PathIcon name="chevron-left" />
    </button>
    <button
      v-if="poses.length > 1"
      class="pose-arrow next"
      aria-label="下一张"
      @click="stepPose(1)"
    >
      <PathIcon name="chevron-right" />
    </button>

    <button class="zoom-hint" aria-label="放大查看图片" @click="emit('zoom')">🔍 放大看</button>

    <span class="form-tag">{{ formName }}</span>

    <div
      v-if="poses.length > 1"
      class="pose-dots"
      role="tablist"
      :aria-label="`${heroName}${formName}的姿势`"
    >
      <button
        v-for="(src, i) in poses"
        :key="'d' + i"
        class="pose-dot"
        :class="{ on: i === index }"
        role="tab"
        :aria-selected="i === index"
        :aria-label="`姿势${i + 1}`"
        @click="jumpPose(i)"
      />
    </div>
  </div>
</template>

<style scoped>
.hero-stage {
  position: relative;
  flex: none;
  width: min(72vw, 44vh, 420px);
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius);
  background:
    radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--tone) 26%, transparent), transparent 68%),
    var(--card-bg);
  box-shadow: var(--shadow-float);
  overflow: hidden;
}
/* 多姿势轮播：单格 = 76% 方形画布，横向 snap 滑动 */
.pose-view {
  width: 76%;
  height: 76%;
  position: relative;
}
.pose-strip {
  width: 100%;
  height: 100%;
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.pose-strip::-webkit-scrollbar {
  display: none;
}
.pose-cell {
  flex: none;
  width: 100%;
  height: 100%;
  margin: 0;
  scroll-snap-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pose-cell img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.25));
}
.pose-cell.sil img {
  filter: brightness(0.22) drop-shadow(0 6px 12px rgba(0, 0, 0, 0.3));
}

/* 左右箭头：孩子友好的大按点 */
.pose-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: none;
  background: var(--overlay);
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-chip);
  cursor: pointer;
  font-size: 20px;
  transition: transform var(--dur-fast);
}
.pose-arrow:active {
  transform: translateY(-50%) scale(0.94);
}
.pose-arrow.prev {
  left: 8px;
}
.pose-arrow.next {
  right: 8px;
}

/* 小点指示器：当前页拉长胶囊（与课程轮播一致） */
.pose-dots {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 7px;
  padding: 4px 8px;
  border-radius: var(--radius-pill);
  background: var(--overlay);
}
.pose-dot {
  width: 9px;
  height: 9px;
  padding: 0;
  border: none;
  border-radius: var(--radius-pill);
  background: rgba(0, 0, 0, 0.22);
  cursor: pointer;
  transition:
    width var(--dur-base) var(--ease-out),
    background var(--dur-base) ease;
}
.pose-dot.on {
  width: 22px;
  background: var(--tone, var(--c-blue));
}

.form-tag {
  position: absolute;
  left: 12px;
  top: 12px;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--tone) 22%, var(--bar-bg));
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
  color: var(--ink);
}

/* 放大入口：显眼但克制，孩子一眼知道大图可点 */
.zoom-hint {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 12px;
  border-radius: var(--radius-pill);
  background: var(--overlay);
  color: var(--ink);
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
  box-shadow: var(--shadow-chip);
  cursor: pointer;
  transition: transform var(--dur-fast);
}
.zoom-hint:active {
  transform: translateY(1px) scale(0.97);
}
</style>
