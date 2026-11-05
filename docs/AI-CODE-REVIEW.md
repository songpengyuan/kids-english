# AI 代码审查报告（2026-11-05）

> 审查范围：`frontend/src/composables/`（14 个文件）、`frontend/src/stores/`（6 个文件）、
> `frontend/src/components/activities/`（14 个 .vue）。审查方式：通读源码 + 对照调用方与
> 底层实现（`utils/speechScore.ts`、`services/api.ts`、`stores/progress/cloudSync.ts`）
> 交叉验证，所有行号已与当前工作区核对。
>
> **审查说明**：`OrderView.vue` / `OrderView.test.ts` 正被并行会话重构（拼句子 → 看图填空，
> 已有 b354fee 提交），按要求跳过未审；`useOrderSession.ts` 同属重构波及面，相关结论
> 已标注「若重构后废弃此文件可关闭本条」。
>
> 汇总：**P0 × 2 ｜ P1 × 10 ｜ P2 × 19**，共 31 条。
> 重点优先级：#1 录音隐私泄漏、#2 死循环卡死、#6 跨家庭数据串写、#7 贝壳无限刷。

---

## P0（会卡死 / 泄漏录音等严重问题）

### 1. [P0] frontend/src/components/activities/SpeakView.vue:45-51 ｜ 内存泄漏（录音）
**问题**：onMounted 预请求的 `getUserMedia` 流从未调用 `stop()`，麦克风被永久占用。
**为什么是 bug**：进入「跟我读」页即触发 `navigator.mediaDevices.getUserMedia({ audio: true })`，
返回的 MediaStream 被直接丢弃。浏览器不会因流失去引用就释放麦克风硬件——系统麦克风指示灯
持续亮着，孩子退出该页、回菜单甚至进其他 App 后麦克风仍被占用。这是隐私红线相关
（docs/DATA-INVENTORY.md 把录音列为最敏感数据）的资源泄漏，且每次进入该页叠加一条。
**建议修复**：拿到流后立即 `stream.getTracks().forEach(t => t.stop())`（预请求的目的只是触发
授权弹窗，不需要保活）；或改为复用 `createRecorder().ensureMic()` 并在卸载时 release。

### 2. [P0] frontend/src/components/activities/MemoryView.vue:28,45-49 ｜ 边界（死循环卡死）
**问题**：words 恰好 1 个词时 `buildGroups` 同步死循环，浏览器标签页直接卡死。
**为什么是 bug**：`groupSize = words.length >= 8 ? 4 : Math.min(3, Math.floor(words.length / 2))`，
1 个词时 `Math.floor(1/2)=0` → `groupSize=0`；随后 `g = Math.ceil(1/0) = Infinity`，
`for (let gi = 0; gi < g; gi++)` 永不终止。组件 setup 阶段同步执行（第 61 行），页面白屏假死
只能杀标签页。触发路径：wordGroups 配出只有 1 个词的群——`scripts/validate-data.mjs:90` 只校验
「每群至少 1 个词」，拦不住 1 词群，LessonView 按 `wordGroupsOf` 过滤后把单元素数组传进 MemoryView。
**建议修复**：`groupSize` 计算加下限 `Math.max(1, Math.min(3, Math.floor(n / 2)))`，或在
buildGroups 开头对 `groupSize <= 0` 兜底为 1。

---

## P1（特定操作序列下出错的真 bug）

### 3. [P1] frontend/src/stores/gate.ts:77 ｜ 持久化
**问题**：`persist()` 里 `localStorage.setItem` 无 try/catch，且被卷进 `verify()` 的 try/catch，
验证结果被写存储失败吞掉。
**为什么是 bug**：生产环境 + localStorage 写入抛异常（老 iOS Safari 无痕模式、配额满）时，
家长输入**正确口令**：`setToken`/`unlockedAt` 已生效，但 `persist()` 抛错 → 落入 catch（98 行）
→ `isLocalOrigin()` 为 false → 105 行 `return false` → GateView 显示「口令不对」。重试永远失败，
**该设备被永久锁在门外**；而门禁实际已在内存解锁，状态自相矛盾。localhost 分支更糟：catch 内
102 行的 `persist()` 再次抛出，异常从 `verify()` 逃逸成未处理 rejection，页面无任何反馈。
**建议修复**：`persist()` 内部整体包 try/catch（内存态照常生效）；`verify()` 把 `persist()`
移出 try 块或单独兜底，保证验证成功必然 `return true`。

