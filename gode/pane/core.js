// gode/pane/core.js —— 面板的游戏侧：Ref 登记处（参数 / 表 / 动作 / 预设 / 落盘）。不碰通道（chan.js）、不认游戏（游戏只经 host 回调进来）。
//   createCore({ ns, host, tblDir?, ...conf }) → core；声明脚本里用 core.c_（参数）与 core.api（= gg：pane / table / acts / watch），然后 await core.seal()
//     ns       存储键前缀，必须由页面传入（mock 与真游戏同源，不传会互相读到对方的预设）
//     tblDir   表 ↔ <tblDir>/<表名>.tsv；不给就是纯内存表
//     conf     fpsSettleMs / fpsSampleMs（R6 timeit 的两个时长）
//
// 值模型（P-2，同 rgl/vars.js）：值住在 owner 里，登记处只持 Ref(owner, key)。
//   c_.Fx = { gravity: [0.8, 0, 2, '重力'], bloom: { on: [true, 'Bloom'] } }   赋值 = 登记参数主题（嵌套对象 = 嵌套表）；元组怎么读见 parseTuple
//   c_.Fx.gravity            读 owner；c_.Fx.gravity = 3 写（走同一条 set 路由：校验、changed、host.set）；拼错键直接抛错
//   c_.Fx.it.gravity         Ref：一个 getter 函数，调用即读；r.set(v) / r(v) 写；带 key / owner / path / meta，所以 Pass 的 ${} 直接能用（名字取 key）
//   core.ref('$Fx.gravity')  同一个 Ref（同一路径总是同一个函数）
//   core.api.watch(Fps.sunDir, { path: '$Frame.sunDir', hz: 4 })   把已经带 key + owner 的 getter（帧对象 Fps / Fpv）登记成只读 Ref，按 hz 采样推给面板
// 落盘（✎）：声明时在 Proxy 的 set 里取调用栈（caller sloc，V8 给的位置是这条赋值的 `=`）；✎ 把「文件:行:列 + 键名 + 旧值 + 新值」交给开发服务器，
//   它在 `c_.Fx = {…}` 的花括号里按键名分词、原位改写数字 / 字符串字面量（tools/decl.js）。循环 / 计算出来的声明共用 sloc 或没有字面量，✎ 会跳过并说明。
//
// 声明有问题（路径没登记、种类对不上、未知选项…）不抛：记进 core.errors 并跳过那一行 / 那个参数，页面照常起来（s09 §9；热重载时手滑不会白屏）。
// 订阅者（游戏窗口的视图、chan.js）收到同一种 GameMsg：schema changed meta presets tbl_change perf copy toast panel
import { plain, matches, makeStore, eq, clone, isFolder, scopePathsOf, tsvParse, tsvStringify } from './lib.js'
import { putFile, getText, patchDecl } from './devlink.js'

const SELF = import.meta.url
const HOMES = ['game:tl', 'game:tr', 'game:pause', 'panel']
const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o)
const isNum = Number.isFinite
const kindOf = (v, m) => m.kind ?? (typeof v === 'number' ? (m.options ? 'enum' : 'num') : typeof v === 'boolean' ? 'bool'
  : typeof v === 'string' ? (m.options ? 'enum' : m.color ? 'hex' : m.multiline ? 'text' : 'str') : Array.isArray(v) ? (m.color ? 'rgb' : 'vec' + v.length) : 'none')
const OK = {
  num: isNum, bool: v => typeof v === 'boolean', enum: (v, m) => Array.isArray(m.options) && m.options.includes(v),
  hex: v => /^#[0-9a-f]{6}$/i.test(v), str: v => typeof v === 'string', text: v => typeof v === 'string',
  rgb: v => Array.isArray(v) && v.length === 3 && v.every(isNum), vec2: v => Array.isArray(v) && v.length === 2 && v.every(isNum), vec3: v => Array.isArray(v) && v.length === 3 && v.every(isNum),
}
const META_KEYS = ['label', 'doc', 'fx', 'min', 'max', 'step', 'log', 'options', 'color', 'multiline', 'ro', 'graph', 'kind']
const REF_KEYS = ['label', 'tabs', 'timeit'], FOLDER_KEYS = ['open', 'id'], ACT_KEYS = ['act', 'label'], PICK_KEYS = ['pick', 'fields']
const stray = (o, ok) => Object.keys(o).filter(k => !ok.includes(k))
/** 写进源码的数先去掉浮点噪声（滑块的 step 运算会给出 0.49999999999999994 / 0.35000000000000003）：10 位有效数字 */
const tidy = v => typeof v === 'number' ? Number(v.toPrecision(10)) : Array.isArray(v) ? v.map(tidy) : v

