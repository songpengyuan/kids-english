#!/usr/bin/env node
/**
 * PWA 验证（CDP 驱动无头 Chrome + vite preview 模拟 GitHub Pages 子路径）：
 *   1. 产物路径：子路径 base 下 manifest/图标/sw.js 都能访问，manifest 合法
 *   2. SW 注册并接管页面，壳缓存（index.html + 哈希 assets）就位
 *   3. 媒体进缓存：请求过一次 song.mp3 后 kids-media-v1 里有完整条目
 *   4. 真·断网（杀掉 preview 服务）：刷新仍能渲染首页；song.mp3 可从缓存读出；
 *      Range 请求返回 206（离线也能拖进度条）
 *   5. 更新及时性 A：换掉 dist/index.html 内容 → 刷新立刻拿到新内容（network-first）
 *   6. 更新及时性 B：换掉 dist/sw.js 的构建 id → reg.update() 后 SW 自动升级到新版本
 *   7. 更新不打断玩法：孩子在课时页时升级完成也不会强制刷新；回到首页才静默刷新
 *
 * 用法：node scripts/verify-pwa.mjs   （脚本自己负责 build + 起/停 preview）
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CDP_PORT = Number(process.env.AUDIT_PORT || 9340);
const PREVIEW_PORT = 4173;
const BASE = `http://localhost:${PREVIEW_PORT}/kids-english/`;

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

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

/* ---------- 0. 构建 + 起 preview ---------- */
console.log("building (GH_REPO=kids-english)...");
const build = spawnSync("pnpm", ["build"], { cwd: ROOT, env: { ...process.env, GH_REPO: "kids-english" }, stdio: "pipe" });
if (build.status !== 0) {
  console.error(String(build.stderr || build.stdout));
  process.exit(1);
}

function startPreview() {
  // detached：把 pnpm 及其子进程（真正的 vite preview）放进同一进程组，
  // 停的时候整组杀掉，否则子进程会占着 4173 端口导致重启失败
  const p = spawn("pnpm", ["preview", "--port", String(PREVIEW_PORT), "--strictPort"], {
    cwd: ROOT,
    env: { ...process.env, GH_REPO: "kids-english" },
    stdio: "ignore",
    detached: true,
  });
  return p;
}
function stopPreview(p) {
  try {
    process.kill(-p.pid, "SIGKILL"); // 负 pid = 杀整个进程组
  } catch {
    try {
      p.kill("SIGKILL");
    } catch {}
  }
}
async function waitPreview() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return true;
    } catch {}
    await sleep(250);
  }
  return false;
}
function freePort(port) {
  spawnSync("/bin/sh", ["-c", `lsof -ti:${port} | xargs kill -9 2>/dev/null; true`]);
}

freePort(PREVIEW_PORT);
let preview = startPreview();
if (!(await waitPreview())) {
  console.error("preview 没起来");
  process.exit(1);
}

