<script setup lang="ts">
/**
 * 宝藏罐（/treasure）：贝壳余额 + **英雄图鉴**。
 *
 * 两级结构（用户要求）：
 *   第一级 = 角色（烈焰战士 / 苍蓝战士 …）
 *   第二级 = 同一角色的不同**形态**（复合型 / 强力型 / 空中型 …），每个形态独立收集
 *
 * 交互：
 *   · 点任意形态卡 → 发音介绍（先英文"Blaze Warrior, Combo Form"再中文"烈焰战士，复合型"）
 *   · 未收集 → 显示剪影 + 价格；贝壳够就能兑换，不够则提示"再攒 N 个贝壳"
 *   · 已收集 → 显示 ★（可重复兑换升级，最高 3★）—— 给贝壳一个长期去处
 *
 * 数据流单向：本页只调 rewards store 的 buyForm，不改其它状态。
 */
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import {
  ALL_FORMS,
  formById,
  ERA_INFO,
  FORM_TOTAL,
  HERO_TOTAL,
  RARITY_INFO,
  heroesByEra,
  introOf,
} from "../data/heroes";
import { MAX_FORM_STARS, useRewardsStore } from "../stores/rewards";
import { sfxCoin, sfxCorrect, sfxTap, sfxWrong } from "../services/effects";
import { speak, speakZh } from "../services/speech";
import { Star } from "@lucide/vue";
import HeaderBar from "../components/layout/HeaderBar.vue";
import HeroFormCard from "../components/treasure/HeroFormCard.vue";
import type { AlbumForm } from "../components/treasure/HeroFormCard.vue";
import PathIcon from "../components/PathIcon.vue";
import ShellIcon from "../components/ShellIcon.vue";

defineOptions({ name: "TreasureView" }); // KeepAlive include 需要稳定组件名

const rewards = useRewardsStore();
const router = useRouter();

/** 卡片条目 = 形态数据 + 它属于哪个角色（单形态角色的卡上直接显示角色名） */
interface CardEntry {
  key: string;
  heroName: string;
  form: AlbumForm;
}

/** 形态 → 卡片数据（价格/是否收集/星级/够不够钱） */
function toCard(f: (typeof ALL_FORMS)[number]): AlbumForm {
  const price = RARITY_INFO[f.rarity].price;
  return {
    id: f.id,
    name: f.name,
    rarity: f.rarity,
    rarityLabel: RARITY_INFO[f.rarity].label,
    color: f.color,
    price,
    image: f.image,
    fallback: f.fallback,
    owned: rewards.isOwned(f.id),
    stars: rewards.starsOf(f.id),
    afford: rewards.shells >= price,
    short: Math.max(0, price - rewards.shells),
  };
}

/** 图鉴：世代 → 角色 → 形态（三级；41 位角色不分段会太长） */
const album = computed(() =>
  heroesByEra().map(({ era, heroes }) => ({
    era,
    ...ERA_INFO[era],
    /** 单形态角色（昭和居多）→ 紧凑卡网格，省掉一屏一屏的空行 */
    singles: heroes
      .filter((h) => h.forms.length === 1)
      .map<CardEntry>((h) => ({ key: h.id, heroName: h.name, form: toCard(ALL_FORMS.find((x) => x.id === h.forms[0].id)!) })),
    /** 多形态角色 → 一个角色一段，形态并排 */
    groups: heroes
      .filter((h) => h.forms.length > 1)
      .map((hero) => ({
        id: hero.id,
        name: hero.name,
        en: hero.en,
        owned: hero.forms.filter((f) => rewards.isOwned(f.id)).length,
        total: hero.forms.length,
        forms: hero.forms.map<CardEntry>((f) => ({
          key: f.id,
          heroName: hero.name,
          form: toCard(ALL_FORMS.find((x) => x.id === f.id)!),
        })),
      })),
  }))
);

/** 点卡片：已收集 → 进角色详情页；未收集 → 发音介绍（英文读完再接中文，不掐断） */
async function introduce(formId: string) {
  sfxTap();
  if (rewards.isOwned(formId)) {
    const h = formById(formId)?.heroId;
    if (h) {
      router.push(`/treasure/hero/${h}?form=${formId}`);
      return;
    }
  }
  const intro = introOf(formId);
  if (!intro) return;
  await speak(intro.en); // 英文：顺便当英语输入
  await speakZh(intro.zh, 1, { bypassMute: true });
}

/** 兑换 / 升级 */
function buy(formId: string) {
  sfxTap();
  const r = rewards.buyForm(formId);
  if (r === "bought") sfxCoin();
  else if (r === "upgraded") sfxCorrect();
  else sfxWrong();
}

</script>