### 4. [P1] frontend/src/stores/auth.ts:181,203 ｜ 持久化
**问题**：`createChild`（181 行）与 `selectChild`（203 行）在**服务端变更成功之后**才执行无守卫的
`localStorage.setItem`，写入抛异常会让前端误判失败。
**为什么是 bug**：受限存储环境（无痕/配额满）下，家长新建孩子：`POST /children` 成功、
`children.value` 已更新，181 行 setItem 抛 QuotaExceededError → `createChild` reject → UI 按失败
提示 → 家长重试 → **后端产生重名重复的孩子档案**，且两份档案各自积累进度。`selectChild` 同理：
内存已切换、异常抛给调用方，UI 状态错乱。
**建议修复**：setItem 包 try/catch（写失败仅放弃记忆，不影响本次结果）；或把持久化挪到函数开头/finally。

### 5. [P1] frontend/src/stores/gate.ts:93 ｜ 竞态（跨家庭数据串写）
**问题**：门禁口令验证直接 `setToken(res.token)` **置换身份**，但不触发任何会话边界处理
（`auth.logout()` 存在却无人调用），旧家庭遗留的本地待上报数据会被归到新家庭孩子头上。
**为什么是 bug**：设备先以 A 家口令进门（token=A），离线玩了一晚攒下未上报进度；之后换了环境/家庭，
家长输入 B 家口令 → `verify()` 换成 B 的 token → GateView.vue:47 紧接着 `await progress.flushReport()`，
而 `cloudSync.ts:56` 是 **flush 时**才取 `activeChildId()` → A 家孩子的本地进度全量
`PUT /children/{B家孩子}/progress`。叠加「max 合并只增不减」契约，这些错账**永久无法清除**
（跨家庭孩子数据串写，踩隐私边界）。
**建议修复**：`verify()` 成功后若检测到 token 属主变化（如 family_id 不同），先清空本地进度/奖励的
待上报队列（或给每条上报记录捕获当时的 childId）；至少在 gate 换票时调用 `auth.logout()` 级联重置。

### 6. [P1] frontend/src/stores/player.ts:194-195,224-225 ｜ 状态机
**问题**：`playSong`/`togglePlay` 乐观置 `playing.value = true`，audio 实例**没有监听
`pause`/`error`/`stall` 事件**（bindAudio 只挂了 timeupdate 和 ended），真实播放状态与 UI/计时脱钩。
**为什么是 bug**：孩子离线听一首未缓存的歌（PWA 离线是本应用常态场景）：`audio.play()` reject 或
媒体 error → `playing` 恒为 true、`ended` 永不触发 → `startListenTimer` 的结算循环一直按墙钟
`addListenActivity`（128 行，随后 `save()` 落盘并上云），**没播出任何声音却无限累计磨耳朵时长**。
iOS 来电/Siri 打断触发 audio pause 同理：UI 显示播放中，打断的几十分钟照常计入。弱网 stall 也复现。
**建议修复**：监听 `pause`（用标志位区分主动调用）和 `error`，事件到来时回写 `playing=false` 并
`stopListenTimer()`；`play().catch()` 里同样回滚状态。

### 7. [P1] frontend/src/stores/rewards.ts:208（配合 101-105）｜ 数据一致性
**问题**：`buyForm` 是贝壳**消费**（208 行 `shells.value -= form.price`），而本地/云端合并规则全是
max（101-105 行；后端 `rewards.py:_merge_rewards` 同样取 max），消费在同步语义下不成立。
**为什么是 bug**：孩子攒 200 贝壳并已上云；在图鉴花 120 兑换形态 → 本地 80 → `report()` PUT
{shells:80} → 后端 `max(200,80)=200`，云端纹丝不动；孩子进「我的」页（MyView.vue:84
`rewards.syncFromServer()`）→ `Math.max(80, 200)` → **贝壳回到 200，形态照常到手**。循环兑换 =
无限贝壳，货币闭环失效。
**建议修复**：云端为贝壳引入消费扣减语义（如记录 `shellsSpent` 只增字段，展示值=总收入−spent），
或兑换走独立 POST 接口由服务端校验余额，不走 max 合并。

