import type { Tone } from "../types";

export interface TrackCover {
  emoji: string;
  tone: Tone;
}

/** 轨道不继承课程封面时的例外：l11 的颜色歌用调色盘，而不是棕熊 */
const GROUP_COVERS: Record<string, TrackCover> = {
  colors: { emoji: "🎨", tone: "pink" },
};

/** 轨道封面：有词群专属封面就用它，否则沿用课程封面与色调 */
export function trackCover(
  group: string | undefined,
  fallbackEmoji: string,
  fallbackTone: Tone
): TrackCover {
  return (group && GROUP_COVERS[group]) || { emoji: fallbackEmoji, tone: fallbackTone };
}
