#!/usr/bin/env python3
"""通过 GitHub Git Data API 推送本地提交（git 通道被代理拦截时的兜底）。

用法: GH_TOKEN=xxx python3 push-via-api.py <owner/repo> <local_commit_sha> <branch>

支持：新增/修改/删除文件、二进制文件（mp3/mp4/图片，走 base64）。
提交后校验生成的 tree 与本地 tree 是否逐字节一致。
"""
import base64, json, os, re, subprocess, sys, urllib.request
from datetime import datetime, timedelta, timezone


def api(token, method, url, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"token {token}")
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


token = os.environ["GH_TOKEN"]
REPO_DIR = "/Users/perrysong/Documents/qwen-agent/YZMy6xpaqC/default/kids-english"
repo, sha, branch = sys.argv[1], sys.argv[2], sys.argv[3]
base = f"https://api.github.com/repos/{repo}"

# 1. 本地 commit 元数据
raw = git_bytes("cat-file", "-p", sha).decode()
lines = raw.split("\n")
parent = lines[1].split()[1]
msg = raw.split("\n\n", 1)[1].strip()
author_line = next(l for l in lines if l.startswith("author "))
m = re.match(r"author (.+) <(.+)> (\d+) ([+-]\d{4})", author_line)
name, email, ts, tz = m.group(1), m.group(2), m.group(3), m.group(4)
tzdt = timezone(timedelta(hours=int(tz[:3]), minutes=int(tz[0] + tz[3:])))
iso = datetime.fromtimestamp(int(ts), tzdt).isoformat()

# 2. 找出相对父提交变更的文件（A=新增 M=修改 D=删除）
status_lines = git("diff", "--name-status", "-z", parent, sha).split("\0")
changes = []
for i in range(0, len(status_lines) - 1, 2):
    changes.append((status_lines[i][0], status_lines[i + 1]))
print("变更文件:", changes)

# 3. 上传 blob / 构造 tree 项（删除用 sha=null）
tree_items = []
for st, f in changes:
    if st == "D":
        tree_items.append({"path": f, "mode": "100644", "type": "blob", "sha": None})
        print(f"  delete {f}")
        continue
    content = git_bytes("cat-file", "blob", f"{sha}:{f}")
    blob = api(token, "POST", f"{base}/git/blobs",
               {"content": base64.b64encode(content).decode(), "encoding": "base64"})
    tree_items.append({"path": f, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    print(f"  blob {f} ({len(content)}B) -> {blob['sha'][:8]}")

# 4. 基于父提交树创建新树
parent_tree = api(token, "GET", f"{base}/git/commits/{parent}")["tree"]["sha"]
tree = api(token, "POST", f"{base}/git/trees",
           {"base_tree": parent_tree, "tree": tree_items})
print("新树:", tree["sha"][:8])

# 5. 创建提交（保持本地作者与时间）
commit = api(token, "POST", f"{base}/git/commits", {
    "message": msg, "tree": tree["sha"], "parents": [parent],
    "author": {"name": name, "email": email, "date": iso},
    "committer": {"name": name, "email": email, "date": iso},
})
print("新提交:", commit["sha"][:8])

# 6. 更新分支
api(token, "PATCH", f"{base}/git/refs/heads/{branch}", {"sha": commit["sha"], "force": True})
print(f"✅ 已更新 {branch} -> {commit['sha'][:8]}")

# 7. 校验 tree 与本地一致
local_tree_sha = git("rev-parse", f"{sha}^{{tree}}")
print("tree 一致:", tree["sha"] == local_tree_sha)
