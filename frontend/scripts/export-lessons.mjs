/**
 * 导出课程数据 → backend/seed/lessons.json（后端内容库种子）。
 *
 * 用 vite 的 ssrLoadModule 加载 src/data/lessons.ts（处理 TS + JSON import，
 * 与前端同源）：加课只需改前端数据 + 重跑本脚本 + 重新导入。
 */
import { createServer } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// appRoot = frontend/（vite SSR 项目根，源码在 frontend/src）；repoRoot = 仓库根（后端种子输出）
const appRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const out = path.join(repoRoot, "backend/seed/lessons.json");

const server = await createServer({
  root: appRoot,
  server: { middlewareMode: true },
  logLevel: "error",
});
try {
  const mod = await server.ssrLoadModule("/src/data/lessons.ts");
  const lessons = mod.lessons.map((l) => ({
    id: l.id,
    order: l.id.replace(/\D/g, ""),
    title: l.title,
    titleZh: l.titleZh,
    emoji: l.emoji,
    tone: l.tone,
    type: l.type,
    date: l.date || null,
    stageStyle: l.stageStyle ?? "cards",
    song: {
      audio: l.song.audio,
      video: l.song.video,
      scene: l.song.scene,
      group: l.song.group ?? null,
      lyrics: l.song.lyrics,
      lyricsZh: l.song.lyricsZh ?? [],
      timings: l.song.timings || null,
      tracks: (l.song.tracks || []).map((t) => ({
        title: t.title,
        titleZh: t.titleZh ?? null,
        audio: t.audio ?? null,
        video: t.video ?? null,
        lyrics: t.lyrics ?? [],
        lyricsZh: t.lyricsZh ?? [],
        group: t.group ?? null,
      })),
    },
    words: l.words.map((w) => ({
      id: w.id,
      en: w.en,
      zh: w.zh,
      emoji: w.emoji,
      image: w.image,
      audio: w.audio,
      // 词群（l11 colors/animals）；无分组的课不写该字段，避免整份种子的噪声 diff
      ...(w.group ? { group: w.group } : {}),
    })),
    phrases: l.phrases.map((p) => ({ en: p.en, zh: p.zh, audio: p.audio })),
    // 契约字段：颜色配对 / 词群（l11）；undefined 时 JSON.stringify 会自动省略
    colorPairs: l.colorPairs,
    wordGroups: l.wordGroups,
  }))
    // 按 order 稳定输出：数组顺序在 seed 里**不该有意义**（课程顺序由每条的 order 字段表达，
    // 后端 seed_lessons 也只用 order_no）。若沿用 lessons.ts 的数组顺序，
    // 每次调整 TS 里的课程排列都会产生整份 JSON 的 diff，把真实内容变化淹没在噪声里。
    .sort((a, b) => Number(a.order) - Number(b.order));

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(lessons, null, 2));
  console.log(`✅ 已导出 ${lessons.length} 课 → backend/seed/lessons.json`);
} finally {
  await server.close();
}
