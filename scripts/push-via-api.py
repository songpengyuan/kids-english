#!/usr/bin/env python3
"""通过 GitHub Git Data API 推送（git 通道被代理拦截时的兜底）。

用法: GH_TOKEN=xxx python3 push-via-api.py <owner/repo> <local_commit_sha> <branch>

原理（树对比模式，不依赖本地/远端共享提交历史）：
  1. 取远端分支当前 commit 与 tree（recursive）；
  2. 本地 `git ls-tree -r` 得到目标提交的 path→blob sha（git 与 GitHub 的 blob 哈希算法一致，可直接比对）；
  3. 差异项：新增/修改 → 上传 blob；远端多出的 → sha=null 删除；
  4. base_tree=远端树 建新树 → 建提交（父=远端 commit，作者/信息取自本地提交）→ 强推分支；
  5. 校验新 tree 与本地 tree 一致。

支持：新增/修改/删除文件、二进制文件（mp3/mp4/图片，走 base64）。
"""
import base64, json, os, re, subprocess, sys, urllib.request
from datetime import datetime, timedelta, timezone


def api(method, url, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"token {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    try:
        with urllib.request.urlopen(req) as r:
            body = r.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code} {url}\n{e.read().decode()}", file=sys.stderr)
        raise


def git_bytes(*args):
    """返回原始字节，不经过文本解码，保证二进制与尾部换行逐字节一致"""
    return subprocess.check_output(["git", "-C", REPO_DIR, *args])


def git(*args):
    return git_bytes(*args).decode().strip()


# 项目根目录 = 本脚本所在目录的上一级（动态解析，项目移动后依然可用）
REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = os.environ["GH_TOKEN"]
repo, sha, branch = sys.argv[1], sys.argv[2], sys.argv[3]
base = f"https://api.github.com/repos/{repo}"

# 1. 远端分支状态
br = api("GET", f"{base}/branches/{branch}")
remote_commit = br["commit"]["sha"]
remote_tree = br["commit"]["commit"]["tree"]["sha"]
print(f"远端 {branch} -> {remote_commit[:8]} (tree {remote_tree[:8]})")

local_tree = git("rev-parse", f"{sha}^{{tree}}")
if remote_tree == local_tree:
    print("✅ 远端树与本地目标树已一致，无需推送")
    sys.exit(0)

# 2. 远端树全量 path→sha
rt = api("GET", f"{base}/git/trees/{remote_tree}?recursive=1")
if rt.get("truncated"):
    print("远端树过大被截断，无法安全对比", file=sys.stderr)
    sys.exit(1)
remote_files = {e["path"]: e["sha"] for e in rt["tree"] if e["type"] == "blob"}

# 3. 本地目标提交的全量 path→sha（git blob sha 与 GitHub 一致，可直接比对）
ls_raw = git_bytes("ls-tree", "-r", sha).decode()
local_files = {}
for line in ls_raw.splitlines():
    meta, path = line.split("\t", 1)
    mode, typ, h = meta.split()
    local_files[path] = h

# 4. 计算差异
changed = [p for p, h in local_files.items() if remote_files.get(p) != h]
deleted = [p for p in remote_files if p not in local_files]
print(f"差异：修改/新增 {len(changed)} 项，删除 {len(deleted)} 项")

# 5. 上传 blob / 构造 tree 项
tree_items = []
for p in deleted:
    tree_items.append({"path": p, "mode": "100644", "type": "blob", "sha": None})
    print(f"  delete {p}")
for p in changed:
    content = git_bytes("cat-file", "blob", f"{sha}:{p}")
    if remote_files.get(p) is None and len(content) == 0:
        pass  # 新增空文件也照常上传
    blob = api("POST", f"{base}/git/blobs",
               {"content": base64.b64encode(content).decode(), "encoding": "base64"})
    tree_items.append({"path": p, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    print(f"  blob {p} ({len(content)}B) -> {blob['sha'][:8]}")

# 6. 基于远端树建新树
tree = api("POST", f"{base}/git/trees", {"base_tree": remote_tree, "tree": tree_items})
print("新树:", tree["sha"][:8])

# 7. 建提交：提交信息/作者取自本地目标提交
raw = git_bytes("cat-file", "-p", sha).decode()
lines = raw.split("\n")
msg = raw.split("\n\n", 1)[1].strip()
author_line = next(l for l in lines if l.startswith("author "))
m = re.match(r"author (.+) <(.+)> (\d+) ([+-]\d{4})", author_line)
name, email, ts, tz = m.group(1), m.group(2), m.group(3), m.group(4)
tzdt = timezone(timedelta(hours=int(tz[:3]), minutes=int(tz[0] + tz[3:])))
iso = datetime.fromtimestamp(int(ts), tzdt).isoformat()

commit = api("POST", f"{base}/git/commits", {
    "message": msg, "tree": tree["sha"], "parents": [remote_commit],
    "author": {"name": name, "email": email, "date": iso},
    "committer": {"name": name, "email": email, "date": iso},
})
print("新提交:", commit["sha"][:8])

# 8. 强推分支
api("PATCH", f"{base}/git/refs/heads/{branch}", {"sha": commit["sha"], "force": True})
print(f"✅ 已更新 {branch} -> {commit['sha'][:8]}")

# 9. 校验 tree 与本地一致
print("tree 一致:", tree["sha"] == local_tree)
sys.exit(0 if tree["sha"] == local_tree else 1)
