<script setup lang="ts">
/**
 * 英雄图鉴里的"形态卡"（宝藏罐用）。
 *
 * 三态：
 *  · 未收集 → 剪影 + "兑换 🐚价"（贝壳够）/ "再攒 N"（不够）
 *  · 已收集未满星 → ★ 星级 + "升级 🐚价"
 *  · 已满星 → "已满级 ★★★"
 *
 * 图片：优先家长放的 `<id>.png`，加载失败自动回退内置原创 `<id>.svg`。
 * compact = 单形态角色用的紧凑卡（只有图 + 角色名）。
 */
import { computed, ref } from "vue";

/** 未解锁卡点的时候摇晃一下 */
const shakeTick = ref(0);
import ShellIcon from "../ShellIcon.vue";

export interface AlbumForm {
  id: string;
  name: string;
  rarity: string;
  rarityLabel: string;
  color: string;
  price: number;
  image: string;
  fallback: string;
  owned: boolean;
  stars: number;
  afford: boolean;
  short: number;
}

const props = withDefaults(
  defineProps<{ form: AlbumForm; heroName: string; maxStars?: number; compact?: boolean }>(),
  { maxStars: 3, compact: false }
);

const emit = defineEmits<{ introduce: [id: string]; buy: [id: string] }>();

/** png 加载失败 → 回退内置原创占位图 */
const imgFailed = ref(false);
const src = computed(() => (imgFailed.value ? props.form.fallback : props.form.image));

function onTap() {
  if (!props.form.owned) shakeTick.value++;
  emit("introduce", props.form.id);
}
</script>

<template>
  <div
    class="form-card"
    :class="[form.rarity, { owned: form.owned, locked: !form.owned, compact }]"
    :style="{ '--tone': form.color }"
  >
    <button
      class="form-tap"
      :class="{ shaking: !form.owned }"
      :key="'shake-' + shakeTick"
      :aria-label="`${heroName} ${form.name}，点击听介绍`"
      @click="onTap"
    >
      <img
        class="form-img"
        :class="{ sil: !form.owned }"
        :src="src"
        :alt="`${heroName}${form.name}`"
        @error="imgFailed = true"
      />
      <!-- 未收集不显示星级（灰星堆在剪影下显得像"已经拿到"） -->
      <span v-if="form.owned" class="form-stars" :aria-label="`${form.stars} 星`">
        <span v-for="s in maxStars" :key="s" :class="{ on: form.stars >= s }">★</span>
      </span>
    </button>
    <p class="form-name">{{ compact ? heroName : form.name }}</p>
    <p class="rarity">{{ form.rarityLabel }}</p>

    <button
      v-if="!form.owned"
      class="buy"
      :disabled="!form.afford"
      :aria-label="`兑换${heroName}${form.name}，${form.price}贝壳`"
      @click="emit('buy', form.id)"
    >
      <template v-if="form.afford">兑换 <ShellIcon />{{ form.price }}</template>
      <template v-else>再攒 {{ form.short }}</template>
    </button>
    <button
      v-else-if="form.stars < maxStars"
      class="buy up"
      :disabled="!form.afford"
      :aria-label="`升级${heroName}${form.name}，${form.price}贝壳`"
      @click="emit('buy', form.id)"
    >
      <template v-if="form.afford">升级 <ShellIcon />{{ form.price }}</template>
      <template v-else>再攒 {{ form.short }}</template>
    </button>
    <span v-else class="maxed">已满级 ★★★</span>
  </div>
</template>

<style scoped>
.form-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: color-mix(in srgb, var(--tone) 12%, var(--card-bg));
  border: 2px solid color-mix(in srgb, var(--tone) 42%, transparent);
  border-radius: var(--radius-s);
  padding: var(--gap-xs);
}
.form-card.legend {
  border-width: 3px;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tone) 30%, transparent);
}
.form-card.locked {
  background: var(--btn-off-bg);
  border-color: var(--btn-off-deep);
}
.form-tap {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  -webkit-tap-highlight-color: transparent;
}
.form-tap:active {
  transform: scale(0.94);
}
/* 未解锁卡点一下：左右摇晃，表示"锁住了" */
.form-tap.shaking {
  animation: card-shake 0.4s ease;
}
@keyframes card-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}
.form-img {
  /* 5 岁适龄：手机 80px / 平板 ~112px / 桌面 112px（随 vw 流体） */
  width: clamp(80px, 15vw, 112px);
  height: clamp(80px, 15vw, 112px);
  object-fit: contain;
}
/* 紧凑卡（单形态角色）：手机 64px / 平板 ~96px / 桌面 96px */
.compact .form-img {
  width: clamp(64px, 13vw, 96px);
  height: clamp(64px, 13vw, 96px);
}
/* 未收集：剪影（看不清是谁，吊胃口） */
.form-img.sil {
  filter: brightness(0) opacity(0.28);
}
.form-stars {
  display: flex;
  gap: 3px;
  font-size: clamp(13px, 1.4vw, 16px);
  color: var(--line);
  line-height: 1;
}
.form-stars .on {
  color: var(--gold);
}
.form-name {
  margin: 0;
  font-size: clamp(15px, 1.7vw, 19px);
  font-weight: 800;
  color: var(--ink);
  text-align: center;
}
.rarity {
  margin: 0;
  font-size: clamp(13px, 1.4vw, 16px);
  font-weight: 700;
  color: var(--ink-faint);
}
.buy {
  width: 100%;
  min-height: var(--tap-min);
  border: none;
  border-radius: var(--radius-pill);
  background: var(--green);
  color: var(--on-tone);
  font-weight: 900;
  font-size: var(--fs-small);
  box-shadow: 0 var(--press) 0 var(--green-dark);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
}
.buy.up {
  background: var(--blue);
  box-shadow: 0 var(--press) 0 var(--blue-dark);
}
.buy:disabled {
  background: var(--btn-off-bg);
  color: var(--btn-off-ink);
  box-shadow: none;
  cursor: default;
}
.buy:active:not(:disabled) {
  transform: translateY(calc(var(--press) - 1px));
  box-shadow: none;
}
.maxed {
  font-size: clamp(13px, 1.4vw, 16px);
  font-weight: 800;
  color: var(--gold);
}
</style>
