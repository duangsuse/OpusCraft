// gode/pane/lib.js —— 面板的纯函数：文字约定（s09 §9）、tsv 表格式（s09 §3）、行 / 范围工具、带前缀的存储。
//   不碰 DOM（localStorage 除外）、不碰网络、不认游戏。tsv 的列头语法其实是引擎 gm.tbl 的格式，引擎起来后应迁过去。

// ── 文字：文件夹名第一个 emoji = 图标；搜索与折叠记忆都忽略 emoji、大小写与空白
export const EMO = /\p{Extended_Pictographic}(?:️|⃣)?(?:‍\p{Extended_Pictographic}️?)*/u
export const firstEmoji = s => s.match(EMO)?.[0] ?? null
export const plain = s => s.replace(new RegExp(EMO.source, 'gu'), '').replace(/️/g, '').trim()
export const norm = s => plain(String(s)).toLowerCase().replace(/\s+/g, '')
/** 词首字母：'sharpDist' → sd，'gl.ao strength' → gas */
export const initials = s => plain(String(s)).replace(/\$/g, '').split(/[\s._:/·-]+|(?=[A-Z])/).filter(Boolean).map(w => w[0]).join('').toLowerCase()
/** 子串（忽略 emoji / 大小写 / 空白）或某个字段的词首字母以 q 开头 */
export const matches = (q, ...fields) => { const n = norm(q); return !n || norm(fields.join(' ')).includes(n) || fields.some(f => initials(f).startsWith(n) || initials(String(f).split('.').pop()).startsWith(n)) }
export const score = (q, label, path) => { const n = norm(q); return norm(label).startsWith(n) ? 4 : norm(label).includes(n) ? 3 : norm(path).includes(n) ? 2 : 1 }

// ── tsv：第一行表头，id 列固定在最前；其余列 `名[:类型[:min..max[:step]]]`，类型 str（缺省）/ num / bool / hex。
//   例：  id  name  gravity:num:0..2:0.05  solid:bool  tint:hex
export function tsvParse(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#')), head = lines.shift()?.split('\t') ?? []
  const cols = head.slice(1).map(h => {
    const [k, type = 'str', rg, st] = h.split(':'), c = { k, type }
    if (rg) { const [a, b] = rg.split('..'); c.min = +a; c.max = +b } if (st) c.step = +st
    return c
  })
  const rows = lines.map(l => {
    const f = l.split('\t'), r = { id: f[0] }
    cols.forEach((c, i) => { const v = f[i + 1] ?? ''; r[c.k] = c.type === 'num' ? +v : c.type === 'bool' ? v === 'true' : v })
    return r
  })
  return { cols, rows }
}
export function tsvStringify({ cols, rows }) {
  const head = ['id', ...cols.map(c => c.type === 'str' ? c.k : [c.k, c.type, c.min != null ? `${c.min}..${c.max}` : '', c.step ?? ''].join(':').replace(/:+$/, ''))].join('\t')
  return [head, ...rows.map(r => [r.id, ...cols.map(c => r[c.k])].join('\t'))].join('\n') + '\n'
}

// ── 行 / 范围
export const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
export const clone = v => Array.isArray(v) ? v.slice() : v
export const lastKey = p => p.split('.').pop()
export const isFolder = r => Array.isArray(r) && typeof r[0] === 'string' && Array.isArray(r[1])

/** 某组行里的全部路径（预设 / 恢复默认的范围） */
export function rowPaths(rows, out = []) {
  for (const r of rows) { if (!Array.isArray(r)) continue; if (isFolder(r)) rowPaths(r[1], out); else out.push(...[r[0]].flat()) }
  return out
}
/** scope（'root' / 'root/文件夹 id/…' / 单个路径）里的全部路径；找不到 → null */
export function scopePathsOf(roots, vals, scope) {
  if (scope in vals) return [scope]
  const [id, ...fs] = scope.split('/'); let rows = roots.find(r => r.id === id)?.rows
  for (const f of fs) { rows = rows?.find(r => isFolder(r) && (r[2]?.id ?? plain(r[0])) === f)?.[1] }
  return rows ? rowPaths(rows) : null
}

// ── 存储：键前缀 ns 必须由页面在构造时传入（mock 与真游戏同源，不传就会互相读到对方的预设 / 折叠）
export function makeStore(ns) {
  if (typeof ns !== 'string' || !ns) throw new TypeError('pane: ns（存储键前缀）必须由页面传入，例如 createCore({ ns: "myapp." })')
  const key = k => ns + k
  return {
    ns, key,
    load(k, d) { try { return JSON.parse(localStorage.getItem(key(k))) ?? d } catch { return d } },
    save(k, v) { try { localStorage.setItem(key(k), JSON.stringify(v)) } catch {} },
  }
}