### 8. [P1] frontend/src/components/activities/MatchView.vue:399-408（同模式：MemoryView.vue:98-104、SpinnerView.vue:181-186）｜ 竞态
**问题**：组间过场的 `await new Promise(r => setTimeout(r, 1100))` 期间卸载组件，恢复后仍会
`emit("done", stars)`，把「完成」发进已离开的页面。
**为什么是 bug**：孩子连上最后一组后 1.1 秒内退出（回菜单/切课）是常见操作。watch 回调的 async
续体不受组件卸载影响（Vue 只停 watcher 本身，不取消已挂起的 await），`emit` 在卸载后仍会调用父级
handler——LessonView 的 `@done="afterGame"` 照常执行，星级结算/撒花/切关发生在孩子已经离开的界面上。
MemoryView（900ms）与 SpinnerView（settleTimer 900ms）是同一模式。
**建议修复**：await 之后用组件存活标记（`let alive = true; onBeforeUnmount(() => (alive = false))`）
守卫，`if (!alive) return` 再 emit；或改用可清理的 setTimeout。

### 9. [P1] frontend/src/components/activities/LearnStage.vue:144-156 ｜ 内存泄漏（定时器）
**问题**：dialog 模式的 `questionTimer` 在组件卸载时未清理，问句 TTS 会在离开页面后响出来。
**为什么是 bug**：进 dialog 或轮次切换后 260/320ms 内退出（孩子手快点返回），定时器照常触发
`speak(questionPhrase.value!.en)`——家长问句"What's that?"在下一个页面/菜单上凭空播放。
TalkView 已修过一模一样的问题（TalkView.vue:177-179 的 onBeforeUnmount 清 questionTimer，注释
明确写着「过去 ~180ms 后问句还会在新页面上响一声」），LearnStage 的 dialog 是同逻辑的复制品但没
同步这个修复。
**建议修复**：照 TalkView 抄——`onBeforeUnmount(() => { if (questionTimer) clearTimeout(questionTimer); })`。

### 10. [P1] frontend/src/components/activities/LearnStage.vue:102-103（配合 50-57）｜ 状态机
**问题**：dialog 模式进度上报自相矛盾——挂载时按翻页页码报 progress，首轮答对后 `emit("total", 1)`，
顶栏圆点进度随之塌掉。
**为什么是 bug**：l10 dialog 课挂载时 watch [page,total]（immediate）发出 total=词数、
progress=(page+1)/total*100（第 1 轮未答就显示约 11%）；孩子答对第一词后第 102 行
`emit("total", 1)` 把 total 改成 1，LessonProgressHeader（MIN_DOTS=2）从此不画圆点、
doneCount=Math.round(pct/100*1) 也对不上「第 N/9 轮」。同一玩法在 TalkView 里的正确做法是每轮
`emit("total", total.value)`（词数）+ passedCount 进度。同一功能两处口径不一致，dialog 课的
局内进度显示是坏的。
**建议修复**：dialog 模式下跳过 50-57 的 watch（用 `if (!props.dialog)` 守卫），统一按
`passedIds.size / words.length` 报 progress、`words.length` 报 total。

### 11. [P1] frontend/src/components/activities/SpinnerView.vue:119-127,131-151 ｜ 状态机/竞态
**问题**：录音中点「转一转」不会停掉录音，反而把 micPhase 重置为 idle，MediaRecorder 被孤儿化、
下一次 start 叠加录音。
**为什么是 bug**：「转一转」按钮（308 行）在 `micPhase === "listening"` 时并未禁用（只 disabled 于
spinning/finished）。孩子按下麦克风正在录音时再点转盘：1900ms 后 spin 回调把 `micPhase` 置 "idle"、
`micBlocked` 置 false，但底层 recorder 仍在录音、recTimer（5 秒自动停）仍挂着。此后再点麦克风：
onMicTap 看到 idle → `recorder.start()` 在 createRecorder 里直接
`mr = new MediaRecorder(recordStream)` 覆盖引用——旧 MediaRecorder 永远没人 stop，持续占用编码器
与内存；旧 recTimer 到点后 `stopListening()` 又会把新录音提前掐断，导致录音被截短、开口计数错乱。
**建议修复**：spin() 开头 `if (micPhase.value === "listening") await stopListening()`（或在 listening
期间禁用转盘按钮）；createRecorder.start() 里对已 active 的 mr 先 stop 再新建。

