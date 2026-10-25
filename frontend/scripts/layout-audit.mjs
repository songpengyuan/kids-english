#!/usr/bin/env node
/**
 * 多视口布局走查
 *
 * 用 CDP 驱动无头 Chrome，对「若干视口 × 若干页面」逐一切换尺寸、截图，
 * 并程序化检测溢出（文档滚动 / #app 内容溢出 / 具体越界元素）。
 * 改完布局必须跑一遍 —— 肉眼只看截图很容易漏。
 *
 * 前置：
 *   1. 构建。直接 `pnpm build` 会因 emptyOutDir 清 dist/ 被批量删除保护拦下，
 *      所以构建到 /tmp 下的独立目录：
 *        BASE_PATH=/ node ./node_modules/vite/bin/vite.js build \
 *          --outDir /tmp/kids-audit-dist --emptyOutDir
 *   2. 起静态服务：
 *        cd /tmp/kids-audit-dist && python3 -m http.server 8801
 *      （BASE_PATH=/ 构建的根路径产物，所以 AUDIT_BASE 末尾是 / 而不是 /kids-english/）
 *   3. 本机装有 Chrome（默认路径，可用 CHROME_PATH 覆盖）
 *
 * 用法：
 *   node scripts/layout-audit.mjs                         # 全视口（约 8 分钟，放后台跑）
 *   AUDIT_VIEWPORTS=ipad    node scripts/layout-audit.mjs # 只跑 iPad 形态
 *   AUDIT_VIEWPORTS=phone   node scripts/layout-audit.mjs # 只跑手机形态
 *
 * 环境变量：
 *   AUDIT_BASE       被测页面基地址，默认 http://127.0.0.1:8801/
 *   AUDIT_PORT       Chrome 调试端口，默认 9333
 *   AUDIT_OUT        截图与报告输出目录，默认 /tmp/shots
 *   AUDIT_VIEWPORTS  视口组过滤（ipad / phone / desktop，或视口名里的任意片段）
 *
 * 为什么不用 `chrome --screenshot --virtual-time-budget`：
 *   页面里有无限循环的 CSS 动画（anim-float / anim-wiggle），
 *   虚拟时间推进不到 idle，Chrome 会一直挂着不退出。
 *   用 CDP 手动控制节奏就绕开了这个坑。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = Number(process.env.AUDIT_PORT || 9333);
const BASE = process.env.AUDIT_BASE || "http://127.0.0.1:8801/app/";
const OUT = process.env.AUDIT_OUT || "/tmp/shots";
/** 可选：覆盖 UA（例如模拟 iPhone Safari 17.4+ 走 Safari 触感分支） */
const UA = process.env.AUDIT_UA || "";
/** 可选：只跑某一组视口（按名字片段匹配） */
const VP_FILTER = process.env.AUDIT_VIEWPORTS || "";

/**
 * 视口清单。
 *
 * iPad 是主场景，所以把它的各种形态都摊开 —— 关键点是**宽度横跨 700 与 768 两个断点**：
 * iPad mini 竖屏只有 744 宽，够不到 `@media (min-width: 768px)` 的宽屏 token 放大，
 * 而它显然是一台 iPad。只测 768 会漏掉它，只测理论分辨率也会漏掉分屏。
 *
 * 档位速查（useViewport.sizeTier 按高度：<480 tiny / <640 compact / <900 regular / ≥900 roomy）：
 *   ipad_landscape 1024×768      wide · regular   主力
 *   ipad_mini_portrait 744×1133  wide · roomy     够不到 768 的 wide token ⚠
 *   ipad_split_half 507×768      narrow · regular 分屏
 */
