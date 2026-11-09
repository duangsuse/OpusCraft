// gode/pane/view.js —— 面板的视图层，游戏窗口与独立面板页共用（s09 §6、§9）。只认 Schema + io，不认游戏。
//   makeCtx(io, name, ns) → ctx：Schema 的本地镜像（vals / meta / presets），msg(GameMsg) 进、io.* 出；ns = 存储键前缀，页面传入
//   RootView：一个 root 的 Tweakpane（文件夹、预设头、tabs 链接、vec2、pick、右键菜单、已改动标记、timeit 徽标）
//   presetBar / Search：预设头、全局搜索（参数 / 表行）。两个页面的外壳在 shell-game.js / shell-panel.js
import { Pane } from '../../vendor/npm/tweakpane.js'
import { firstEmoji, plain, matches, score, makeStore, eq, isFolder, lastKey, scopePathsOf } from './lib.js'

export const $ = (tag, cls = '', txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e }
export const icon = t => firstEmoji(t) ?? [...plain(t)][0] ?? '·'
export function toast(msg, bad) {
  const t = $('div', 'toast' + (bad ? ' bad' : ''), msg); document.body.append(t); setTimeout(() => t.remove(), bad ? 4500 : 2200)
}
function menu(ev, items) {
  document.querySelector('.ctxmenu')?.remove()
  const m = $('div', 'ctxmenu'); m.style.left = Math.min(ev.clientX, innerWidth - 200) + 'px'; m.style.top = Math.min(ev.clientY, innerHeight - 40 * items.length - 20) + 'px'
  for (const it of items) { const b = $('button', '', it.label); b.onclick = () => { if (it.form) { m.replaceChildren(it.form(() => m.remove())) } else { m.remove(); it.fn() } }; m.append(b) }
  document.body.append(m)
  const off = e => { if (!m.contains(e.target) || e.type === 'keydown') { m.remove(); removeEventListener('pointerdown', off, true); removeEventListener('keydown', off, true) } }
  setTimeout(() => { addEventListener('pointerdown', off, true); addEventListener('keydown', off, true) })
}

// ── ctx
export function makeCtx(io, name, ns) {
  const store = makeStore(ns)                                      // ns 缺了就抛：存储键前缀由页面传入
  const ctx = {
    io, name, store, schema: null, vals: {}, def: {}, meta: {}, pdata: {}, cur: {}, perf: {}, views: new Set(), alive: true, panelUp: false, index: [],
    folds: store.load(`gg_fold.${name}`, {}),
    fold: (k, d) => ctx.folds[k] ?? d,
    setFold(k, v) { ctx.folds[k] = v; store.save(`gg_fold.${name}`, ctx.folds) },
    each(f) { for (const v of [...ctx.views]) if (!v.dead) f(v) },
    load(schema) {
      const s = structuredClone(schema)                            // 游戏窗口里 schema 是登记处的活对象，视图只拿副本（面板页本来就是消息克隆）
      Object.assign(ctx, { schema: s, vals: s.vals, def: s.def, meta: s.meta, pdata: s.pdata, cur: s.cur })
      ctx.index = buildIndex(schema); ctx.each(v => v.render?.())
    },
    /** 某路径在 scope 里的基线：当前预设里的值，没选预设就是默认值（黄点 / ↺ / dirty 都以它为准） */
    base: (p, scope) => ctx.pdata[scope]?.[ctx.cur[scope]]?.[p] ?? ctx.def[p],
    set(p, v) { ctx.vals[p] = v; ctx.io.set(p, v); ctx.each(x => x.refresh?.([p])) },
    setAlive(b) { ctx.alive = b; ctx.each(v => v.alive?.(b)) },
    msg(m) {
      switch (m.t) {
        case 'schema': ctx.load(m.schema); break
        case 'changed': if (m.from !== name) { Object.assign(ctx.vals, m.d); ctx.each(v => v.refresh?.(Object.keys(m.d))) } break
        case 'meta': ctx.meta[m.path] = m.meta; ctx.each(v => v.render?.()); break
        case 'presets': ctx.pdata[m.scope] = m.data; ctx.cur[m.scope] = m.cur; ctx.each(v => v.presets?.(m.scope)); ctx.each(v => v.refresh?.()); break
        case 'perf': ctx.perf[m.path] = m; ctx.each(v => v.perfed?.(m.path)); break
        case 'tbl_change': ctx.each(v => v.tbl?.(m.name, m)); break
        case 'copy': if (m.from === name || !m.from) navigator.clipboard?.writeText(m.text).then(() => toast('已复制：' + m.text.slice(0, 60) + (m.text.length > 60 ? '…' : '')), () => prompt('复制失败，手动复制：', m.text)); break
        case 'toast': if ((m.to ?? 'ui') === name) toast(m.msg, m.bad); break          // 谁操作谁看到；没写 to = 游戏窗口
        case 'panel': ctx.panelUp = m.up; ctx.each(v => v.panel?.()); break
      }
    },
  }
  return ctx
}