### 12. [P1] frontend/src/composables/useChestMachine.ts:62-64（配合 113-120）｜ 状态机
**问题**：`openChest` 的 650ms 延时器在 `closeOverlay()` 时未被清除，会把已关闭的宝箱从
"collected" 复活回 "reward"。
**为什么是 bug**：孩子敲满 3 下（phase="open"，启动 650ms timer）→ 在 650ms 内点关闭
（`closeOverlay` 明确支持任意阶段一键退出，置 phase="collected"，但不清 timer）→ 650ms 到点回调
执行 `phase.value = "reward"`，已关闭的组件重新进入奖励展示态；若组件仍挂载，展示区/徽标状态与
实际不一致。
**建议修复**：`closeOverlay()`（和 `endCollect()`）入口处 `if (timer) clearTimeout(timer)`，
或把 timer 改为可代际取消。

### 13. [P1] frontend/src/composables/useOrderSession.ts:79 ｜ 状态机/边界
**问题**：`pick` 用 `bank.filter((w) => w !== word)` 移除**所有**同名词块，但槽里只放入 1 个——
含重复单词的句子永远拼不完。
**为什么是 bug**：lessons.json 的 l12 实际存在 "The wheels on the bus go round and round."
（round×2、the×2）、"swish swish swish"（×3）、"beep beep beep"（×3）。点一次 "swish" 后 bank 里
3 个全被移走、slots 只有 1 个，`checkComplete` 的长度条件永远不满足，只能靠 `revealAnswer` 兜底
过关；顺带 wrongCount 被迫累积压星级。该修复（`indexOf`+`splice` 删一个）同时可防同一词块双击
导致 slots 重复 push。
**建议修复**：`const i = bank.value.indexOf(word); if (i >= 0) bank.value.splice(i, 1);` 再 push。
**注**：该文件刚被并行会话重构——OrderView.vue 已于 2026-11-05 改写为「看图填空」，工作区里已无
任何组件引用 useOrderSession（仅测试引用）；若重构后废弃此文件可关闭本条。

### 14. [P1] frontend/src/composables/useSpeechSession.ts:199-201 ｜ 竞态
**问题**：`await stopCaptureRecorder()` 挂起期间用户点「下一个/再试一次」，旧词录音结果仍会在
await 恢复后被 `adoptRecordingUrl` 收养并 `autoReplay()`，旧声音在新词界面自动外放。
**为什么是 bug**：SpeakView 传 `captureVoice: true`（SpeakView.vue:40）。ASR 结束 → onFinish 同步置
status="feedback" → `await recorder.stop()` 等 `mr.onstop`（异步，数十 ms 窗口）→ 窗口内点「下一个」
（next():313 只做 clearRecordingUrl，此时 recUrl 尚为空）或「再试一次」（retry():304 语义是丢弃录音）
→ onstop 触发后 onFinish 续体拿到旧词 url → `adoptRecordingUrl(url)` 写入 recUrl 并 `autoReplay()`
无交互自动播放——retry 的「丢弃」保证被击穿，孩子点确定丢弃后却听到上一次的声音。
**建议修复**：给每次词/尝试加代际 token，await 恢复后校验 `idx`/`status` 未变再 adopt+replay；
或 retry/next 时递增 token 使旧续体直接丢弃 url。

---

## P2（规范问题 / 潜在隐患）

### 15. [P2] frontend/src/stores/gate.ts:50（配合 auth.ts:88）｜ 持久化/边界
**问题**：store 初始化期的 `localStorage.getItem` 无守卫，存储被禁时直接抛 SecurityError。
**为什么是 bug**：Chrome「阻止所有 Cookie」、部分家长管控 WebView 禁用存储时，**访问** localStorage
本身即抛异常：`useGateStore()` 首次实例化在应用启动路径上，50 行抛错 → setup 失败 → 白屏；
auth.ts:88 在 `restore()` 的 try（90 行才开始）之外抛出 → restore 整体 reject，App.vue:60 的
`.then` 链不执行，云端初始化全跳过且无日志。
**建议修复**：封装 `safeGet/safeSet` 工具（try/catch 返回 null/忽略），所有 store 启动期读写统一走它。

