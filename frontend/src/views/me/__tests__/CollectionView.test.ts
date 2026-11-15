// @vitest-environment jsdom
/**
 * 我的收藏册（CollectionView，2026-11-15 收集生长 v1）：
 *  - 贴纸墙：每课一卡，解锁亮封面 / 未锁定问号盘 + 进度；
 *  - 点读口径：解锁卡点读英文课名（ttsOnly）且进该课；锁定卡中文提示、也进课
 *    （孩子回去把课玩完）；
 *  - 英雄条 → 宝藏罐；进页乐乐鸟问候（气泡，模块单例）。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPinia, getActivePinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { mount, flushPromises } from "@vue/test-utils";
import CollectionView from "../CollectionView.vue";
import { lessons } from "../../../data/lessons";
import { lessonLevels } from "../../../data/pathLevels";
import { useProgressStore } from "../../../stores/progress";
import { useMascot, __resetMascotState } from "../../../composables/useMascot";

vi.mock("../../../services/speech", () => ({ speak: vi.fn(), speakZh: vi.fn() }));
vi.mock("../../../services/haptics", () => ({ hapticTap: vi.fn() }));
import { speak, speakZh } from "../../../services/speech";

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/me/collection", name: "collection", component: { template: "<div />" } },
      { path: "/course/:id", name: "course-detail", component: { template: "<div />" } },
      { path: "/me/treasure", name: "treasure", component: { template: "<div />" } },
    ],
  });
}

async function mountAt() {
  const router = makeRouter();
  await router.push("/me/collection");
  await router.isReady();
  // 用 beforeEach 激活的同一个 pinia：种子数据要进组件读到的同一 store 实例
  const w = mount(CollectionView, { global: { plugins: [getActivePinia()!, router] } });
  await flushPromises();
  return { w, router };
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  __resetMascotState();
  vi.clearAllMocks();
});

describe("CollectionView · 贴纸墙", () => {
  it("每课一卡；无进度时全部锁定（问号盘 + 进度提示）", async () => {
    const { w } = await mountAt();
    expect(w.findAll(".sticker").length).toBe(lessons.length);
    expect(w.findAll(".sticker--locked").length).toBe(lessons.length);
    const first = w.find(".sticker--locked");
    expect(first.find(".sticker__q").exists()).toBe(true);
    expect(first.text()).toContain("玩法");
    // 总览：贴纸 0/N
    expect(w.find(".summary").text()).toContain(`课程贴纸 0/${lessons.length}`);
  });

  it("l4 全部玩法完成 → 该卡解锁亮封面，总览计数 +1", async () => {
    const progress = useProgressStore();
    const keys = lessonLevels(lessons.find((l) => l.id === "l4")!)
      .filter((l) => l.actKey !== "chest")
      .map((l) => l.actKey);
    progress.progress["l4"] = { completed: [...keys] };
    const { w } = await mountAt();
    expect(w.findAll(".sticker--locked").length).toBe(lessons.length - 1);
    const lit = w.findAll(".sticker").filter((s) => !s.classes().includes("sticker--locked"));
    expect(lit.length).toBe(1);
    expect(lit[0].find(".sticker__img").exists()).toBe(true);
    expect(w.find(".summary").text()).toContain(`课程贴纸 1/${lessons.length}`);
  });
});

describe("CollectionView · 点读与跳转", () => {
  it("解锁卡：点读英文课名（ttsOnly）并进该课", async () => {
    const progress = useProgressStore();
    const keys = lessonLevels(lessons.find((l) => l.id === "l4")!)
      .filter((l) => l.actKey !== "chest")
      .map((l) => l.actKey);
    progress.progress["l4"] = { completed: [...keys] };
    const { w, router } = await mountAt();
    const lit = w.findAll(".sticker").filter((s) => !s.classes().includes("sticker--locked"))[0];
    await lit.trigger("click");
    await flushPromises();
    expect(speak).toHaveBeenCalledWith("A Sailor Went to Sea", { ttsOnly: true });
    expect(router.currentRoute.value.path).toBe("/course/l4");
  });

  it("锁定卡：中文提示点读，同样进课（孩子回去玩完）", async () => {
    const { w, router } = await mountAt();
    const locked = w.find(".sticker--locked");
    await locked.trigger("click");
    await flushPromises();
    expect(speakZh).toHaveBeenCalledWith("玩完这一课的玩法，就能点亮这张贴纸哦");
    expect(router.currentRoute.value.path).toBe("/course/" + lessons[0].id);
  });

  it("英雄条 → 宝藏罐", async () => {
    const { w, router } = await mountAt();
    await w.find(".heroes").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/me/treasure");
  });

  it("进页乐乐鸟问候（气泡，不触发飞入）", async () => {
    await mountAt();
    const m = useMascot();
    expect(m.bubble.value).not.toBe("");
    expect(m.popupActive.value).toBe(false);
  });
});