/** 搜索索引：参数（标签 / 路径 / doc / 所在文件夹）+ pick 行引用的表 */
function buildIndex(schema) {
  const out = { refs: [], tbls: [] }
  const walk = (rows, root, chain, names) => {
    for (const r of rows) {
      if (!Array.isArray(r)) { if (r.pick) out.tbls.push({ name: r.pick, root, chain, names }); continue }
      if (isFolder(r)) { walk(r[1], root, [...chain, r[2]?.id ?? plain(r[0])], [...names, r[0]]); continue }
      for (const p of [r[0]].flat()) { const m = schema.meta[p]; out.refs.push({ kind: 'ref', path: p, label: (r[1]?.label && !Array.isArray(r[0]) ? r[1].label : m.label) ?? lastKey(p), doc: m.doc ?? '', root, chain, names }) }
    }
  }
  for (const r of schema.roots) walk(r.rows, { id: r.id, title: r.title, home: r.home }, [r.id], [])
  return out
}
function searchRefs(ctx, q, n = 60) {
  return ctx.index.refs.filter(h => matches(q, h.label, h.path, h.doc, h.names.join(' ')))
    .map(h => [score(q, h.label, h.path), h]).sort((a, b) => b[0] - a[0]).slice(0, n).map(x => x[1])
}

/** 预设头：[选择 ▾] [＋] [－] [↺]。选择框底部放低频项（覆盖当前、复制 &json=、落盘默认）。＋ = 直接存成 #1 #2…；－ = 重命名当前预设（留空 = 删除）；↺ = 回到当前预设。
 *  scope = root id 或 root/文件夹 id。返回 view（登记在 ctx.views：presets 重填、refresh 更新 dirty；destroy 摘掉） */
const ACT = { over: '\u0001over', copy: '\u0001copy', write: '\u0001write' }
export function presetBar(ctx, scope) {
  const el = $('div', 'pp'), sel = $('select'), io = ctx.io, paths = () => scopePathsOf(ctx.schema.roots, ctx.vals, scope) ?? []
  const view = { el, dead: false,
    destroy() { view.dead = true; ctx.views.delete(view) },
    presets() { fill() }, render() { fill() },
    refresh() { el.classList.toggle('dirty', paths().some(p => !ctx.meta[p].ro && !eq(ctx.vals[p], ctx.base(p, scope)))) } }
  function fill() {
    const cur = ctx.cur[scope] ?? ''; sel.replaceChildren(new Option('（默认）', ''))
    for (const n of Object.keys(ctx.pdata[scope] ?? {})) sel.add(new Option(n, n))
    const sep = new Option('──────', '-'); sep.disabled = true; sel.add(sep)
    sel.add(new Option('💾 覆盖当前预设', ACT.over)); sel.add(new Option('⎘ 复制改动为 &json=', ACT.copy)); sel.add(new Option('✎ 落盘到源码', ACT.write))
    sel.value = cur; view.refresh()
  }
  sel.title = '预设（profile）：黄点与 ↺ 都以它为基线'
  sel.onchange = () => {
    const v = sel.value; sel.value = ctx.cur[scope] ?? ''
    if (v === ACT.over) io.preset('overwrite', scope)
    else if (v === ACT.copy) io.preset('copy', scope)
    else if (v === ACT.write) { if (confirm('把这里的当前值（和改过的区间）改写进源码里的 c_ 声明？\n不是单独字面量的（循环 / 计算出来的）会跳过。')) io.preset('write', scope) }
    else io.preset('apply', scope, v)
  }
  const btn = (t, tip, fn) => { const b = $('button', '', t); b.title = tip; b.onclick = fn; el.append(b) }
  el.append(sel)
  btn('＋', '把当前值存成新预设（#1 #2…）', () => io.preset('save', scope))
  btn('－', '重命名当前预设（留空 = 删除）', () => { const n = ctx.cur[scope]; if (!n) return toast('先在左边选一个预设', true); const to = prompt(`重命名「${n}」（留空 = 删除）`, n); if (to !== null) io.preset('rename', scope, n, to.trim()) })
  btn('↺', '恢复：回到当前预设（没选预设 = 默认值）', () => io.reset(scope))
  ctx.views.add(view); fill(); return view
}

