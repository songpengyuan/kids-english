<script setup>
/**
 * 宝藏罐：展示贝壳余额 + 贴纸图鉴（已收集亮色，未收集灰显"?"激励收集）。
 * 只读 rewards store，不在此页发奖励——数据流单向。
 */
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useRewardsStore, stickerPool, stickerPrice, stickerTotal } from "../stores/rewards";
import { sfxCoin, sfxTap, sfxWrong } from "../utils/effects";
import { ChevronLeft, Star } from "@lucide/vue";

defineOptions({ name: "TreasureView" }); // KeepAlive include 需要稳定组件名

const rewards = useRewardsStore();
const router = useRouter();

/** 图鉴：池子里的贴纸 + 是否已收集 */
const album = computed(() => {
  return stickerPool.map((s) => ({ emoji: s, got: rewards.stickers.includes(s) }));
});

const albumPct = computed(() =>
  stickerTotal ? Math.round((rewards.stickers.length / stickerTotal) * 100) : 0
);

/** 商店与图鉴同构：未收集的贴纸可按标价定向购买（贝壳的消耗出口） */
const shop = computed(() =>
  stickerPool.map((s) => ({ emoji: s, got: rewards.stickers.includes(s) }))
);

function buy(emoji) {
  sfxTap();
  const ok = rewards.buySticker(emoji);
  if (ok) sfxCoin();
  else sfxWrong();
}
</script>

<template>
  <div class="treasure view">
    <div class="topbar">
      <button class="back" aria-label="返回首页" title="返回首页" @click="router.push('/')">
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

      <!-- 贴纸商店：贝壳定向购买未收集贴纸（消耗出口，避免贝壳只进不出） -->
      <div class="album anim-fade-up">
        <div class="album-head">
          <span class="album-title">🛍️ 贴纸商店</span>
          <span class="album-progress">🐚 {{ rewards.shells }}</span>
        </div>
        <p class="shop-tip">贝壳攒着也是攒着，买下还没集到的贴纸吧！一张 {{ stickerPrice }} 贝壳</p>
        <div class="grid">
          <div
            v-for="(s, i) in shop"
            :key="'shop' + s.emoji + i"
            class="cell"
            :class="{ got: s.got }"
          >
            <span class="sticker">{{ s.got ? s.emoji : "?" }}</span>
            <button
              v-if="!s.got"
              class="buy"
              :disabled="rewards.shells < stickerPrice"
              :aria-label="'购买' + s.emoji + '贴纸'"
              @click="buy(s.emoji)"
            >
              🐚 {{ stickerPrice }}
            </button>
            <span v-else class="cell-cap">已收集</span>
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

/* ---------- 贴纸商店 ---------- */
.shop-tip {
  margin: 0;
  font-size: var(--fs-small);
  color: var(--ink-faint);
  font-weight: 700;
}
.buy {
  margin-top: 4px;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  background: linear-gradient(160deg, #ffd87a, #f0b429);
  color: #6b4e00;
  font-weight: 800;
  font-size: 12px;
  box-shadow: 0 var(--press) 0 rgba(0, 0, 0, 0.14);
  transition: transform 0.1s, opacity 0.2s;
}
.buy:active {
  transform: translateY(2px);
}
.buy:disabled {
  opacity: 0.45;
  transform: none;
  cursor: not-allowed;
}
</style>