<template>
  <div class="treasure view">
    <HeaderBar show-back back-label="返回首页" @back="router.push('/')">
      <template #title><PathIcon name="gift" class="title-ico" /> 宝藏罐</template>
      <template #right>
        <div class="star-badge"><Star class="k-ico star-fill" />{{ rewards.totalStars }}</div>
      </template>
    </HeaderBar>

    <div class="view-body treasure-body">
      <!-- 贝壳余额 -->
      <div class="shells-card anim-pop">
        <span class="shell-big"><ShellIcon /></span>
        <div>
          <p class="label">攒了这么多贝壳</p>
          <p class="num">{{ rewards.shells }}</p>
          <p class="hint">每完成一个玩法开一次宝箱，贝壳就会变多！</p>
        </div>
      </div>

      <!-- 英雄图鉴：角色 → 形态 -->
      <div class="album anim-fade-up">
        <div class="album-head">
          <span class="album-title">英雄图鉴</span>
          <span class="album-progress">
            {{ rewards.ownedCount }} / {{ FORM_TOTAL }} 个形态 · {{ HERO_TOTAL }} 位角色（{{ rewards.albumPct }}%）
          </span>
        </div>

        <!-- 世代 → 角色 → 形态 -->
        <div v-for="era in album" :key="era.era" class="era-block">
          <div class="era-head">
            <span class="era-name">{{ era.label }}</span>
            <span class="era-en">{{ era.en }} · {{ era.hint }}</span>
          </div>

          <!-- 单形态角色：紧凑卡网格（角色名显示在卡上） -->
          <div v-if="era.singles.length" class="forms mini">
            <HeroFormCard
              v-for="c in era.singles"
              :key="c.key"
              :form="c.form"
              :hero-name="c.heroName"
              :max-stars="MAX_FORM_STARS"
              compact
              @introduce="introduce"
              @buy="buy"
            />
          </div>

          <!-- 多形态角色：一个角色一段 -->
          <div v-for="hero in era.groups" :key="hero.id" class="hero-row">
            <div class="hero-head">
              <span class="hero-name">{{ hero.name }}</span>
              <span class="hero-en">{{ hero.en }}</span>
              <span class="hero-count">{{ hero.owned }}/{{ hero.total }}</span>
            </div>
            <div class="forms">
              <HeroFormCard
                v-for="c in hero.forms"
                :key="c.key"
                :form="c.form"
                :hero-name="c.heroName"
                :max-stars="MAX_FORM_STARS"
                @introduce="introduce"
                @buy="buy"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.treasure {
  gap: var(--gap-s);
}
.treasure-body {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
  overflow-y: auto;
  padding-bottom: var(--gap-m);
}

/* ---------- 贝壳余额 ---------- */
.shells-card {
  display: flex;
  align-items: center;
  gap: var(--gap-m);
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-m);
  flex: none;
}
.shell-big {
  font-size: clamp(34px, 7vh, 54px);
  line-height: 1;
  filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.12));
}
.label {
  margin: 0;
  font-size: var(--fs-small);
  font-weight: 700;
  color: var(--ink-soft);
}
.num {
  margin: 0;
  font-size: var(--fs-title);
  font-weight: 900;
  color: var(--ink);
}
.hint {
  margin: 0;
  font-size: var(--fs-small);
  color: var(--ink-faint);
  font-weight: 600;
}

/* ---------- 图鉴 ---------- */
.album {
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hard);
  padding: var(--gap-m);
  display: flex;
  flex-direction: column;
  gap: var(--gap-m);
  flex: none;
}
.album-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--gap-s);
}
.album-title {
  font-weight: 900;
  font-size: var(--fs-body);
  color: var(--ink);
}
.album-progress {
  font-weight: 800;
  font-size: var(--fs-small);
  color: var(--ink-soft);
}

/* 一个角色一段 */
.era-block {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
  padding-top: var(--gap-xs);
  border-top: 2px dashed var(--line);
}
.era-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.era-name {
  font-weight: 900;
  font-size: var(--fs-body);
  color: var(--ink);
  background: color-mix(in srgb, var(--purple) 22%, transparent);
  border-radius: var(--radius-pill);
  padding: 2px 12px;
}
.era-en {
  font-size: var(--fs-small);
  font-weight: 700;
  color: var(--ink-faint);
}
.hero-row {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
}
.hero-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.hero-name {
  font-weight: 900;
  font-size: var(--fs-body);
  color: var(--ink);
}
.hero-en {
  font-size: var(--fs-small);
  font-weight: 700;
  color: var(--ink-faint);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hero-count {
  font-size: var(--fs-small);
  font-weight: 800;
  color: var(--ink-soft);
}

/* 形态卡网格（卡片本体样式在 components/treasure/HeroFormCard.vue 里） */
.forms {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: var(--gap-s);
}
/* 单形态角色：紧凑卡，一屏能放 3~4 个 */
.forms.mini {
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
}
</style>
