#!/usr/bin/env node
/**
 * 针对本次四项修复的交互验证（CDP 驱动无头 Chrome）：
 *   1. 连线：完成后线条 pathLength=100、端点不进入卡片内部（留 2px 余量）
 *   2. 听音选图：每个选项下方有英文单词标签
 *   3. 标题：课程卡片 / 顶栏显示英文标题，不含中文
 *   4. 学单词：点卡片触发 animate.css tada 动画且卡片始终可见（无 scale(0)/opacity 0 帧）
 *
 * 用法：先启动 preview（4173 端口），然后 node scripts/verify-fixes.mjs
 */
import { spawn } from "node:child_process";

const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = Number(process.env.AUDIT_PORT || 9333);
const BASE = process.env.AUDIT_BASE || "http://localhost:4173/kids-english/";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(ws, id, method, params = {}) {
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) {
        ws.removeEventListener("message", onMsg);
        if (msg.error) reject(new Error(method + ": " + msg.error.message));
        else resolve(msg.result);
      }
    };
    ws.addEventListener("message", onMsg);
  });
}

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-gpu",
  "--window-size=1200,900",
  "about:blank"
], { stdio: "ignore" });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

try {
  // 等 devtools 端口就绪
  let targets = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      targets = await res.json();
      if (targets.length) break;
    } catch {}
    await sleep(300);
  }
  const page = targets.find((t) => t.type === "page");
  // Node 22 自带原生 WebSocket（事件用 addEventListener）
  const ws = new globalThis.WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("WebSocket 连接失败")), { once: true });
  });
  let msgId = 0;
  const send = (method, params = {}) => rpc(ws, ++msgId, method, params);

  await send("Page.enable");
  await send("Runtime.enable");

  const goto = async (url) => {
    await send("Page.navigate", { url });
    await sleep(1200);
  };
  const evalJs = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails));
    return r.result.value;
  };

  /* ---------- 3. 标题英文 ---------- */
  await goto(BASE);
  const homeTitle = await evalJs(`document.querySelector('.lesson-card .lt')?.textContent?.trim()`);
  check("首页课程卡片标题为英文", !/[\u4e00-\u9fff]/.test(homeTitle || ""), homeTitle);

  await goto(BASE + "?lesson=l4");
  const barTitle = await evalJs(`document.querySelector('.topbar .title')?.textContent?.trim()`);
  check("课程页顶栏标题为英文", !/[\u4e00-\u9fff]/.test(barTitle || ""), barTitle);
  const zhLeak = await evalJs(
    `[document.querySelector('.topbar .title')?.textContent, document.querySelector('.lesson-card .lt')?.textContent].join('')`
  );
  check("标题无中文残留", !/[\u4e00-\u9fff]/.test(zhLeak), zhLeak);

  /* ---------- 2. 听音选图单词标签 ---------- */
  await goto(BASE + "?lesson=l4&stage=quiz");
  await sleep(1500);
  const quizInfo = await evalJs(`(() => {
    const opts = [...document.querySelectorAll('.opt')];
    return {
      n: opts.length,
      withWord: opts.filter(o => o.querySelector('.w') && o.querySelector('.w').textContent.trim()).length,
      texts: opts.map(o => o.querySelector('.w')?.textContent?.trim())
    };
  })()`);
  check("听音选图 4 个选项都有英文单词标签", quizInfo.n === 4 && quizInfo.withWord === 4, quizInfo.texts.join(", "));

  /* ---------- 4. 学单词点击动画 ---------- */
  await goto(BASE + "?lesson=l4&stage=learn");
  await sleep(1200);
  const animRes = await evalJs(`(async () => {
    const card = document.querySelector('.word-card');
    if (!card) return { found: false };
    const before = getComputedStyle(card).transform;
    card.querySelector('.pic').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    const cls = card.className;
    const mid = getComputedStyle(card).transform;
    const visibleMid = mid !== 'none' && !/matrix\\(0,/.test(mid);
    await new Promise(r => setTimeout(r, 900));
    const clsAfter = card.className;
    return { found: true, cls, clsAfter, animated: mid !== before, visibleMid };
  })()`);
  check("点词卡触发 animate.css tada", /animate__tada/.test(animRes.cls || ""), animRes.cls);
  check("动画过程中卡片保持可见", animRes.found && animRes.visibleMid);
  check("动画结束后类被清理(可重复触发)", !/animate__animated/.test(animRes.clsAfter || ""));

  /* ---------- 1. 连线 ---------- */
  await goto(BASE + "?lesson=l4&stage=match");
  await sleep(1500);
  // 依次把每张图拖到中间对应单词（按 data-word 找 id 匹配）
  const matchRes = await evalJs(`(async () => {
    const fire = (el, type, x, y) => {
      const ev = new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true });
      el.dispatchEvent(ev);
    };
    const board = document.querySelector('.board');
    const lineDone = () => document.querySelector('.done-line');
    // 第一对：左列第一张图 + 中间与其同 id 的单词
    const img = document.querySelector('.col.imgs .cell.pic');
    const id = img.__vueParentComponent ? null : null;
    // 直接从 DOM 拿不到 id，用 Vue 内部方式太绕 —— 改为遍历：对每个单词位置抬起一次，
    // 释放后检查是否产生 done-line，直到产生为止
    const words = [...document.querySelectorAll('[data-word]')];
    const rb = board.getBoundingClientRect();
    let ok = false;
    for (const w of words) {
      const wr = w.getBoundingClientRect();
      fire(img, 'pointerdown', rb.left + 10 + img.getBoundingClientRect().width / 2, img.getBoundingClientRect().top + img.getBoundingClientRect().height / 2);
      // 移动到单词上
      fire(document, 'pointermove', wr.left + wr.width / 2, wr.top + wr.height / 2);
      fire(document, 'pointerup', wr.left + wr.width / 2, wr.top + wr.height / 2);
      await new Promise(r => setTimeout(r, 600));
      if (lineDone()) { ok = true; break; }
    }
    if (!ok) return { ok, lines: [] };
    await new Promise(r => setTimeout(r, 600));
    const lines = [...document.querySelectorAll('.done-line')].map(l => ({
      pathLength: l.getAttribute('pathLength'),
      x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'),
      x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2')
    }));
    // 校验端点不在卡片内部：卡片 rect（board 坐标）
    const cellRects = [...document.querySelectorAll('.cell')].map(c => {
      const r = c.getBoundingClientRect();
      return { l: r.left - rb.left, t: r.top - rb.top, r: r.right - rb.left, b: r.bottom - rb.top };
    });
    const EPS = 2.5;
    const inside = (x, y) => cellRects.some(rc => x > rc.l + EPS && x < rc.r - EPS && y > rc.t + EPS && y < rc.b - EPS);
    const bads = [];
    for (const l of lines) {
      for (const [label, x, y] of [["x1,y1", l.x1, l.y1], ["x2,y2", l.x2, l.y2]]) {
        if (inside(x, y)) {
          const hit = cellRects.findIndex(rc => x > rc.l + EPS && x < rc.r - EPS && y > rc.t + EPS && y < rc.b - EPS);
          bads.push(label + "=(" + x.toFixed(1) + "," + y.toFixed(1) + ") in cell#" + hit);
        }
      }
    }
    return { ok, lines, badEndpoints: bads.length, badDetail: bads.join("; "), dashOffset: document.querySelector('.done-line') ? getComputedStyle(document.querySelector('.done-line')).strokeDashoffset : null };
  })()`);
  check("连线能成功连上", matchRes.ok);
  check("done-line 带 pathLength=100(长线无断口)", matchRes.lines?.every(l => l.pathLength === "100"), JSON.stringify(matchRes.lines?.[0]));
  check("线条端点不在卡片内部(不被遮挡)", matchRes.badEndpoints === 0, matchRes.badDetail);
  check("线型为实线(dashoffset 已画满)", matchRes.dashOffset === "0px", String(matchRes.dashOffset));

  // 截图存档
  const shot = await send("Page.captureScreenshot", { format: "png" });
  const fs = await import("node:fs");
  fs.writeFileSync("/tmp/verify-fixes-match.png", Buffer.from(shot.data, "base64"));
} catch (e) {
  console.error("脚本异常:", e.message);
  process.exitCode = 2;
} finally {
  chrome.kill();
}

const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} 项通过`);
if (fails.length) process.exitCode = 1;
