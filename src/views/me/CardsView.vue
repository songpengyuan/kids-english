<script setup lang="ts">
/**
 * 我的卡片（/me/cards）——奥特曼卡片收集册
 */
import AppHeader from "../../components/layout/AppHeader.vue";
import { useCardsStore } from "../../stores/cards";

const cards = useCardsStore();
</script>

<template>
  <div class="cards view">
    <AppHeader title="我的卡片" icon="me" />
    <div class="cards-body view-body">
      <p class="summary">已收集 {{ cards.uniqueCount }} / {{ cards.allCards.length }} 张</p>
      <div class="grid">
        <div
          v-for="c in cards.allCards"
          :key="c.id"
          class="card"
          :class="['rarity-' + c.rarity, { locked: !cards.owned[c.id] }]"
        >
          <template v-if="cards.owned[c.id]">
            <div class="card-emoji">{{ c.emoji }}</div>
            <div class="card-name">{{ c.name }}</div>
            <div class="card-rarity">{{ c.rarity }}</div>
            <div v-if="cards.owned[c.id] > 1" class="card-dup">×{{ cards.owned[c.id] }}</div>
          </template>
          <template v-else>
            <div class="card-emoji">❓</div>
            <div class="card-name">未解锁</div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cards-body {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
}
.summary {
  text-align: center;
  font-weight: 800;
  color: var(--ink-soft);
  margin: 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: var(--gap-s);
}
.card {
  border-radius: var(--radius);
  padding: var(--gap-s);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: var(--card-bg);
  border: 2px solid var(--line);
  position: relative;
}
.card.locked {
  opacity: 0.4;
}
.card.rarity-N { border-color: #9ca3af; }
.card.rarity-R { border-color: #3b82f6; }
.card.rarity-SR { border-color: #a855f7; box-shadow: 0 2px 12px rgba(168,85,247,0.3); }
.card.rarity-SSR { border-color: #f59e0b; box-shadow: 0 0 16px rgba(245,158,11,0.5); }
.card-emoji { font-size: 36px; }
.card-name { font-size: 12px; font-weight: 800; text-align: center; }
.card-rarity { font-size: 10px; font-weight: 800; padding: 1px 8px; border-radius: 99px; background: rgba(240,180,41,0.15); color: #b45309; }
.card-dup { position: absolute; top: 4px; right: 6px; font-size: 11px; font-weight: 800; color: var(--ink-faint); }
</style>