// ── 一个 root 的视图
export class RootView {
  constructor(ctx, el, id) { Object.assign(this, { ctx, el, id, dead: false, reg: new Map(), folders: new Map(), marks: [], syncs: [], picks: [], pbars: [], tabEls: [], pf: new Map() }); ctx.views.add(this); this.render() }
  destroy() { this.dead = true; this.ctx.views.delete(this); this.pbars.forEach(b => b.destroy()); this.pane?.dispose() }
  render() {
    if (this.dead) return
    this.pane?.dispose(); this.el.replaceChildren()
    for (const k of ['reg', 'folders', 'pf']) this[k].clear(); this.marks = []; this.syncs = []; this.picks = []; this.pbars.forEach(b => b.destroy()); this.pbars = []
    const root = this.ctx.schema?.roots.find(r => r.id === this.id); if (!root) return
    this.pane = new Pane({ container: this.el })
    this.rows(this.pane, root.rows, [root.id], root.id)
    this.refresh()
  }
  refresh() {
    if (this.dead || !this.pane) return
    this.pane.refresh(); for (const s of this.syncs) s()
    const { vals, base } = this.ctx, ctx = this.ctx
    for (const { paths, el, sc } of this.marks) el.classList.toggle('chg', paths.some(p => !ctx.meta[p].ro && !eq(vals[p], base(p, sc))))
    for (const a of this.el.querySelectorAll('.tabs a')) a.classList.toggle('on', vals[a.dataset.p] === a.dataset.v)
  }
  perfed(path) {
    const el = this.pf.get(path), m = this.ctx.perf[path]; if (!el || !m) return
    el.textContent = `${m.fps >= 0 ? '+' : ''}${m.fps.toFixed(1)} fps`; el.className = 'pf ' + (m.fps >= 0 ? 'up' : 'down'); el.title = `前后 1 s 中位数之差：fps ${m.fps.toFixed(1)}，gpu ${m.gpu.toFixed(2)} ms`
  }
  tbl(name, m) { for (const p of this.picks) if (p.name === name) p.change(m, m.from === this.ctx.name) }

