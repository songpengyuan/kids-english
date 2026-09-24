#!/usr/bin/env node
/**
 * 交互验证（CDP 驱动无头 Chrome）：
 *   1. 连线：完成后线条 pathLength=100、端点落在卡片中心、SVG 置顶
 *   2. 听音选图：每个选项下方有英文单词标签
 *   3. 标题：课程卡片 / 顶栏显示英文标题，不含中文
 *   4. 学单词：点卡片触发 animate.css tada 动画且卡片始终可见
 *   5. 连线：图片与单词都能当起点（拖动 + 点选两种模式）
 *   6. 音乐模式：播放进度条（可拖动跳转）+ 循环播放开关（状态持久化）
 *   7. 连线方向：起点=先按下的卡片、终点=后按下的卡片（两个方向都验）
 *   8. 连错标记：标红的必须是孩子实际按下的两张卡，不能因 id 同名误伤另一侧
 *   8. 暗黑模式：品牌色亮度下降、面色比底色亮一档、卡片底色真的被替换
 *   9. 卡片色调统一：玩法卡/课时卡/封面都走 .tone-* 色调板，无内联写死颜色
 *  10. 图标库：控件区不再出现 emoji，图标以 SVG 渲染且随字号缩放
 *  11. 音乐默认循环；完整听一遍后可领星并进入结算页
 *
 * 用法：先启动 dev/preview 服务，然后 AUDIT_BASE=http://localhost:5173/kids-english/ node scripts/verify-fixes.mjs
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
    "--no-sandbox",
  `--remote-debugging-port=${PORT}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-gpu",
  // 无头环境没有真实用户手势，audio.play() 会被自动播放策略拦掉；
  // 「听完一遍领星」「循环重播」这些用例必须真的播起来才能验证。
  "--autoplay-policy=no-user-gesture-required",
  "--mute-audio",
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
    await sleep(400);
    // 等 vite 冷启动 / 懒编译完成：readyState 且 #app 真的渲染出内容才继续，
    // 否则偶发「页面还没画出来就断言」→ 一串 undefined 假失败
    for (let i = 0; i < 20; i++) {
      const ready = await evalJs(
        `document.readyState === 'complete' && !!document.querySelector('#app') && document.querySelector('#app').children.length > 0`
      ).catch(() => false);
      if (ready) break;
      await sleep(300);
    }
    await sleep(600);
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
    const words = [...document.querySelectorAll('.col.words .cell.word')];
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
    // 校验端点在卡片中心：卡片中心（board 坐标）
    const cellRects = [...document.querySelectorAll('.cell')].map(c => {
      const r = c.getBoundingClientRect();
      return { cx: r.left - rb.left + r.width / 2, cy: r.top - rb.top + r.height / 2 };
    });
    const EPS = 3;
    const atCenter = (x, y) => cellRects.some(rc => Math.abs(x - rc.cx) < EPS && Math.abs(y - rc.cy) < EPS);
    const bads = [];
    for (const l of lines) {
      for (const [label, x, y] of [["x1,y1", l.x1, l.y1], ["x2,y2", l.x2, l.y2]]) {
        if (!atCenter(x, y)) {
          bads.push(label + "=(" + x.toFixed(1) + "," + y.toFixed(1) + ")");
        }
      }
    }
    // 连线 SVG 应在所有卡片之上
    const zLines = getComputedStyle(document.querySelector('.lines')).zIndex;
    return { ok, lines, badEndpoints: bads.length, badDetail: bads.join("; "), zLines, dashOffset: document.querySelector('.done-line') ? getComputedStyle(document.querySelector('.done-line')).strokeDashoffset : null };
  })()`);
  check("连线能成功连上", matchRes.ok);
  check("done-line 带 pathLength=100(长线无断口)", matchRes.lines?.every(l => l.pathLength === "100"), JSON.stringify(matchRes.lines?.[0]));
  check("线条端点为卡片中心(中心到中心)", matchRes.badEndpoints === 0, matchRes.badDetail);
  check("连线 SVG 在最上层(z-index>=30)", Number(matchRes.zLines) >= 30, "z=" + matchRes.zLines);
  check("线型为实线(dashoffset 已画满)", matchRes.dashOffset === "0px", String(matchRes.dashOffset));

  /* ---------- 5. 连线：单词也能当起点 ---------- */
  await goto(BASE + "?lesson=l4&stage=match");
  await sleep(1500);
  const wordStartRes = await evalJs(`(async () => {
    const fire = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true }));
    const word = document.querySelector('.col.words .cell.word');
    if (!word) return { found: false };
    const id = word.getAttribute('data-word');
    const target = document.querySelector('[data-side="img"][data-word="' + id + '"]');
    if (!target) return { found: true, hasTarget: false };
    const wr = word.getBoundingClientRect(), tr = target.getBoundingClientRect();
    fire(word, 'pointerdown', wr.left + wr.width / 2, wr.top + wr.height / 2);
    await new Promise(r => setTimeout(r, 120)); // 等 Vue 渲染出拖拽线
    const draggingAfterDown = !!document.querySelector('.drag-line');
    const highlighted = !!document.querySelector('.cell.word.active');
    fire(document, 'pointermove', tr.left + tr.width / 2, tr.top + tr.height / 2);
    fire(document, 'pointerup', tr.left + tr.width / 2, tr.top + tr.height / 2);
    await new Promise(r => setTimeout(r, 700));
    return { found: true, hasTarget: true, draggingAfterDown, highlighted, matched: document.querySelectorAll('.done-line').length };
  })()`);
  check("单词卡可作连线起点(按下即拉线)", wordStartRes.draggingAfterDown === true);
  check("按下单词卡有选中高亮", wordStartRes.highlighted === true);
  check("从单词拖到图片能配对成功", (wordStartRes.matched || 0) >= 1, "done-line=" + wordStartRes.matched);

  /* ---------- 6. 连线：点选模式（先点单词再点图片） ---------- */
  await goto(BASE + "?lesson=l4&stage=match");
  await sleep(1500);
  const tapModeRes = await evalJs(`(async () => {
    const fire = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true }));
    const word = document.querySelector('.col.words .cell.word');
    const id = word.getAttribute('data-word');
    const target = document.querySelector('[data-side="img"][data-word="' + id + '"]');
    const wr = word.getBoundingClientRect(), tr = target.getBoundingClientRect();
    // 先点单词（原地松手）→ 应保留选中高亮
    fire(word, 'pointerdown', wr.left + wr.width / 2, wr.top + wr.height / 2);
    fire(document, 'pointerup', wr.left + wr.width / 2, wr.top + wr.height / 2);
    await new Promise(r => setTimeout(r, 250));
    const selected = !!document.querySelector('.cell.word.active');
    // 再点对应图片 → 配对
    fire(target, 'pointerdown', tr.left + tr.width / 2, tr.top + tr.height / 2);
    fire(document, 'pointerup', tr.left + tr.width / 2, tr.top + tr.height / 2);
    await new Promise(r => setTimeout(r, 700));
    return { selected, matched: document.querySelectorAll('.done-line').length };
  })()`);
  check("点单词后保留选中高亮", tapModeRes.selected === true);
  check("再点图片即完成配对", (tapModeRes.matched || 0) >= 1, "done-line=" + tapModeRes.matched);

  /* ---------- 7. 音乐模式：进度条 + 循环播放 ---------- */
  await goto(BASE + "?lesson=l5&stage=song");
  await sleep(1800);
  await evalJs(`[...document.querySelectorAll('.song .tab')].find(t => t.textContent.includes('音乐')).click()`);
  await sleep(600);
  const seekRes = await evalJs(`(async () => {
    const seek = document.querySelector('.seek');
    const audio = document.querySelector('audio');
    const btn = document.querySelector('.loop-btn');
    if (!seek || !audio || !btn) return { found: false };
    // 等元数据把总时长读出来
    for (let i = 0; i < 60 && !(audio.duration > 0); i++) await new Promise(r => setTimeout(r, 100));
    const r = seek.getBoundingClientRect();
    const fire = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true }));
    fire(seek, 'pointerdown', r.left + r.width * 0.5, r.top + r.height / 2);
    fire(window, 'pointermove', r.left + r.width * 0.75, r.top + r.height / 2);
    fire(window, 'pointerup', r.left + r.width * 0.75, r.top + r.height / 2);
    await new Promise(r2 => setTimeout(r2, 300));
    const times = [...document.querySelectorAll('.transport .t-time')].map(e => e.textContent.trim());
    return {
      found: true, duration: audio.duration, currentTime: audio.currentTime,
      times, fill: document.querySelector('.seek-fill').style.width,
      knobLeft: document.querySelector('.seek-knob').style.left
    };
  })()`);
  check("音乐模式有进度条且读到总时长", seekRes.found === true && (seekRes.duration || 0) > 5, (seekRes.duration || 0).toFixed(1) + "s");
  check("进度条显示 当前/总时长", seekRes.times?.length === 2 && /^\d+:\d\d$/.test(seekRes.times[1] || ""), (seekRes.times || []).join(" / "));
  check("拖动进度条可跳转播放位置", seekRes.currentTime / seekRes.duration > 0.6 && seekRes.currentTime / seekRes.duration < 0.9, Math.round(100 * seekRes.currentTime / seekRes.duration) + "%");
  check("进度条视觉同步(填充+滑块)", /7[0-9](\.|%)/.test(seekRes.fill) || parseFloat(seekRes.fill) > 60, seekRes.fill);

  const loopRes = await evalJs(`(async () => {
    const btn = document.querySelector('.loop-btn');
    const before = btn.classList.contains('on');
    btn.click();
    await new Promise(r => setTimeout(r, 120)); // 等 Vue 更新 class
    const after = btn.classList.contains('on');
    const stored = localStorage.getItem('kids-english-song-loop');
    btn.click();
    await new Promise(r => setTimeout(r, 120));
    return { before, after, stored, storedBack: localStorage.getItem('kids-english-song-loop') };
  })()`);
  check("循环按钮可切换开关态", loopRes.after !== loopRes.before, loopRes.before + " → " + loopRes.after);
  check("循环状态持久化", loopRes.stored === (loopRes.before ? "0" : "1") && loopRes.storedBack === (loopRes.before ? "1" : "0"), "stored=" + loopRes.stored);

  /* ---------- 8. 连线方向 = 用户操作顺序 ---------- */
  for (const order of ["word→img", "img→word"]) {
    await goto(BASE + "?lesson=l4&stage=match");
    await sleep(1500);
    const dirRes = await evalJs(`(async () => {
      const fire = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true }));
      const word = document.querySelector('.col.words .cell.word');
      if (!word) return { found: false };
      const id = word.getAttribute('data-word');
      const img = document.querySelector('[data-side="img"][data-word="' + id + '"]');
      if (!img) return { found: false };
      // 组件用 offset* 量卡片中心，这里用同一套算法，免受入场动画 transform 干扰
      const center = (el) => ({ x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 });
      const first = ${JSON.stringify(order)} === "word→img" ? word : img;
      const second = ${JSON.stringify(order)} === "word→img" ? img : word;
      const fr = first.getBoundingClientRect(), sr = second.getBoundingClientRect();
      fire(first, 'pointerdown', fr.left + fr.width / 2, fr.top + fr.height / 2);
      fire(document, 'pointermove', sr.left + sr.width / 2, sr.top + sr.height / 2);
      fire(document, 'pointerup', sr.left + sr.width / 2, sr.top + sr.height / 2);
      await new Promise(r => setTimeout(r, 700));
      const line = document.querySelector('.done-line');
      if (!line) return { found: true, matched: false };
      return {
        found: true, matched: true,
        x1: +line.getAttribute('x1'), y1: +line.getAttribute('y1'),
        x2: +line.getAttribute('x2'), y2: +line.getAttribute('y2'),
        firstC: center(first), secondC: center(second)
      };
    })()`);
    const near = (a, b) => Math.abs(a - b) < 2;
    check(
      `${order} 连线起点 = 先按下的卡片`,
      dirRes.matched === true && near(dirRes.x1, dirRes.firstC.x) && near(dirRes.y1, dirRes.firstC.y),
      `起点(${dirRes.x1},${dirRes.y1}) 期望(${dirRes.firstC?.x},${dirRes.firstC?.y})`
    );
    check(
      `${order} 连线终点 = 后按下的卡片`,
      dirRes.matched === true && near(dirRes.x2, dirRes.secondC.x) && near(dirRes.y2, dirRes.secondC.y),
      `终点(${dirRes.x2},${dirRes.y2}) 期望(${dirRes.secondC?.x},${dirRes.secondC?.y})`
    );
  }

  /* ---------- 8.5 连错标记：标红的必须是实际按下的那两张卡 ---------- */
  for (const order of ["word→img", "img→word"]) {
    await goto(BASE + "?lesson=l4&stage=match");
    await sleep(1500);
    const wrongRes = await evalJs(`(async () => {
      const fire = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true }));
      const word = document.querySelector('.col.words .cell.word');
      if (!word) return { found: false };
      const id = word.getAttribute('data-word');
      // 故意挑一张与它不配对的图片
      const img = [...document.querySelectorAll('.col.imgs .cell.pic')]
        .find(el => el.getAttribute('data-word') !== id);
      if (!img) return { found: false };
      const badId = img.getAttribute('data-word');
      const first = ${JSON.stringify(order)} === "word→img" ? word : img;
      const second = ${JSON.stringify(order)} === "word→img" ? img : word;
      const fr = first.getBoundingClientRect(), sr = second.getBoundingClientRect();
      fire(first, 'pointerdown', fr.left + fr.width / 2, fr.top + fr.height / 2);
      fire(document, 'pointermove', sr.left + sr.width / 2, sr.top + sr.height / 2);
      fire(document, 'pointerup', sr.left + sr.width / 2, sr.top + sr.height / 2);
      await new Promise(r => setTimeout(r, 200)); // 仍在该对标记存续窗口内
      const wrong = [...document.querySelectorAll('.cell.wrong')];
      return {
        found: true, id, badId,
        wrongKeys: wrong.map(el => el.getAttribute('data-side') + ':' + el.getAttribute('data-word')),
        // 同一 id 的另一侧卡片：这两张绝不该被标红
        sameIdImgWrong: !!document.querySelector('.col.imgs .cell.pic[data-word="' + id + '"].wrong'),
        sameIdWordWrong: !!document.querySelector('.col.words .cell.word[data-word="' + badId + '"].wrong'),
        lines: document.querySelectorAll('.done-line').length
      };
    })()`);
    const expect = [`word:${wrongRes.id}`, `img:${wrongRes.badId}`];
    check(
      `${order} 连错只标红实际按下的两张卡`,
      wrongRes.wrongKeys?.length === 2 && expect.every((k) => wrongRes.wrongKeys.includes(k)),
      JSON.stringify(wrongRes.wrongKeys) + " 期望 " + JSON.stringify(expect)
    );
    check(
      `${order} 连错不误伤同 id 的另一侧卡片`,
      wrongRes.sameIdImgWrong === false && wrongRes.sameIdWordWrong === false,
      `同名图片卡=${wrongRes.sameIdImgWrong} 同名单词卡=${wrongRes.sameIdWordWrong}`
    );
    check(`${order} 连错不画线`, wrongRes.lines === 0, "done-line=" + wrongRes.lines);
  }

  /* ---------- 9. 暗黑模式：亮色被调暗 ---------- */
  await goto(BASE);
  const themeRes = await evalJs(`(async () => {
    const root = document.documentElement;
    const lum = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
        v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    };
    const pick = (theme, props) => {
      root.setAttribute('data-theme', theme);
      const cs = getComputedStyle(root);
      const out = {};
      for (const p of props) out[p] = cs.getPropertyValue(p).trim();
      return out;
    };
    const props = ['--green', '--blue', '--orange', '--bg', '--card-bg'];
    const light = pick('light', props);
    const dark = pick('dark', props);
    root.setAttribute('data-theme', 'light');
    const ratios = props.filter(p => /^#/.test(light[p])).map(p => ({ p, l: lum(light[p]), d: lum(dark[p]) }));
    return { light, dark, ratios };
  })()`);
  const brandProps = themeRes.ratios.filter((r) => ["--green", "--blue", "--orange"].includes(r.p));
  check(
    "暗色下品牌色亮度整体下降",
    brandProps.every((r) => r.d < r.l * 0.8),
    brandProps.map((r) => `${r.p} ${r.l.toFixed(2)}→${r.d.toFixed(2)}`).join(", ")
  );
  const bgLum = themeRes.ratios.find((r) => r.p === "--bg");
  const cardLum = themeRes.ratios.find((r) => r.p === "--card-bg");
  check("暗色下面色比底色亮一档(卡片有层次)", cardLum.d > bgLum.d, `bg=${themeRes.dark["--bg"]} card=${themeRes.dark["--card-bg"]}`);

  // 真实元素：暗色下按钮底色确实换成了降亮的品牌色
  await goto(BASE + "?lesson=l4");
  await sleep(900);
  const btnRes = await evalJs(`(async () => {
    const root = document.documentElement;
    const read = async () => {
      await new Promise(r => requestAnimationFrame(r));
      return getComputedStyle(document.querySelector('.act')).backgroundColor;
    };
    localStorage.setItem('kids-english-theme', 'light');
    root.setAttribute('data-theme', 'light');
    const light = await read();
    localStorage.setItem('kids-english-theme', 'dark');
    root.setAttribute('data-theme', 'dark');
    const dark = await read();
    root.setAttribute('data-theme', 'light');
    return { light, dark };
  })()`);
  check("玩法卡底色在暗色下被替换", btnRes.light !== btnRes.dark, `${btnRes.light} → ${btnRes.dark}`);

  /* ---------- 10. 卡片色调统一 ---------- */
  const toneRes = await evalJs(`(() => {
    const acts = [...document.querySelectorAll('.act')];
    const tones = acts.map(a => [...a.classList].find(c => c.startsWith('tone-')));
    return {
      n: acts.length,
      tones,
      missing: tones.filter(t => !t).length,
      distinct: new Set(tones).size,
      inlineBg: acts.filter(a => (a.getAttribute('style') || '').includes('background')).length,
      coverTone: [...(document.querySelector('.lesson-cover')?.classList || [])].find(c => c.startsWith('tone-')) || null
    };
  })()`);
  check("玩法卡全部走统一色调板", toneRes.missing === 0 && toneRes.n > 0, toneRes.tones.join(", "));
  check("玩法卡色调互不重复(不再撞色)", toneRes.distinct === toneRes.n, `${toneRes.distinct}/${toneRes.n} 个不同`);
  check("玩法卡不再内联写死背景色", toneRes.inlineBg === 0);
  check("课时封面走同一色调板", !!toneRes.coverTone, toneRes.coverTone);

  await goto(BASE);
  await sleep(900);
  const homeToneRes = await evalJs(`(() => {
    const cards = [...document.querySelectorAll('.lesson-card')];
    return {
      n: cards.length,
      inlineBg: cards.filter(c => (c.getAttribute('style') || '').includes('background')).length,
      tones: cards.map(c => [...c.classList].find(x => x.startsWith('tone-')) || null)
    };
  })()`);
  check("课时卡不再内联写死背景色", homeToneRes.inlineBg === 0);
  check("课时卡走同一色调板", homeToneRes.tones.every(Boolean), homeToneRes.tones.join(", "));

  /* ---------- 11. 图标库：控件不再依赖 emoji ---------- */
  const ICON_CTRLS = [
    ".k-btn:not(.result .k-btn)", ".tab", ".loop-btn", ".play-btn", ".theme-toggle",
    ".pager .arrow", ".topbar .back", ".big-speaker", ".mic", ".star-badge",
    ".mini-stars", ".heard-mark", ".mode-tag", ".hint", ".tip", ".speaker"
  ].join(", ");
  const EMOJI_RE = "\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}\\u{FE0F}\\u{2190}-\\u{21FF}";
  const iconScan = `(() => {
    const emoji = new RegExp("[${EMOJI_RE}]", "u");
    const els = [...document.querySelectorAll(${JSON.stringify(ICON_CTRLS)})];
    const withEmoji = els.filter(e => emoji.test(e.textContent)).map(e => e.className + ":" + e.textContent.trim());
    const svgEls = [...document.querySelectorAll("svg.k-ico")];
    const fixed = svgEls.filter(s => { const r = s.getBoundingClientRect(); return Math.round(r.width) === 24 && Math.round(r.height) === 24; });
    return { ctrls: els.length, withEmoji, svg: svgEls.length, fixed24: fixed.length };
  })()`;

  const iconPages = ["", "?lesson=l4", "?lesson=l4&stage=learn", "?lesson=l4&stage=quiz", "?lesson=l4&stage=match", "?lesson=l5&stage=song"];
  let iconAgg = { ctrls: 0, withEmoji: [], svg: 0 };
  for (const p of iconPages) {
    await goto(BASE + p);
    await sleep(1300);
    if (p.includes("song")) {
      await evalJs(`[...document.querySelectorAll('.song .tab')].find(t => t.textContent.includes('音乐')).click()`);
      await sleep(500);
    }
    const r = await evalJs(iconScan);
    iconAgg.ctrls += r.ctrls;
    iconAgg.svg += r.svg;
    iconAgg.withEmoji.push(...r.withEmoji);
  }
  check("控件区已无 emoji 图标", iconAgg.withEmoji.length === 0, iconAgg.withEmoji.slice(0, 4).join(" | ") || `扫描 ${iconAgg.ctrls} 个控件`);
  check("图标由图标库渲染为 SVG", iconAgg.svg > 0, `${iconAgg.svg} 个 svg.k-ico`);

  await goto(BASE + "?lesson=l5&stage=song");
  await sleep(1400);
  const iconCssRes = await evalJs(`(async () => {
    await new Promise(r => requestAnimationFrame(r));
    const s = document.querySelector('.tab .k-ico');
    const r0 = s.getBoundingClientRect();
    return { w: Math.round(r0.width), h: Math.round(r0.height), stroke: getComputedStyle(s).strokeWidth };
  })()`);
  check("图标随字号缩放(非写死 24px)", iconCssRes.w !== 24 || iconCssRes.h !== 24, `${iconCssRes.w}×${iconCssRes.h} stroke=${iconCssRes.stroke}`);

  /* ---------- 12. 音乐默认循环 + 完成一遍即可领星 ---------- */
  const loopDefaultRes = await evalJs(`(async () => {
    localStorage.removeItem('kids-english-song-loop');
    location.reload();
    return true;
  })()`);
  await sleep(1600);
  await evalJs(`[...document.querySelectorAll('.song .tab')].find(t => t.textContent.includes('音乐')).click()`);
  await sleep(500);
  const loopDefault = await evalJs(`(() => {
    const btn = document.querySelector('.loop-btn');
    return { on: btn.classList.contains('on'), aria: btn.getAttribute('aria-pressed') };
  })()`);
  check("音乐默认开启循环播放(首次进入)", loopDefaultRes === true && loopDefault.on === true, "aria-pressed=" + loopDefault.aria);

  const finishRes = await evalJs(`(async () => {
    const find = () => document.querySelector('.song .k-btn.finish');
    const before = find();
    if (!before) return { found: false };
    const disabledBefore = before.disabled;
    // 把音频直接怼到结尾，让它自然 played 完 → ended
    const a = document.querySelector('.song audio');
    a.muted = true;
    if (a.duration) a.currentTime = Math.max(0, a.duration - 0.2);
    await a.play().catch(() => {});
    for (let i = 0; i < 80; i++) {
      const b = find();
      if (b && !b.disabled) break;
      await new Promise(r => setTimeout(r, 100));
    }
    const after = find();
    return { found: true, disabledBefore, disabledAfter: after.disabled, text: after.textContent.trim(), loopOn: after && document.querySelector('.loop-btn').classList.contains('on') };
  })()`);
  check("听完一遍前领星按钮不可点", finishRes.disabledBefore === true);
  check("听完一遍后领星按钮可点(循环模式下也生效)", finishRes.disabledAfter === false, finishRes.text + " · loop=" + finishRes.loopOn);

  const finishClickRes = await evalJs(`(async () => {
    const btn = document.querySelector('.song .k-btn.finish:not([disabled])');
    if (!btn) return { clicked: false };
    btn.click();
    await new Promise(r => setTimeout(r, 700));
    return { clicked: true, result: !!document.querySelector('.result'), audioPaused: document.querySelector('.song audio')?.paused ?? null };
  })()`);
  check("点领星后进入结算页", finishClickRes.clicked === true && finishClickRes.result === true);

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
