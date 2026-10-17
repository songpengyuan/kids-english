/**
 * 底部导航可见性规则（回归测试）。
 *
 * 真实事故：条件曾是 `三个首页 && !player.nowPlaying`。nowPlaying 是"歌词全屏页展开"的
 * 全局标志，不从路由派生；从歌词页用系统返回手势离开 /listen 时它仍是 true，
 * 于是 /course 上整条底栏消失 —— 屏幕上没有任何 tab，孩子彻底回不去磨耳朵。
 * 现在只有 /listen 自身才可能隐藏底栏。
 */
import { describe, expect, it } from "vitest";
import { shouldShowNav } from "../nav-visibility";

describe("shouldShowNav · 底栏何时该出现", () => {
  it("三个主 tab 在正常状态下都显示底栏", () => {
    for (const p of ["/course", "/listen", "/me"]) {
      expect(shouldShowNav(p, false)).toBe(true);
    }
  });

  it("只有磨耳朵的歌词全屏页隐藏底栏", () => {
    expect(shouldShowNav("/listen", true)).toBe(false);
  });

  it("播放页展开状态残留时，其他 tab 仍必须有底栏（否则无路可退）", () => {
    // 这条就是事故现场：nowPlaying 残留为 true，人已经站在 /course
    expect(shouldShowNav("/course", true)).toBe(true);
    expect(shouldShowNav("/me", true)).toBe(true);
  });

  it("非主 tab 页面一律隐藏（沉浸页）", () => {
    for (const p of ["/game", "/me/report", "/me/treasure", "/course/l10", "/me/calendar"]) {
      expect(shouldShowNav(p, false)).toBe(false);
    }
  });
});