const chrome = spawn(CHROME, [
  "--headless=new",
  "--no-sandbox",
  `--remote-debugging-port=${CDP_PORT}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-gpu",
  "--autoplay-policy=no-user-gesture-required",
  "--mute-audio",
  "--window-size=1200,900",
  "about:blank"
], { stdio: "ignore" });

try {
  let targets = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      targets = await res.json();
      if (targets.length) break;
    } catch {}
    await sleep(300);
  }
  const page = targets.find((t) => t.type === "page");
  const ws = new globalThis.WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("WebSocket 连接失败")), { once: true });
  });
  let msgId = 0;
  const send = (method, params = {}) => rpc(ws, ++msgId, method, params);
  await send("Page.enable");
  await send("Runtime.enable");

  const goto = async (url, wait = 1200) => {
    await send("Page.navigate", { url });
    await sleep(wait);
  };
  const evalJs = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails));
    return r.result.value;
  };

  /* ---------- 1. 产物与 manifest ---------- */
  await goto(BASE, 800);
  const html = await evalJs(`document.documentElement.outerHTML`);
  check("index.html 引用子路径 manifest", html.includes("/kids-english/manifest.webmanifest"), "base 重写正确");
  const mf = await evalJs(`(async () => {
    const r = await fetch("manifest.webmanifest");
    if (!r.ok) return { ok: false, status: r.status };
    const j = await r.json();
    return { ok: true, display: j.display, start: j.start_url, icons: (j.icons || []).map(i => i.src) };
  })()`);
  check("manifest 可访问且合法", mf.ok === true && mf.display === "standalone", JSON.stringify(mf));
  const iconOk = await evalJs(`(async () => {
    const rs = await Promise.all(${JSON.stringify(mf.icons || [])}.map(s => fetch(s).then(r => r.ok).catch(() => false)));
    return rs.every(Boolean);
  })()`);
  check("manifest 图标全部可访问", iconOk === true, (mf.icons || []).join(", "));

  /* ---------- 2. SW 接管 + 壳缓存 ---------- */
  await goto(BASE, 1000);
  let controlled = false;
  for (let i = 0; i < 30; i++) {
    controlled = await evalJs(`!!navigator.serviceWorker.controller`);
    if (controlled) break;
    await send("Page.navigate", { url: BASE }); // 首次访问要等 SW 激活并 claim，刷一次
    await sleep(1000);
  }
  check("Service Worker 已注册并接管页面", controlled === true);
  const shell = await evalJs(`(async () => {
    const names = await caches.keys();
    const shellName = names.find(n => n.startsWith("kids-app-"));
    if (!shellName) return { found: false };
    const keys = (await (await caches.open(shellName)).keys()).map(k => new URL(k.url).pathname);
    return { found: true, name: shellName, count: keys.length, hasIndex: keys.some(k => k.endsWith("/kids-english/") || k.endsWith("/kids-english/index.html")), hasAssets: keys.some(k => k.includes("/assets/")) };
  })()`);
  check("壳缓存就位(index.html + 哈希资源)", shell.found && shell.hasIndex && shell.hasAssets, `${shell.name} 共 ${shell.count} 项`);

  /* ---------- 3. 媒体进缓存 ---------- */
  const mediaUrl = BASE + "lessons/l4/song.mp3";
  const mediaCached = await evalJs(`(async () => {
    const r = await fetch("lessons/l4/song.mp3");
    if (!r.ok) return { ok: false, status: r.status };
    await new Promise(res => setTimeout(res, 800)); // 等后台写缓存完成
    const cache = await caches.open("kids-media-v1");
    const hit = await cache.match(location.origin + "/kids-english/lessons/l4/song.mp3");
    return { ok: true, cached: !!hit, size: hit ? Number(hit.headers.get("content-length")) : 0 };
  })()`);
  check("童谣音频已进媒体缓存", mediaCached.ok && mediaCached.cached && mediaCached.size > 1000000, `${(mediaCached.size / 1048576).toFixed(1)} MB`);

  // PING 助手：每次导航后页面上下文都会重置，用前必须重新注入
  const PING_FN = `window.__swPing = () => new Promise((resolve) => {
    if (!navigator.serviceWorker.controller) return resolve(null);
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(null), 2500);
    ch.port1.onmessage = (e) => { clearTimeout(t); resolve(e.data); };
    navigator.serviceWorker.controller.postMessage({ type: "PING" }, [ch.port2]);
  })`;
  await evalJs(PING_FN);
  const verA = await evalJs(`window.__swPing()`);
  check("SW 版本通道可用(PING/PONG)", !!verA?.version, "version=" + verA?.version);

  /* ---------- 4. 真·断网（杀掉 preview 服务） ---------- */
  stopPreview(preview);
  await sleep(800);

  await send("Page.navigate", { url: BASE });
  await sleep(2000);
  const offlineRender = await evalJs(`!!document.querySelector(".lesson-card")`);
  check("断网刷新仍能渲染首页(壳缓存兜底)", offlineRender === true);

  const offlineMedia = await evalJs(`(async () => {
    try {
      const r = await fetch("lessons/l4/song.mp3");
      return { ok: r.ok, status: r.status, len: Number(r.headers.get("content-length") || 0) };
    } catch (e) { return { ok: false, err: String(e) }; }
  })()`);
  check("断网可从缓存读出童谣音频", offlineMedia.ok === true && offlineMedia.len > 1000000, `${(offlineMedia.len / 1048576).toFixed(1)} MB`);

  const offlineRange = await evalJs(`(async () => {
    try {
      const r = await fetch("lessons/l4/song.mp3", { headers: { Range: "bytes=0-99" } });
      const buf = await r.arrayBuffer();
      return { status: r.status, bytes: buf.byteLength, cr: r.headers.get("content-range") };
    } catch (e) { return { status: 0, err: String(e) }; }
  })()`);
  check(
    "断网 Range 请求返回 206(离线可拖进度条)",
    offlineRange.status === 206 && offlineRange.bytes === 100 && /bytes 0-99\//.test(offlineRange.cr || ""),
    `status=${offlineRange.status} bytes=${offlineRange.bytes}`
  );

  preview = startPreview();
  if (!(await waitPreview())) throw new Error("preview 重启失败");

  /* ---------- 5. 更新及时性 A：换了 HTML 立刻可见 ---------- */
  const indexPath = path.join(ROOT, "dist", "index.html");
  const origIndex = fs.readFileSync(indexPath, "utf8");
  fs.writeFileSync(indexPath, origIndex.replace("</head>", '  <meta name="x-update-test" content="deploy-2" />\n</head>'));
  await goto(BASE, 1500);
  const markerSeen = await evalJs(`!!document.querySelector('meta[name="x-update-test"]')`);
  check("页面导航走 network-first(新部署立刻生效)", markerSeen === true, "改完 dist/index.html 刷新即见新标记");
  fs.writeFileSync(indexPath, origIndex); // 还原，避免影响后续用例

  /* ---------- 6/7. 更新及时性 B + 不打断玩法 ---------- */
  await goto(BASE + "?lesson=l4", 1500); // 深链进课时 = 非安全刷新时机
  const swPath = path.join(ROOT, "dist", "sw.js");
  const swSrc = fs.readFileSync(swPath, "utf8");
  const idA = /const BUILD_ID = "([^"]+)"/.exec(swSrc)?.[1];
  fs.writeFileSync(swPath, swSrc.replace(`"${idA}"`, '"v2update"'));
  await evalJs(`window.__held = "in-lesson"`); // 若页面被强制刷新，它就会消失
  await evalJs(PING_FN);
  await evalJs(`navigator.serviceWorker.getRegistration().then(r => r.update())`);

  let verB = null;
  for (let i = 0; i < 40; i++) {
    verB = await evalJs(`window.__swPing()`);
    if (verB?.version === "v2update") break;
    await sleep(400);
  }
  check("SW 检测到新版本并自动升级", verB?.version === "v2update", `${verA?.version} -> ${verB?.version}`);
  await sleep(2000); // 再等一会，确认没有迟到的强制刷新
  const stillHeld = await evalJs(`window.__held`);
  check("玩法中不被强制刷新(更新挂起)", stillHeld === "in-lesson", "标记仍在 = 页面没被刷掉");

  await evalJs(`document.querySelector(".topbar .back")?.click()`);
  await sleep(2500);
  await evalJs(PING_FN); // 刷新后上下文已重置，重新注入再 PING
  const afterBack = await evalJs(`(async () => ({ held: window.__held, ping: await window.__swPing() }))()`);
  check("回到首页立即静默刷新应用新版本", afterBack.held === undefined && afterBack.ping?.version === "v2update", `held=${afterBack.held} version=${afterBack.ping?.version}`);

  /* ---------- 汇总 ---------- */
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n===== PWA 验证：${pass}/${results.length} 项通过 =====`);
  if (pass !== results.length) process.exitCode = 1;
} catch (e) {
  console.error("脚本异常:", e.message);
  process.exitCode = 1;
} finally {
  try {
    chrome.kill("SIGKILL");
  } catch {}
  if (preview) stopPreview(preview);
}