### 16. [P2] frontend/src/stores/auth.ts:207（配合 services/api.ts:91）｜ 竞态
**问题**：会话中途 JWT 过期时，api 层 401 静默 `setToken(null)`，auth store 毫不知情——
`family`/`currentChildId` 保持已登录状态，UI 与同步通道长期不一致。
**为什么是 bug**：孩子设备常开数天，token 过期后任一后台请求（如 rewards `report()`）命中 401 →
api 清 token 并抛错，但没有任何代码调用 `auth.logout()` 或通知 auth store。此后
`rewards.activeChildId()`（rewards.ts:84-87，靠 `getToken()` 判断）返回 null，**所有进度/奖励静默
退化纯本地模式**，而「我的」页仍显示已登录家庭——家长以为上云正常，实际换设备就缺数据
（本地仍在，重登会 max 合并回来，故不算丢失，是静默停摆）。
**建议修复**：api 层 401 时派发一个事件/回调，auth store 收到后走 `logout()` 并提示重新登录。

### 17. [P2] frontend/src/stores/content.ts:21 ｜ 持久化
**问题**：`CACHE_KEY = "kids-content-lessons-v1"` 声明后全文零引用，文件头注释（5-7 行）
「成功后缓存到 localStorage」从未实现——远端内容无任何持久化。
**为什么是 bug**：远端后端新增了本地没有的课程（l12+），孩子在线时通过 `summaries`/`detailCache`
（纯内存）看到并学过；一旦离线冷启动，两个缓存全空，`lessonList` 回退本地静态 → **新课从界面上
消失**，`getLesson` 对其返回 null。与注释承诺的离线可用不符（本地静态老课不受影响，故为 P2）。
**建议修复**：要么实现 CACHE_KEY 的读写（summaries + 已拉取详情落盘），要么删掉死常量并修正头
注释，明确「远端新增课离线不可见」是既定限制。

### 18. [P2] frontend/src/stores/streak.ts:160 ｜ 状态机/边界
**问题**：`todayDone`/`day` 的跨天翻新只依赖 `visibilitychange → refreshDay()`（App.vue:80-84），
应用**持续前台跨零点**时没有任何触发点。
**为什么是 bug**：孩子设备常亮挂磨耳朵页过夜（儿童平板典型场景）：23:59 达标显示「今日已完成」，
00:00 后页面仍停留在昨天状态——`day.date`、今日目标进度、日历高亮全是昨天的（computed 依赖不随
时钟失效，store 注释自己也承认这一点）。直到下次点击记账或切换 App 才纠正；期间显示误导但记账是
安全的（所有 `mark*` 都先 `rollOver`）。
**建议修复**：store 内挂一个每分钟的 `setInterval` 调 `refreshDay()`（或比对 `localDate()` 变化），
覆盖前台不隐藏的跨天。

### 19. [P2] frontend/src/components/activities/QuizView.vue:84-93 ｜ 竞态
**问题**：watch(session.idx) 里的 `setTimeout(playTarget, 350)` 未保存句柄，既不清除也不去重。
**为什么是 bug**：孩子在题目出现 350ms 内点对答案（低龄乱点很常见），家长立刻点 Next → idx 变化
又排一个新 timer → 旧 timer 到点 `playTarget()` 读的是**新题**的 target，新 timer 到点再读一遍 →
同一题的发音连读两次、第二次打断第一次。最后一题答完点 Next 触发 emit("done") 卸载组件后，若有
pending timer，会在下一玩法页上凭空读出一个单词。
**建议修复**：保存 `let qTimer`，watch 回调与 onBeforeUnmount 里 clearTimeout；或用 useQuizSession
的 `later()` 基建统一纳管。

### 20. [P2] frontend/src/composables/useSpeechSession.ts:124-132 ｜ 内存泄漏
**问题**：`stopCaptureRecorderSilent` 调 `recorder.stop()` 后直接 `clearRecordingUrl()`，新创建的
ObjectURL 被丢弃且永不 revoke。
**为什么是 bug**：`createRecorder().stop()`（utils/speechScore.ts:257-266）在 onstop 里必定
`URL.createObjectURL(blob)`。SpeakView 开了 `captureVoice: true`，每次 ASR 走 no-speech /
not-allowed / network 分支（useSpeechSession.ts:165/170/180）或新一轮 startAsr 前的静默收尾，都会
生成一个含孩子声音的 webm blob URL 然后丢弃——既泄漏内存（blob 被 URL 引用直到页面卸载），也与
「录音仅内存、及时释放」的设计意图相悖；连续 no-speech 几轮就积累几条。
**建议修复**：让 recorder.stop() 返回的 url 在「不采用」路径上立即 `URL.revokeObjectURL(url)`
（或给 createRecorder 加 `stopAndDiscard()`）。

