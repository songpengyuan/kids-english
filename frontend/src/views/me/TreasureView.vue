<script setup lang="ts">
/**
 * 宝藏罐（/me/treasure）：贝壳余额 + **英雄图鉴**。
 *
 * 两级结构：
 *   第一级 = 角色（烈焰战士 / 苍蓝战士 …）
 *   第二级 = 同一角色的不同**形态**（复合型 / 强力型 / 空中型 …），每个形态独立收集
 *
 * 交互：
 *   · 点任意形态卡 → 发音介绍（先英文"Blaze Warrior, Combo Form"再中文"烈焰战士，复合型"）
 *   · 未收集 → 显示剪影 + 价格；贝壳够就能兑换，不够则提示"再攒 N 个贝壳"
 *   · 已收集 → 显示 ★（可重复兑换升级，最高 3★）—— 给贝壳一个长期去处
 *
 * 页面结构（2026-10 设计系统统一）：骨架用 PageShell、区块标题用 SectionTitle、
 * 顶部两个筛选用 SegmentedTabs、空态用 EmptyState，本文件不再自写卡片底色与圆角。
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
} from "../../data/heroes";
import { MAX_FORM_STARS, useRewardsStore } from "../../stores/rewards";
import { sfxCoin, sfxCorrect, sfxTap, sfxWrong } from "../../services/effects";
import { speak, speakZh } from "../../services/speech";
import { Star } from "@lucide/vue";
import PageShell from "../../components/ui/PageShell.vue";
import SectionTitle from "../../components/ui/SectionTitle.vue";
import SegmentedTabs from "../../components/ui/SegmentedTabs.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import HeroFormCard from "../../components/treasure/HeroFormCard.vue";
import type { AlbumForm } from "../../components/treasure/HeroFormCard.vue";
import ShellIcon from "../../components/ShellIcon.vue";

defineOptions({ name: "TreasureView" }); // KeepAlive include 需要稳定组件名

const rewards = useRewardsStore();
const router = useRouter();

/** 顶部筛选：owned=只看已兑换获得，all=看全部英雄图鉴 */
const viewTab = ref<"owned" | "all">("owned");

const VIEW_TABS = [
  { value: "owned", label: "我获得的" },
  { value: "all", label: "全部英雄" },
];

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
  heroesByEra().map(({ era, heroes }) => {
    const onlyOwned = viewTab.value === "owned";
    const filterOwned = (c: CardEntry) => !onlyOwned || c.form.owned;
    return {
      era,
      ...ERA_INFO[era],
      singles: heroes
        .filter((h) => h.forms.length === 1)
        .map<CardEntry>((h) => ({ key: h.id, heroName: h.name, form: toCard(ALL_FORMS.find((x) => x.id === h.forms[0].id)!) }))
        .filter(filterOwned),
      groups: heroes
        .filter((h) => h.forms.length > 1)
        .map((hero) => ({
          id: hero.id,
          name: hero.name,
          en: hero.en,
          owned: hero.forms.filter((f) => rewards.isOwned(f.id)).length,
          total: hero.forms.length,
          forms: hero.forms
            .map<CardEntry>((f) => ({
              key: f.id,
              heroName: hero.name,
              form: toCard(ALL_FORMS.find((x) => x.id === f.id)!),
            }))
            .filter(filterOwned),
        }))
        .filter((g) => g.forms.length > 0),
    };
  })
);

