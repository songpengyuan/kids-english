<script setup lang="ts">
/**
 * 本课关卡大卡片列表（#/course/:id/game 本课闯关地图，2026-11 重设计）。
 *
 * 设计口径（用户拍板）：
 *  1. 形态 = 大卡片关卡列表，替换旧蛇形小圆节点：每关一张横向大卡，大图标 +
 *     序号 + 玩法名 + 状态徽章，整卡可点，主操作触控区大、顺序清楚。
 *  2. 解锁规则 =「玩法全开放、完成才点亮」：9 个玩法关都可直接点进去玩，
 *     不强制线性顺序；玩过并完成（completed 含该玩法 key）后点亮为 done、显示星数；
 *     只有末尾宝箱关仍按「本课全部玩法完成」解锁。不改动 pathLevels.computeStates
 *     的共享线性算法（全站总地图 #/game 仍走 GamePath，语义与测试基线不变）。
 *  3. 范围 = 只服务本课地图；全站总地图继续使用 GamePath。
 *
 * 完成口径：以 progress[lessonId].completed 含 actKey 为「已点亮」（setGameStars /
 * markSong 都会写 completed，与课程完成度 lessonProgress 同口径）；星数取该 key 数值。
 */
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import type { Lesson } from "../../data/lessons";
import { splitActKey } from "../../data/lessons";
import { lessonLevels, type PathLevel } from "../../data/pathLevels";
import { useProgressStore } from "../../stores/progress";
import { speakZh } from "../../services/speech";
import { hapticTap } from "../../services/haptics";
import PathIcon from "../PathIcon.vue";
import ChestReward from "../rewards/ChestReward.vue";

const props = defineProps<{ lesson: Lesson }>();
const router = useRouter();
const progress = useProgressStore();

interface Row {
  lv: PathLevel;
  done: boolean;
  stars: number;
}

/** 本课进度条目（可能为 undefined）；actKey 可能是复合键（learn:colors），按索引取值 */
const rec = computed(() => progress.progress[props.lesson.id] as Record<string, unknown> | undefined);
/** 玩过的玩法 key 列表（含 song / chest 等），完成点亮与宝箱判定统一走它 */
const completed = computed<string[]>(() => (rec.value?.completed as string[] | undefined) ?? []);

const levels = computed(() => lessonLevels(props.lesson));

/** 玩法关（排除末尾宝箱）；顺序由 activityKeys → lessonLevels 决定 */
const rows = computed<Row[]>(() =>
  levels.value
    .filter((l) => l.actKey !== "chest")
    .map((lv) => {
      const done = completed.value.includes(lv.actKey);
      const raw = rec.value?.[lv.actKey];
      const stars = typeof raw === "number" ? raw : 0;
      return { lv, done, stars };
    })
);

/** 推荐关 = 第一个未完成玩法；全部完成则为 null（把注意力让给宝箱） */
const currentId = computed(() => rows.value.find((r) => !r.done)?.lv.id ?? null);
const currentRow = computed(() => rows.value.find((r) => r.lv.id === currentId.value) ?? null);

const doneCount = computed(() => rows.value.filter((r) => r.done).length);
const playCount = computed(() => rows.value.length);
const pct = computed(() => (playCount.value ? Math.round((doneCount.value / playCount.value) * 100) : 0));

/* ---------- 宝箱关（唯一保留解锁条件的奖励节点） ---------- */
const chestDone = computed(() => completed.value.includes("chest"));
const chestOpenable = computed(
  () => !chestDone.value && playCount.value > 0 && doneCount.value === playCount.value
);
const chestOpen = ref(false);

/** 玩法 → 色调（与 LessonMenu 的 ACT_META 一致；仅用于图标着色，不挂全局 .tone-* 卡面类） */
const TONE: Record<string, string> = {
  song: "green",
  learn: "orange",
  quiz: "blue",
  hear: "blue",
  memory: "blue",
  match: "purple",
  speak: "pink",
  order: "teal",
  talk: "teal",
  spinner: "orange"
};
function rowTone(lv: PathLevel): string {
  return TONE[splitActKey(lv.actKey).act] ?? "blue";
}
/** 图标名取裸玩法（复合键 learn:colors 也映射到 learn 图标） */
function iconName(lv: PathLevel): string {
  return splitActKey(lv.actKey).act;
}