### 21. [P2] frontend/src/components/activities/SongView.vue:105-117,121-123 ｜ 状态机
**问题**：兜底的 watch(props.group) 换群时重置了 trackIdx/watched/missing 状态，但没重置 `mode`，
可能落进「没有任何 Tab 高亮」的中间态。
**为什么是 bug**：LessonView 用 key 重挂载 song，正常路径不走这个 watch；但一旦走兜底（组件被复用），
若孩子停在「视频」Tab 时换成无视频的词群：`hasVideo` 变 false，模板 `v-if="mode === 'video' && hasVideo"`
与 `v-else-if="mode === 'stage'"` 都不命中，直接渲染 audio 分支，而两个 Tab 的 `on` 类分别要求
mode===firstTab('stage') 和 mode==='audio'——均不满足，Tab 栏全部熄灭，UI 与实际内容不符
（点击任一 Tab 可自愈）。
**建议修复**：watch 里加一行 `mode.value = firstTab.value`（与 switchTrack 一样保持 mode 与素材一致）。

### 22. [P2] frontend/src/components/activities/SpeakView.vue:109（另见 TalkView.vue:276、QuizView.vue:109、SpeakView.vue:88）｜ 边界
**问题**：词表为空时多个玩法无运行时兜底：`cur` 为 undefined 直接渲染崩溃，progress 除以 0 报 Infinity。
**为什么是 bug**：useSpeechSession 的 `cur = computed(() => words.value[idx.value])`
（useSpeechSession.ts:80）空数组时返回 undefined。SpeakView 模板 `:key="cur.id"`（109 行）、TalkView 的
`playAnswer(cur)`/`passedIds.has(cur.id)`（276/286 行）、QuizView 的 `q.options`（109 行，
useQuizSession.ts:78 空题目返回 undefined）都会抛 TypeError 白屏；SpeakView.vue:88 的
`Math.round(((idx+1)/total)*100)` 在 total=0 时上报 Infinity 给顶栏。当前 validate-data.mjs:90 拦住了
0 词群，但 lessons.json 本体（非分组路径）无「课时至少 1 词」校验，且这类防御只值一行。
**建议修复**：各玩法入口对 `words.length === 0` 早退（渲染空态提示并直接 emit done/占位），
模板对 cur/q 判空。

### 23. [P2] frontend/src/components/activities/MemoryView.vue:156-166（同类：MatchView.vue:519-535,550-586、QuizView.vue:107-117、WordCard.vue:82,105）｜ 无障碍
**问题**：核心玩法卡片全是「pointerdown/click 的裸 div」，键盘完全不可达。
**为什么是 bug**：翻牌（MemoryView）、连线的图卡与词卡（MatchView）、听音选图的选项（QuizView）、
点读卡（WordCard）都没有 tabindex/role="button"/keydown 处理；键盘用户（包括部分辅助触控/外接键盘
场景）无法完成任何一关。MemoryView 的牌背只有 "？"，无 aria-label，屏幕阅读器得到的是 8 个无语义的
"？" 格子。SongView.vue:335-345 的进度条有 role="slider" + tabindex="0" 却没有任何 keydown 处理，
聚焦后键盘无法拖动，是不完整的 slider。
**建议修复**：卡片加 `role="button" tabindex="0" @keyup.enter/@keydown.space`（或换成 button 元素）；
slider 补 Left/Right 键步进。

