/**
 * 宝箱奖励状态机：敲三下 → 开箱入账 → 展示 → 收取 → 完成。
 *
 * 抽出来的原因：ChestReward（877 行）script 里阶段流转、入账、徽标/展示区
 * 双计数与音效钩子是一台完整状态机，与 DOM（晃动/脉冲/飞行元素）耦合后
 * 既没法单测也难读。这里只管状态与入账，视效经 hooks 注入。
 *
 * 阶段：closed（敲击中）→ open（第 3 下开箱瞬间）→ reward（展示+收取）
 *       → flying（飞行中）→ collected（完成）。
 */
import { ref, onScopeDispose, type Ref } from "vue";

export type ChestPhase = "closed" | "open" | "reward" | "flying" | "collected";

export interface ChestRoll {
  shells: number;
  formId?: string | null;
  isNew?: boolean;
}

/** rewards store 的最小接口（避免整个 store 类型进来） */
export interface ChestRewards {
  shells: number;
  rollChest(): ChestRoll;
  grant(r: ChestRoll): void;
}

export interface ChestMachineHooks {
  /** 第 3 下开箱瞬间（金光 + 撒花 + 开盖音） */
  onOpened?: () => void;
  /** 奖励入账后（硬币音 + 掉形态时的贴纸音） */
  onRewardShown?: (r: ChestRoll) => void;
}

export function useChestMachine(rewards: ChestRewards, hooks: ChestMachineHooks = {}) {
  /** 已敲击次数（0..3；3 = 开箱） */
  const taps = ref(0);
  const phase = ref<ChestPhase>("closed");
  const reward = ref<ChestRoll | null>(null);
  /** 顶部徽标当前显示数（收取动画前 = 入账前旧值，收取时逐个 +1 到新值） */
  const shown = ref(0);
  /** 中间展示区剩余贝壳数（开箱后 = 本次掉落数；收取时逐个 -1，与右上 +1 对应） */
  const panelShown = ref(0);

  let timer: ReturnType<typeof setTimeout> | undefined;
  function later(fn: () => void, ms: number) {
    timer = setTimeout(fn, ms);
  }
  onScopeDispose(() => timer && clearTimeout(timer));

  /** 第 3 下：开箱 + 奖励入账（幂等，贴纸去重在 store 内） */
  function openChest() {
    shown.value = rewards.shells; // 徽标先显示旧余额，收取时递增
    panelShown.value = 0; // 开箱瞬间先清空，入账后填充展示区
    hooks.onOpened?.();
    const r = rewards.rollChest();
    rewards.grant(r);
    reward.value = r;
    panelShown.value = r.shells; // 展示区出现对应的贝壳/海螺（宝箱替换成奖励）
    hooks.onRewardShown?.(r);
    // 650ms：金光/光柱足够看完，又不让性急的孩子干等（原 1s 偏拖）
    later(() => {
      phase.value = "reward";
    }, 650);
  }

  /**
   * 敲一下（点宝箱/空白处共用）。
   * 返回 "tapped" = 计了一次敲击（1..3 都算，组件放敲击音效与晃动；
   * 第 3 下内部已开箱入账）；"collect" = 处于奖励展示态，组件应发起收取；
   * "ignore" = 无事发生（开箱瞬间/flying/collected）。
   */
  function tap(): "collect" | "tapped" | "ignore" {
    if (phase.value === "flying" || phase.value === "collected") return "ignore";
    if (phase.value === "reward") return "collect";
    if (taps.value >= 3) return "ignore"; // 开箱瞬间（open 阶段）不再响应
    taps.value++;
    if (taps.value === 3) {
      phase.value = "open";
      openChest();
    }
    return "tapped";
  }

  /** 跳过开箱动画（奖励照常入账）：直接完成三连击 → 展示奖励 */
  function skip() {
    if (phase.value !== "closed") return;
    if (timer) clearTimeout(timer);
    taps.value = 3;
    phase.value = "open";
    openChest();
  }

  /** 发起收取：进入 flying 态。非 reward 态（或没有奖励）返回 false */
  function beginCollect(): boolean {
    if (phase.value !== "reward" || !reward.value) return false;
    phase.value = "flying";
    return true;
  }

  /** 收取完成 */
  function endCollect() {
    phase.value = "collected";
  }

  /**
   * 关闭。无论动画进行到哪一步都能一键退出：
   * 还没开箱（closed）→ 奖励照常入账（与"跳过"一致），返回 true；
   * 已开箱 → 直接收起，返回 false。
   * 注意：**已收进宝藏罐（collected）也能关** —— 结算页如果没有接 @done，
   * 这里就是用户唯一的出口（否则会卡在"已收进宝藏罐"这一屏）。
   */
  function closeOverlay(): boolean {
    const shouldGrant = phase.value === "closed";
    if (shouldGrant) {
      rewards.grant(rewards.rollChest());
    }
    phase.value = "collected";
    return shouldGrant;
  }

  return {
    taps,
    phase,
    reward,
    shown,
    panelShown,
    tap,
    skip,
    beginCollect,
    endCollect,
    closeOverlay,
  };
}