const VIEWPORTS = [
  // 手机（回归基线，防止改 iPad 时把手机改坏）
  { name: "phone_se_portrait", w: 375, h: 667, mobile: true },
  { name: "phone14_portrait", w: 390, h: 844, mobile: true },
  { name: "phone14_landscape", w: 844, h: 390, mobile: true },
  // 667×375：宽过了 600 却不到 768 —— "值档宽屏、结构档手机"的边界样本
  // （iPhone SE 横屏。曾验证过 4 列宫格若降到 600 会在这里挤爆，见 PracticeView 注释）
  { name: "phone_se_landscape", w: 667, h: 375, mobile: true },
  // iPad（主场景）
  { name: "ipad_mini_portrait", w: 744, h: 1133, mobile: true },
  { name: "ipad_mini_landscape", w: 1133, h: 744, mobile: true },
  { name: "ipad_portrait", w: 768, h: 1024, mobile: true },
  { name: "ipad_landscape", w: 1024, h: 768, mobile: true },
  { name: "ipad_air_portrait", w: 820, h: 1180, mobile: true },
  { name: "ipad_pro11_portrait", w: 834, h: 1194, mobile: true },
  { name: "ipad_pro_landscape", w: 1366, h: 1024, mobile: true },
  { name: "ipad_split_half", w: 507, h: 768, mobile: true },
  // 分屏 2/3（约 678×768）：宽过 600 拿值档、够不到 768 拿结构分栏 ——
  // "600 值档 / 768 结构档"之间的样本，留一个视口常驻盯着（见 DESIGN_SYSTEM §11.5）
  { name: "ipad_split_two_thirds", w: 678, h: 768, mobile: true },
  // 桌面（#app 限宽 1180，本质是"更宽的 wide"）
  { name: "desktop_window", w: 1440, h: 900, mobile: false }
].filter((v) => !VP_FILTER || v.name.includes(VP_FILTER));

/**
 * 页面清单（hash 路由）。
 *
 * 2026-10 更新：项目早已从 `#/lesson/:id?stage=` 迁到课程域 `#/course/:id/:stage`，
 * 旧清单里的 9 个页面全都落进 not-found → 重定向到 `#/course`，
 * 产出的是 9 张"首页"截图 + 假阳性全绿。**改了走查发现之前先确认这份清单跟得上路由。**
 *
 * 不含 `/me/report` 与 `/me/parent`：它们 meta.requiresParent，
 * 未解锁时 parentGuard 会重定向到 `/me`，测不到真实页面。
 */
const PAGES = [
  { name: "home", q: "#/course" },
  // 课程详情页：默认 game 视图；?view=menu 是卡片目录（两个视图都要量）
  { name: "course-game", q: "#/course/l4" },
  { name: "course-menu", q: "#/course/l4?view=menu" },
  { name: "learn", q: "#/course/l4/learn" },
  { name: "hear", q: "#/course/l4/hear" },
  { name: "memory", q: "#/course/l4/memory" },
  { name: "match", q: "#/course/l4/match" },
  { name: "speak", q: "#/course/l4/speak" },
  { name: "order", q: "#/course/l4/order" },
  { name: "song", q: "#/course/l4/song" },
  { name: "talk", q: "#/course/l4/talk" },
  { name: "quest", q: "#/course/l4/game/quest?step=learn" },
  { name: "review", q: "#/course/review" },
  { name: "listen", q: "#/listen" },
  { name: "me", q: "#/me" },
  { name: "calendar", q: "#/me/calendar" },
  { name: "treasure", q: "#/me/treasure" },
  { name: "hero", q: "#/me/treasure/hero/tiga" },
  // 播放器是"点开才出现"的浮层，静态首屏量不到 —— 这正是它去年出过
  // "iPad 横屏看不到播放键"的原因（单列 850px 塞进 652px）。
  // prep：先点第一首歌把浮层展开，再按常规探针量。
  { name: "listen-player", q: "#/listen", prep: "document.querySelector('.song-row')?.click()" },
  // 视频播放浮层（2026-10-25 自绘控制栏后纳入）：切到视频 tab 再点第一张卡。
  // tab 切换是 Vue 异步渲染，prep 里起 async 等一拍再点卡（外部有 900ms 稳定期兜底）。
  {
    name: "listen-video",
    q: "#/listen",
    prep: `(async () => {
      const tab = [...document.querySelectorAll('button')].find(b => b.textContent.includes('视频'));
      tab?.click();
      await new Promise(r => setTimeout(r, 300));
      document.querySelector('.video-card')?.click();
    })()`,
  },
];