### 24. [P2] frontend/src/components/activities/QuizView.vue:113-116（同类：SpeakView.vue:197,214、MemoryView.vue:158-164、MatchView.vue:623-625）｜ 无障碍
**问题**：答对/答错、判定结果等关键动态反馈均无 aria-live，读屏用户得不到任何结果播报。
**为什么是 bug**：QuizView 选项的 right/wrong 只靠边框变色表达；SpeakView 的 verdict（「太棒了/
再试一次」）、heard 文本、MemoryView 配对成功、MatchView 组间 banner 都是纯视觉变化，没有
`aria-live="polite"` 区域，辅助技术不感知状态迁移。TalkView 的 `.ci-hint` 已示范了正确写法
（310 行 aria-live="polite"），其余玩法未同步。
**建议修复**：给结果反馈容器统一加 `aria-live="polite"`（SpeakView verdict、QuizView 可复用 .tip
或加一个视觉隐藏的 live region）。

### 25. [P2] frontend/src/composables/useOrderSession.ts:66-67 ｜ 竞态
**问题**：拼错回滚的 800ms `setTimeout` 无代际守卫，`phrases` 在窗口内变化时，旧回调会对**新句子**
再执行一次 `buildSentence()`（重洗 bank、清空 slots、解锁）。
**为什么是 bug**：组件随路由参数复用（LessonView 对同组件变参不重挂载，靠 watch 重置）时切换词群/
课时，恰逢上一句刚拼错 → 新句出现 0-800ms 内被打断重洗，且 wrongCount 已按旧句 +1 污染新句星级；
卸载后回调仍写 ref。
**建议修复**：`buildSentence`/watch 时递增会话序号，回滚回调先比对序号再落地。
（同 #13 注：若重构后废弃此文件可关闭本条。）

### 26. [P2] frontend/src/composables/useQuizSession.ts:44-46,175-186 ｜ 状态机
**问题**：`mainQuestions` 是 computed 且内部调用 `Math.random`，`reset()` 不触碰其任何依赖，
「再练一次」永远返回首次缓存的同一套题、同一洗牌顺序。
**为什么是 bug**：复习页点「再练一次」（注释承诺「题目按当前词表重新生成」）→ 词表未变 → computed
命中缓存 → 孩子刷到与上一轮完全相同的题目序列，违背重开一轮的语义；词表变化时反而会因依赖变化触发
洗牌重算（与 useMatchSession 注释里警告的「途中重洗」同源风险）。
**建议修复**：把 mainQuestions 改为 shallowRef，在 `reset()`（及初始化）里显式重新
`buildQuizQuestions` 生成。

### 27. [P2] frontend/src/composables/useLessonFlow.ts:127 ｜ 内存泄漏
**问题**：`boot()` 里 `setTimeout(() => speak(...), 400)` 未保存句柄、从不清理。
**为什么是 bug**：进入课程页 400ms 内退出（快速点入再返回）→ 组件卸载后 TTS 仍报出上一课标题；
LessonView 对路由变参会重复 `flow.boot()`（LessonView.vue:122-125），多次回菜单会叠加多个未清理的
speak 定时器。
**建议修复**：保存 timer，重新 boot 前与 `onScopeDispose` 中 clearTimeout。

### 28. [P2] frontend/src/composables/useLessonFlow.ts:245 ｜ 边界
**问题**：`lessonProgress` 用 `activities.value.length` 做除数，空数组时得 NaN
（`Math.min(100, NaN)` 仍为 NaN）。
**为什么是 bug**：某课 `activityKeys` 为空（远端内容 API 覆盖出半截数据/新课上架素材未齐）→
菜单进度直接渲染 "NaN%"。
**建议修复**：`const n = activities.value.length; return n ? Math.min(100, Math.round((done / n) * 100)) : 0;`

### 29. [P2] frontend/src/composables/useAudioTransport.ts:66-68 ｜ 竞态
**问题**：`play()` 的 promise 回调无条件 `playing.value = true`，与快速 pause 形成竞态——
pause 之后 UI 回到「播放中」。
**为什么是 bug**：快速「点播放→点暂停」（孩子连续乱点很典型）：`pause()` 同步置 playing=false，但按
HTML 规范 pause() 会 **resolve** 未决的 play promise（而非 reject）→ `.then` 随后执行 →
playing=true，按钮显示暂停态而音频实际停着。`.catch` 只覆盖了被拒分支。
**建议修复**：`.then(() => { if (audioEl.value && !audioEl.value.paused) playing.value = true; })`。

