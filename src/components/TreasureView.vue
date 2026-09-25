<script setup>
/**
 * 宝藏罐：展示贝壳余额 + 贴纸图鉴（已收集亮色，未收集灰显"?"激励收集）。
 * 只读 rewards store，不在此页发奖励——数据流单向。
 */
import { computed } from "vue";
import { useRewardsStore, stickerPool, stickerTotal } from "../stores/rewards";
import { ChevronLeft, Star } from "@lucide/vue";

const rewards = useRewardsStore();

const emit = defineEmits(["back"]);

/** 图鉴：池子里的贴纸 + 是否已收集 */
const album = computed(() => {
  return stickerPool.map((s) => ({ emoji: s, got: rewards.stickers.includes(s) }));
});

const albumPct = computed(() =>
  stickerTotal ? Math.round((rewards.stickers.length / stickerTotal) * 100) : 0
);
</script>

<template>
  <div class="treasure view">
    <div class="topbar">
      <button class="back" aria-label="返回首页" title="返回首页" @click="emit('back')">
        <ChevronLeft class="k-ico" />
      </button>
      <div class="title">🎁 宝藏罐</div>
      <div class="star-badge">
        <Star class="k-ico star-fill" />{{ rewards.chestsOpened }} 次开箱
      </div>
    </div>

    <div class="view-body treasure-body">
      <!-- 贝壳余额 -->
      <div class="shells-card anim-pop">
        <span class="shell-ico">🐚</span>
        <div>
          <p class="label">攒了这么多贝壳</p>
          <p class="num">{{ rewards.shells }}</p>
          <p class="hint">每完成一个玩法开一次宝箱，贝壳就会变多！</p>
        </div>
      </div>

      <!-- 贴纸图鉴 -->
      <div class="album anim-fade-up">
        <div class="album-head">
          <span class="album-title">贴纸图鉴</span>
          <span class="album-progress">{{ rewards.stickers.length }} / {{ stickerTotal }}（{{ albumPct }}%）</span>
        </div>
        <div class="grid">
          <div
            v-for="(s, i) in album"
            :key="s.emoji + i"
            class="cell"
            :class="{ got: s.got }"
          >
            <span class="sticker">{{ s.got ? s.emoji : "?" }}</span>
            <span class="cell-cap">{{ s.got ? "已收集" : "待收集" }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.treasure {
  align-items: center;
}
.treasure-body {
  display: flex;
  flex-direction: column;
  gap: var(--gap-m);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: var(--pad-y);
}

.shells-card {
  display: flex;
  align-items: center;
  gap: var(--gap-m);
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-m);
  border-left: 8px solid var(--yellow);
}
.shell-ico {
  font-size: var(--fs-emoji-xl);
  line-height: 1;
}
.label {
  margin: 0;
  font-weight: 800;
  color: var(--ink-soft);
  font-size: var(--fs-small);
}
.num {
  margin: 2px 0 0;
  font-weight: 800;
  font-size: clamp(30px, min(6vh, 5vw), 48px);
  color: var(--gold);
  line-height: 1.1;
}
.hint {
  margin: 4px 0 0;
  font-size: var(--fs-small);
  color: var(--ink-faint);
  font-weight: 700;
}

.album {
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-m);
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
}
.album-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.album-title {
  font-weight: 800;
  color: var(--ink);
  font-size: var(--fs-body);
}
.album-progress {
  font-weight: 800;
  color: var(--ink-soft);
  font-size: var(--fs-small);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: var(--gap-s);
}
.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--gap-s) 0;
  border-radius: var(--radius-s);
  background: var(--tint-cream);
  transition: background 0.2s;
}
.cell.got {
  background: var(--tint-green);
  box-shadow: inset 0 0 0 3px rgba(88, 204, 2, 0.25);
}
.sticker {
  font-size: clamp(26px, min(5vh, 4vw), 38px);
  line-height: 1;
}
.cell:not(.got) .sticker {
  filter: grayscale(1);
  opacity: 0.35;
}
.cell-cap {
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-faint);
}
.cell.got .cell-cap {
  color: var(--green-dark);
}
</style>
