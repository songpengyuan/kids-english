/**
 * ===== Service Worker =====
 *
 * 本文件**不参与应用打包**：构建时由 vite.config.js 里的 kids-pwa 插件原样拷贝到
 * dist/sw.js，并把文件里的构建占位符替换成当次构建 id。正因如此，每次部署 sw.js 的
 * 字节都会变化，浏览器就能在下次打开时检测到新版本 —— 这是"及时更新"的前提。
 *
 * 更新策略（诉求：有新版本要尽快生效；离线也要能用）：
 *  1. 页面导航 → network-first（4s 超时回退缓存）
 *     每次打开/切回都先问网络要最新 index.html，有新版本立刻用新的；
 *     网络慢时 4 秒内先给缓存保证秒开，同时后台继续拉新版写进缓存。
 *     —— 这是"更新及时"的根本保证，绝不能把 HTML 做成 cache-first。
 *  2. /assets/*（文件名带内容哈希）→ cache-first
 *     哈希即版本，内容永远不会错，命中缓存零请求。
 *  3. /lessons/*（单词图/发音/童谣音视频）→ 先用缓存 + 后台条件校验
 *     用 etag 发 If-None-Match，没变时 GitHub Pages 回 304（零下载），
 *     变了才更新缓存 —— 换同名素材不会被旧文件永久黏住。
 *     支持 Range 请求（视频/音频拖进度条必需），首次以 Range 方式访问时
 *     会在后台把完整文件拉进缓存，下次离线可播。
 *  4. 其余请求一律直连（dev 模块的 HMR 等不缓存）。
 *
 * 版本与清理：
 *  - 壳缓存 kids-app-<buildId>：每次构建新建，activate 时保留最近 2 份、
 *    删更老的（保留 1 份旧的是为了更新瞬间旧页面还能拿到自己的旧资源）。
 *  - 媒体缓存 kids-media-v1：名字固定不随构建变化，避免每次更新都重下几十 MB。
 */

/* eslint-disable no-restricted-globals */
const BUILD_ID = "__BUILD_ID__";
const SHELL_CACHE = `kids-app-${BUILD_ID}`;
const MEDIA_CACHE = "kids-media-v1";
const NAV_TIMEOUT = 4000;

const SCOPE_PATH = new URL(self.registration.scope).pathname; // 如 /kids-english/

/** 相对 scope 的路径（"assets/index-x.js"），与部署在根路径还是子路径无关 */
function relPath(url) {
  const p = url.pathname;
  return p.startsWith(SCOPE_PATH) ? p.slice(SCOPE_PATH.length) : p.slice(1);
}

const SHELL_URL = new URL("./", self.registration.scope).href; // index.html

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("nav-timeout")), ms);
    promise.then((v) => (clearTimeout(t), resolve(v)), (e) => (clearTimeout(t), reject(e)));
  });
}

/* ---------- install：预缓存壳 ---------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll([
        SHELL_URL,
        new URL("manifest.webmanifest", self.registration.scope).href,
        new URL("icon-192.png", self.registration.scope).href,
        new URL("icon-512.png", self.registration.scope).href,
        new URL("icon-maskable-512.png", self.registration.scope).href
      ]);
      await self.skipWaiting(); // 新版本装好即接管，不等旧标签页全部关闭
    })()
  );
});

/* ---------- activate：清理旧壳缓存（保留最近 2 份）、裁剪媒体缓存并接管页面 ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      const olds = names
        .filter((n) => n.startsWith("kids-app-") && n !== SHELL_CACHE)
        .sort((a, b) => (a < b ? 1 : -1)); // 同长度时间戳 id，字符串序即时间序
      await Promise.all(olds.slice(1).map((n) => caches.delete(n)));
      await trimMediaCache();
      await self.clients.claim();
    })()
  );
});

/**
 * 媒体缓存裁剪：kids-media-v1 名字固定、只增不减，课程多了本地会膨胀到几十 MB。
 * 超过上限时按缓存条目顺序删最旧的文件，直到降到目标值。
 * （Cache API 不保证 keys() 顺序，主流实现近似插入序，尽力而为即可。）
 */
const MEDIA_LIMIT = 100 * 1024 * 1024; // 100 MB 触发
const MEDIA_TARGET = 80 * 1024 * 1024; // 清理到 80 MB 以下

async function trimMediaCache() {
  try {
    const cache = await caches.open(MEDIA_CACHE);
    const keys = await cache.keys();
    if (keys.length === 0) return;
    const sizes = [];
    let total = 0;
    for (const req of keys) {
      let size = 0;
      try {
        const resp = await cache.match(req, { ignoreVary: true });
        const len = resp && resp.headers.get("Content-Length");
        if (len && Number(len)) {
          size = Number(len);
        } else {
          // 无 Content-Length 的响应（部分代理会去掉）→ 读 Content-Range 总数
          const cr = resp && resp.headers.get("Content-Range");
          const m = cr && /\/\s*(\d+)\s*$/.exec(cr);
          size = m ? Number(m[1]) || 0 : 0;
        }
        if (!size && resp) size = (await resp.clone().arrayBuffer()).byteLength || 0;
      } catch {
        size = 0;
      }
      sizes.push(size);
      total += size;
    }
    let i = 0;
    while (total > MEDIA_LIMIT && i < keys.length) {
      total -= sizes[i] || 0;
      await cache.delete(keys[i]); // 删最旧，直到低于目标
      i++;
    }
  } catch {
    /* 裁剪失败不影响激活主流程 */
  }
}

