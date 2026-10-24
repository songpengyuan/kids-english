// @vitest-environment jsdom
/**
 * 宝箱状态机（composable）行为测试：
 * 三连敲开箱、敲击期无副作用、reward 态点按转收取、跳过与关闭的入账语义。
 * rewards store 用最小假体（shells/rollChest/grant），视效经 hooks 计数。
 */
import { describe, expect, it, vi } from "vitest";
import { useChestMachine } from "../useChestMachine";

function fakeRewards() {
  let rolls = 0;
  return {
    shells: 7,
    rollChest: () => ({ shells: 2 + (rolls++ % 2), formId: rolls === 1 ? "noa-base" : null }),
    grant: vi.fn(),
  };
}

function setup() {
  const rewards = fakeRewards();
  const onOpened = vi.fn();
  const onRewardShown = vi.fn();
  const m = useChestMachine(rewards, { onOpened, onRewardShown });
  return { m, rewards, onOpened, onRewardShown };
}

describe("useChestMachine", () => {
  it("前两下只计数，不触发开箱与入账", () => {
    const { m, rewards, onOpened } = setup();
    expect(m.tap()).toBe("tapped");
    expect(m.tap()).toBe("tapped");
    expect(m.taps.value).toBe(2);
    expect(m.phase.value).toBe("closed");
    expect(rewards.grant).not.toHaveBeenCalled();
    expect(onOpened).not.toHaveBeenCalled();
  });

  it("第三下：开箱入账，徽标显示旧余额、展示区填入掉落，650ms 后进 reward", () => {
    vi.useFakeTimers();
    const { m, rewards, onOpened, onRewardShown } = setup();
    m.tap();
    m.tap();
    expect(m.tap()).toBe("tapped"); // 第 3 下也算敲击（组件放升调音效），内部已开箱
    expect(m.taps.value).toBe(3);
    expect(m.phase.value).toBe("open");
    expect(onOpened).toHaveBeenCalledTimes(1);
    expect(rewards.grant).toHaveBeenCalledTimes(1);
    expect(m.shown.value).toBe(7); // 旧余额
    expect(m.panelShown.value).toBeGreaterThan(0);
    expect(onRewardShown).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(650);
    expect(m.phase.value).toBe("reward");
    vi.useRealTimers();
  });

  it("reward 态再点 = 请求收取；beginCollect 进 flying；endCollect 收尾", () => {
    vi.useFakeTimers();
    const { m } = setup();
    m.tap();
    m.tap();
    m.tap();
    vi.advanceTimersByTime(650);
    expect(m.tap()).toBe("collect");
    expect(m.beginCollect()).toBe(true);
    expect(m.phase.value).toBe("flying");
    m.endCollect();
    expect(m.phase.value).toBe("collected");
    vi.useRealTimers();
  });

  it("skip：closed 态直接开箱入账；非 closed 态忽略", () => {
    vi.useFakeTimers();
    const { m, rewards } = setup();
    m.tap();
    m.skip();
    expect(m.taps.value).toBe(3);
    expect(rewards.grant).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(650);
    m.skip(); // reward 态不响应
    expect(rewards.grant).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("closeOverlay：closed 态关闭也照常入账（返回 true）；开过箱关闭不入账", () => {
    vi.useFakeTimers();
    const { m, rewards } = setup();
    expect(m.closeOverlay()).toBe(true);
    expect(rewards.grant).toHaveBeenCalledTimes(1);
    expect(m.phase.value).toBe("collected");
    vi.useRealTimers();
  });
});
