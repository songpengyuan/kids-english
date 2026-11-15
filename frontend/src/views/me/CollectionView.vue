<script setup lang="ts">
/**
 * 我的收藏册（/me/collection，2026-11-15 收集生长 v1）——孩子自己的"宝贝墙"。
 *
 * 目标：给"我的东西在变多"的可视化（趣味感杠杆②，叽里呱啦对照实验的结论：
 * 奖励不生长 = 没有明天再来的动机），顺带兑现日历页"打卡贴纸"的老承诺。
 *
 * 组成：
 *  - 课程贴纸墙：每课一张贴纸卡，解锁 = 本课全部玩法关完成（与 LessonLevelList
 *    宝箱门同口径，纯派生零新存储，见 useCollection）；封面复用 emojiCoverUrl
 *    自托管贴纸图，资产集外回退 emoji 文本
 *  - 英雄收集度条：rewards store 的 ownedCount/albumPct，跳宝藏罐看大图
 *
 * 点读口径（孩子看到的都能发音）：贴纸卡点读英文课名（CourseDetailView.speakTitle
 * 同款 ttsOnly），点卡同时进该课（锁定卡也进——孩子回去把课玩完）；英雄条目 speakZh。
 */
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { ChevronRight } from "@lucide/vue";
import PageShell from "../../components/ui/PageShell.vue";
import ShellIcon from "../../components/ShellIcon.vue";
import { useCollection, type LessonSticker } from "../../composables/useCollection";
import { useMascot } from "../../composables/useMascot";
import { speak, speakZh } from "../../services/speech";
import { hapticTap } from "../../services/haptics";

const router = useRouter();
const { stickers, stickersUnlocked, stickersTotal, heroesOwned, heroesTotal, heroesPct } =
  useCollection();
const mascot = useMascot();

onMounted(() => {
  // 收藏册问候：页面在 dock 白名单里，鸟已在角落，只出气泡不重复飞入
  mascot.collectionGreet();
});

function openSticker(s: LessonSticker) {
  hapticTap();
  if (s.unlocked) void speak(s.lesson.title, { ttsOnly: true });
  else speakZh("玩完这一课的玩法，就能点亮这张贴纸哦");
  void router.push(`/course/${s.lesson.id}`);
}

function goTreasure() {
  hapticTap();
  speakZh("宝藏罐");
  void router.push("/me/treasure");
}
</script>

<template>
  <PageShell
    scroll
    title="我的收藏册"
    icon="sticker"
    back-label="返回"
    @back="router.push('/me')"
  >
    <!-- 总览：贴纸 + 英雄两条收集线，全页的"成就感主角" -->
    <section class="card summary anim-pop">
      <div class="summary__row">
        <span class="summary__item">🏷 课程贴纸 <b>{{ stickersUnlocked }}/{{ stickersTotal }}</b></span>
        <span class="summary__item">🐚 英雄 <b>{{ heroesOwned }}/{{ heroesTotal }}</b></span>
      </div>
      <div class="summary__bar" aria-hidden="true">
        <i :style="{ width: heroesPct + '%' }"></i>
      </div>
      <p class="summary__hint">每玩完一课点亮一张贴纸，攒贝壳还能换英雄哦！</p>
    </section>

    <!-- 课程贴纸墙：解锁亮起来，未解锁是问号剪影（期待感） -->
    <section class="wall">
      <button
        v-for="s in stickers"
        :key="s.lesson.id"
        type="button"
        class="sticker"
        :class="{ 'sticker--locked': !s.unlocked }"
        :aria-label="`第${s.lesson.id}课贴纸，${s.unlocked ? '已点亮' : '未点亮'}，${s.lesson.title}`"
        @click="openSticker(s)"
      >
        <span class="sticker__disc">
          <img v-if="s.unlocked && s.cover" class="sticker__img" :src="s.cover" :alt="s.lesson.title" />
          <span v-else-if="s.unlocked" class="sticker__emoji">{{ s.lesson.emoji }}</span>
          <span v-else class="sticker__q" aria-hidden="true">?</span>
        </span>
        <span class="sticker__name">{{ s.lesson.titleZh }}</span>
        <span v-if="s.unlocked" class="sticker__en">{{ s.lesson.title }}</span>
        <span v-else class="sticker__lock">{{ s.done }}/{{ s.total }} 玩法</span>
      </button>
    </section>

    <!-- 英雄收集度：跳宝藏罐（那里是图鉴 + 兑换） -->
    <button type="button" class="card heroes anim-fade-up" @click="goTreasure">
      <span class="heroes__ico"><ShellIcon /></span>
      <span class="heroes__body">
        <span class="heroes__title">英雄收藏</span>
        <span class="heroes__desc">{{ heroesOwned }}/{{ heroesTotal }} 个形态（{{ heroesPct }}%）· 去宝藏罐看</span>
      </span>
      <ChevronRight class="heroes__chev" aria-hidden="true" />
    </button>
  </PageShell>
</template>

<style scoped>
.summary {
  display: flex;
  flex-direction: column;
  gap: var(--gap-xs);
  padding: var(--gap-s) var(--gap-m);
  margin-bottom: var(--gap-s);
}
.summary__row {
  display: flex;
  justify-content: space-between;
}
.summary__item {
  font-size: var(--fs-body);
  color: var(--ink-soft);
}
.summary__item b {
  color: var(--ink);
  font-weight: var(--fw-strong);
  font-size: var(--fs-title);
}
.summary__bar {
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--line);
  overflow: hidden;
}
.summary__bar i {
  display: block;
  height: 100%;
  background: var(--gold);
  border-radius: inherit;
  transition: width 0.5s;
}
.summary__hint {
  margin: 0;
  font-size: var(--fs-small);
  color: var(--ink-faint);
}

/* 贴纸墙：3 列方卡（宽屏自动多列），未解锁 = 虚线问号盘 */
.wall {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: var(--gap-s);
}
.sticker {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: var(--gap-s) var(--gap-xs);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--card-bg);
  box-shadow: var(--shadow-soft);
  color: inherit;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: transform var(--dur-fast);
}
.sticker:active {
  transform: scale(0.96);
}
.sticker--locked {
  border-style: dashed;
  box-shadow: none;
  background: transparent;
}
.sticker__disc {
  width: min(88px, 18vw);
  aspect-ratio: 1;
  border-radius: var(--radius-pill);
  background: var(--brand-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.sticker--locked .sticker__disc {
  background: var(--line);
}
.sticker__img {
  width: 76%;
  height: 76%;
  object-fit: contain;
}
.sticker__emoji {
  font-size: 34px;
  line-height: 1;
}
.sticker__q {
  font-size: 30px;
  font-weight: var(--fw-strong);
  color: var(--ink-faint);
}
.sticker__name {
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.sticker--locked .sticker__name {
  color: var(--ink-faint);
}
.sticker__en,
.sticker__lock {
  font-size: var(--fs-small);
  color: var(--ink-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* 英雄条：横向卡，与磁贴观感一致 */
.heroes {
  margin-top: var(--gap-s);
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  padding: var(--gap-s) var(--gap-m);
  text-align: left;
  color: inherit;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.heroes:active {
  transform: scale(0.98);
}
.heroes__ico {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-pill);
  background: var(--brand-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}
.heroes__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.heroes__title {
  font-size: var(--fs-body);
  font-weight: var(--fw-strong);
  color: var(--ink);
}
.heroes__desc {
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.heroes__chev {
  flex: none;
  color: var(--ink-faint);
}
</style>