### 30. [P2] frontend/src/composables/useAudioTransport.ts:82-87 ｜ 状态机
**问题**：`reset()` 不清 `seeking`，换素材后进度条卡在拖动位置。
**为什么是 bug**：用户正按住拖进度条时父组件换曲调 `reset()`（清 currentTime/buffered）→ `seeking`
仍 true → `handleTimeUpdate` 第 115 行 `if (seeking.value) return` 持续跳过同步，新音频播放中进度条
冻结在旧位置直到松手。
**建议修复**：`reset()` 中 `seeking.value = false`。

### 31. [P2] frontend/src/composables/useAudioTransport.ts:146-148 ｜ 内存泄漏
**问题**：`onSeekDown` 向 window 挂 pointermove/up/cancel 三监听，composable 无 onScopeDispose
兜底清理。
**为什么是 bug**：拖动中组件卸载（拖动手势内发生路由跳转）→ 监听滞留 window；通常靠下一次 pointerup
自愈，但期间 `applySeek` 会继续驱动已卸载组件的 audio 引用与 ref，且拖动中若 iOS 直接杀页面则依赖
浏览器回收。
**建议修复**：`onScopeDispose(onSeekUp)` 兜底（幂等，removeEventListener 无害）。

### 32. [P2] frontend/src/composables/useSpeechSession.ts:113-122,325-333 ｜ 内存泄漏
**问题**：`recorder.stop()` 只停 MediaRecorder，不释放 MediaStream 轨；`recorder.release()`
（唯一停轨处）仅在组件卸载的 `cleanup` 调用——整个会话期间每词之间麦克风流与 AudioContext 保持打开。
**为什么是 bug**：孩子读完一词进入 feedback 停留/家长判定时，系统麦克风指示灯常亮、AudioContext
常驻（utils/speechScore.ts:257-266 stop 不触 release；release 在 useSpeechSession:332 且仅
onBeforeUnmount）。对儿童 App 属隐私/功耗敏感：非录音时段麦克风仍在采集（只是没写进 recorder）。
**建议修复**：每次尝试收尾后 `recorder.release()`（下次 start 会重新 openCapture 并自动重取权限），
或至少在进入 feedback/idle 时释放。

### 33. [P2] frontend/src/composables/useFlyToEl.ts:35-47 ｜ 内存泄漏/竞态
**问题**：rAF 动画循环不可取消、`onStep` 抛错时 promise 永不 resolve。
**为什么是 bug**：`flyOne` 被宝箱收取流程 `await` 串行调用；任一帧 `onStep?.(p, t)`（第 40 行，
调用方注入的拖尾视效回调）抛异常 → 第 41 行不再排下一帧、第 44 行 resolve 不执行 → 收取序列永久
挂起，宝箱状态机停在 "flying"，`tap()` 从此返回 "ignore"，只能靠关闭弹窗逃生；卸载后 rAF 也会对
detached 节点继续跑到自然结束（≤380ms）。
**建议修复**：`onStep` 调用包 try/finally（finally 里保证排帧/resolve），并返回带 cancel 的句柄供
onScopeDispose 取消。

---

## 交叉主题小结

1. **「定时器 / await 续体越过卸载或状态切换边界」**是最大的一族（#8 #9 #12 #14 #19 #25 #27）：
   修复范式现成——TalkView 的 questionTimer 清理、useLrc 的序号守卫是本仓库内的正确范本。
2. **儿童 App 特有的隐私敏感项**：#1（麦克风预请求不释放）、#32（词间麦克风保持采集）、
   #20（含孩子声音的 blob URL 泄漏）建议合并成一次「录音链路专项修复」。
3. **数据一致性**：#5（换口令跨家庭串写）与 #7（贝壳 max 合并吞消费）都源于「本地操作 +
   max 合并」的组合语义，需要在上报协议层面补「消费/重置」类语义才能根治。
4. **值得肯定的现状**：useLrc 的 fetch 序号守卫、useMatchSession 的多指隔离与 pointercancel
   处理、useWhisperPrompt 的 recognizer 资格校验与三定时器清理、TalkView 的 aria-live 示范，
   都是同类问题里已经做对的参照实现。

## 未审说明

- `OrderView.vue` / `OrderView.test.ts`：并行会话正在重构（拼句子 → 看图填空，b354fee 及后续
  WIP），本报告跳过。
- `stores/progress/`、`components/` 其他子目录、`views/` 不在本期范围（仅作调用方交叉核对）。
