/**
 * 底部导航可见性规则（回归测试）。
 *
 * 历史事故：条件曾是 `三个首页 && !player.nowPlaying`。nowPlaying 是"歌词页展开"的
 * 全局标志，不从路由派生；从歌词页用系统返回手势离开 /listen 时它仍是 true，
 * 于是 /course 上整条底栏消失 —— 屏幕上没有任何 tab，孩子彻底回不去磨耳朵。
 *
 * 2026-10-17 二改：磨耳朵播放页改为"浮层让位"（下边界抬到底栏之上），底栏随之常显。
 * 规则退化为"只认路径"，不再接受第二个参数 —— "播放页展开就藏底栏"那条分支已删除。
 */
import { describe, expect, it } from "vitest";
import { shouldShowNav } from "../nav-visibility";

describe("shouldShowNav · 底栏何时该出现", () => {
  it("三个主 tab 一律显示底栏（规则只看路径）", () => {
    for (const p of ["/course", "/listen", "/me"]) {
      expect(shouldShowNav(p)).toBe(true);
    }
  });

  it("磨耳朵播放页（/listen）底栏仍在：播放页只占底栏之上的空间", () => {
    // 这条是上一版的反面：以前期望 false（靠藏底栏腾地方），
    // 代价是播放页成了全站唯一没有导航的页面，只能靠顶栏收起键退出。
    expect(shouldShowNav("/listen")).toBe(true);
  });

  it("非主 tab 页面一律隐藏（沉浸页）", () => {
    for (const p of ["/game", "/me/report", "/me/treasure", "/course/l10", "/me/calendar"]) {
      expect(shouldShowNav(p)).toBe(false);
    }
  });
});
