/**
 * 家长门禁算术题（纯函数，可单测）。
 *
 * 亲子模式默认零文字依赖，家长区用"简单加法"做门禁：
 *  - 孩子乱点大概率答不对（且答错换题），家长秒过；
 *  - 和 ≤ 10，题目足够简单，不给孩子造成挫败（反正是大人答）。
 */
export interface GateQuestion {
  a: number;
  b: number;
  answer: number;
}

/** 随机出一题：a,b ∈ [1,9]，a+b ≤ 10 */
export function makeGateQuestion(): GateQuestion {
  const a = 1 + Math.floor(Math.random() * 9); // 1..9
  const b = 1 + Math.floor(Math.random() * (10 - a)); // 1..(10-a)，保证和 ≤ 10
  return { a, b, answer: a + b };
}

/** 校验用户输入是否等于答案（输入规范化：去空格/前导零） */
export function checkGateAnswer(q: GateQuestion, input: string): boolean {
  return input.trim() === String(q.answer);
}
