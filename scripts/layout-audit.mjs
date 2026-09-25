#!/usr/bin/env node
/**
 * 多视口布局走查
 *
 * 用 CDP 驱动无头 Chrome，对「若干视口 × 若干页面」逐一切换尺寸、截图，
 * 并程序化检测溢出（文档滚动 / #app 内容溢出 / 具体越界元素）。
 * 改完布局必须跑一遍 —— 肉眼只看截图很容易漏。
 *
 * 前置：
 *   1. pnpm build（带 GH_REPO）后把 dist 挂到子路径服务上，例如：
 *        GH_REPO=kids-english pnpm build
 *        rsync -a dist/ /tmp/preview/kids-english/
 *        cd /tmp/preview && python3 -m http.server 8801
 *   2. 本机装有 Chrome（默认路径，可用 CHROME_PATH 覆盖）
 *
 * 用法：
 *   node scripts/layout-audit.mjs
 *
 * 环境变量：
 *   AUDIT_BASE   被测页面基地址，默认 http://127.0.0.1:8801/kids-english/
 *   AUDIT_PORT   Chrome 调试端口，默认 9333
 *   AUDIT_OUT    截图与报告输出目录，默认 /tmp/shots
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
const BASE = process.env.AUDIT_BASE || "http://127.0.0.1:8801/kids-english/";
const OUT = process.env.AUDIT_OUT || "/tmp/shots";
/** 可选：覆盖 UA（例如模拟 iPhone Safari 17.4+ 走 Safari 触感分支） */
const UA = process.env.AUDIT_UA || "";

const VIEWPORTS = [
  { name: "iphone_se_portrait", w: 375, h: 667, mobile: true },
  { name: "iphone14_portrait", w: 390, h: 844, mobile: true },
  { name: "iphone14_landscape", w: 844, h: 390, mobile: true },
  { name: "ipad_portrait", w: 768, h: 1024, mobile: true },
  { name: "ipad_landscape", w: 1024, h: 768, mobile: true },
  { name: "ipad_pro_landscape", w: 1366, h: 1024, mobile: true }
];

/** 页面清单：hash 路由（#/lesson/l4?stage=xxx），新页面 /treasure /report /review */
const PAGES = [
  { name: "home", q: "#/" },
  { name: "menu", q: "#/lesson/l4" },
  { name: "learn", q: "#/lesson/l4?stage=learn" },
  { name: "quiz", q: "#/lesson/l4?stage=quiz" },
  { name: "match", q: "#/lesson/l4?stage=match" },
  { name: "speak", q: "#/lesson/l4?stage=speak" },
  { name: "song", q: "#/lesson/l4?stage=song" },
  { name: "talk", q: "#/lesson/l4?stage=talk" },
  { name: "treasure", q: "#/treasure" },
  { name: "report", q: "#/report" },
  { name: "review", q: "#/review" }
];

/** 检测当前页是否真实渲染、是否溢出、哪些元素越界 */
const PROBE = `(() => {
  const de = document.documentElement;
  const app = document.getElementById('app');
  const vw = window.innerWidth, vh = window.innerHeight;
  const bad = [];
  // 找最近的纵向可滚动祖先：信息页（家长报告/宝藏罐）允许内容超一屏内部滚动，
  // 容器内容区内的"越界"是正常滚动，不是布局溢出
  const scrollAncestor = (el) => {
    let p = el.parentElement;
    while (p) {
      const cs = getComputedStyle(p);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
      p = p.parentElement;
    }
    return null;
  };
  if (app) {
    for (const el of app.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const sa = scrollAncestor(el);
      const inScroll = !!sa && r.bottom <= sa.getBoundingClientRect().top + sa.scrollHeight + 2;
      // 横向越界始终报（页面不应横向滚动）；纵向越界仅在没有可滚容器时报
      if (r.right > vw + 2 || r.left < -2 || (!inScroll && (r.bottom > vh + 2 || r.top < -2))) {
        bad.push({
          c: (typeof el.className === 'string' ? el.className : el.tagName).slice(0, 48),
          b: Math.round(r.bottom), r: Math.round(r.right)
        });
      }
    }
  }
  return JSON.stringify({
    vw, vh,
    // 必须真的渲染出页面，否则错误页/空白页会得出"零溢出"的假阳性
    rendered: !!(app && app.children.length > 0 && document.querySelector('.view')),
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

      const res = await cdp.send("Runtime.evaluate", {
        expression: PROBE,
        returnByValue: true
      });
      const info = JSON.parse(res.result.value);

      const shot = await cdp.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false
      });
      const file = path.join(OUT, `${vp.name}__${pg.name}.png`);
      fs.writeFileSync(file, Buffer.from(shot.data, "base64"));

      const ok =
        info.rendered === true &&
        info.docScroll <= 0 &&
        info.docScrollW <= 0 &&
        info.appOverflowY <= 1 &&
        info.appOverflowX <= 1 &&
        info.badCount === 0;

      report.push({ viewport: vp.name, page: pg.name, ok, ...info });
      console.log(
        `${ok ? "OK  " : "FAIL"}  ${vp.name.padEnd(22)} ${pg.name.padEnd(6)}` +
          `  渲染=${info.rendered ? 1 : 0}` +
          `  文档溢出 ${info.docScroll}px  内部溢出 ${info.appOverflowY}px` +
          `  越界元素 ${info.badCount}`
      );
      if (!ok) for (const b of info.bad) console.log(`        ↳ ${b.c}  bottom=${b.b}`);
    }
  }

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  const failed = report.filter((r) => !r.ok);
  console.log(`\n===== 汇总：${report.length - failed.length}/${report.length} 通过 =====`);
  if (failed.length) {
    console.log("未通过：");
    for (const f of failed) console.log(`  ${f.viewport} / ${f.page}`);
  }
  ws.close();
  process.exit(failed.length ? 1 : 0);
} catch (e) {
  console.error("走查失败:", e.message);
  process.exitCode = 2;
} finally {
  chrome.kill("SIGKILL");
}