  /** sc = 这些行归属的预设范围（最近的、有预设头的文件夹，否则 root）：黄点与 ↺ 的基线由它的当前预设定 */
  rows(f, rows, chain, sc) {
    for (const r of rows) {
      if (!Array.isArray(r)) r.act ? this.act(f, r) : this.pick(f, r, chain)
      else if (isFolder(r)) this.folder(f, r, chain, sc)
      else if (Array.isArray(r[0])) this.pair(f, r[0], r[1] ?? {}, chain, sc)
      else this.ref(f, r[0], r[1] ?? {}, chain, sc)
    }
  }
  folder(f, [name, rows, o = {}], chain, sc) {
    const c = [...chain, o.id ?? plain(name)], key = c.join('/')
    const fd = f.addFolder({ title: name, expanded: this.ctx.fold(key, o.open ?? false) })
    fd.on('fold', e => this.ctx.setFold(key, e.expanded)); this.folders.set(key, fd)
    const bar = rows.some(r => !isFolder(r) && !r.act)
    if (bar) { const b = presetBar(this.ctx, key), s = this.slot(fd); s.querySelector('.tp-lblv_v').replaceChildren(b.el); this.pbars.push(b) }
    this.rows(fd, rows, c, bar ? key : sc)
  }
  /** 占一行的空白格：用 Tweakpane 自己的 blade 占位，行序才对；返回行元素 */
  slot(f, label) {
    const b = f.addBlade({ view: 'text', label: label ?? '', parse: v => v, value: '' }), el = b.element
    if (label == null) { el.querySelector('.tp-lblv_l')?.remove(); el.classList.add('tp-lblv-nol') }
    return el
  }
  hook(el, paths, chain, sc) {
    const { ctx } = this
    el.title = paths.map(p => p + (ctx.meta[p].doc ? ' — ' + ctx.meta[p].doc : '')).join('\n')
    for (const p of paths) this.reg.set(p, { el, chain })
    this.marks.push({ paths, el, sc })
    el.addEventListener('contextmenu', e => {
      e.preventDefault(); const items = []
      for (const p of paths) {
        const m = ctx.meta[p], tag = paths.length > 1 ? `${m.label ?? lastKey(p)}：` : ''
        if (m.kind === 'num' && !m.ro) items.push({ label: tag + '区间 min / max…', form: close => rangeForm(ctx, p, close) })
        items.push({ label: tag + '⎘ 复制为 &json=', fn: () => ctx.io.preset('copy', p) }, { label: tag + '↺ 恢复（当前预设）', fn: () => ctx.io.reset(sc, p) })
      }
      menu(e, items)
    })
  }
  ref(f, path, o, chain, sc) {
    const { ctx } = this, m = ctx.meta[path], label = o.label ?? m.label ?? lastKey(path), vec = n => ({ get v() { const a = ctx.vals[path]; return n === 2 ? { x: a[0], y: a[1] } : { x: a[0], y: a[1], z: a[2] } }, set v(q) { ctx.set(path, n === 2 ? [q.x, q.y] : [q.x, q.y, q.z]) } })
    const T = { get v() { return ctx.vals[path] }, set v(x) { ctx.set(path, x) } }
    let b, el
    switch (m.kind) {
      case 'num':
        if (m.ro) b = f.addBinding(T, 'v', { label, readonly: true, interval: 250, ...(m.graph && { view: 'graph', min: m.min, max: m.max }) })
        else if (m.log) el = this.logRow(f, path, label)
        else b = f.addBinding(T, 'v', { label, min: m.min, max: m.max, step: m.step })
        break
      case 'bool': b = f.addBinding(T, 'v', { label }); break
      case 'enum': b = f.addBinding(T, 'v', { label, options: Object.fromEntries(m.options.map(x => [x, x])) }); break
      case 'hex': b = f.addBinding(T, 'v', { label, view: 'color' }); break
      case 'rgb': b = f.addBinding({ get v() { const a = ctx.vals[path]; return { r: a[0], g: a[1], b: a[2] } }, set v(c) { ctx.set(path, [c.r, c.g, c.b]) } }, 'v', { label, view: 'color', color: { type: 'float' } }); break
      case 'str': b = f.addBinding(T, 'v', { label, readonly: !!m.ro }); break
      case 'text': el = this.textRow(f, path, label); break
      case 'vec2': b = f.addBinding(vec(2), 'v', { label }); break
      case 'vec3': b = f.addBinding(vec(3), 'v', { label }); break
      default: throw new Error(`pane: ${path} 的控件种类 ${m.kind} 不认识`)
    }
    el ??= b.element; this.hook(el, [path], chain, sc)
    if (o.timeit) { const pf = $('span', 'pf', '⏱'); el.querySelector('.tp-lblv_l')?.append(pf); this.pf.set(path, pf); b?.on('change', () => { pf.textContent = '⏱…'; pf.className = 'pf' }); this.perfed(path) }
    if (o.tabs && f !== this.pane && m.options) this.tabs(f, path, m)
  }
  logRow(f, path, label) {
    const { ctx } = this, m = ctx.meta[path], el = this.slot(f, label), r = $('input'), n = $('input', 'num'), lo = Math.log(m.min), hi = Math.log(m.max)
    r.type = 'range'; r.min = 0; r.max = 1000; n.type = 'number'; n.step = 'any'
    r.oninput = () => ctx.set(path, +Math.exp(lo + (hi - lo) * r.value / 1000).toPrecision(4))
    n.onchange = () => { const v = +n.value; if (Number.isFinite(v) && v > 0) ctx.set(path, v) }
    this.syncs.push(() => { const v = ctx.vals[path]; r.value = Math.round((Math.log(Math.max(v, m.min)) - lo) / (hi - lo) * 1000); if (document.activeElement !== n) n.value = v })
    const box = $('div', 'logrow'); box.append(r, n); el.querySelector('.tp-lblv_v').replaceChildren(box); return el
  }
  textRow(f, path, label) {
    const { ctx } = this, m = ctx.meta[path], el = this.slot(f, label), ta = $('textarea'); ta.rows = 4; ta.readOnly = !!m.ro
    ta.onchange = () => ctx.set(path, ta.value)
    this.syncs.push(() => { if (document.activeElement !== ta) ta.value = ctx.vals[path] })
    el.querySelector('.tp-lblv_v').replaceChildren(ta); return el
  }
  /** R3：两个相关键并成一格。拖动区永远是 -1…+1 的方块（小格子里任何一对键都能拖到头），再按各自的区间映射到真实值；两个输入框直接写真实值，↑↓ 手调一个步长 */
  pair(f, [a, c], o, chain, sc) {
    const { ctx } = this, ma = ctx.meta[a], mb = ctx.meta[c], el = this.slot(f, o.label ?? `${ma.label ?? lastKey(a)}→${mb.label ?? lastKey(c)}`)
    const pad = $('div', 'pad'), dot = $('i'), ix = $('input'), iy = $('input'), box = $('div', 'vec2'), col = $('div', 'ins')
    const toN = (v, m) => (v - m.min) / (m.max - m.min) * 2 - 1, fromN = (n, m) => { const v = m.min + (n + 1) / 2 * (m.max - m.min), st = m.step; return +(st ? Math.round(v / st) * st : v).toPrecision(6) }
    for (const [i, m] of [[ix, ma], [iy, mb]]) { i.type = 'number'; i.step = m.step ?? 'any'; i.min = m.min; i.max = m.max }
    pad.append(dot, $('b', 'h'), $('b', 'v')); col.append(ix, iy); box.append(pad, col); el.querySelector('.tp-lblv_v').replaceChildren(box)
    const clamp = n => Math.max(-1, Math.min(1, n))
    const setN = (nx, ny) => { const x = fromN(nx, ma), y = fromN(ny, mb); if (x !== ctx.vals[a]) ctx.set(a, x); if (y !== ctx.vals[c]) ctx.set(c, y) }
    const drag = e => { const r = pad.getBoundingClientRect(); setN(clamp((e.clientX - r.left) / r.width * 2 - 1), clamp(1 - (e.clientY - r.top) / r.height * 2)) }
    pad.onpointerdown = e => { pad.setPointerCapture(e.pointerId); drag(e); pad.onpointermove = drag }
    pad.onpointerup = () => { pad.onpointermove = null }
    ix.onchange = () => Number.isFinite(+ix.value) && ctx.set(a, +ix.value); iy.onchange = () => Number.isFinite(+iy.value) && ctx.set(c, +iy.value)
    this.syncs.push(() => {
      dot.style.left = (clamp(toN(ctx.vals[a], ma)) + 1) * 50 + '%'; dot.style.top = (1 - clamp(toN(ctx.vals[c], mb))) * 50 + '%'
      if (document.activeElement !== ix) ix.value = ctx.vals[a]; if (document.activeElement !== iy) iy.value = ctx.vals[c]
    })
    // 点名字：弹出一个大的浮动拖动板（同样 -1…+1，只是把拖动范围放大；不创建控件，随时再点名字 / 点外面 / Esc 收起）
    const lab = el.querySelector('.tp-lblv_l'); lab.classList.add('lk'); lab.title = '点名字：放大拖动板'
    lab.onclick = () => {
      const old = document.querySelector('.bigpad'); old?.remove(); if (old && old.__for === el) return lab.classList.remove('open')
      const big = $('div', 'bigpad'), bp = $('div', 'pad'), bd = $('i'); big.__for = el; bp.append(bd, $('b', 'h'), $('b', 'v')); big.append($('div', 'cap', `${lab.textContent}　-1 … +1`), bp)
      const rl = lab.getBoundingClientRect(); big.style.left = Math.max(8, Math.min(rl.left, innerWidth - 232)) + 'px'; big.style.top = Math.min(rl.bottom + 4, innerHeight - 250) + 'px'
      const show = () => { bd.style.left = (clamp(toN(ctx.vals[a], ma)) + 1) * 50 + '%'; bd.style.top = (1 - clamp(toN(ctx.vals[c], mb))) * 50 + '%' }
      const move = e => { const r = bp.getBoundingClientRect(); setN(clamp((e.clientX - r.left) / r.width * 2 - 1), clamp(1 - (e.clientY - r.top) / r.height * 2)); show() }
      bp.onpointerdown = e => { try { bp.setPointerCapture(e.pointerId) } catch {} move(e); bp.onpointermove = move }; bp.onpointerup = () => { bp.onpointermove = null }
      const sync = () => { if (!big.isConnected) return this.syncs.splice(this.syncs.indexOf(sync), 1); show() }; this.syncs.push(sync)
      const off = ev => { if (ev.type === 'keydown' ? ev.key === 'Escape' : !big.contains(ev.target) && ev.target !== lab) { big.remove(); lab.classList.remove('open'); removeEventListener('pointerdown', off, true); removeEventListener('keydown', off, true) } }
      document.body.append(big); lab.classList.add('open'); show(); setTimeout(() => { addEventListener('pointerdown', off, true); addEventListener('keydown', off, true) })
    }
    this.hook(el, [a, c], chain, sc)
  }
  act(f, r) {
    const a = this.ctx.schema.acts[r.act], b = f.addButton({ title: r.label ?? a?.label ?? r.act })
    b.element.title = a?.keys ? `键：${a.keys}` : r.act; b.on('click', () => this.ctx.io.act(r.act, 'tap'))
  }
  /** R7：枚举行的前 3 项在文件夹标题行显示成链接，折叠着也能点 */
  tabs(fd, path, m) {
    const title = fd.element.querySelector('.tp-fldv_t'); if (!title) return
    const box = title.querySelector('.tabs') ?? title.appendChild($('span', 'tabs'))
    for (const v of m.options.slice(0, 3)) {
      const a = $('a', '', v); a.dataset.p = path; a.dataset.v = v; a.title = `${m.label ?? lastKey(path)} = ${v}`
      a.onclick = e => { e.preventDefault(); e.stopPropagation(); this.ctx.set(path, v) }; box.append(a)
    }
  }
  /** pickLib（R5）：先划选表里的一行（可搜索），再改它的字段。表与 defl/<表>.tsv 挂钩：行 / 字段带「已改动」点（相对 tsv），
   *  ✎ 写回 tsv、↺ 还原此行 / 全部；tsv 被外面改了会自动重取（没改过的行跟文件走） */
  pick(f, r, chain) {
    const { ctx } = this, name = r.pick, el = this.slot(f, null), box = $('div', 'pick'), top = $('div', 'tb'), inp = $('input'), list = $('ul'), fields = $('div', 'fields'), info = $('div', 'info')
    const fileEl = $('span', 'file'), cnt = $('span', 'cnt'), bAll = $('button', '', '↺ 全部'), bWrite = $('button', '', '✎ 写回 tsv')
    bAll.title = '丢弃这张表所有未写回的改动'; bWrite.title = '把整张表写回 tsv（经开发服务器）'
    top.append(fileEl, cnt, bAll, bWrite); inp.placeholder = `搜索 ${name}…`; box.append(top, inp, list, fields, info); el.querySelector('.tp-lblv_v').replaceChildren(box)
    let cols = [], rows = [], sel = null, total = 0, dirty = 0, seq = 0, ctl = {}
    const nd = row => Object.keys(row?.__d ?? {}).length
    const marks = () => {
      cnt.textContent = dirty ? `${dirty} 行改动` : 'tsv 已同步'; cnt.classList.toggle('chg', !!dirty); bAll.disabled = bWrite.disabled = !dirty
      ;[...list.children].forEach((li, i) => { const row = rows[i], n = nd(row); li.classList.toggle('chg', !!n); li.querySelector('em').textContent = n ? ` ✎${n}` : '' })
      const row = rows.find(x => x.id === sel); for (const [k, c] of Object.entries(ctl)) { const was = row?.__d && k in row.__d; c.lab.classList.toggle('chg', !!was); c.lab.title = was ? `tsv 里是 ${row.__d[k]}` : '' ; c.rev.hidden = !nd(row) }
    }
    const fetchRows = async () => { const n = ++seq, res = await ctx.io.tbl(name, { q: inp.value, from: 0, n: 40 }); if (n !== seq || this.dead) return; cols = res.cols; rows = res.rows; total = res.total; dirty = res.dirty; fileEl.textContent = res.file; fileEl.title = res.file; draw() }
    const draw = () => {
      list.replaceChildren(...rows.map(row => { const li = $('li', row.id === sel ? 'on' : '', row.id); li.append($('small', '', ' ' + (row.name ?? '')), $('em')); li.onclick = () => { sel = row.id; draw() }; return li }))
      info.textContent = total > rows.length ? `${rows.length} / ${total}（输入关键字缩小）` : `${total} 行`
      fields.replaceChildren(); ctl = {}; const row = rows.find(x => x.id === sel); if (!row) return marks()
      for (const k of r.fields) {
        const col = cols.find(c => c.k === k); if (!col) continue
        const w = $('label'), lab = $('span', '', k); w.append(lab); let i
        if (col.type === 'bool') { i = $('input'); i.type = 'checkbox'; i.checked = row[k]; i.onchange = () => put(k, i.checked) }
        else if (col.type === 'hex') { i = $('input'); i.type = 'color'; i.value = row[k]; i.oninput = () => put(k, i.value) }
        else if (col.type === 'num') { i = $('input'); i.type = 'number'; i.step = col.step ?? 'any'; if (col.min != null) i.min = col.min; if (col.max != null) i.max = col.max; i.value = row[k]; i.onchange = () => Number.isFinite(+i.value) && put(k, +i.value) }
        else { i = $('input'); i.value = row[k]; i.onchange = () => put(k, i.value) }
        w.append(i); fields.append(w); ctl[k] = { lab, i }
      }
      const rev = $('button', 'rev', '↺ 还原此行'); rev.onclick = () => ctx.io.tblop('revert', name, sel); fields.append(rev); for (const c of Object.values(ctl)) c.rev = rev
      marks()
    }
    const put = (k, v) => { const row = rows.find(x => x.id === sel); row[k] = v; ctx.set(`${name}.${sel}.${k}`, v) }
    inp.oninput = fetchRows
    bWrite.onclick = () => ctx.io.tblop('write', name); bAll.onclick = () => confirm(`丢弃 ${name} 表里全部未写回的改动？`) && ctx.io.tblop('revert', name)
    this.picks.push({
      name, el,
      /** 表变了：自己改的（带 id / d）只更新标记，不重建输入框（取色器拖动中不能重画）；别处 / 文件来的整页重取 */
      change: (m, own) => { const row = own && m.id && rows.find(x => x.id === m.id); if (!row) return fetchRows(); const was = nd(row); row.__d = m.d; dirty += (nd(row) > 0) - (was > 0); marks() },
      show: id => { inp.value = id; sel = id; fetchRows() },
    })
    this.reg.set(`${name}.*`, { el, chain }); fetchRows()
  }
  /** 搜索命中跳转：展开文件夹链、滚到并高亮 */
  reveal(hit) {
    let el, chain
    if (hit.kind === 'tbl') { const p = this.picks.find(x => x.name === hit.tbl); if (!p) return; p.show(hit.id); el = p.el; chain = hit.chain }
    else { const e = this.reg.get(hit.path); if (!e) return; el = e.el; chain = e.chain }
    for (let i = 2; i <= chain.length; i++) { const fd = this.folders.get(chain.slice(0, i).join('/')); if (fd) fd.expanded = true }
    requestAnimationFrame(() => { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600) })
  }
}
function rangeForm(ctx, path, close) {
  const m = ctx.meta[path], f = $('form', 'rangeform'), a = $('input'), b = $('input'), ok = $('button', '', '确定')
  for (const [i, v] of [[a, m.min], [b, m.max]]) { i.type = 'number'; i.step = 'any'; i.value = v }
  f.append($('span', '', `${m.label ?? lastKey(path)}`), a, $('span', '', '…'), b, ok)
  f.onsubmit = e => { e.preventDefault(); ctx.io.range(path, +a.value, +b.value); close() }
  setTimeout(() => a.focus()); return f
}