/** 玩法全开放：任意玩法卡都直接进闯关玩法页（useQuest 不做锁校验，落点与旧地图一致） */
function openRow(r: Row) {
  hapticTap();
  void router.push(`/course/${props.lesson.id}/game/quest?step=${r.lv.actKey}`);
}

function openChest() {
  if (!chestOpenable.value) return;
  hapticTap();
  chestOpen.value = true;
}
function onChestDone() {
  progress.markChest(props.lesson.id);
  chestOpen.value = false;
}
function onLockedChest() {
  speakZh(`先把${playCount.value}个小游戏都完成，就能打开宝箱啦`);
}
function onChestRow() {
  if (chestDone.value) {
    speakZh("宝箱已经领取过啦");
    return;
  }
  if (chestOpenable.value) openChest();
  else onLockedChest();
}
</script>

<template>
  <div class="lll-scroll" role="list" aria-label="本课关卡列表">
    <div class="lll-inner">
      <!-- 本课完成度总览（补回旧地图缺失的整体进度感） -->
      <section class="lll-summary">
        <div class="lll-summary__row">
          <span class="lll-count">已完成 {{ doneCount }} / {{ playCount }} 关</span>
          <span class="lll-pct">{{ pct }}%</span>
        </div>
        <div class="lll-bar" aria-hidden="true"><i :style="{ width: pct + '%' }"></i></div>
        <p v-if="currentRow" class="lll-hint">先玩「{{ currentRow.lv.name }}」</p>
        <p v-else-if="!chestDone" class="lll-hint lll-hint--gold">全部完成，去开宝箱！</p>
        <p v-else class="lll-hint">这节课全部完成啦，真棒！</p>
      </section>

      <ul class="lll-list">
        <li
          v-for="r in rows"
          :key="r.lv.id"
          class="lll-row"
          role="listitem"
          :class="{ 'is-current': r.lv.id === currentId, 'is-done': r.done }"
          :data-tone="rowTone(r.lv)"
        >
          <button
            class="lll-btn"
            type="button"
            @click="openRow(r)"
            :aria-label="`第${r.lv.no}关，${r.lv.name}，${r.done ? '已完成' : '去玩'}`"
          >
            <span class="lll-ico"><PathIcon :name="iconName(r.lv)" /></span>
            <span class="lll-main">
              <span class="lll-no">第 {{ r.lv.no }} 关</span>
              <span class="lll-name">{{ r.lv.name }}</span>
            </span>
            <span class="lll-side">
              <span v-if="r.done" class="st st-done">
                <span v-if="r.stars > 0">★{{ r.stars }}</span>
                <span v-else>已完成</span>
              </span>
              <span v-else-if="r.lv.id === currentId" class="st st-current">继续</span>
              <span v-else class="st st-open">去玩</span>
              <span class="lll-chev" aria-hidden="true">›</span>
            </span>
          </button>
        </li>

        <!-- 宝箱奖励关：唯一保留解锁条件 -->
        <li
          class="lll-row lll-row--chest"
          role="listitem"
          :class="{ 'is-openable': chestOpenable, 'is-done': chestDone }"
        >
          <button
            class="lll-btn"
            type="button"
            @click="onChestRow"
            :aria-label="chestDone ? '宝箱已领取' : chestOpenable ? '打开宝箱' : '完成全部玩法解锁宝箱'"
          >
            <span class="lll-ico lll-ico--chest"><PathIcon name="chest" /></span>
            <span class="lll-main">
              <span class="lll-no">奖励关</span>
              <span class="lll-name">开宝箱</span>
              <span v-if="!chestDone && !chestOpenable" class="lll-sub">完成全部 {{ playCount }} 个玩法解锁</span>
            </span>
            <span class="lll-side">
              <span v-if="chestDone" class="st st-done">已领取</span>
              <span v-else-if="chestOpenable" class="st st-current">开箱</span>
              <span v-else class="st st-locked"><PathIcon name="lock" /></span>
            </span>
          </button>
        </li>
      </ul>
    </div>

    <ChestReward v-if="chestOpen" @done="onChestDone" />
  </div>
</template>

<style scoped>
/* 滚动容器：PageShell fill 给剩余高度，列表自管纵向滚动（地图本就是允许滚动页） */
.lll-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
}
.lll-inner {
  width: 100%;
  max-width: 560px;
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
  padding: var(--gap-s) var(--pad-x) var(--gap-m);
}