/** 调用栈里第一个不在本文件的帧 → { file: 相对仓库根的路径, line, col }（Chromium：`at … (http://host/gode/x.js:12:7)`；声明脚本用 //# sourceURL 就是真实路径） */
function sloc() {
  for (const l of new Error().stack.split('\n').slice(1)) {
    const m = /(https?:\/\/[^\s()]+?):(\d+):(\d+)\)?\s*$/.exec(l.trim()); if (!m || m[1] === SELF) continue
    return { file: new URL(m[1]).pathname.replace(/^\//, ''), line: +m[2], col: +m[3] }
  }
  return null
}

/** 声明元组 → { v, meta, slots, bad }。按默认值的种类读后面的位置（一参数一行；✎ 靠下标改写，所以位置是约定的一部分）：
 *    数    [默认, 最小, 最大, 标签?, extra?]       只读读数可省区间：[默认, 标签?, { ro: true }]
 *    枚举  [默认, [选项…], 标签?, extra?]          第二项是数组 = 枚举
 *    其余  [默认, 标签?, extra?]                   布尔 / 字符串 / #hex / 向量 / rgb；颜色、多行、只读写在 extra 里
 *  extra = 末尾的普通对象：step log doc fx ro graph color multiline … ；slots = ✎ 能改的下标 */
function parseTuple(t) {
  const bad = [], v = t[0], rest = t.slice(1), extra = isObj(rest.at(-1)) ? rest.pop() : {}, meta = {}, slots = { def: 0 }
  let i = 0
  if (Array.isArray(rest[0]) && !Array.isArray(v)) { meta.options = rest[0]; i = 1 }
  else if (typeof v === 'number' && typeof rest[0] === 'number') {
    if (typeof rest[1] !== 'number') bad.push('数值元组是 [默认, 最小, 最大, 标签?]，最大不是数')
    meta.min = rest[0]; meta.max = rest[1]; slots.min = 1; slots.max = 2; i = 2
  }
  if (rest[i] !== undefined) { if (typeof rest[i] === 'string') meta.label = rest[i++]; else bad.push(`第 ${i + 2} 项要是字符串标签`) }
  if (rest.length > i) bad.push(`元组多出 ${rest.length - i} 项（数 [默认,最小,最大,标签]；枚举 [默认,[选项],标签]；其余 [默认,标签]；别的设置放最后一个对象里）`)
  return { v, meta: { ...meta, ...extra }, slots, bad }
}

/** 一个参数声明的毛病（空 = 没毛病）：值与 meta 推出的控件种类要自洽，区间要能画滑块，未知的 meta 键多半是拼错 */
function vetParam(v, m) {
  if (!isObj(m)) return ['meta 要是对象']
  const bad = [], k = kindOf(v, m), x = stray(m, META_KEYS)
  if (x.length) bad.push(`meta 里不认识的键 ${x}（有：${META_KEYS}）`)
  if (!(k in OK)) return [...bad, `推不出控件种类（值 ${JSON.stringify(v)}；支持 ${Object.keys(OK)}）`]
  if (k === 'enum' && !(Array.isArray(m.options) && m.options.length && new Set(m.options).size === m.options.length)) bad.push('枚举需要非空且不重复的 options')
  else if (!OK[k](v, m)) bad.push(`默认值 ${JSON.stringify(v)} 不符合 ${k}${k === 'hex' ? '（要 #rrggbb）' : k === 'enum' ? '（不在 options 里）' : ''}`)
  if (k === 'num' && (!m.ro || m.graph)) {
    if (!(isNum(m.min) && isNum(m.max) && m.min < m.max)) bad.push('数值需要 min < max（滑块 / 折线用）')
    else {
      if (m.log && !(m.min > 0)) bad.push('log 区间要求 min > 0')
      if (!m.ro && (v < m.min || v > m.max)) bad.push(`默认值 ${v} 在区间 ${m.min}…${m.max} 之外`)
    }
  }
  if (m.step != null && !(isNum(m.step) && m.step > 0)) bad.push('step 要是正数')
  if (m.options && k !== 'enum') bad.push('options 只用于枚举')
  if (m.color && k !== 'hex' && k !== 'rgb') bad.push('color 只用于 #hex 字符串或 rgb 三元数')
  if (m.multiline && k !== 'text') bad.push('multiline 只用于字符串')
  return bad
}

/** 一组行的毛病：记进 err 并跳过那一行；返回通过的行。env = { meta, tables, acts, timeits } */
function vetRows(rows, at, env, err) {
  if (!Array.isArray(rows)) { err(`${at}：rows 要是数组`); return [] }
  const out = [], ids = new Set()
  rows.forEach((r, i) => {
    const bad = m => err(`${at} 第 ${i + 1} 行 ${JSON.stringify(r)?.slice(0, 70)}：${m}`)
    if (!Array.isArray(r)) {
      if (!isObj(r)) return bad('行要是数组，或 { act } / { pick, fields }')
      if ('act' in r) {
        const x = stray(r, ACT_KEYS); if (x.length) return bad(`{ act } 行不认识的键 ${x}`)
        if (typeof r.act !== 'string' || !(r.act.startsWith('/') || r.act in env.acts)) return bad(`动作 ${r.act} 不在 acts 里，也不是 /命令`)
        if (r.label != null && typeof r.label !== 'string') return bad('label 要是字符串')
      } else if ('pick' in r) {
        const x = stray(r, PICK_KEYS); if (x.length) return bad(`{ pick } 行不认识的键 ${x}`)
        const t = env.tables[r.pick]; if (!t) return bad(`表 ${r.pick} 没有登记`)
        if (!Array.isArray(r.fields) || !r.fields.length) return bad('pick 需要非空的 fields')
        const miss = r.fields.filter(f => !t.cols.some(c => c.k === f)); if (miss.length) return bad(`表 ${r.pick} 没有列 ${miss}（有：${t.cols.map(c => c.k)}）`)
      } else return bad('不认识的行：要 { act } 或 { pick, fields }')
      return out.push(r)
    }
    if (isFolder(r)) {
      const [name, sub, o = {}] = r
      if (!plain(name)) return bad('文件夹名不能为空')
      if (!isObj(o) || stray(o, FOLDER_KEYS).length) return bad(`文件夹选项只有 ${FOLDER_KEYS}`)
      const id = o.id ?? plain(name)
      if (ids.has(id)) return bad(`同一层里文件夹 id「${id}」重复（折叠记忆按 id 存；用 { id } 区分）`)
      ids.add(id); return out.push([name, vetRows(sub, `${at} › ${plain(name)}`, env, err), o])
    }
    const [p, o = {}] = r, ps = [p].flat()
    if (!isObj(o)) return bad('第二项（行选项）要是对象')
    const x = stray(o, REF_KEYS); if (x.length) return bad(`行选项不认识的键 ${x}（有：${REF_KEYS}）`)
    if (o.label != null && typeof o.label !== 'string') return bad('label 要是字符串')
    if (!ps.every(q => typeof q === 'string')) return bad('路径要是字符串；vec2 对要是 [路径, 路径]')
    if (Array.isArray(p) && (p.length !== 2 || p[0] === p[1])) return bad('vec2 对要是两个不同的路径')
    const miss = ps.filter(q => !(q in env.meta)); if (miss.length) return bad(`路径 ${miss} 没有登记`)
    if (Array.isArray(p)) {
      const no = ps.filter(q => env.meta[q].kind !== 'num' || env.meta[q].ro)
      if (no.length) return bad(`vec2 对要两个可写的数值，${no} 不是`)
      if (o.tabs != null || o.timeit != null) return bad('vec2 对不支持 tabs / timeit')
    } else {
      const m = env.meta[p]
      if (o.tabs != null && (o.tabs !== true || m.kind !== 'enum')) return bad(`tabs: true 只能给枚举行（${p} 是 ${m.kind}）`)
      if (o.timeit != null && (typeof o.timeit !== 'string' || m.kind !== 'bool')) return bad(`timeit: '名字' 只能给布尔行（${p} 是 ${m.kind}）`)
      if (o.timeit) env.timeits.set(p, o.timeit)
    }
    out.push(r)
  })
  return out
}

export function createCore({ ns, host = {}, tblDir = '', ...conf }) {
  const C = { fpsSettleMs: 2000, fpsSampleMs: 1000, ...conf }
  const ls = makeStore(ns)
  const slot = {}, def = {}, meta = {}, at = {}, defMeta = {}, refs = new Map(), sites = [], topics = {}, tables = {}, acts = {}, pending = [], R = [], timeits = new Map(), errors = []
  const subs = new Set(), pdata = ls.load('gg_presets', {}), cur = ls.load('gg_profile', {}), keep = ls.load('gg_roots', {})
  let sealed = false
  const err = m => errors.push(m)
  const emit = m => { for (const s of subs) s(m) }
  const toast = (msg, bad, to) => emit({ t: 'toast', msg, bad, to })    // to = 该看到它的窗口（'ui' 游戏窗口 / 'panel' 面板页）：谁操作就在谁那里弹，不然两个窗口各弹一个
  const dest = from => from === 'panel' ? 'panel' : 'ui'
  const read = p => { const s = slot[p]; return s.get ? s.get() : s.target[s.key] }
  const snapshot = () => Object.fromEntries(Object.keys(slot).map(p => [p, clone(read(p))]))
  /** 路径 → 当前值的只读视图（核对 / 调试用；写请用 set 或 c_） */
  const vals = new Proxy({}, {
    get: (_, p) => typeof p === 'string' && p in slot ? read(p) : undefined, has: (_, p) => p in slot, ownKeys: () => Object.keys(slot),
    getOwnPropertyDescriptor: (_, p) => p in slot ? { enumerable: true, configurable: true, value: read(p) } : undefined,
  })

  // ── 声明：c_.主题 = { 键: [默认, …] }
  function makeOwner(path, target) {
    const where = 'c_.' + path.join('.'), P = k => '$' + [...path, k].join('.')
    const it = new Proxy({}, { get: (_, k) => typeof k === 'symbol' ? undefined : refFor(P(k)) })
    return new Proxy(target, {
      get(t, k, rcv) {
        if (k === 'it') return it
        if (typeof k === 'symbol' || k in t) return Reflect.get(t, k, rcv)
        if (k === 'then' || k === 'toJSON') return undefined
        throw new Error(`${where}：没有参数 '${k}'（已声明：${Object.keys(t)}）`)
      },
      set(t, k, v) { if (typeof k !== 'string' || !(P(k) in slot)) throw new Error(`${where}：没有参数 '${String(k)}'，不能赋值`); set(P(k), v, 'code'); return true },
      deleteProperty() { throw new Error(`${where}：参数不能删除`) },
      defineProperty() { return false },
    })
  }
  function build(path, lit, where) {
    const target = {}, owner = makeOwner(path, target)
    for (const [k, x] of Object.entries(lit)) {
      const p = '$' + [...path, k].join('.')
      if (Array.isArray(x)) {
        const { v, meta: m, slots, bad } = parseTuple(x); bad.push(...vetParam(v, m))
        for (const b of bad) err(`参数 ${p}：${b}`); if (bad.length) continue
        target[k] = clone(v); slot[p] = { owner, target, key: k }; def[p] = clone(v); meta[p] = { ...m, kind: kindOf(v, m) }
        at[p] = { where, topic: path[0], key: path.slice(1).concat(k).join('.'), slots }
      } else if (isObj(x)) target[k] = build([...path, k], x, where)
      else err(`参数 ${p}：要是 [默认, …] 元组或嵌套对象`)
    }
    return owner
  }
  function declare(topic, lit, where) {
    if (sealed) return err(`c_.${topic}：封存（seal）之后不能再声明`)
    if (topic in topics) return err(`c_.${topic}：声明了两次`)
    if (!isObj(lit)) return err(`c_.${topic}：要赋一个对象 { 键: [默认, …] }`)
    if (where) {                                                       // 同一处语句声明了不止一个主题 = 循环生成，源码里没有各自的字面量
      for (const s of sites) if (s.file === where.file && s.line === where.line && s.col === where.col) s.shared = where.shared = true
      sites.push(where)
    }
    topics[topic] = build([topic], lit, where ?? { shared: true })
  }
  const c_ = new Proxy(topics, {
    get(t, k) {
      if (typeof k === 'symbol' || k in t) return Reflect.get(t, k)
      if (k === 'then' || k === 'toJSON') return undefined
      throw new Error(`c_.${k}：没有这个参数主题（已声明：${Object.keys(t)}）`)
    },
    set(t, k, lit) { declare(String(k), lit, sloc()); return true },
    deleteProperty() { throw new Error('c_：参数主题不能删除') },
  })

  /** Ref：一个 getter 函数，调用即读；r(v) / r(old => v) / r.set(v) 写（同一条 set 路由）；key / owner / path / meta 是只读属性。同一路径总是同一个函数 */
  function refFor(p) {
    let r = refs.get(p); if (r) return r
    const s = slot[p]; if (!s) throw new Error(`没有参数 ${p}`)
    r = (...a) => { if (!a.length) return read(p); set(p, typeof a[0] === 'function' ? a[0](read(p)) : a[0], 'code'); return read(p) }
    r.set = v => { set(p, v, 'code'); return r }
    Object.defineProperties(r, { key: { value: s.key }, owner: { value: s.owner }, path: { value: p }, meta: { get: () => meta[p] } })
    refs.set(p, r); return r
  }
  /** 把一个带 key + owner 的 getter（帧对象的 Fps.sunDir 之类）登记成只读 Ref，每 1000/hz 毫秒采样，变了就推 changed */
  function watch(ref, { path, hz = 4, ...m } = {}) {
    if (sealed) return err('watch：封存（seal）之后不能再登记')
    if (typeof ref !== 'function' || ref.key == null) return err(`watch：第一个参数要是带 key / owner 的 getter（Ref），收到 ${typeof ref}`)
    if (typeof path !== 'string' || !path) return err(`watch(${ref.key})：要 { path: '$主题.键' }`)
    if (path in slot) return err(`参数 ${path}：登记了两次`)
    const v = ref(), m2 = { ...m, ro: true }, bad = vetParam(v, m2)
    for (const b of bad) err(`参数 ${path}：${b}`); if (bad.length) return
    slot[path] = { owner: ref.owner, key: ref.key, get: ref }; def[path] = clone(v); meta[path] = { ...m2, kind: kindOf(v, m2) }
    let last = clone(v)
    setInterval(() => { const x = ref(); if (!eq(x, last)) { last = clone(x); emit({ t: 'changed', from: 'code', d: { [path]: x } }) } }, 1000 / hz)
  }

  const scopePaths = scope => scopePathsOf(R, meta, scope)?.filter(p => !meta[p].ro)   // 只读项不参与预设 / 恢复 / 改动判断
  function set(path, v, from = 'code') {
    const s = slot[path], m = meta[path]
    if (!s) return tblSet(path, v, from) || toast(`没有这个参数：${path}`, true, dest(from))
    if (!s.target) return toast(`${path} 是只读读数，不能写`, true, dest(from))
    if (!OK[m.kind](v, m)) return toast(`${path}：值 ${JSON.stringify(v)} 不合法（${m.kind}）`, true, dest(from))
    if (eq(s.target[s.key], v)) return
    s.target[s.key] = clone(v); emit({ t: 'changed', from, d: { [path]: s.target[s.key] } })
    if (!m.ro) host.set?.(path, v, m)                                        // 只读项是游戏往面板推的读数，不回头通知游戏
    if (timeits.has(path)) timeit(path)
  }
  /** R6：切换前取 1 s 的中位数，等 2 s 稳定，再取 1 s */
  function timeit(path) {
    const before = host.fps?.(C.fpsSampleMs); if (!before) return
    setTimeout(() => { const a = host.fps(C.fpsSampleMs); emit({ t: 'perf', path, fps: a.fps - before.fps, gpu: a.gpu - before.gpu }) }, C.fpsSettleMs + C.fpsSampleMs)
  }
  function range(path, min, max, from = 'code') {
    const m = meta[path]; if (m?.kind !== 'num' || !(min < max)) return toast('区间不合法', true, dest(from))
    m.min = min; m.max = max; emit({ t: 'meta', path, meta: m })
  }

  // ── 表：路径 blk.:sand.gravity = 表.行 id.字段。表与 <tblDir>/<表>.tsv 挂钩：文件是基线，面板里的改动是叠加层（行 / 字段级「已改动」），
  //   ✎ 写回 = 序列化整张表经开发服务器 PUT；文件被外面改了（编辑器 / 另一个窗口写回）→ 没改过的行跟着新文件走，改过的行保留
  const dirtyOf = (t, row) => { const b = t.base.get(row.id), d = {}; for (const c of t.cols) if (!b || b[c.k] !== row[c.k]) d[c.k] = b ? b[c.k] : null; return d }
  function tbl(name, { q = '', from = 0, n = 50 } = {}) {
    const t = tables[name], hits = t.rows.filter(r => matches(q, r.id, r.name))
    return { t: 'tbl', name, q, from, cols: t.cols, file: t.file, total: hits.length, dirty: t.rows.filter(r => Object.keys(dirtyOf(t, r)).length).length, rows: hits.slice(from, from + n).map(r => ({ ...r, __d: dirtyOf(t, r) })) }
  }
  function tblSet(path, v, from) {
    const m = /^([^.]+)\.(.+)\.([^.]+)$/.exec(path), t = m && tables[m[1]], row = t?.rows.find(r => r.id === m[2]), col = t?.cols.find(c => c.k === m[3])
    if (!row || !col) return false
    row[col.k] = v; emit({ t: 'tbl_change', name: m[1], from, id: row.id, d: dirtyOf(t, row) }); host.set?.(path, v, {}); return true
  }
  /** revert：还原一行（id）或整张表；write：序列化整张表写回 tsv */
  async function tblop(op, name, id, from = 'code') {
    const t = tables[name]; if (!t) return
    const to = dest(from)
    if (op === 'revert') {
      for (const row of t.rows) if (!id || row.id === id) { const b = t.base.get(row.id); if (b) Object.assign(row, b) }
      emit({ t: 'tbl_change', name, from: 'code' })
    } else if (op === 'write') {
      if (!t.file) return toast(`表 ${name} 没有 tsv 文件（createCore 的 tblDir）`, true, to)
      if (!t.rows.some(r => Object.keys(dirtyOf(t, r)).length)) return toast(`${t.file} 没有改动`, false, to)
      try { const w = await putFile(t.file, () => tsvStringify(t)); toast(w.ok ? `已写回 ${t.file}` : `写回失败 ${w.status}：${w.text}`, !w.ok, to) }
      catch (e) { toast(`写回失败：${e.message}（没连开发服务器？）`, true, to) }
    }
  }
  async function reloadTables(only) {
    for (const [n, t] of Object.entries(tables)) {
      if (!t.file || (only && only !== t.file)) continue
      try {
        const text = await getText(t.file); if (text == null) continue
        const fresh = tsvParse(text), old = new Map(t.rows.map(x => [x.id, x]))
        t.cols = fresh.cols
        t.rows = fresh.rows.map(f => { const o = old.get(f.id); return o && Object.keys(dirtyOf(t, o)).length ? o : f })   // 没改过的跟文件走，改过的保留
        t.base = new Map(fresh.rows.map(x => [x.id, { ...x }]))
        emit({ t: 'tbl_change', name: n, from: 'file' })
      } catch {}
    }
  }

  // ── 预设（profile）：scope = 'root' 或 'root/文件夹 id/…'；每个 scope 有「当前预设」cur[scope]（'' = 默认）。写入只在这里（单一写者）
  //   行上的黄点、↺ 恢复、头部的 dirty 都以当前预设为基线：没选预设时基线 = 默认值（= 源码里声明的字面量）
  const snap = ps => Object.fromEntries(ps.map(p => [p, clone(read(p))]))
  const base = (p, scope) => pdata[scope]?.[cur[scope]]?.[p] ?? def[p]
  const pushPresets = scope => { ls.save('gg_presets', pdata); ls.save('gg_profile', cur); emit({ t: 'presets', scope, cur: cur[scope] ?? '', data: pdata[scope] ?? {} }) }
  function preset(op, scope, name, from = 'code', to) {
    const T = (m, bad) => toast(m, bad, dest(from)), ps = scopePaths(scope); if (!ps) return T(`没有这个范围：${scope}`, true)
    const S = pdata[scope] ??= {}
    if (op === 'save') {                                             // ＋：不问名字，#1 #2…
      let n = 1; while (`#${n}` in S) n++; S[`#${n}`] = snap(ps); cur[scope] = `#${n}`; pushPresets(scope); T(`已保存为 #${n}`)
    } else if (op === 'overwrite') {
      if (!cur[scope]) return T('当前没有选中的预设', true); S[cur[scope]] = snap(ps); pushPresets(scope); T(`已覆盖「${cur[scope]}」`)
    } else if (op === 'rename') {                                    // －：改名；名字留空 = 删除
      if (!(name in S)) return
      if (!to) { delete S[name]; if (cur[scope] === name) cur[scope] = ''; T(`已删除「${name}」`) }
      else if (to !== name) { if (to in S) return T(`已有叫「${to}」的预设`, true); S[to] = S[name]; delete S[name]; if (cur[scope] === name) cur[scope] = to }
      pushPresets(scope)
    } else if (op === 'apply') {
      cur[scope] = name && S[name] ? name : ''; for (const p of ps) set(p, clone(base(p, scope))); pushPresets(scope)
    } else if (op === 'copy') {
      const d = Object.fromEntries(ps.filter(p => !eq(read(p), def[p])).map(p => [p, read(p)]))
      if (!Object.keys(d).length) return T('这个范围相对默认没有改动')
      emit({ t: 'copy', from, text: '&json=' + encodeURIComponent(JSON.stringify(d)) })
    } else if (op === 'write') writeDefaults(ps, from)
  }
  /** ↺：回到当前预设（没有就回默认）。path 给了就只恢复这一项（scope 仍是它所在文件夹，决定基线） */
  function reset(scope, path, from = 'code') { const ps = path ? [path] : scopePaths(scope); if (ps) for (const p of ps) set(p, clone(base(p, scope)), from) }

  /** ✎ 落盘：当前值（和改过的区间）≠ 源码里的字面量的，按 caller sloc 改写那条 c_.X = {…}（经开发服务器 POST /__dev/patch，s16 §13.4）。
   *  同一条声明的多处修改合成一次请求；共用 sloc（循环生成）的、只读读数、表行跳过并说明。成功后源码即新默认：def / 区间基线随之更新，页面不重载（devlink.mute） */
  async function writeDefaults(ps, from = 'code') {
    const groups = new Map(), skipped = []
    for (const p of ps) {
      const s = slot[p], a = at[p]; if (!s?.target || !a) continue
      const m = meta[p], edits = []
      if (!eq(s.target[s.key], def[p])) edits.push({ p, key: a.key, idx: a.slots.def, old: def[p], value: tidy(clone(s.target[s.key])) })
      if (m.kind === 'num' && a.slots.min != null) for (const f of ['min', 'max']) if (m[f] !== defMeta[p][f]) edits.push({ p, key: a.key, idx: a.slots[f], old: defMeta[p][f], value: tidy(m[f]), f })
      if (!edits.length) continue
      if (a.where.shared || !a.where.file) { skipped.push(p); continue }
      const k = `${a.where.file}:${a.where.line}:${a.where.col}`
      ;(groups.get(k) ?? groups.set(k, { where: a.where, topic: a.topic, edits: [] }).get(k)).edits.push(...edits)
    }
    let done = 0; const fail = []
    for (const g of groups.values()) {
      try {
        const w = await patchDecl(g.where.file, { line: g.where.line, col: g.where.col, topic: g.topic, edits: g.edits.map(({ key, idx, old, value }) => ({ key, idx, old, value })) })
        if (!w.ok) { fail.push(`c_.${g.topic}：${w.text || w.status}`); continue }
        done += g.edits.length
        for (const e of g.edits) {                                       // 源码即新默认；当前值也换成写进源码的那个数（去掉噪声），不然黄点永远不灭
          if (e.f) defMeta[e.p][e.f] = meta[e.p][e.f] = e.value
          else { def[e.p] = clone(e.value); slot[e.p].target[slot[e.p].key] = clone(e.value) }
        }
      } catch (e) { fail.push(`c_.${g.topic}：${e.message}（没连开发服务器？）`) }
    }
    if (done) emit({ t: 'schema', schema: schema() })
    const files = [...new Set([...groups.values()].map(g => g.where.file.split('/').pop()))], msg = []
    if (done) msg.push(`已改写 ${files} 里的 ${done} 处字面量`)
    if (skipped.length) msg.push(`${skipped.length} 项不是单独的 c_.X = {…} 字面量（循环 / 计算出来的），没落盘：${skipped.slice(0, 3)}${skipped.length > 3 ? '…' : ''}`)
    if (fail.length) msg.push(`失败：${fail[0]}${fail.length > 1 ? `（另有 ${fail.length - 1} 处）` : ''}`)
    toast(msg.join('；') || '没有需要落盘的改动', fail.length > 0 || (!done && skipped.length > 0), dest(from))
  }

  function home(id, to, from = 'code') {
    const r = R.find(x => x.id === id); if (!r) return
    if (!to) return r.home
    if (!HOMES.includes(to)) return toast(`归属 ${to} 不对（${HOMES.join(' / ')}）`, true, dest(from))
    r.home = to; keep[id] = to; ls.save('gg_roots', keep); emit({ t: 'schema', schema: schema() }); return to
  }
  function act(a, edge = 'tap', from = 'code') {
    if (a.startsWith('/')) return host.cmd?.(a)
    if (!acts[a]) return toast(`没有这个动作：${a}`, true, dest(from))
    host.act?.(a, edge)
  }
  const schema = () => ({ roots: R, meta, vals: snapshot(), def, pdata, cur, acts })

  /** 声明脚本跑完以后调一次：校验面板行、封存声明、读 tsv。返回的 promise 在表读完后 resolve */
  async function seal() {
    if (sealed) return
    sealed = true
    for (const [n, t] of Object.entries(tables)) if (!Array.isArray(t?.cols) || !Array.isArray(t?.rows)) { err(`表 ${n}：要有 cols 和 rows`); delete tables[n] }
    const env = { meta, tables, acts, timeits }
    for (const r of pending) {
      const id = r.id ?? plain(r.title ?? '')
      if (!r.title) { err('root 需要 title'); continue }
      if (R.some(x => x.id === id)) { err(`root ${id}：id 重复`); continue }
      if (r.home && !HOMES.includes(r.home)) err(`root ${r.title}：home ${r.home} 不是 ${HOMES.join(' / ')}`)
      R.push({ id, title: r.title, home: [keep[id], r.home].find(h => HOMES.includes(h)) ?? 'game:pause', rows: vetRows(r.rows ?? [], r.title, env, err) })
    }
    for (const [n, t] of Object.entries(tables)) { t.file = tblDir ? `${tblDir}/${n}.tsv` : ''; t.base = new Map(t.rows.map(r => [r.id, { ...r }])) }
    for (const p in meta) if (meta[p].kind === 'num') defMeta[p] = { min: meta[p].min, max: meta[p].max }   // 区间的出厂值（= 源码里的字面量）
    if (errors.length) console.error(`[pane] ${errors.length} 处声明有问题（已跳过）：\n  ` + errors.join('\n  '))
    await reloadTables()
  }

  /** gg：声明脚本里用的另一半（照 s09 §9 的 gg.pane(root, rows, { home })） */
  const api = {
    pane(title, rows, o = {}) { if (sealed) err(`pane ${title}：封存（seal）之后不能再登记`); else pending.push({ title, rows, ...o }) },
    table(name, spec) { if (sealed) err(`table ${name}：封存（seal）之后不能再登记`); else tables[name] = spec },
    acts(map) { if (sealed) err('acts：封存（seal）之后不能再登记'); else Object.assign(acts, map) },
    watch,
  }
  return {
    ns, c_, api, ref: refFor, vals, def, meta, tables, roots: R, errors, get: p => p in slot ? read(p) : undefined, set, on(f) { subs.add(f); return () => subs.delete(f) }, emit,
    act, range, preset, reset, home, tbl, schema, reloadTables, tblop, toast, timeitPaths: timeits, seal,
  }
}
