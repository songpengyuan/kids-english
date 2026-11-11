/**
 * 课程封面：把课程 emoji 映射到自托管的原创封面图（512×512 透明 WebP）。
 *
 * 为什么不直接渲染 emoji 文本：跨设备 emoji 字体差异大（Android/Windows 画风各一套、
 * 老机型缺新字符直接显示豆腐块），课程封面又是每屏最显眼的视觉——统一成自托管图片后
 * 全端像素级一致（iOS 也用同一张图，避免"图文混排"两种画风）。
 *
 * 视觉与版权：7 张封面由本项目自行生成（3D 贴纸风、统一光材与圆角），
 * 不复制 Apple / Twemoji 等平台 emoji 的造型，也不引入第三方署名义务。
 * 文件按 emoji 码位命名，落在 public/covers/<码位>.webp。
 * 新增课时若换了 emoji：补一张同风格的 512×512 透明 WebP 即可；
 * 不在资产集 → 返回 null，调用方回退显示 emoji 文本（宁可风格不统一也不显示豆腐块）。
 */
const KNOWN_COVER_CODEPOINTS = new Set(["1f3ba", "1f30a", "1f446", "1f412", "1f43b", "1f68c", "1f98d"]);

export function emojiCoverUrl(emoji: string | null | undefined): string | null {
  if (!emoji) return null;
  // 过滤变体选择符 FE0F；ZWJ 组合序列（多码位）不在资产集，直接回退
  const cps = [...emoji]
    .map((c) => c.codePointAt(0)!.toString(16))
    .filter((c) => c !== "fe0f");
  return cps.length === 1 && KNOWN_COVER_CODEPOINTS.has(cps[0]) ? `/covers/${cps[0]}.webp` : null;
}
