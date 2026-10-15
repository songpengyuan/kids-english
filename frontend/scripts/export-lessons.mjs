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
      lyrics: l.song.lyrics,
      timings: l.song.timings || null,
    },
    words: l.words.map((w) => ({
      id: w.id,
      en: w.en,
      zh: w.zh,
      emoji: w.emoji,
      image: w.image,
      audio: w.audio,
    })),
    phrases: l.phrases.map((p) => ({ en: p.en, zh: p.zh, audio: p.audio })),
  }));

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(lessons, null, 2));
  console.log(`✅ 已导出 ${lessons.length} 课 → backend/seed/lessons.json`);
} finally {
  await server.close();
}
