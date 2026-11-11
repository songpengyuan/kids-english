// @vitest-environment jsdom
/**
 * 看图学词会话（useLearnSession）——学单词玩法的核心逻辑：
 *  - 点读覆盖率 → 星级（markTapped 去重、learnStars 集成）
 *  - 未测量时的保守分页（首帧 2×2，不铺全词再收缩）
 *  - 词表变化时分页重置（resetOn words；词群切换场景）
 *
 * 生命周期钩子（onMounted 的 ResizeObserver）直接调用时只告警不注册（可忽略）；
 * matchMedia / ResizeObserver 由桩补齐（useViewport 与测量逻辑需要）。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { useLearnSession } from "../useLearnSession";
import type { Word } from "../../data/lessons";

function makeWords(n: number): Word[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `w${i}`,
    en: `word${i}`,
    zh: `词${i}`,
    emoji: "🙂",
    lessonId: "l-x",
    image: null,
  })) as unknown as Word[];
}

/** jsdom 缺的 API（useViewport 的 matchMedia + 测量的 ResizeObserver） */
vi.hoisted(() => {
  const w = globalThis as unknown as Record<string, unknown>;
  w.matchMedia =
    w.matchMedia ||
    ((query: string) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }));
  w.ResizeObserver = w.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  w.requestAnimationFrame = w.requestAnimationFrame || ((cb: FrameRequestCallback) => 0);
  w.cancelAnimationFrame = w.cancelAnimationFrame || (() => {});
});

/** 宿主组件（让组合式函数拿到合法的 setup 上下文）；words 用真 ref 支持换表 */
function hostWith(words: Word[]) {
  let session!: ReturnType<typeof useLearnSession>;
  const wordsRef = ref(words);
  let wordsBox: { value: Word[] } | null = null;
  const Host = defineComponent({
    setup() {
      session = useLearnSession(wordsRef);
      wordsBox = wordsRef;
      return () => h("div");
    },
  });
  const wrapper = mount(Host);
  return { session, wrapper, wordsBox: wordsBox! };
}

beforeEach(() => vi.clearAllMocks());

describe("useLearnSession · 点读覆盖与星级", () => {
  it("markTapped：点过记一个，重复点不重复计", () => {
    const words = makeWords(4);
    const { session } = hostWith(words);
    session.markTapped(words[0]);
    session.markTapped(words[0]); // 同词再点：只记一次
    expect(session.tappedCount.value).toBe(1);
    session.markTapped(words[1]);
    expect(session.tappedCount.value).toBe(2);
  });

  it("全部点过 → 3 星；一个没点 → 1 星（点读覆盖率口径）", () => {
    const words = makeWords(4);
    const { session } = hostWith(words);
    expect(session.stars.value).toBe(1); // 一个没点也兜底 1 星
    for (const w of words) session.markTapped(w);
    expect(session.tappedCount.value).toBe(4);
    expect(session.stars.value).toBe(3); // 全覆盖 = 满星
  });

  it("部分点过（60%）→ 2 星", () => {
    const words = makeWords(10);
    const { session } = hostWith(words);
    for (const w of words.slice(0, 6)) session.markTapped(w); // 60%
    expect(session.stars.value).toBe(2);
  });
});

describe("useLearnSession · 分页与网格", () => {
  it("未测量时给保守分页（2×2=4 每页），不把全部词铺出来", () => {
    const { session } = hostWith(makeWords(10));
    expect(session.total.value).toBe(3); // 10 词 / 每页 4 → 3 页
    expect(session.items.value).toHaveLength(4);
    expect(session.gridStyle.value["--cols"]).toBe(2);
  });

  it("词表变化 → 分页重置回第 1 页（词群切换场景）", async () => {
    const { session, wordsBox } = hostWith(makeWords(10));
    session.gotoNext();
    expect(session.page.value).toBe(1);
    // 换一套词（如词群切换 Colors→Animals）：分页重置（watcher 异步 flush）
    wordsBox.value = makeWords(6);
    await nextTick();
    expect(session.page.value).toBe(0);
    expect(session.total.value).toBe(2); // 6 词 / 每页 4 → 2 页
  });

  it("翻页：gotoNext/gotoPrev 边界（首页不能往前，末页不能往后）", () => {
    const { session } = hostWith(makeWords(10));
    session.gotoPrev();
    expect(session.page.value).toBe(0); // 首页再往前不动
    session.gotoNext();
    session.gotoNext();
    expect(session.page.value).toBe(2);
    session.gotoNext();
    expect(session.page.value).toBe(2); // 末页（第 3 页）不再往后
  });
});
