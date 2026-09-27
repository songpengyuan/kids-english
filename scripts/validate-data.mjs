/**
 * 数据层静态校验（CI/build:ci 用，P2-3）。
 *
 * 用 vite 的 SSR 构建把 src/data 各数据模块打包成临时 ESM 后做结构/引用/资源校验，
 * 防止内容扩展时数据漂移上线（如：课时 id 重复、单词重名、关卡引用了不存在的
 * 玩法、图片/音频文件被误删导致上课白屏）。
 *
 * 校验项：
 *  1. lessons：id 唯一、tone 在 6 色调板、words 非空且 word.id 唯一、
 *     phrases 引用的单词存在、song.mp3 资源真实存在（硬性）；
 *  2. heroes：角色 id 唯一、formId 全局唯一；
 *  3. heroDetails：每个角色都有详情、形态引用存在；
 *  4. pathLevels：关卡 id 唯一、<lessonId>-<actKey> 引用的课与玩法存在；
 *  5. song-timings：存在的课内时间轴须为正（缺失允许：播放器会比例映射回退）。
 *
 * 用法：node scripts/validate-data.mjs（在 build:ci 里与 test/type-check 同门禁）。
 */
import { build } from "vite";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(tmpdir(), "ke-data-"));
const entryFile = join(outDir, "entry.ts");

const D = (rel) => JSON.stringify(join(root, rel));
writeFileSync(
  entryFile,
  [
    `import { lessons, activityKeys, getLesson } from ${D("src/data/lessons.ts")};`,
    `import { HEROES, ALL_FORMS } from ${D("src/data/heroes.ts")};`,
    `import { HERO_DETAILS } from ${D("src/data/heroDetails.ts")};`,
    `import { buildLevels } from ${D("src/data/pathLevels.ts")};`,
    "export { lessons, activityKeys, getLesson, HEROES, ALL_FORMS, HERO_DETAILS, buildLevels };",
    ""
  ].join("\n"),
  "utf-8"
);

const errors = [];
const warns = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

let mod;
try {
  await build({
    configFile: false,
    logLevel: "error",
    build: {
      ssr: true,
      write: true,
      outDir,
      emptyOutDir: true,
      rollupOptions: { input: entryFile, output: { format: "es", entryFileNames: "data.js" } }
    }
  });
  mod = await import(pathToFileURL(join(outDir, "data.js")).href);

  /* ---------- 1. lessons ---------- */
  const TONES = new Set(["blue", "green", "orange", "purple", "pink", "teal"]);
  const ids = new Set();
  for (const l of mod.lessons) {
    check(!ids.has(l.id), `课时 id 重复：${l.id}`);
    ids.add(l.id);
    check(l.title?.trim(), `课时 ${l.id} 缺 title`);
    check(l.emoji, `课时 ${l.id} 缺 emoji`);
    check(TONES.has(l.tone), `课时 ${l.id} tone 非法：${l.tone}（须在 6 色调板）`);
    check(Array.isArray(l.words) && l.words.length > 0, `课时 ${l.id} 单词表为空`);
    const wordIds = new Set();
    for (const w of l.words || []) {
      check(w.id?.trim(), `课时 ${l.id} 有单词缺 id`);
      check(!wordIds.has(w.id), `课时 ${l.id} 单词重复：${w.id}`);
      wordIds.add(w.id);
    }
    for (const p of l.phrases || []) {
      if (p.word) check(wordIds.has(p.word), `课时 ${l.id} 口语句引用不存在的单词：${p.word}`);
    }
    // 资源硬校验：童谣音频缺失 = 上课白屏
    const songMp3 = `public/lessons/${l.id}/song.mp3`;
    check(existsSync(join(root, songMp3)), `课时 ${l.id} 缺童谣音频：${songMp3}`);
    // 单词图软校验（缺失可降级 emoji，只告警）
    for (const w of l.words || []) {
      const img = w.image;
      if (img && img.startsWith("/lessons/")) {
        const rel = "public" + img;
        if (!existsSync(join(root, rel))) warns.push(`课时 ${l.id} 单词图缺失（将降级 emoji）：${img}`);
      }
    }
  }

  /* ---------- 2. heroes ---------- */
  const heroIds = new Set();
  for (const h of mod.HEROES) {
    check(h.id?.trim(), "有英雄缺 id");
    check(!heroIds.has(h.id), `英雄 id 重复：${h.id}`);
    heroIds.add(h.id);
    check(Array.isArray(h.forms) && h.forms.length > 0, `英雄 ${h.id} 无形态`);
  }
  const formIds = new Set();
  for (const f of mod.ALL_FORMS) {
    check(f.id?.trim(), "有形态缺 id");
    check(!formIds.has(f.id), `形态 id 重复：${f.id}`);
    formIds.add(f.id);
  }

  /* ---------- 3. heroDetails ---------- */
  for (const h of mod.HEROES) {
    check(mod.HERO_DETAILS[h.id], `英雄 ${h.id} 缺详情（heroDetails.ts）`);
  }
  for (const [id, d] of Object.entries(mod.HERO_DETAILS)) {
    check(heroIds.has(id), `heroDetails 里的 id 不在 HEROES 中：${id}`);
    check(Array.isArray(d?.skills), `heroDetails ${id} 缺 skills`);
  }

  /* ---------- 4. pathLevels ---------- */
  const levels = mod.buildLevels();
  const lvIds = new Set();
  for (const lv of levels) {
    check(!lvIds.has(lv.id), `关卡 id 重复：${lv.id}`);
    lvIds.add(lv.id);
    const m = /^(.+?)-([a-z]+)$/.exec(lv.id);
    if (m) {
      const lesson = mod.getLesson(m[1]);
      check(Boolean(lesson), `关卡 ${lv.id} 引用了不存在的课时 ${m[1]}`);
      if (lesson) {
        // chest = 宝箱关（多邻国式每课最后一关），不属玩法序列，单独豁免
        if (m[2] !== "chest") {
          const keys = mod.activityKeys(lesson);
          check(keys.includes(m[2]), `关卡 ${lv.id} 的玩法 ${m[2]} 不在该课玩法中（${keys.join("/")}）`);
        }
      }
    }
  }

  /* ---------- 5. song-timings（无 timing 允许，有则必须为正） ---------- */
  for (const l of mod.lessons) {
    if (l.song?.timings) {
      check(l.song.timings.duration > 0, `课时 ${l.id} 的 song-timings duration 非法`);
      check(Array.isArray(l.song.timings.timeline) && l.song.timings.timeline.length > 0, `课时 ${l.id} 的 timeline 为空`);
    }
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

for (const w of warns) console.warn("⚠️  " + w);
if (errors.length) {
  console.error(`✋ 数据校验失败（${errors.length} 项）：`);
  for (const e of errors) console.error("  ✗ " + e);
  process.exit(1);
}
console.log(`✅ 数据校验通过：${mod.lessons.length} 课、${mod.HEROES.length} 英雄、${mod.ALL_FORMS.length} 形态、${mod.buildLevels().length} 关卡`);