// ── 全局搜索（P-12）
export class Search {
  constructor(ctx, el, go) {
    Object.assign(this, { ctx, el, go, hits: [], sel: 0, seq: 0, dead: false })
    this.input = $('input', 'sq'); this.input.placeholder = '搜索参数 / 路径 / 说明 / 表行…（忽略 emoji、大小写；词首字母也行）'
    this.list = $('ul', 'hits'); this.hint = $('div', 'hint'); el.append(this.input, this.list, this.hint)
    this.input.oninput = () => this.run()
    this.input.onkeydown = e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.sel = Math.max(0, Math.min(this.hits.length - 1, this.sel + (e.key === 'ArrowDown' ? 1 : -1))); this.draw() }
      else if (e.key === 'Enter' && this.hits[this.sel]) go(this.hits[this.sel])
      else if (e.key === 'Escape') { e.preventDefault(); this.onEsc?.() }
    }
    ctx.views.add(this)
  }
  render() { this.run() }
  refresh() {}
  destroy() { this.dead = true; this.ctx.views.delete(this) }
  focus() { this.input.focus(); this.input.select() }
  async run() {
    const { ctx } = this, q = this.input.value, n = ++this.seq
    this.hits = q.trim() ? searchRefs(ctx, q) : []; this.sel = 0; this.draw()
    if (!q.trim()) return
    for (const t of ctx.index.tbls) {
      const res = await ctx.io.tbl(t.name, { q, n: 8 }); if (n !== this.seq || this.dead) return
      for (const row of res.rows) this.hits.push({ kind: 'tbl', path: `${t.name}.${row.id}`, label: row.id, doc: row.name ?? '', root: t.root, chain: t.chain, names: t.names, tbl: t.name, id: row.id })
      this.draw()
    }
  }
  draw() {
    const { ctx } = this
    this.list.replaceChildren(...this.hits.map((h, i) => {
      const li = $('li', i === this.sel ? 'on' : ''); li.append($('span', 'k', h.kind === 'tbl' ? '▤' : '◆'), $('b', '', h.label), $('i', '', h.path), $('small', '', [icon(h.root.title) + ' ' + plain(h.root.title), ...h.names.map(plain)].join(' › ') + (ctx.schema.roots.find(r => r.id === h.root.id)?.home === 'panel' ? '' : '')))
      li.onpointerdown = e => { e.preventDefault(); this.go(h) }; li.onmousemove = () => { if (this.sel !== i) { this.sel = i; [...this.list.children].forEach((x, j) => x.classList.toggle('on', j === i)) } }
      return li
    }))
    this.list.children[this.sel]?.scrollIntoView({ block: 'nearest' })
    this.hint.textContent = this.input.value.trim() ? (this.hits.length ? '↑↓ 选，Enter 跳转，Esc 退出' : '没有命中') : `共 ${ctx.index.refs.length} 个参数、${ctx.index.tbls.length} 张表可搜`
  }
}