/** 点卡片：已收集 → 进角色详情页；未收集 → 发音介绍（英文读完再接中文，不掐断） */
async function introduce(formId: string) {
  sfxTap();
  if (rewards.isOwned(formId)) {
    const h = formById(formId)?.heroId;
    if (h) {
      router.push(`/me/treasure/hero/${h}?form=${formId}`);
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
  <PageShell
    scroll
    title="宝藏罐"
    icon="gift"
    back-label="返回"
    @back="router.push('/me')"
  >
    <template #right>
      <div class="star-badge"><Star class="k-ico star-fill" />{{ rewards.totalStars }}</div>
    </template>

    <!-- 贝壳余额：全页唯一的实底大卡，孩子第一眼看到攒了多少 -->
    <section class="card shells anim-pop">
      <span class="shells__icon"><ShellIcon /></span>
      <div class="shells__body">
        <p class="shells__label">攒了这么多贝壳</p>
        <p class="shells__num">{{ rewards.shells }}</p>
        <p class="shells__hint">每完成一个玩法开一次宝箱，贝壳就会变多！</p>
      </div>
    </section>

    <!-- 英雄图鉴：世代 → 角色 → 形态 -->
    <section class="card album anim-fade-up">
      <header class="album__head">
        <SectionTitle>英雄图鉴</SectionTitle>
        <span class="album__progress">
          {{ rewards.ownedCount }} / {{ FORM_TOTAL }} 个形态 · {{ HERO_TOTAL }} 位角色（{{ rewards.albumPct }}%）
        </span>
      </header>

      <SegmentedTabs
        :model-value="viewTab"
        :items="VIEW_TABS"
        @update:model-value="viewTab = $event as 'owned' | 'all'"
      />

      <EmptyState
        v-if="viewTab === 'owned' && rewards.ownedCount === 0"
        title="还没有获得英雄"
        desc="去闯关攒贝壳兑换吧！"
      />

      <div v-for="era in album" :key="era.era" class="era">
        <div class="era__head">
          <span class="era__name">{{ era.label }}</span>
          <span class="era__en">{{ era.en }} · {{ era.hint }}</span>
        </div>

        <!-- 单形态角色：紧凑卡网格（角色名显示在卡上） -->
        <div v-if="era.singles.length" class="forms forms--mini">
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
          <div class="hero-row__head">
            <span class="hero-row__name">{{ hero.name }}</span>
            <span class="hero-row__en">{{ hero.en }}</span>
            <span class="hero-row__count">{{ hero.owned }}/{{ hero.total }}</span>
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
    </section>
  </PageShell>
</template>

<style scoped>
/* ---------- 贝壳余额 ---------- */
.shells {
  display: flex;
  align-items: center;
  gap: var(--gap-m);
}
.shells__icon {
  font-size: var(--fs-emoji-l);
  line-height: 1;
  filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.12));
}
.shells__body {
  min-width: 0;
}
.shells__label {
  margin: 0;
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  color: var(--ink-soft);
}
.shells__num {
  margin: 0;
  font-size: var(--fs-title);
  font-weight: var(--fw-strong);
  color: var(--ink);
}
.shells__hint {
  margin: 0;
  font-size: var(--fs-small);
  color: var(--ink-faint);
  font-weight: var(--fw-mid);
}

/* ---------- 图鉴 ---------- */
.album {
  display: flex;
  flex-direction: column;
  gap: var(--gap-m);
}
.album__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--gap-s);
}
.album__progress {
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
  color: var(--ink-soft);
}

/* 一个世代一段，用虚线分隔（视觉上"往下还有"） */
.era {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
  padding-top: var(--gap-xs);
  border-top: 2px dashed var(--line);
}
.era__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.era__name {
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
  color: var(--ink);
  background: color-mix(in srgb, var(--purple) 22%, transparent);
  border-radius: var(--radius-pill);
  padding: 2px 12px;
}
.era__en {
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  color: var(--ink-faint);
}

.hero-row {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
}
.hero-row__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.hero-row__name {
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
  color: var(--ink);
}
.hero-row__en {
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  color: var(--ink-faint);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hero-row__count {
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
  color: var(--ink-soft);
}

/* 形态卡网格（卡片本体样式在 components/treasure/HeroFormCard.vue 里） */
.forms {
  display: grid;
  /* 列宽随设备：手机 ~2 列大卡 / 平板 ~5 列 / 桌面更多，auto-fill 自适应 */
  grid-template-columns: repeat(auto-fill, minmax(136px, 1fr));
  gap: var(--gap-s);
}
/* 单形态角色：紧凑卡，一屏能放 3~4 个 */
.forms--mini {
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
}
</style>
