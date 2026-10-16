// @vitest-environment jsdom
/**
 * HeroDetailView 招牌技能整卡朗读：
 * 点整卡 → 从第一个技能依次朗读全部（当前技能 chip 高亮跟随）；
 * 再点整卡 → 停止；点单个 chip → 打断整卡只读当前技能。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { HEROES } from "../../../data/heroes";

vi.mock("../../../services/speech", () => ({
  speak: vi.fn(),
  speakZh: vi.fn(),
  stopSpeaking: vi.fn(),
}));
vi.mock("../../../services/effects", () => ({ sfxTap: vi.fn() }));

import { speakZh, stopSpeaking } from "../../../services/speech";
import HeroDetailView from "../HeroDetailView.vue";

const routes = [
  { path: "/", component: { template: "<div />" } },
  { path: "/me/treasure/hero/:id", name: "hero-detail", component: HeroDetailView },
];

async function mountHero(id: string) {
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push(`/me/treasure/hero/${id}`);
  await router.isReady();
  return mount(HeroDetailView, { global: { plugins: [createPinia(), router] } });
}

const tiga = HEROES.find((h) => h.id === "tiga")!;
const skills = tiga.detail?.skills ?? [];

describe("HeroDetailView · 招牌技能整卡朗读", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(speakZh).mockResolvedValue(undefined);
  });

  it("点整卡 → 依次朗读全部技能（数量=技能数，顺序一致）", async () => {
    const w = await mountHero("tiga");
    await w.find(".skills-card").trigger("click");
    await flushPromises();

    expect(speakZh).toHaveBeenCalledTimes(skills.length);
    skills.forEach((s, i) => {
      expect(speakZh).toHaveBeenNthCalledWith(i + 1, s, 1, { bypassMute: true });
    });
  });

  it("整卡朗读中当前技能 chip 高亮跟随", async () => {
    const w = await mountHero("tiga");
    await w.find(".skills-card").trigger("click");
    await flushPromises();
    // 全部读完后的高亮已清除；重开验证读第 2 个时高亮在它上面
    const chips = w.findAll(".chip");
    // 挂起不 resolve：停在第一个技能上，验证高亮跟随
    vi.mocked(speakZh).mockImplementation(() => new Promise(() => {}));
    await w.find(".skills-card").trigger("click");
    await flushPromises();
    expect(w.findAll(".chip")[0].classes()).toContain("speaking");
  });

  it("整卡朗读中再点整卡 → 停止（stopSpeaking，不再继续读下一个）", async () => {
    const w = await mountHero("tiga");
    let resolveFirst: (() => void) | undefined;
    const calls: string[] = [];
    vi.mocked(speakZh).mockImplementation((text: string) => {
      calls.push(text);
      if (calls.length === 1) {
        return new Promise<void>((r) => {
          resolveFirst = r;
        });
      }
      return Promise.resolve();
    });
    await w.find(".skills-card").trigger("click");
    await flushPromises();
    expect(calls).toHaveLength(1); // 第一个技能在读

    await w.find(".skills-card").trigger("click"); // 再点 → 停止
    expect(stopSpeaking).toHaveBeenCalled();
    resolveFirst?.();
    await flushPromises();
    expect(calls).toHaveLength(1); // 不再继续读
  });

  it("点单个 chip → 打断整卡，只读当前技能", async () => {
    const w = await mountHero("tiga");
    let resolveFirst: (() => void) | undefined;
    vi.mocked(speakZh).mockImplementation((text: string) => {
      if (text === skills[0]) {
        return new Promise<void>((r) => {
          resolveFirst = r;
        });
      }
      return Promise.resolve();
    });
    await w.find(".skills-card").trigger("click");
    await flushPromises();

    await w.findAll(".chip")[1].trigger("click"); // 点第 2 个技能
    expect(stopSpeaking).toHaveBeenCalled();
    resolveFirst?.();
    await flushPromises();
    // 只读了第 2 个（sayZh），不再续读整卡
    expect(speakZh).toHaveBeenLastCalledWith(skills[1], 1, { bypassMute: true });
    const allCalls = vi.mocked(speakZh).mock.calls.map((c) => c[0]);
    expect(allCalls.filter((t) => t === skills[1])).toHaveLength(1);
  });
});

/**
 * 拆分回归：背面资料的朗读状态原本和页面存在同一个文件里，2026-10 拆分后
 * 移到 HeroInfoPanel 内部，父级要打断它只能通过递增 resetToken。
 * 这条契约（翻面 / 换形态 → 背面朗读必须停）跨了两个组件，最容易被拆坏。
 */
describe("HeroDetailView · 翻面与切形态打断背面朗读", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(speakZh).mockResolvedValue(undefined);
  });

  it("翻到背面时，背面正在朗读的条目被打断并清掉高亮", async () => {
    const w = await mountHero("tiga");

    // 让朗读挂起，停在「介绍」卡上
    vi.mocked(speakZh).mockImplementation(() => new Promise(() => {}));
    await w.findAll(".info-card")[0].trigger("click");
    await flushPromises();
    expect(w.findAll(".info-card")[0].classes()).toContain("speaking");

    // 翻面 → 应打断（否则会出现"正面读着、背面翻开还在读"的串台）
    vi.mocked(stopSpeaking).mockClear();
    await w.find(".detail-btn").trigger("click");
    await flushPromises();
    expect(stopSpeaking).toHaveBeenCalled();
    expect(w.findAll(".info-card")[0].classes()).not.toContain("speaking");
  });

  it("切换形态时，背面正在朗读的条目被打断", async () => {
    const w = await mountHero("tiga");

    vi.mocked(speakZh).mockImplementation(() => new Promise(() => {}));
    await w.findAll(".info-card")[0].trigger("click");
    await flushPromises();
    expect(w.findAll(".info-card")[0].classes()).toContain("speaking");

    // 换个形态（tiga 有 3 个形态，缩略图一定存在）
    const thumbs = w.findAll(".thumb");
    expect(thumbs.length).toBeGreaterThan(1);
    vi.mocked(stopSpeaking).mockClear();
    await thumbs[1].trigger("click");
    await flushPromises();
    expect(stopSpeaking).toHaveBeenCalled();
    expect(w.findAll(".info-card")[0].classes()).not.toContain("speaking");
  });
});
