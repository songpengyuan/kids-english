/**
 * 地图节点图标覆盖检查。
 *
 * 新增玩法时最容易漏的三处之一（另外两处：LessonView.ACT_META、useLessonFlow 的
 * 可直达 stage 判定）。漏了图标不会报错，地图上只是一个空白圆节点——
 * 孩子看不出"这一关是什么"，属于典型的静默失效，所以用测试兜住。
 */
import { describe, expect, it } from "vitest";
import { ACT_NAMES } from "../pathLevels";
import { APP_ICON_PATHS, ICON_PATHS, ICON_TEXT } from "../pathIcons";

describe("地图节点图标", () => {
  it("每个玩法（含宝箱关）都有矢量图标或文本图标", () => {
    // PathIcon 同时查 ICON_PATHS 与 APP_ICON_PATHS（宝箱在后者），测试口径要一致
    const missing = Object.keys(ACT_NAMES).filter(
      (key) =>
        !(ICON_PATHS[key]?.length > 0) &&
        !(APP_ICON_PATHS[key]?.length > 0) &&
        !ICON_TEXT[key]
    );
    expect(missing).toEqual([]);
  });
});
