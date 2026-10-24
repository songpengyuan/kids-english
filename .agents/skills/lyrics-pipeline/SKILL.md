---
name: lyrics-pipeline
description: 为 kids-english 项目的课时歌曲生成/核查逐行时间轴与标准 LRC 歌词文件，并接入前端逐行高亮。凡是：新课配歌、老师给了 song.mp3 要配歌词、"歌词和音频对不上"、KTV 高亮不准、改了歌词要重新出时间轴、用到 gen-lrc.py / gen-songs.py / song-timings.json / useLrc / LRC 文件——即使没说"歌词"两个字也应触发。
---

# 歌词时间轴流水线（lyrics-pipeline）

给一首新歌配出"逐行精确高亮"的歌词，分三步：**歌词文本进数据源 → 核对歌词与音频的真实结构 → 跑对齐出 LRC**。绝大多数事故出在第 2 步被跳过，不是出在对齐算法。

## 关键文件地图

| 文件 | 角色 |
|---|---|
| `frontend/src/data/lessons.json` | 歌词文本唯一数据源（2212736 起数据本体 JSON 化：`song.lyrics` / 多轨 `tracks[n].lyrics`；lessons.ts 只留类型与 normalize） |
| `frontend/scripts/gen-lrc.py` | 语音对齐工具：真人演唱 mp3 → 逐行时间 → LRC + 核查报告 |
| `frontend/scripts/gen-songs.py` | 自研合成曲（l6-l8）生成器，时间轴由它精确给出 |
| `frontend/src/data/song-timings.json` | 只服务 SongStage 的 bpm 节拍动画；l4/l5 的历史估算时间轴 |
| `frontend/public/lessons/<id>/*.lrc` | 运行时被前端拉取的成品（音频同名配对） |
| `frontend/src/composables/useLrc.ts` | 前端消费：解析/缓存/行索引/歌词映射 |
| `backend/seed/lessons.json` | 后端 seed，歌词与 timings 要和前端同步 |
| `docs/LYRICS-WORKFLOW.md` | 完整经验文档（本 skill 的深读版） |

## 第 0 步：环境自举（一次性）

优先复用本机已有环境（`/Users/perrysong/.workbuddy/binaries/python/envs/default/bin/python`，已装好）。没有就用 skill 自带脚本：

```bash
.agents/skills/lyrics-pipeline/scripts/bootstrap-env.sh [pip镜像URL]
```

要点（为什么）：faster-whisper 做词级识别；`av` 必须锁 `<19`（PyAV 19 删了 faster-whisper 依赖的 `metadata_errors` 参数，不锁必炸）；模型下载在国内走 `HF_ENDPOINT=https://hf-mirror.com HF_HUB_DISABLE_XET=1`（xet 后端过镜像会 401）；mp3 解码用 macOS 自带 `afconvert`（Linux 无此命令，需改脚本用 ffmpeg，暂未做）。

## 第 1 步：歌词文本进 lessons.json

- 一行 = 一个语义句（跟唱节奏一致）；段间空行用 `""` 条目；多轨课写进对应 `tracks[n].lyrics`。
- **歌词必须与音频的实际演唱结构一致**——先做第 2 步再定稿，不要按"经典版本"想当然。

## 第 2 步：结构核查（头号错误来源，跳过必返工）

历史上两次大返工都因歌词与音频结构不符：l5 乐器段顺序写反（音频是 piano→trombone→violin，歌词却 violin 在前）；l10 歌词写了 2 轮而音频只唱 1 轮。定式：

1. **裸识别**全曲，打印 SEG 段落文本（识别代码在 gen-lrc.py 的 `ASR.words`，可直接复用）；
2. 重复性儿歌把标志性词（动物/乐器/颜色名）出现时间列成表——每个词出现几次、在几秒，就是歌的真实结构；
3. 歌词行数/轮次/顺序与结构不符 → **先改 lessons.json 歌词**，再进第 3 步；
4. 可疑歌词句（两句听不清哪个对）用**切片 + 双提示词置信度仲裁**：切 2~3s 音频，分别以两个候选句做 `initial_prompt` 识别，平均词置信度高者为真。

## 第 3 步：跑对齐

```bash
cd frontend
HF_ENDPOINT=https://hf-mirror.com HF_HUB_DISABLE_XET=1 \
  <python> scripts/gen-lrc.py l12          # 多轨课: scripts/gen-lrc.py "l12#Colors Song"
```

产出 `public/lessons/l12/song.lrc` + 控制台逐行报告。然后：

- `~ 插值` 行（whisper 没听清、结构推算的行）逐条听音频确认；
- 合成曲课（gen-songs.py 管的 l6-l8）时间轴精确，直接 `scripts/gen-lrc.py --synth` 导出 LRC 即可，不要跑对齐。

## 第 4 步：同步与验收

- `backend/seed/lessons.json`：**外科手术式**替换对应歌词数组/timings 块（正则定位 + 括号配对），改完 `json.load` 校验。它是多会话共享文件，**禁止整文件重 dump**（会卷进别人的未提交改动，曾把并行会话的半成品块搞成非法 JSON）。
- 静态交叉验证 LRC↔歌词能被 `mapLrcToLyrics` 匹配（条数 + 首尾文本一致），否则前端会静默降级成比例高亮：解析 LRC 数非空行，与 `lessons.json` 歌词的非空行比对。
- `npm --prefix frontend run test` 全绿；前端两处各验一首（磨耳朵歌词页含拖进度条、课时"音乐"tab 含切轨道）。
- `song-timings.json` 边界：真人演唱课（无可靠 bpm）**不要新增条目**，逐行时间只放 LRC——乱加 bpm 会改变 SongStage 动画行为。l4/l5 已有条目会在重跑时自动更新（低置信行保留原值并维持 `estimated: true`）。

## 对齐实现的不变式（改 gen-lrc.py 前必读，改完跑 `gen-lrc.py l5` 回归）

1. **主识别绝不带 initial_prompt**——整曲喂歌词提示会让 whisper「对答案」：副歌拼成单字母碎片（'p','a','n','o'）甚至跳唱。提示词只允许在切片仲裁里用。
2. **whisper 对童声+伴奏是非确定的**（同参数两次运行词数差 50+）：跑最多 3 遍取锚定歌词词数最多的一遍。
3. **NW 代价不变式**：完全不匹配代价（4.0）必须 > GAP_L+GAP_A（3.2），否则把歌词词硬凑到拟声杂音上、一行摊出几十秒；回溯平局优先跳过多余音频词（锚重复段的最早一次出现）。
4. **`nw_pairs` 只收 token 列表**——传 `(token,start,end)` 元组会让全部代价退化成常数（最大的坑，症状：所有行等距分布）。
5. 副歌「串烧回调」（如 l5 每段副歌带前面乐器的回调）会诱使歌词行错锚到回调块——靠「相同文本/相同词数已锚定行对的节距迁移 + 上一行结束时间」兜底，不要试图用识别解决。

深读：`docs/LYRICS-WORKFLOW.md`（含新课验收清单与 l5/l10 案例复盘）。
