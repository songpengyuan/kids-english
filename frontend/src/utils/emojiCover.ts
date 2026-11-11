/**
 * 课程封面：把课程 emoji 映射到自托管 Twemoji SVG。
 *
 * 为什么不直接渲染 emoji 文本：跨设备 emoji 字体差异大（Android/Windows 画风各一套、
 * 老机型缺新字符直接显示豆腐块），课程封面又是每屏最显眼的视觉——统一转成
 * 自托管 SVG 后全端像素级一致（iOS 也用同一张图，避免"图文混排"两种画风）。
 *
 * 资产来源：@twemoji/svg（CC-BY 4.0，可商用需署名），落在 public/covers/<码位>.svg。
 * 新增课时若换了 emoji：把对应码位 SVG 补进 public/covers/ 即可；
 * 不在资产集 → 返回 null，调用方回退显示 emoji 文本（宁可风格不统一也不显示豆腐块）。
 */
const KNOWN_COVER_CODEPOINTS = new Set(["1f3ba", "1f30a", "1f446", "1f412", "1f43b", "1f68c", "1f98d"]);

export function emojiCoverUrl(emoji: string | null | undefined): string | null {
  if (!emoji) return null;
  // 过滤变体选择符 FE0F；ZWJ 组合序列（多码位）不在资产集，直接回退
  const cps = [...emoji]
    .map((c) => c.codePointAt(0)!.toString(16))
    .filter((c) => c !== "fe0f");
  return cps.length === 1 && KNOWN_COVER_CODEPOINTS.has(cps[0]) ? `/covers/${cps[0]}.svg` : null;
}