/** 检测当前页是否真实渲染、是否溢出、哪些元素越界 */
const PROBE = `(() => {
  const de = document.documentElement;
  const app = document.getElementById('app');
  const vw = window.innerWidth, vh = window.innerHeight;
  const bad = [];
  /**
   * 某个轴向上有没有"能滚动的祖先"。
   * 有 → 超出视口的部分用户滑得到，属于正常滚动，不该报。
   *
   * 原版探针只认 overflowY，于是**横向轮播一律误报**（英雄姿势、关卡横滑都用
   * overflow-x:auto + 每格 100% 宽的写法，格子天然排到视口右边）；
   * 反向的漏报也存在：.game-path-scroll 竖滚容器里的装饰山丘被当成"被裁掉"。
   * （注意：这段是模板字符串，注释里不能出现反引号）
   * 现在两个轴分别判断，只报"既出界又没有任何容器能滚到"的那种。
   */
  const scrollableAxis = (el, axis) => {
    const key = axis === 'y' ? 'overflowY' : 'overflowX';
    let p = el.parentElement;
    while (p && p !== de) {
      const ov = getComputedStyle(p)[key];
      if (ov === 'auto' || ov === 'scroll') return true;
      p = p.parentElement;
    }
    return false;
  };
  if (app) {
    for (const el of app.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      /**
       * 装饰层不参与溢出判定：背景插画（CuteBackdrop 的山丘）本来就故意
       * 画到视口外再由 #app 裁掉 —— 那是构图，不是"内容被切掉"。
       * 判据用语义标记而不是类名：aria-hidden="true" 的子树，或自身 pointer-events:none。
       */
      if (el.closest('[aria-hidden="true"]')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
      const hitY = (r.bottom > vh + 2 || r.top < -2) && !scrollableAxis(el, 'y');
      const hitX = (r.right > vw + 2 || r.left < -2) && !scrollableAxis(el, 'x');
      if (hitX || hitY) {
        bad.push({
          c: (typeof el.className === 'string' ? el.className : el.tagName).slice(0, 48),
          axis: (hitX ? 'x' : '') + (hitY ? 'y' : ''),
          b: Math.round(r.bottom),
          r: Math.round(r.right)
        });
      }
    }
  }
  return JSON.stringify({
    vw, vh,
    // 必须真的渲染出页面，否则错误页/空白页会得出"零溢出"的假阳性
    rendered: !!(app && app.children.length > 0 && document.querySelector('.view')),
    // 实际落地的 hash：被重定向（路由不存在 / 家长门禁拦下）时要看得出来，
    // 否则会拿着一张"首页"截图当成目标页通过 —— 旧版清单正是这样假绿了 9 个页面
    hash: location.hash || '(空)',
    docScroll: de.scrollHeight - de.clientHeight,
    docScrollW: de.scrollWidth - de.clientWidth,
    appOverflowY: app ? app.scrollHeight - app.clientHeight : -1,
    appOverflowX: app ? app.scrollWidth - app.clientWidth : -1,
    badCount: bad.length,
    bad: bad.slice(0, 6)
  });
})()`;

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}, timeout = 30000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 超时: ${method}`));
        }
      }, timeout);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        }
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForPageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === "page");
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* chrome 还没起来，继续等 */
    }
    await sleep(250);
  }
  throw new Error("Chrome 调试端口未就绪，请确认 CHROME_PATH 与端口");
}

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--no-sandbox",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--mute-audio",
    `--remote-debugging-port=${PORT}`,
    "--user-data-dir=/tmp/chrome-cdp-audit",
    "about:blank"
  ],
  { stdio: "ignore" }
);

try {
  fs.mkdirSync(OUT, { recursive: true });
  const wsUrl = await waitForPageTarget();
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });

  const cdp = new CDP(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  const report = [];

  for (const vp of VIEWPORTS) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: vp.w,
      height: vp.h,
      deviceScaleFactor: 1,
      mobile: vp.mobile
    });
    // 可选：模拟 iOS Safari UA，用于验证 Safari 专属分支（如触感开关叠加层）不影响布局
    if (UA) await cdp.send("Emulation.setUserAgentOverride", { userAgent: UA });

    for (const pg of PAGES) {
      await cdp.send("Page.navigate", { url: BASE + pg.q });
      // 等 Vue 挂载 + ResizeObserver 完成测量与分页；再留一点余量让入场动画
      // （anim-fade-up / anim-pop）跑完，否则探针会撞上动画中间态误报越界。
      // 首次导航（首个视口 × 首页）偶发更慢，统一给足 2.4s。
      await sleep(2400);

      // 防呆：BASE 指错站点时所有截图都在拍错的东西（曾因默认 BASE 少 /app/
      // 前缀，整轮拍的是备案落地页白跑）。标题不含应用名即刻中止。
      const title = await cdp.send("Runtime.evaluate", {
        expression: "document.title",
        returnByValue: true,
      });
      if (!String(title.result?.value ?? "").includes("丞丞ABC")) {
        throw new Error(
          `页面标题不是丞丞ABC（实际「${title.result?.value}」）—— BASE 大概率指错了站点：` +
            `应用挂在 /app/ 子路径（dev: http://127.0.0.1:<port>/app/），根路径是备案落地页。`
        );
      }

      // 可选交互：把"点开才出现"的浮层展开（播放器 / 抽屉），否则量不到真实布局
      if (pg.prep) {
        await cdp.send("Runtime.evaluate", { expression: `(() => { ${pg.prep} })()` });
        await sleep(900); // 浮层入场动画（--dur-slow）+ 布局稳定
      }

      const res = await cdp.send("Runtime.evaluate", {
        expression: PROBE,
        returnByValue: true
      });
      // 探针自己抛异常时 result.value 是 undefined，直接 JSON.parse 会得到
      // 一句没头没尾的 `"undefined" is not valid JSON` —— 把真异常挖出来再报。
      if (res.exceptionDetails || res.result?.value === undefined) {
        throw new Error(
          `探针执行失败 @ ${vp.name}/${pg.name}：` +
            (res.exceptionDetails?.exception?.description ?? JSON.stringify(res.result ?? res))
        );
      }
      const info = JSON.parse(res.result.value);

      const shot = await cdp.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false
      });
      const file = path.join(OUT, `${vp.name}__${pg.name}.png`);
      fs.writeFileSync(file, Buffer.from(shot.data, "base64"));

      // 期望 #/course/l4/learn，实际可能被路由重定向到别处（页面清单过期的主要症状）
      const misrouted = info.hash !== pg.q;

      const ok =
        info.rendered === true &&
        !misrouted &&
        info.docScroll <= 0 &&
        info.docScrollW <= 0 &&
        info.appOverflowY <= 1 &&
        info.appOverflowX <= 1 &&
        info.badCount === 0;

      report.push({ viewport: vp.name, page: pg.name, ok, misrouted, ...info });
      console.log(
        `${ok ? "OK  " : "FAIL"}  ${vp.name.padEnd(20)} ${pg.name.padEnd(9)}` +
          `  渲染=${info.rendered ? 1 : 0}` +
          `  文档溢出 ${info.docScroll}px  内部溢出 ${info.appOverflowY}px` +
          `  越界元素 ${info.badCount}` +
          (misrouted ? `  ⚠ 重定向到 ${info.hash}` : "")
      );
      if (!ok) for (const b of info.bad) console.log(`        ↳ [${b.axis}] ${b.c || '(无类名)'}  right=${b.r} bottom=${b.b}`);
    }
  }

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  const failed = report.filter((r) => !r.ok);
  console.log(`\n===== 汇总：${report.length - failed.length}/${report.length} 通过 =====`);
  if (failed.length) {
    // 分两类报：清单过期（重定向）和真的布局溢出，处理方式完全不同
    const mis = failed.filter((f) => f.misrouted);
    const layout = failed.filter((f) => !f.misrouted);
    if (mis.length) {
      console.log(`\n页面清单过期（已重定向，${mis.length} 处）—— 更新 scripts/layout-audit.mjs 的 PAGES：`);
      for (const f of mis) console.log(`  ${f.viewport} / ${f.page}  期望 ${PAGES.find((p) => p.name === f.page)?.q} → 实际 ${f.hash}`);
    }
    if (layout.length) {
      console.log(`\n布局溢出（${layout.length} 处）：`);
      for (const f of layout) {
        console.log(
          `  ${f.viewport} / ${f.page}  文档溢出 ${f.docScroll}px  内部溢出 ${f.appOverflowY}px  越界 ${f.badCount} 个`
        );
      }
    }
  }
  ws.close();
  process.exit(failed.length ? 1 : 0);
} catch (e) {
  console.error("走查失败:", e.message);
  process.exitCode = 2;
} finally {
  chrome.kill("SIGKILL");
}
