// @vitest-environment jsdom
/**
 * 口令页的「小眼睛」：
 * 家长是手输 6 位数字，错一位就得全删重来 —— 能看一眼再提交是刚需。
 * 这里锁三件事：默认必须是遮码（旁人看不见）、切换后值不变（不能切一下把输入清了）、
 * 无障碍标签跟着状态走（读屏要念得出"显示/隐藏"）。
 */
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import GateView from "../GateView.vue";
import { appRoutes } from "../../router";

vi.hoisted(() => {
  const w = globalThis as unknown as {
    matchMedia?: (q: string) => unknown;
  };
  if (!w.matchMedia) {
    w.matchMedia = (q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    });
  }
});

async function mountGate() {
  const router = createRouter({ history: createMemoryHistory(), routes: appRoutes });
  await router.push("/gate");
  await router.isReady();
  return mount(GateView, { global: { plugins: [createPinia(), router] } });
}

describe("口令页 · 显示/隐藏切换", () => {
  it("默认遮码，且没点过之前不显示明文", async () => {
    const w = await mountGate();
    expect(w.find(".gate__input").attributes("type")).toBe("password");
    expect(w.find(".gate__eye").attributes("aria-label")).toBe("显示口令");
  });

  it("点一下变明文，再点回遮码；输入内容不丢", async () => {
    const w = await mountGate();
    const input = w.find(".gate__input");
    await input.setValue("135790");

    await w.find(".gate__eye").trigger("click");
    expect(w.find(".gate__input").attributes("type")).toBe("text");
    expect(w.find(".gate__eye").attributes("aria-label")).toBe("隐藏口令");
    expect((w.find(".gate__input").element as HTMLInputElement).value).toBe("135790");

    await w.find(".gate__eye").trigger("click");
    expect(w.find(".gate__input").attributes("type")).toBe("password");
    expect((w.find(".gate__input").element as HTMLInputElement).value).toBe("135790");
  });

  it("小眼睛是普通按钮，不参与表单提交（否则按它会误触发进入）", async () => {
    const w = await mountGate();
    expect(w.find(".gate__eye").attributes("type")).toBe("button");
  });
});
