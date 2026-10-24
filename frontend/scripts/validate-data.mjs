/**
 * 数据层静态校验（CI/build:ci 用，P2-3）。
 *
 * 用 vite 的 SSR 构建把 src/data 各数据模块打包成临时 ESM 后做结构/引用/资源校验，
 * 防止内容扩展时数据漂移上线（如：课时 id 重复、单词重名、关卡引用了不存在的
 * 玩法、图片/音频文件被误删导致上课白屏）。
 *
 * 校验项：
 *  1. lessons：id 唯一、tone 在 6 色调板、words 非空且 word.id 唯一、
 *     phrases 引用的单词存在、stageStyle 枚举、word.color 色值格式、
 *     词群闭包（word/song/track 的 group 须在 wordGroups 登记）、
 *     colorPairs 引用完整（wordId/color 均须指向本课单词且颜色词带色值）、
 *     歌曲轨道可播放（title + audio/video 至少其一）、
 *     音视频资源真实存在（硬性：第一轨 + 多轨逐个查盘）；
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
    "export { lessons, activityKeys, getLesson, HEROES, ALL_FORMS, buildLevels };",
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
    // 词群（l11 颜色/动物）：分组必须合法且覆盖全部词，否则分组玩法里会静默丢词
    if (l.wordGroups?.length) {
      const groupKeys = new Set(l.wordGroups.map((g) => g.key));
      check(groupKeys.size === l.wordGroups.length, `课时 ${l.id} wordGroups key 重复`);
      for (const g of l.wordGroups) {
        check(g.name?.trim(), `课时 ${l.id} 词群 ${g.key} 缺 name`);
        check((l.words || []).some((w) => w.group === g.key), `课时 ${l.id} 词群 ${g.key} 没有任何词`);
      }
      for (const w of l.words || []) {
        check(!!w.group && groupKeys.has(w.group), `课时 ${l.id} 单词 ${w.id} 的 group 非法：${w.group ?? "缺失"}`);
      }
    } else {
      check(!(l.words || []).some((w) => w.group), `课时 ${l.id} 有单词配了 group 但没声明 wordGroups`);
    }
    // 歌曲也按词群拆分时（l11 颜色歌/动物歌），group 必须在 wordGroups 里登记
    {
      const groupKeys = new Set((l.wordGroups || []).map((g) => g.key));
      const songGroups = [l.song?.group, ...(l.song?.tracks || []).map((t) => t.group)].filter(Boolean);
      for (const g of songGroups) {
        check(groupKeys.has(g), `课时 ${l.id} 歌曲 group 非法：${g}（须在 wordGroups 中声明）`);
      }
    }
    // 学单词玩法样式枚举：写错值会静默回退默认样式，孩子看到的是错的玩法
    check(l.stageStyle === "cards" || l.stageStyle === "dialog", `课时 ${l.id} stageStyle 非法：${l.stageStyle}（cards | dialog）`);
    // 颜色词的色值格式（WordCard 色点 / 连一连色圆都靠它渲染，错值静默变 #ccc）
    for (const w of l.words || []) {
      if (w.color) check(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(w.color), `课时 ${l.id} 单词 ${w.id} 的 color 不是合法色值：${w.color}（须 #rgb / #rrggbb）`);
    }
    // 颜色配对引用必须存在（连一连 colorMode 静默失效的护栏）。
    // p.color 指向本课颜色词 id（不是色值），该词必须带 color 色值
    const paired = new Set();
    check(!l.colorPairs || l.colorPairs.length >= 2, `课时 ${l.id} colorPairs 至少 2 对才能成局`);
    for (const p of l.colorPairs || []) {
      check(wordIds.has(p.wordId), `课时 ${l.id} colorPairs 引用不存在的单词：${p.wordId}`);
      check(!paired.has(p.wordId), `课时 ${l.id} colorPairs 单词被配对两次：${p.wordId}（一个动物只能配一种颜色）`);
      paired.add(p.wordId);
      const colorWord = (l.words || []).find((w) => w.id === p.color);
      check(Boolean(colorWord), `课时 ${l.id} colorPairs 颜色 ${p.color} 不是本课单词 id`);
      check(Boolean(colorWord?.color), `课时 ${l.id} colorPairs 颜色词 ${p.color} 缺 color 色值（色圆渲染不出）`);
    }
    // 多轨播放列表：title 必填、audio/video 至少其一，否则轨道在磨耳朵/唱童谣里点不动
    for (const t of l.song?.tracks || []) {
      check(t.title?.trim(), `课时 ${l.id} 有歌曲轨道缺 title`);
      check(Boolean(t.audio || t.video), `课时 ${l.id} 歌曲轨道「${t.title}」缺 audio/video（至少其一）`);
    }
    // 资源硬校验：声明了就要真实存在（缺失 = 上课白屏/轨道点不动）。
    // 逐个查第一轨 + 多轨的 audio/video 实际路径——比旧版"按约定查 song.mp3"
    // 更准：l11 第一轨是 brown-bear.mp3，按约定查会查错文件
    check(Boolean(l.song?.audio || l.song?.video), `课时 ${l.id} 第一轨缺 audio/video`);
    for (const t of [l.song, ...(l.song?.tracks || [])]) {
      for (const src of [t?.audio, t?.video]) {
        if (typeof src === "string" && src.startsWith("/lessons/")) {
          check(existsSync(join(root, "public", src)), `课时 ${l.id} 音视频文件缺失：${src}`);
        }
      }
    }
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

  /* ---------- 3. 英雄详情（已并入 ROSTER，随英雄单源维护） ---------- */
  for (const h of mod.HEROES) {
    check(h.detail?.bio?.trim(), `英雄 ${h.id} 缺简介（ROSTER detail.bio）`);
    check(Array.isArray(h.detail?.skills) && h.detail.skills.length > 0, `英雄 ${h.id} 缺技能（detail.skills）`);
    check(Array.isArray(h.detail?.phrases) && h.detail.phrases.length > 0, `英雄 ${h.id} 缺口头禅（detail.phrases）`);
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
