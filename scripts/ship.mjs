#!/usr/bin/env node
/**
 * 一键发布：提交 + 推送 + 构建状态跟踪
 *
 * 背景：本机代理会间歇性拦截 git 的 HTTPS 通道（502 / HTTP2 framing / empty reply），
 * 所以推送失败时自动降级到 Git Data API 推送（scripts/push-via-api.py）。
 *
 * 用法：
 *   pnpm ship "fix: xxx"           # 提交所有改动并推送
 *   pnpm ship --watch              # 不提交，只跟踪最近一次 Actions 构建到结束
 *   pnpm ship "fix: xxx" --watch   # 提交推送后跟踪构建
 *
 * 推送策略：
 *   1. git push（HTTP/2）
 *   2. git -c http.version=HTTP/1.1 push
 *   3. push-via-api.py（Git Data API，支持二进制/删除文件，推送后校验 tree 一致）
 *   推送成功后把本地分支对齐到远端（API 推送会产生不同 SHA 的等内容提交）。
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* 项目根目录 = 本脚本所在目录的上一级（动态解析，项目移动后依然可用） */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(REPO);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const git = (args, opts = {}) =>
  execFileSync("git", args, { cwd: REPO, encoding: "utf8", ...opts }).trim();
const say = (m) => console.log("ship:", m);

const watchOnly = process.argv.includes("--watch");
const msg = process.argv.slice(2).filter((a) => a !== "--watch").join(" ").trim();

/** 从 osxkeychain 取 GitHub token（osxkeychain credential helper） */
function ghToken() {
  try {
    const out = spawnSync("git", ["credential", "fill"], {
      cwd: REPO,
      input: "protocol=https\nhost=github.com\n",
      encoding: "utf8"
    }).stdout;
    const line = out.split("\n").find((l) => l.startsWith("password="));
    return line ? line.slice("password=".length).trim() : "";
  } catch {
    return "";
  }
}

/** 从 origin URL 解析 owner/repo */
function repoSlug() {
  const url = git(["remote", "get-url", "origin"]);
  const m = url.match(/github\.com[/:](.+?)(?:\.git)?$/);
  if (!m) throw new Error("无法从 origin 解析 owner/repo: " + url);
  return m[1];
}

/** 等待指定 HEAD 的最新一次 Actions 构建结束 */
async function watchActions(slug, headSha) {
  const token = ghToken();
  const headers = { Authorization: `token ${token}`, Accept: "application/vnd.github+json" };
  say(`跟踪 Actions 构建 ${headSha.slice(0, 7)} ...`);
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`https://api.github.com/repos/${slug}/actions/runs?per_page=1`, { headers });
    const run = (await res.json()).workflow_runs?.[0];
    if (run && run.head_sha.startsWith(headSha.slice(0, 7)) && run.status === "completed") {
      say(`构建完成: ${run.conclusion}`);
      return run.conclusion === "success";
    }
    await sleep(10000);
  }
  say("等待构建超时（10 分钟）");
  return false;
}

/** 推送后把本地分支指针对齐远端，消除 API 推送导致的 SHA 分叉（不动工作区文件） */
function converge(slug, branch) {
  execFileSync("git", ["fetch", "origin"], { cwd: REPO, stdio: "ignore" });
  const localTree = git(["rev-parse", "HEAD^{tree}"]);
  const remoteTree = git(["rev-parse", `origin/${branch}^{tree}`]);
  const localSha = git(["rev-parse", "HEAD"]);
  const remoteSha = git(["rev-parse", `origin/${branch}`]);
  if (localSha === remoteSha) return;
  if (localTree === remoteTree) {
    // 内容一致、SHA 不同（API 提交被 GitHub 规范化）→ 只移动分支指针
    execFileSync("git", ["update-ref", `refs/heads/${branch}`, remoteSha], { cwd: REPO, stdio: "ignore" });
    say(`本地分支指针已对齐远端 ${remoteSha.slice(0, 7)}（工作区文件未变动）`);
  } else {
    say(`⚠️ 本地与远端内容不一致，请人工检查：local=${localSha.slice(0, 7)} remote=${remoteSha.slice(0, 7)}`);
  }
}

