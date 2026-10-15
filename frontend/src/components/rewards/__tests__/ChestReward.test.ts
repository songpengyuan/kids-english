// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

// 音效/haptics 桩：ChestReward 引入 effects 但浏览器 AudioContext 在 jsdom 不存在
vi.mock("../../../services/effects", () => ({
  sfxTap: vi.fn(),
  sfxChestOpen: vi.fn(),
  sfxCoin: vi.fn(),
  sfxSticker: vi.fn(),
  sfxCollect: vi.fn(),
  bigCelebrate: vi.fn(),
  celebrate: vi.fn(),
  sfxCorrect: vi.fn(),
  sfxWrong: vi.fn(),
  sfxMatch: vi.fn(),
}));
vi.mock("../../../services/haptics", () => ({
  hapticTap: vi.fn(),
  hapticCoin: vi.fn(),
  hapticChestOpen: vi.fn(),
  hapticSuccess: vi.fn(),
  hapticCelebrate: vi.fn(),
  hapticWrong: vi.fn(),
  hapticMatch: vi.fn(),
}));

import ChestReward from "../ChestReward.vue";
import { useRewardsStore } from "../../../stores/rewards";

/**
 * 收取动画"剩余贝壳保持原位"的核心：固定渲染本次掉落总数，
 * 已飞走的贝壳原地隐藏（gone），布局不再随 panelShown 重排。
 */
function seedReward(shells: number) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useRewardsStore();
  store.shells = 0;
  vi.spyOn(store, "rollChest").mockReturnValue({ shells, formId: null, isNew: false });
  vi.spyOn(store, "grant").mockImplementation(() => {
    store.shells += shells;
    return undefined as any;
  });
  return pinia;
}

async function openChest(shells: number) {
  const pinia = seedReward(shells);
  const w = mount(ChestReward, {
    global: {
      plugins: [pinia],
      stubs: { BaseButton: { template: "<button><slot /></button>" } },
    },
  });
  // 点宝箱 3 下（点击冒泡到 wrap → onWrapClick 算敲一下；宝箱晃动 :key 重建 DOM，需每次重新查找）
  for (let i = 0; i < 3; i++) {
    await w.find(".chest").trigger("click");
    await new Promise((r) => setTimeout(r, 30));
  }
  // 650ms 后进入 reward 阶段
  await new Promise((r) => setTimeout(r, 720));
  return w;
}

describe("ChestReward 收取动画：固定渲染、剩余原位", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("开箱后固定渲染全部掉落贝壳（山形），不随已收取数量重排", async () => {
    const w = await openChest(6);
    expect(w.findAll(".shell-item")).toHaveLength(6);
    const rows = w.findAll(".shell-row").map((r) => r.findAll(".shell-item").length);
    expect(rows).toEqual([1, 2, 3]); // 渲染顺序：顶层 1 → 底层 3（上小下大的山形）
    expect(w.findAll(".shell-item.gone")).toHaveLength(0);
  });

  it("收取按钮带 ×N 计数（本次掉落数）", async () => {
    const w = await openChest(3);
    expect(w.find(".cnt").text()).toBe("×3");
  });

  it("开箱后宝箱隐藏、展示区出现贝壳队列", async () => {
    const w = await openChest(4);
    expect(w.find(".chest").exists()).toBe(false);
    expect(w.findAll(".shell-item")).toHaveLength(4);
  });
});
