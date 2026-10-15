/**
 * 跟我读（speak）的纯逻辑：星级换算。
 *
 * 口径是**首次通过率**（第一次尝试就读对/家长判过的词占比）——
 * 读音靠 ASR 打分或家长判定，所以阈值比"识别型"玩法更宽松：
 * ≥80% → 3 星，≥50% → 2 星，其余 1 星。
 */
export function speakStars(firstAttemptOk: number, total: number): number {
  if (total <= 0) return 1;
  const ratio = firstAttemptOk / total;
  if (ratio >= 0.8) return 3;
  if (ratio >= 0.5) return 2;
  return 1;
}
