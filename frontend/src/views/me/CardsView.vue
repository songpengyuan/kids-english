<script setup lang="ts">
/**
 * 我的卡片（/me/cards）——奥特曼卡片收集册。
 *
 * 本页改用设计系统第 ②③ 层：PageShell 骨架 + .card + SectionTitle + EmptyState。
 * 稀有度配色从 4 个硬编码 hex（#9ca3af / #3b82f6 / #a855f7 / #f59e0b）
 * 改为取 6 色色调板，暗黑模式下自动跟随。
 */
import { useRouter } from "vue-router";
import { useCardsStore } from "../../stores/cards";
import PageShell from "../../components/ui/PageShell.vue";
import SectionTitle from "../../components/ui/SectionTitle.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import IconTile from "../../components/ui/IconTile.vue";
import { Layers } from "@lucide/vue";

const cards = useCardsStore();
const router = useRouter();

/** 稀有度 → 色调板（全站唯一允许的彩色来源） */
const RARITY_TONE: Record<string, "teal" | "blue" | "purple" | "gold"> = {
  N: "teal",
  R: "blue",
  SR: "purple",
  SSR: "gold",
};
</script>

<template>
  <PageShell title="我的卡片" icon="me" scroll @back="router.push('/me')">
    <section class="card summary">
      <IconTile tone="pink"><Layers class="k-ico" /></IconTile>
      <p class="sum-num">
        已收集 <b>{{ cards.uniqueCount }}</b> / {{ cards.allCards.length }} 张
      </p>
    </section>

    <template v-if="cards.allCards.length">
      <SectionTitle>收集册</SectionTitle>
      <section class="grid">
        <div
          v-for="c in cards.allCards"
          :key="c.id"
          class="card c-card"
          :class="[`rarity-${c.rarity}`, { locked: !cards.owned[c.id] }]"
        >
          <template v-if="cards.owned[c.id]">
            <span class="c-emoji" aria-hidden="true">{{ c.emoji }}</span>
            <span class="c-name">{{ c.name }}</span>
            <span class="c-rarity" :class="`tone-${RARITY_TONE[c.rarity] ?? 'teal'}`">{{
              c.rarity
            }}</span>
            <span v-if="cards.owned[c.id] > 1" class="c-dup">×{{ cards.owned[c.id] }}</span>
          </template>
          <template v-else>
            <span class="c-emoji c-emoji--locked" aria-hidden="true">?</span>
            <span class="c-name">未解锁</span>
          </template>
        </div>
      </section>
    </template>

    <EmptyState v-else title="还没有卡片" desc="学完一课就能抽卡啦" />
  </PageShell>
</template>

<style scoped>
.summary {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
}
.sum-num {
  margin: 0;
  font-weight: var(--fw-mid);
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.sum-num b {
  color: var(--ink);
  font-weight: var(--fw-strong);
  font-size: var(--fs-title);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: var(--gap-s);
}
.c-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-xs);
  padding: var(--gap-s);
  position: relative;
}
.c-card.locked {
  opacity: 0.4;
}
/* 稀有度 = 卡片顶部一道色条，配色取自 6 色色调板 */
.c-card::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: var(--gap-xs);
  border-radius: var(--radius) var(--radius) 0 0;
  background: var(--line);
}
.rarity-N::before {
  background: var(--c-teal);
}
.rarity-R::before {
  background: var(--c-blue);
}
.rarity-SR::before {
  background: var(--c-purple);
}
.rarity-SSR::before {
  background: var(--c-gold);
}

.c-emoji {
  font-size: var(--fs-emoji-l);
  line-height: 1.1;
  margin-top: var(--gap-xs);
}
.c-emoji--locked {
  color: var(--ink-faint);
  font-weight: var(--fw-strong);
}
.c-name {
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
  text-align: center;
  color: var(--ink);
}
.c-rarity {
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
  padding: 1px var(--gap-s);
  border-radius: var(--radius-pill);
}
.c-dup {
  position: absolute;
  top: var(--gap-s);
  right: var(--gap-s);
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
  color: var(--ink-faint);
}
</style>
