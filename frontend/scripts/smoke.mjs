#!/usr/bin/env node
/**
 * 白屏冒烟：把构建产物用静态服务跑起来，用无头 Chrome 打开 /app/#/，
 * 断言「应用真的渲染出来了、没有 JS 异常、关键资源没 404」。
 *
 * 为什么单独做这一步（CI 里没有）：
 *   构建成功 ≠ 页面能用。2026-10-16 的线上白屏就是这么来的 ——
 *   vite build 全绿、单测全绿，但运行时路由自跳导致
 *   RangeError: Maximum call stack size exceeded，整页空白。
 *   这类故障只有「真的把页面打开」才能发现。
 *
 * 用法：
 *   node scripts/smoke.mjs                       # 默认取 frontend/dist
 *   node scripts/smoke.mjs --dist /tmp/xxx       # 指定产物目录
 *   CHROME_PATH=/path/to/chrome node scripts/smoke.mjs
 *
 * 退出码：
 *   0 = 通过
 *   1 = 失败（没渲染出来 / 有 JS 异常 / 关键资源 404）
 *   2 = 环境不具备（找不到 Chrome），调用方应视为「跳过」而非失败
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, "..");

const argDistIdx = process.argv.indexOf("--dist");
const DIST = path.resolve(argDistIdx > -1 ? process.argv[argDistIdx + 1] : path.join(FRONTEND, "dist"));

const CHROME =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** #app 渲染出的字符数下限：这条路由至少能渲染出首页骨架 */
const MIN_APP_HTML = 500;
/** 等页面稳定（SW 注册、路由跳转、数据初始化的时间） */
const SETTLE_MS = 1800;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bail(code, msg) {
  if (code === 2) console.log(`⏭️  ${msg}`);
  else console.error(`❌ ${msg}`);
  process.exit(code);
}

// ---------------------------------------------------------------- 前置检查
if (!fs.existsSync(CHROME)) {
  bail(2, `找不到 Chrome（${CHROME}）。设 CHROME_PATH 指定路径，或忽略此步。`);
}
const entry = path.join(DIST, "app", "index.html");
if (!fs.existsSync(entry)) {
  bail(1, `产物里没有 ${entry} —— 构建输出目录不对，或构建没产出 app 入口`);
}

// ---------------------------------------------------------------- 静态服务
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

const notFound = [];
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
  if (p.endsWith("/")) p += "index.html";
  let file = path.join(DIST, p);
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  if (!fs.existsSync(file) && fs.existsSync(file + ".html")) file += ".html";
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    notFound.push(req.url);
    res.writeHead(404, { "Content-Type": "text/plain" }).end("404");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

const port = await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.on("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const { port: p } = probe.address();
    probe.close(() => resolve(p));
  });
});
await new Promise((r) => server.listen(port, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${port}`;

// ---------------------------------------------------------------- 启动无头 Chrome
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kids-smoke-"));
const cdpPort = port + 1;
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

function cleanup() {
  try { chrome.kill("SIGKILL"); } catch {}
  try { server.close(); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.on("exit", cleanup);

/** 等 CDP 起来并拿到 page target 的 ws 地址 */
async function cdpTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  return null;
}

const target = await cdpTarget();
if (!target) bail(2, "Chrome 调试端口没起来（环境问题，按跳过处理）");

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", () => reject(new Error("CDP 连接失败")), { once: true });
});

let nextId = 1;
const pending = new Map();
const exceptions = [];
const consoleErrors = [];
const asset404 = [];

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails || {};
    exceptions.push(d.exception?.description || d.text || "unknown exception");
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
  }
  if (msg.method === "Log.entryAdded") {
    const e = msg.params.entry || {};
    if (e.level === "error" && e.source === "network") {
      const isAsset = /\/(assets|app)\/.*\.(js|css|woff2)$/.test(e.url || "");
      (isAsset ? asset404 : consoleErrors).push(`${e.url} ${e.text || ""}`.trim());
    }
  }
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

// ---------------------------------------------------------------- 打开页面
const URL_TO_OPEN = `${ORIGIN}/app/#/`;
const loaded = new Promise((resolve) => {
  const t = setTimeout(resolve, 15000);
  const onMsg = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === "Page.loadEventFired") {
      clearTimeout(t);
      ws.removeEventListener("message", onMsg);
      resolve();
    }
  };
  ws.addEventListener("message", onMsg);
});
await send("Page.navigate", { url: URL_TO_OPEN });
await loaded;
await sleep(SETTLE_MS);

const probe = await send("Runtime.evaluate", {
  expression: `JSON.stringify({
    appHtml: (document.querySelector('#app') || {}).innerHTML?.length || 0,
    appText: (document.querySelector('#app') || {}).textContent?.trim().length || 0,
    href: location.href,
    title: document.title,
    rootChildren: document.body.children.length
  })`,
  returnByValue: true,
});
const info = JSON.parse(probe.result.value);

// ---------------------------------------------------------------- 判定
const problems = [];
if (info.appHtml < MIN_APP_HTML) {
  problems.push(
    `#app 只渲染出 ${info.appHtml} 字符（< ${MIN_APP_HTML}）—— 页面没起来（白屏的典型形态）`,
  );
}
if (exceptions.length) problems.push(`JS 运行时异常 ${exceptions.length} 条：${exceptions[0]}`);
if (asset404.length) problems.push(`关键资源 404 ${asset404.length} 个：${asset404[0]}`);
if (consoleErrors.length) problems.push(`控制台错误 ${consoleErrors.length} 条：${consoleErrors[0]}`);

console.log(`   打开 ${URL_TO_OPEN}`);
console.log(`   #app 渲染 ${info.appHtml} 字符 · 路由 ${info.href}`);
if (notFound.length) console.log(`   （静态服务 404 的请求：${notFound.slice(0, 3).join(", ")}）`);

if (problems.length) {
  console.error("");
  for (const p of problems) console.error(`   ❌ ${p}`);
  cleanup();
  process.exit(1);
}
cleanup();
process.exit(0);
