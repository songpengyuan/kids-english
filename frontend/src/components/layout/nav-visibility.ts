/**
 * 底部导航的显示规则（纯函数，便于单测）。
 *
 * 只在三个主 tab 显示：/course、/listen、/me；其余页面（闯关、报告、图鉴…）沉浸隐藏。
 * 磨耳朵的歌词全屏页自带完整 transport，也隐藏底栏（退出用顶栏收起键）。
 *
 * ⚠️ 判断"播放页是否展开"必须**同时**锚定路径，不能让一个脱离路由的状态单独说了算。
 * 真实事故：条件曾写成 `三首页 && !nowPlaying`。nowPlaying 是"歌词页展开"的全局标志，
 * 从歌词页用系统返回手势离开 /listen 时它不会复位，于是 /course 上整条底栏一起消失，
 * 孩子既点不到磨耳朵、也去不了任何 tab —— 屏幕上一条导航都没有。
 * 现在只有 `path === "/listen"` 才可能隐藏底栏，其它路径永远保留导航。
 */
export const NAV_PATHS = ["/course", "/listen", "/me"] as const;

export function shouldShowNav(path: string, playerPageOpen: boolean): boolean {
  if (!NAV_PATHS.includes(path as (typeof NAV_PATHS)[number])) return false;
  return !(path === "/listen" && playerPageOpen);
}
