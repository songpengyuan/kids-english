/**
 * 设计系统守卫（CI 用）—— 把「规范」变成会失败的检查，而不是文档里的一句口号。
 *
 * 检查两件事：
 *
 *  ① **引用了不存在的 CSS 变量**（且没有 fallback）
 *     这类 bug 是静默的：CSS 在 computed-value 阶段判定为 invalid，
 *     整条声明被丢掉，元素就"没有那个样式"，控制台一声不吭。
 *     实际踩过的例子（2026-10 走查一次性抓出 6 处）：
 *       · var(--card)      —— tokens 里叫 --card-bg   → 姿势舞台/缩略图底色消失
 *       · var(--pink)      —— tokens 里叫 --c-pink    → 童谣幕布的条纹整条不画
 *       · var(--ink-1)     —— tokens 里叫 --ink       → 闯关横幅文字色丢
 *       · var(--fs-big)    —— tokens 里叫 --fs-hero   → 结算徽章字号丢
 *       · var(--tint)      —— 从来不存在              → 抽屉关闭钮没有底色
 *     `var(--x, fallback)` 是**故意**的可选覆盖（如 --bar-bg 的兜底），放行。
 *
 *  ② **视图层 / UI 层里的硬编码颜色**（`#rgb` `#rrggbb`）
 *     这三层（views、components/ui、components/layout）必须做到零硬编码色：
 *     它们是"所有页面共用同一套规范"的落点。玩法/领域组件（activities、game、
 *     rewards…）里历史遗留较多，暂不拦，走查时按批次清。
 *
 * 定义来源：任何文件里出现 `--name:` 都算已定义 —— 既覆盖 tokens.css / base.css，
 * 也覆盖组件里 `:style="{ '--n': … }"` 这种运行时注入的局部变量。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

/** 必须零硬编码颜色的目录（相对 src/） */
const STRICT_DIRS = ['views', 'components/ui', 'components/layout']

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git'])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(vue|css|js|ts)$/.test(name)) out.push(p)
  }
  return out
}

const files = walk(SRC)

/**
 * 把注释替换成等长空白（**保留换行**，这样后面报的行号仍然准确）。
 * 必须做这一步：注释里经常举反例，比如 CuteBackdrop 里那句
 * "不要用 color-mix(var(--token))" —— 不剔除就会把注释当代码报错。
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/[^\n]*/gm, (m) => m.replace(/[^\n]/g, ' '))
}

/* ---------- 收集所有已定义的 CSS 变量 ---------- */
/* 匹配 "--name:"（CSS 规则里）与 "'--name':" / "\"--name\":" （JS/模板内联样式里），
 * 两种情况都归一化成同一个变量名。 */
const defined = new Set()
const DEFINE_RE = /(?:(['"])(--[a-z0-9-]+)\1|(--[a-z0-9-]+))\s*:/gi
for (const f of files) {
  const text = stripComments(readFileSync(f, 'utf8'))
  for (const m of text.matchAll(DEFINE_RE)) defined.add(m[2] ?? m[3])
}

/* ---------- ① 未定义变量 ---------- */
const USE_RE = /var\(\s*(--[a-z0-9-]+)\s*([,)])/gi
const undefinedVars = []
for (const f of files) {
  const text = stripComments(readFileSync(f, 'utf8'))
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(USE_RE)) {
      const [, name, next] = m
      if (next === ',') continue // 有 fallback：故意的可选覆盖
      if (defined.has(name)) continue
      undefinedVars.push(`${relative(SRC, f)}:${i + 1}  var(${name})`)
    }
  })
}

/* ---------- ② 视图层硬编码颜色 ---------- */
const hardcoded = []
for (const f of files) {
  const rel = relative(SRC, f)
  if (!STRICT_DIRS.some((d) => rel === d || rel.startsWith(d + '/'))) continue
  const text = readFileSync(f, 'utf8')
  // 只看 <style> 块（.vue）；纯 css 全部算
  const styleBlocks = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1])
  const bodies = styleBlocks.length ? styleBlocks : [text]
  bodies.forEach((body, bi) => {
    stripComments(body)
      .split('\n')
      .forEach((line) => {
        const m = line.match(/#[0-9a-fA-F]{3,8}\b/)
        if (m) hardcoded.push(`${rel}${styleBlocks.length ? ` [style#${bi + 1}]` : ''} ${m[0]}`)
      })
  })
}

/* ---------- 汇总 ---------- */
let failed = false

if (undefinedVars.length) {
  failed = true
  console.error(`\n✋ 引用了不存在的 CSS 变量（${undefinedVars.length} 处）—— 这些声明会被静默丢弃：`)
  for (const v of undefinedVars) console.error('   ' + v)
  console.error('   请在 src/styles/tokens.css 里补上定义，或改成正确的变量名。\n')
}

if (hardcoded.length) {
  failed = true
  console.error(`\n✋ 视图/UI 层出现硬编码颜色（${hardcoded.length} 处）—— 应改用 token 或 .tone-*：`)
  for (const h of hardcoded) console.error('   ' + h)
  console.error('   允许目录：' + STRICT_DIRS.join('、') + '（详见 DESIGN_SYSTEM.md 第 13 节）\n')
}

if (failed) process.exit(1)

console.log(
  `✅ 设计系统守卫通过：${files.length} 个文件，${defined.size} 个 token，` +
    `无未定义变量、${STRICT_DIRS.join('/')} 无硬编码颜色`
)