/* ---------- 本课完成度总览 ---------- */
.lll-summary {
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-soft);
  padding: var(--gap-s) var(--gap-m);
  display: flex;
  flex-direction: column;
  gap: var(--gap-xs);
}
.lll-summary__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.lll-count {
  font-size: var(--fs-body);
  font-weight: var(--fw-strong);
  color: var(--ink);
}
.lll-pct {
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
  color: var(--brand);
}
.lll-bar {
  width: 100%;
  height: clamp(8px, 1.4vh, 14px);
  background: var(--line);
  border-radius: var(--radius-pill);
  overflow: hidden;
}
.lll-bar i {
  display: block;
  height: 100%;
  background: var(--brand);
  border-radius: inherit;
  transition: width 0.5s;
}
.lll-hint {
  margin: 0;
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  color: var(--ink-soft);
}
.lll-hint--gold {
  color: var(--gold);
  font-weight: var(--fw-strong);
}

/* ---------- 关卡卡片列表 ---------- */
.lll-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
}
.lll-row {
  /* 类名刻意避开全局 .card（与 .tone-* 互斥坑）；底色统一 var(--card-bg) */
}
.lll-btn {
  width: 100%;
  min-height: 64px;
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  padding: var(--gap-s);
  text-align: left;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--card-bg);
  box-shadow: var(--shadow-soft);
  color: inherit;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: transform var(--dur-fast), border-color var(--dur-fast), background-color var(--dur-fast);
}
.lll-btn:active {
  transform: scale(0.98);
}

/* 当前推荐关：主色描边 + 浅主色底，视觉上一眼可点 */
.lll-row.is-current .lll-btn {
  border-color: var(--brand);
  background: var(--brand-soft);
}

/* 图标底座：open=中性线色底+玩法色图标；done=玩法色实底；current=主色实底 */
.lll-ico {
  flex: none;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-pill);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  background: var(--line);
  color: var(--row, var(--c-blue));
}
.lll-row[data-tone="blue"] { --row: var(--c-blue); }
.lll-row[data-tone="orange"] { --row: var(--c-orange); }
.lll-row[data-tone="green"] { --row: var(--c-green); }
.lll-row[data-tone="pink"] { --row: var(--c-pink); }
.lll-row[data-tone="purple"] { --row: var(--c-purple); }
.lll-row[data-tone="teal"] { --row: var(--c-teal); }

.lll-row.is-done .lll-ico {
  background: var(--row, var(--c-blue));
  color: var(--white);
}
.lll-row.is-current .lll-ico {
  background: var(--brand);
  color: var(--on-tone);
}

.lll-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.lll-no {
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.lll-name {
  font-size: var(--fs-body);
  font-weight: var(--fw-strong);
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lll-sub {
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.lll-side {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--gap-xs);
}
.st {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  padding: 4px 10px;
  border-radius: var(--radius-pill);
}
.st-current {
  background: var(--brand);
  color: var(--on-tone);
  font-weight: var(--fw-strong);
}
.st-open {
  background: var(--brand-soft);
  color: var(--brand);
}
.st-done {
  color: var(--gold);
  background: var(--line);
  font-weight: var(--fw-strong);
}
.st-locked {
  color: var(--path-lock-ink);
  background: var(--path-face-locked);
}
.lll-chev {
  color: var(--ink-faint);
  font-size: 22px;
  line-height: 1;
}

/* ---------- 宝箱奖励关 ---------- */
.lll-row--chest .lll-ico {
  background: var(--path-face-locked);
  color: var(--path-lock-ink);
}
.lll-row--chest.is-openable .lll-ico {
  background: var(--gold);
  color: var(--on-gold);
}
.lll-row--chest.is-openable .lll-btn {
  border-color: var(--gold);
}
.lll-row--chest.is-done .lll-ico {
  background: var(--line);
  color: var(--gold);
}

/* 宽屏：列表不无限拉宽（#app 已限 1180，这里再收窄到舒适阅读宽） */
@media (min-width: 600px) {
  .lll-inner {
    max-width: 620px;
  }
}

/* 手机横屏矮档（max-height:480，批准断点）：收紧纵向、缩小触控块，宁可滚不藏 */
@media (max-height: 480px) {
  .lll-inner {
    gap: var(--gap-xs);
    padding-top: var(--gap-xs);
  }
  .lll-btn {
    min-height: 54px;
    padding: var(--gap-xs) var(--gap-s);
  }
  .lll-ico {
    width: 40px;
    height: 40px;
    font-size: 22px;
  }
  .lll-bar {
    height: 6px;
  }
}
</style>