async function main() {
  const slug = repoSlug();
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);

  /* ---------- 提交 ---------- */
  if (!watchOnly) {
    if (!msg) {
      console.error('用法: pnpm ship "提交信息" [--watch]');
      process.exit(2);
    }
    execFileSync("git", ["add", "-A"], { cwd: REPO, stdio: "inherit" });
    const staged = git(["diff", "--cached", "--name-only"]);
    if (staged) {
      git(["commit", "-m", msg]);
      say("已提交 " + git(["rev-parse", "HEAD"]).slice(0, 7));
    } else {
      say("没有可提交的改动");
    }
  }

  const headSha = git(["rev-parse", "HEAD"]);

  /* ---------- 判断本地/远端关系 ---------- */
  execFileSync("git", ["fetch", "origin"], { cwd: REPO, stdio: "ignore" });
  let relation = "local-ahead";
  try {
    git(["merge-base", "--is-ancestor", headSha, `origin/${branch}`]);
    relation = "remote-has";
    say("远端已包含本地提交，无需推送");
  } catch {
    try {
      git(["merge-base", "--is-ancestor", `origin/${branch}`, headSha]);
    } catch {
      relation = "diverged";
    }
  }

  if (relation === "diverged") {
    // 常见于上一轮走了 API 兜底推送：内容一致但提交 SHA 不同。
    // 此时无需改动任何工作区文件，直接把分支指针移到远端提交即可。
    const localTree = git(["rev-parse", "HEAD^{tree}"]);
    const remoteTree = git(["rev-parse", `origin/${branch}^{tree}`]);
    if (localTree === remoteTree) {
      const remoteSha = git(["rev-parse", `origin/${branch}`]);
      execFileSync("git", ["update-ref", `refs/heads/${branch}`, remoteSha], { cwd: REPO, stdio: "ignore" });
      say(`本地与远端内容一致但 SHA 分叉，分支指针已对齐 ${remoteSha.slice(0, 7)}（工作区文件未变动）`);
      relation = "remote-has";
    } else {
      console.error("ship: ⚠️ 本地与远端内容不一致且历史分叉，请人工处理（不要盲目强推）");
      process.exit(1);
    }
  }

  if (relation !== "remote-has") {
    /* ---------- 推送：两级 git 重试 + API 兜底 ---------- */
    let pushed = false;
    const attempts = [
      ["HTTP/2", ["push", "origin", branch]],
      ["HTTP/1.1", ["-c", "http.version=HTTP/1.1", "push", "origin", branch]]
    ];
    for (const [name, args] of attempts) {
      try {
        execFileSync("git", args, { cwd: REPO, stdio: "pipe" });
        say(`推送成功（${name}）`);
        pushed = true;
        break;
      } catch (e) {
        say(`推送失败（${name}）: ${(e.stderr || e.message || "").toString().split("\n")[0]}`);
      }
    }

    if (!pushed) {
      say("git 通道不可用，走 Git Data API 兜底推送 ...");
      const token = ghToken();
      if (!token) {
        console.error("ship: 钥匙串里找不到 GitHub token");
        process.exit(1);
      }
      const py = ["/Users/perrysong/.workbuddy/binaries/python/versions/3.13.12/bin/python3", "python3"]
        .find((p) => fs.existsSync(p)) || "python3";
      const r = spawnSync(py, ["scripts/push-via-api.py", slug, headSha, branch], {
        cwd: REPO,
        env: { ...process.env, GH_TOKEN: token },
        encoding: "utf8"
      });
      process.stdout.write(r.stdout || "");
      process.stderr.write(r.stderr || "");
      if (r.status !== 0) {
        console.error("ship: API 兜底推送也失败了");
        process.exit(1);
      }
      say("API 兜底推送成功");
    }
    converge(slug, branch);
  }

  /* ---------- 跟踪构建 ---------- */
  if (process.argv.includes("--watch")) {
    const ok = await watchActions(slug, git(["rev-parse", "origin/" + branch]));
    process.exitCode = ok ? 0 : 1;
  }
}

main().catch((e) => {
  console.error("ship:", e.message);
  process.exit(1);
});