/* ---------- 调试/测试通道 ---------- */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "PING") {
    const pong = { type: "PONG", version: BUILD_ID, media: MEDIA_CACHE };
    // MessageChannel 传输时 event.source 为 null，必须回给 port
    if (event.ports[0]) event.ports[0].postMessage(pong);
    else event.source?.postMessage(pong);
  }
});

/* ---------- fetch ---------- */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(handleNavigate(req));
    return;
  }

  const rel = relPath(url);
  if (rel.startsWith("assets/")) {
    event.respondWith(cacheFirst(req, url.href));
    return;
  }
  if (rel === "manifest.webmanifest" || /\.(png|svg|ico|webmanifest)$/.test(rel)) {
    event.respondWith(staleWhileRevalidate(req, url.href));
    return;
  }
  if (rel.startsWith("lessons/")) {
    event.respondWith(handleMedia(req, url));
    return;
  }
  /* 其它（如 dev 的 /src/*、/node_modules/*）不拦截 */
});

/* ---------- 策略实现 ---------- */

/** 导航：network-first + 超时回退 + 后台写缓存 */
async function handleNavigate(req) {
  const cachedPromise = caches.match(SHELL_URL, { ignoreSearch: true, ignoreVary: true });
  const net = fetch(req).then((resp) => {
    if (resp && resp.ok) {
      caches
        .open(SHELL_CACHE)
        .then((c) => c.put(SHELL_URL, resp.clone()))
        .catch(() => {});
    }
    return resp;
  });
  net.catch(() => {}); // 兜底分支返回后，后台这条失败别变成 unhandled rejection
  try {
    return await withTimeout(net, NAV_TIMEOUT);
  } catch (err) {
    const cached = await cachedPromise;
    if (cached) return cached;
    if (err && err.message === "nav-timeout") return net; // 没有缓存时只能继续等网络
    throw err;
  }
}

/** 哈希资源：命中即用，未命中走网络并写入缓存 */
async function cacheFirst(req, key) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(key, { ignoreVary: true });
  if (cached) return cached;
  const resp = await fetch(req);
  if (resp && resp.ok) cache.put(key, resp.clone()).catch(() => {});
  return resp;
}

/** 小文件（manifest/图标）：先用缓存，后台悄悄更新 */
async function staleWhileRevalidate(req, key) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(key, { ignoreVary: true });
  const net = fetch(req)
    .then((resp) => {
      if (resp && resp.ok) cache.put(key, resp.clone()).catch(() => {});
      return resp;
    })
    .catch(() => null);
  return cached || (await net) || Response.error();
}

/** 媒体（可能很大 + 可能是 Range 请求），单独处理 */
const revalidatedAt = new Map(); // href -> 时间戳；SW 重启即失效，只做会话内节流
const REVALIDATE_INTERVAL = 6 * 60 * 60 * 1000; // 6 小时内不重复校验同一个文件

async function handleMedia(req, url) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(url.href, { ignoreVary: true });
  const rangeHeader = req.headers.get("range");

  if (cached) {
    maybeRevalidate(url, cached);
    // 有完整缓存：Range 请求从缓存切片（离线拖进度条的关键）
    return rangeHeader ? sliceFromCache(cached, rangeHeader) : cached;
  }

  const resp = await fetch(req);
  if (rangeHeader) {
    // 浏览器对 <video>/<audio> 首次几乎总是发 Range 请求，若只转发不落盘，
    // 视频永远进不了缓存 → 后台补一份完整文件，下次离线可用
    cacheFullInBackground(url);
    return resp;
  }
  if (resp && resp.ok && resp.status === 200) {
    cache.put(url.href, resp.clone()).catch(() => {});
  }
  return resp;
}

/** 后台条件校验：带 etag 的话 304 零成本，变了才真正更新 */
async function maybeRevalidate(url, cached) {
  const last = revalidatedAt.get(url.href) || 0;
  if (Date.now() - last < REVALIDATE_INTERVAL) return;
  revalidatedAt.set(url.href, Date.now());
  const headers = {};
  const etag = cached.headers.get("etag");
  const lm = cached.headers.get("last-modified");
  if (etag) headers["If-None-Match"] = etag;
  else if (lm) headers["If-Modified-Since"] = lm;
  const resp = await fetch(url.href, headers["If-None-Match"] || headers["If-Modified-Since"] ? { headers } : {});
  if (resp && resp.status === 200) {
    const cache = await caches.open(MEDIA_CACHE);
    await cache.put(url.href, resp);
  }
  /* 304：一个字节都不用下，缓存继续用 */
}

async function cacheFullInBackground(url) {
  const cache = await caches.open(MEDIA_CACHE);
  if (await cache.match(url.href, { ignoreVary: true })) return;
  const resp = await fetch(url.href);
  if (resp && resp.ok && resp.status === 200) await cache.put(url.href, resp);
}

/** 把缓存的完整响应切成 206 Range 响应（浏览器对媒体必发 Range） */
async function sliceFromCache(cached, rangeHeader) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || "");
  if (!m) return cached;
  const buf = await cached.arrayBuffer();
  const size = buf.byteLength;
  let start = m[1] === "" ? size - Number(m[2] || size) : Number(m[1]);
  let end = m[1] !== "" && m[2] !== "" ? Number(m[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return new Response(null, { status: 416, statusText: "Range Not Satisfiable" });
  }
  end = Math.min(end, size - 1);
  const body = buf.slice(start, end + 1);
  return new Response(body, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": cached.headers.get("Content-Type") || "application/octet-stream",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(body.byteLength),
      "Accept-Ranges": "bytes"
    }
  });
}
