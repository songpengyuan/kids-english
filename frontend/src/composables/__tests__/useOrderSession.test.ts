// @vitest-environment jsdom
/**
 * 拼句子会话（composable）行为测试：
 * 出题打乱、拼对锁定+回调、拼错计数回滚、星级按拼错次数、next 结束判定。
 * 注意：目标词来自 targetWords（标点已被剥掉），所以槽里放的是 "play" 不是 "play?"。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { useOrderSession } from "../useOrderSession";

const phrases = [
  { en: "What can you play?", zh: "" },
  { en: "I can play the piano.", zh: "" },
];
/** 目标句的正确词序（无标点） */
const S1 = ["What", "can", "you", "play"];
const S2 = ["I", "can", "play", "the", "piano"];
/** S1 的错误顺序 */
const S1_WRONG = ["can", "What", "play", "you"];

describe("useOrderSession", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("初始化后 bank 是目标句的打乱、槽位为空", () => {
    const s = useOrderSession(ref(phrases));
    expect(s.total.value).toBe(2);
    expect(s.sentenceIdx.value).toBe(0);
    expect(s.slots.value).toHaveLength(0);
    // bank = 目标句的词（顺序可能打乱，但集合一致）
    expect([...s.bank.value].sort()).toEqual([...S1].sort());
  });

  it("拼对：锁定 + solved + onSolved 回调（带句子）", () => {
    const onSolved = vi.fn();
    const s = useOrderSession(ref(phrases), { onSolved });
    for (const w of S1) s.pick(w);
    expect(s.solved.value).toBe(true);
    expect(s.lock.value).toBe(true);
    expect(onSolved).toHaveBeenCalledWith(phrases[0]);
  });

  it("拼错：wrongCount 计数 + 800ms 后整句回滚重出", async () => {
    const onWrong = vi.fn();
    const s = useOrderSession(ref(phrases), { onWrong });
    for (const w of S1_WRONG) s.pick(w);
    expect(s.wrongCount.value).toBe(1);
    expect(onWrong).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(800);
    // 回滚：槽位清空、词回到 bank
    expect(s.slots.value).toHaveLength(0);
    expect(s.solved.value).toBe(false);
  });

  it("星级按拼错次数：0 错 3 星、1-2 错 2 星、3+ 错 1 星", async () => {
    const s = useOrderSession(ref(phrases));
    expect(s.stars.value).toBe(3);
    for (const w of S1_WRONG) s.pick(w);
    await vi.advanceTimersByTimeAsync(800);
    expect(s.stars.value).toBe(2);
    // 再错两次到 3 次
    for (const w of S1_WRONG) s.pick(w);
    await vi.advanceTimersByTimeAsync(800);
    for (const w of S1_WRONG) s.pick(w);
    await vi.advanceTimersByTimeAsync(800);
    expect(s.wrongCount.value).toBe(3);
    expect(s.stars.value).toBe(1);
  });

  it("next：中间句返回 false 并推进，最后一句返回 true", () => {
    const s = useOrderSession(ref(phrases));
    for (const w of S1) s.pick(w);
    expect(s.next()).toBe(false);
    expect(s.sentenceIdx.value).toBe(1);
    for (const w of S2) s.pick(w);
    expect(s.next()).toBe(true);
  });

  it("takeBack：锁定时不弹回，未锁定时词回 bank", () => {
    const s = useOrderSession(ref(phrases));
    s.pick("What");
    expect(s.slots.value).toEqual(["What"]);
    s.takeBack(0);
    expect(s.slots.value).toHaveLength(0);
    expect(s.bank.value).toContain("What");
  });
});
