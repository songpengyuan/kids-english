/**
 * 听音选图会话（composable）行为测试：
 * 答错只标红不推进、答对锁定、首次答对才计入星级、继续/重置。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { nextTick, ref } from "vue";
import { useQuizSession } from "../useQuizSession";

const words = ["a", "b", "c", "d"].map((id) => ({ id, en: id, lessonId: "l4" }));

describe("useQuizSession", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("答错：标红、不推进、不计首次答对", () => {
    const onWrong = vi.fn();
    const s = useQuizSession(() => words, { onWrong });
    const target = s.q.value.target;
    const wrongOpt = s.q.value.options.find((o) => o.id !== target.id)!;
    expect(s.pick(wrongOpt)).toBe("wrong");
    expect(s.wrongPicks.value.has(wrongOpt.id)).toBe(true);
    expect(s.locked.value).toBe(false);
    expect(s.firstTryRight.value).toBe(0);
    expect(onWrong).toHaveBeenCalledTimes(1);
  });

  it("标红约 0.6 秒后自动消失（孩子可以继续选）", async () => {
    const s = useQuizSession(() => words, {});
    const wrongOpt = s.q.value.options.find((o) => o.id !== s.q.value.target.id)!;
    s.pick(wrongOpt);
    vi.advanceTimersByTime(700);
    expect(s.wrongPicks.value.has(wrongOpt.id)).toBe(false);
  });

  it("同一选项连点两次只记一次错", () => {
    const onWrong = vi.fn();
    const s = useQuizSession(() => words, { onWrong });
    const wrongOpt = s.q.value.options.find((o) => o.id !== s.q.value.target.id)!;
    s.pick(wrongOpt);
    expect(s.pick(wrongOpt)).toBe("ignored");
    expect(onWrong).toHaveBeenCalledTimes(1);
  });

  it("答对：锁定并进入反馈态，第二下点其他选项无效", () => {
    const onCorrect = vi.fn();
    const s = useQuizSession(() => words, { onCorrect });
    const target = s.q.value.target;
    expect(s.pick(target)).toBe("correct");
    expect(s.locked.value).toBe(true);
    expect(onCorrect).toHaveBeenCalledWith(target, true);
    const other = s.q.value.options.find((o) => o.id !== target.id)!;
    expect(s.pick(other)).toBe("ignored");
  });

  it("先错后对：本题不计入首次答对（星级据此打折）", () => {
    const s = useQuizSession(() => words, {});
    const target = s.q.value.target;
    const wrongOpt = s.q.value.options.find((o) => o.id !== target.id)!;
    s.pick(wrongOpt);
    s.pick(target);
    expect(s.firstTryRight.value).toBe(0);
    expect(s.stars.value).toBe(1);
  });

  it("全部首次答对 → 3 星；继续推进到最后一题返回 done", async () => {
    const s = useQuizSession(() => words, {});
    const total = s.total.value;
    for (let i = 0; i < total; i++) {
      s.pick(s.q.value.target);
      const r = s.next();
      await nextTick();
      if (i < total - 1) expect(r.done).toBe(false);
      else expect(r.done).toBe(true);
    }
    expect(s.stars.value).toBe(3);
  });

  it("未答题时点继续不生效（不会跳题）", () => {
    const s = useQuizSession(() => words, {});
    const before = s.idx.value;
    s.next();
    expect(s.idx.value).toBe(before);
  });

  it("reset 清空作答状态（复习页的再练一次）", () => {
    const s = useQuizSession(() => words, {});
    s.pick(s.q.value.target);
    s.reset();
    expect(s.idx.value).toBe(0);
    expect(s.locked.value).toBe(false);
    expect(s.firstTryRight.value).toBe(0);
  });

  it("进度上报：初始 0%，答对推进后按题数递增", async () => {
    const onProgress = vi.fn();
    const s = useQuizSession(() => words, { onProgress });
    expect(onProgress).toHaveBeenLastCalledWith(0);
    s.pick(s.q.value.target);
    s.next();
    await nextTick();
    expect(onProgress).toHaveBeenLastCalledWith(25);
  });

  it("跨课同 id 用复合键区分：点同名但不同课的词不算答对", () => {
    const l4Blue = { id: "blue", en: "blue", lessonId: "l4" };
    const l6Blue = { id: "blue", en: "blue", lessonId: "l6" };
    const s = useQuizSession(() => [l4Blue], {
      distractors: () => [l4Blue, l6Blue],
      keyOf: (w) => `${w.lessonId}:${w.id}`,
    });
    expect(s.q.value.target.lessonId).toBe("l4");
    const sameName = s.q.value.options.find((o) => o.lessonId === "l6")!;
    expect(s.pick(sameName)).toBe("wrong"); // 同名不同课 → 算错
    expect(s.locked.value).toBe(false);
    expect(s.pick(l4Blue)).toBe("correct"); // 真正该选的那张
    expect(s.locked.value).toBe(true);
  });
});
