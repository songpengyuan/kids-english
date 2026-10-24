/**
 * 课程视频一次性压缩：public/lessons/<id>/*.mp4 → 720p/CRF26/faststart，
 * 并提取首帧 poster（public/lessons/<id>/<同名>.jpg）。
 *
 * 为什么：6 个 mp4 共 94.5MB（最大单文件 28MB），是 PWA 媒体缓存的大头；
 * 童谣动画 720p 足够（播放宽度 ≤ 屏宽 390-768），CRF26 视觉无损感、体积约 1/3。
 * faststart 把 moov 挪到文件头，浏览器拿到前 100KB 就能起播。
 * poster 用 jpg 不用 webp：@ffmpeg-installer 的构建没编 libwebp。
 *
 * 用法：node scripts/optimize-videos.mjs [--dry] [--force]
 *   --dry   只打印将执行的 ffmpeg 命令
 *   --force 源比产物新/无 poster 时也重压（默认跳过已压过的）
 * 依赖：@ffmpeg-installer/ffmpeg（devDependency，darwin/linux/win 全平台二进制）。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const lessonsDir = path.join(root, "public", "lessons");
const ffmpeg = ffmpegInstaller.path;

const args = new Set(process.argv.slice(2));
const dry = args.has("--dry");
const force = args.has("--force");

const CRF = "26";
const MAXH = "720";

/** 就地压一个 mp4 + 提取 poster。返回 { before, after, poster } */
function compress(src) {
  const before = fs.statSync(src).size;
  const dir = path.dirname(src);
  const base = path.basename(src, ".mp4");
  const poster = path.join(dir, `${base}.jpg`);
  const tmp = src + ".tmp.mp4";

  const filters = [
    `scale='min(${MAXH},ih)':-2`, // 限高 720，等比、宽取偶数
  ];
  const videoArgs = [
    "-y", "-i", src,
    "-vf", filters.join(","),
    "-c:v", "libx264", "-crf", CRF, "-preset", "medium",
    "-c:a", "aac", "-b:a", "96k",
    "-movflags", "+faststart",
    tmp,
  ];
  const posterArgs = ["-y", "-ss", "0.5", "-i", src, "-frames:v", "1", "-vf", "scale='min(720,ih)':-2", "-q:v", "3", poster];

  if (dry) {
    console.log(`[dry] ${path.relative(root, src)}`);
    console.log(`  ffmpeg ${videoArgs.join(" ")}`);
    console.log(`  ffmpeg ${posterArgs.join(" ")}`);
    return { before, after: before, poster: false };
  }
  execFileSync(ffmpeg, videoArgs, { stdio: ["ignore", "ignore", "inherit"] });
  fs.renameSync(tmp, src);
  execFileSync(ffmpeg, posterArgs, { stdio: ["ignore", "ignore", "inherit"] });
  return { before, after: fs.statSync(src).size, poster: fs.existsSync(poster) };
}

const mp4s = [];
for (const lesson of fs.readdirSync(lessonsDir).sort()) {
  const d = path.join(lessonsDir, lesson);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d)) {
    if (f.endsWith(".mp4")) mp4s.push(path.join(d, f));
  }
}
if (!mp4s.length) {
  console.log("没有找到 mp4");
  process.exit(0);
}

let totalBefore = 0;
let totalAfter = 0;
for (const src of mp4s) {
  const rel = path.relative(root, src);
  const out = src + ".tmp.mp4";
  // 已压过的判定：同目录同名 poster 存在且比 mp4 新（我们总是成对产出）
  const base = path.basename(src, ".mp4");
  const poster = path.join(path.dirname(src), `${base}.jpg`);
  const done = fs.existsSync(poster) && fs.statSync(poster).mtimeMs >= fs.statSync(src).mtimeMs;
  if (done && !force) {
    console.log(`跳过（已压过）: ${rel}`);
    continue;
  }
  const { before, after, poster: madePoster } = compress(src);
  totalBefore += before;
  totalAfter += after;
  console.log(`${rel}: ${(before / 1048576).toFixed(1)}MB → ${(after / 1048576).toFixed(1)}MB${madePoster ? "（poster 已出）" : ""}`);
  if (fs.existsSync(out)) fs.rmSync(out); // 中断清理
}
if (totalBefore > 0) {
  console.log(`\n合计：${(totalBefore / 1048576).toFixed(1)}MB → ${(totalAfter / 1048576).toFixed(1)}MB（省 ${(100 - (totalAfter / totalBefore) * 100).toFixed(0)}%）`);
}
