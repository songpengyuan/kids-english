/**
 * 底部导航的显示规则（纯函数，便于单测）。
 *
 * 只在三个主 tab 显示：/course、/listen、/me；其余页面（闯关、报告、图鉴…）沉浸隐藏。
 *
 * ⚠️ 历史事故（保留在这里，防止有人改回去）：
 *   条件曾写成 `三首页 && !player.nowPlaying`。nowPlaying 是"歌词页展开"的全局标志，
 *   不从路由派生；从歌词页用系统返回手势离开 /listen 时它仍是 true，
 *   于是 /course 上整条底栏一起消失 —— 屏幕上没有任何 tab，孩子彻底回不去磨耳朵。
 *   结论：**底栏显隐只认路径**，任何脱离路由的全局状态都不参与这个判断。
 *
 * ⚠️ 2026-10-17 二改（本文件现在的形态）：磨耳朵播放页**不再隐藏底栏**。
 *   上一版为了不让"播放页 transport"和"底栏"两个底部打架，把整条底栏藏了，
 *   代价是播放页成了全站唯一没有导航的页面（只能靠顶栏收起键退出）。
 *   现在的解法是**让浮层让位、而不是让底栏消失**：
 *     · 播放浮层不再 inset:0 盖满全屏，下边界抬到 `底栏之上`
 *       （见 ListenView.vue 的 .player：bottom = nav-h + 安全区）；
 *     · 底栏仍在 --z-floating(40)，浮层在 --z-bar(30)，即使边界算错也是底栏压在上面，
 *       不会重演"导航消失"的事故。
 *   于是这里退化为"只看路径在不在三个主 tab 里"，不再需要第二个参数。
 */
export const NAV_PATHS = ["/course", "/listen", "/me"] as const;

export function shouldShowNav(path: string): boolean {
  return NAV_PATHS.includes(path as (typeof NAV_PATHS)[number]);
}
