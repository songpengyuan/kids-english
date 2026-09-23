#!/usr/bin/env node
/**
 * Safari 触感通路验证（CDP 无头 Chrome + iPhone Safari UA）
 *
 * 验证目标：
 *   1. 在 Safari UA 下会给可点元素叠加透明 <input switch>（触感来源）
 *   2. 叠加层不改变宿主元素尺寸/位置（不破坏布局）
 *   3. 真实命中测试下，点击仍能落到业务处理器（亲子对话卡片、学单词卡片）
 *   4. 连线拖拽（pointerdown → pointermove → pointerup）不受叠加层影响
 *
 * 用法：先启动 preview（4173），再 node scripts/verify-haptics.mjs
 */
import { spawn } from "node:child_process";

const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = Number(process.env.AUDIT_PORT || 9334);
const BASE = process.env.AUDIT_BASE || "http://localhost:4173/kids-english/";
// iPhone Safari 17.5
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--mute-audio",
    `--remote-debugging-port=${PORT}`,
    "--user-data-dir=/tmp/chrome-cdp-haptics",
    "about:blank"
  ],
  { stdio: "ignore" }
);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

let ws;
try {
  let page = null;
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) break;
    } catch {}
    await sleep(250);
  }
  ws = new globalThis.WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", () => rej(new Error("WS 连接失败")), { once: true });
  });

  let id = 0;
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const myId = ++id;
      const onMsg = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id !== myId) return;
        ws.removeEventListener("message", onMsg);
        msg.error ? reject(new Error(method + ": " + msg.error.message)) : resolve(msg.result);
      };
      ws.addEventListener("message", onMsg);
      ws.send(JSON.stringify({ id: myId, method, params }));
    });

  const evalJs = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "eval 失败");
    return r.result.value;
  };
  const goto = async (url) => {
    await send("Page.navigate", { url });
    await sleep(1400);
  };
  const clickAt = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(60);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await send("Emulation.setUserAgentOverride", { userAgent: IOS_UA });
  // 桌面 Chrome 也定义了 navigator.vibrate（空实现），先删掉才能真正模拟 iOS Safari
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: "try { delete Navigator.prototype.vibrate; } catch (e) {}"
  });

  /* ---------- 1. 叠加层注入 ---------- */
  await goto(BASE);
  const info = await evalJs(`window.__kidsHaptics()`);
  check("Safari 走「透明 switch」通路", info && info.Safari开关触感 === true && info.原生震动 === false, JSON.stringify(info));
  const homeOverlays = await evalJs(`document.querySelectorAll('input[data-haptic-switch]').length`);
  check("首页课程卡片已叠加开关", homeOverlays >= 2, "count=" + homeOverlays);

  /* ---------- 2. 叠加层不影响布局 ---------- */
  const layout = await evalJs(`(() => {
    const card = document.querySelector('.lesson-card');
    const ov = card.querySelector('input[data-haptic-switch]');
    if (!ov) return { ok: false, reason: 'no overlay' };
    const cr = card.getBoundingClientRect();
    const or = ov.getBoundingClientRect();
    const cs = getComputedStyle(ov);
    return {
      ok: true,
      sameSize: Math.abs(cr.width - or.width) < 1.5 && Math.abs(cr.height - or.height) < 1.5,
      absolute: cs.position === 'absolute',
      invisible: Number(cs.opacity) === 0,
      hostPos: getComputedStyle(card).position
    };
  })()`);
  check("叠加层与宿主同尺寸且绝对定位透明", layout.ok && layout.sameSize && layout.absolute && layout.invisible, JSON.stringify(layout));

  /* ---------- 3. 点击仍能命中业务逻辑 ---------- */
  // 亲子对话：点第一条口语句，应出现「✓ 听过啦」
  await goto(BASE + "?lesson=l5&stage=talk");
  const phraseBox = await evalJs(`(() => {
    const el = document.querySelector('.phrase');
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, hasOverlay: !!el.querySelector('input[data-haptic-switch]') };
  })()`);
  check("亲子对话卡片已叠加开关", phraseBox.hasOverlay);
  await clickAt(phraseBox.x, phraseBox.y);
  await sleep(700);
  const heard = await evalJs(`!!document.querySelector('.phrase .heard-mark')`);
  check("点击穿透叠加层 → 亲子对话标记「听过啦」", heard === true);

  // 学单词：点词卡应触发 animate.css tada 且不消失
  await goto(BASE + "?lesson=l5&stage=learn");
  const cardBox = await evalJs(`(() => {
    const c = document.querySelector('.word-card');
    const r = c.querySelector('.pic').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, hasOverlay: !!c.querySelector('.pic input[data-haptic-switch]') };
  })()`);
  check("词卡图片区已叠加开关", cardBox.hasOverlay);
  await clickAt(cardBox.x, cardBox.y);
  await sleep(220);
  const anim = await evalJs(`(() => {
    const c = document.querySelector('.word-card');
    const t = getComputedStyle(c).transform;
    return { cls: c.className, visible: t !== 'none' };
  })()`);
  check("点击穿透叠加层 → 词卡播放 tada 动画", /animate__tada/.test(anim.cls), anim.cls);

  /* ---------- 4. 连线拖拽不受影响 ---------- */
  await goto(BASE + "?lesson=l5&stage=match");
  const drag = await evalJs(`(() => {
    const img = document.querySelector('.col.imgs .cell.pic');
    const word = img.querySelector('img').alt.trim().toLowerCase();
    const target = [...document.querySelectorAll('[data-word]')].find(w => w.textContent.trim().toLowerCase() === word);
    if (!target) return null;
    const a = img.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    return {
      from: { x: a.left + a.width / 2, y: a.top + a.height / 2 },
      to: { x: b.left + b.width / 2, y: b.top + b.height / 2 },
      overlaysOnBoard: document.querySelectorAll('.board input[data-haptic-switch]').length
    };
  })()`);
  check("连线棋盘格子已叠加开关", drag && drag.overlaysOnBoard > 0, "overlays=" + (drag && drag.overlaysOnBoard));
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: drag.from.x, y: drag.from.y, button: "left", clickCount: 1 });
  for (let i = 1; i <= 6; i++) {
    const x = drag.from.x + ((drag.to.x - drag.from.x) * i) / 6;
    const y = drag.from.y + ((drag.to.y - drag.from.y) * i) / 6;
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left" });
    await sleep(40);
  }
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: drag.to.x, y: drag.to.y, button: "left", clickCount: 1 });
  await sleep(700);
  const lineCount = await evalJs(`document.querySelectorAll('.done-line').length`);
  check("拖拽连线仍然成功（穿透叠加层）", lineCount === 1, "done-line=" + lineCount);
} catch (e) {
  console.error("脚本异常:", e.message);
  process.exitCode = 2;
} finally {
  chrome.kill();
}

const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} 项通过`);
if (fails.length) process.exitCode = 1;
