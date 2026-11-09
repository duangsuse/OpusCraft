// gode/pane/chan.js —— 独立窗口协议的两端（PanelMsg ↔ GameMsg，flow/pane.ts，s09 §10）：同一份版本号、同一套 channel 名、同一张消息表。
//   serve(core, { ns, panelUrl })  游戏窗口一侧：把 core 的 GameMsg 转发到 BroadcastChannel，把 PanelMsg 交给 core。返回 { code, pair, popOut, panelUrl }
//   link(ctx, { code })            面板页一侧：io 与游戏窗口里的 io 同形，视图层分不出区别。返回 { io, close, got }
//   pairOf(str)                    从 URL 片段 / 粘贴串解出 { code, ns, hash }
// channel 名带配对码：同源 Worker 也能 new BroadcastChannel，名字猜不到就冒充不了面板页（P-14）；码放在 URL 片段里，Worker 读不到。
// 游戏窗口刷新后面板页怎么知道：心跳和 schema 都带 epoch（每次 serve() 一个新随机数）；面板页见到陌生 epoch 就当手里的 schema 过期，重新 hello。
import { makeStore } from './lib.js'

export const V = 1
const CONF = { channel: 'gode-pane', batchMs: 16, beatMs: 1000 }
const rand = () => Math.random().toString(36).slice(2, 8)

/** '#k=码&ns=前缀'（或不带 #）→ { code, ns, hash }；缺哪个都返回 null */
export function pairOf(s) {
  const p = new URLSearchParams(String(s ?? '').trim().replace(/^#/, '')), code = p.get('k'), ns = p.get('ns')
  return code && ns ? { code, ns, hash: new URLSearchParams({ k: code, ns }).toString() } : null
}

export function serve(core, { ns, panelUrl, ...conf }) {
  const c = { ...CONF, ...conf }, ls = makeStore(ns)
  if (!panelUrl) throw new TypeError('pane: serve 需要页面传入 panelUrl（独立面板页的地址）')
  const code = (() => { try { return sessionStorage[ls.key('pane_code')] ??= rand() } catch { return rand() } })()
  const epoch = rand(), ch = new BroadcastChannel(`${c.channel}:${code}`), pair = new URLSearchParams({ k: code, ns }).toString()
  let up = false, n = 0, timer = 0, q = { game: {}, panel: {} }
  const send = m => ch.postMessage(m)
  const wire = m => m.t === 'schema' ? { ...m, e: epoch, schema: { v: V, ...m.schema } } : m
  const setUp = b => { if (b !== up) { up = b; core.emit({ t: 'panel', up }) } }
  const flush = () => { timer = 0; for (const from of ['game', 'panel']) if (Object.keys(q[from]).length) send({ t: 'changed', from, d: q[from] }); q = { game: {}, panel: {} } }
  core.on(m => {
    if (m.t === 'changed') { Object.assign(q[m.from === 'panel' ? 'panel' : 'game'], m.d); timer ||= setTimeout(flush, c.batchMs) }
    else if (m.t === 'copy') { if (m.from === 'panel') send(m) }
    else if (m.t === 'toast') { if (m.to === 'panel') send(m) }                    // 只转发给「操作发生在面板页」的 toast；游戏窗口的 toast 面板页不重复弹
    else if (m.t !== 'tbl' && m.t !== 'panel') send(m.t === 'tbl_change' ? { ...m, from: m.from === 'panel' ? 'panel' : 'game' } : wire(m))
  })
  ch.onmessage = ({ data: m }) => {
    switch (m.t) {
      case 'hello': if (m.v !== V) return send({ t: 'toast', msg: `协议版本不符：面板页 ${m.v}，游戏 ${V}`, bad: true, to: 'panel' }); setUp(true); send(wire({ t: 'schema', schema: core.schema() })); break
      case 'set': core.set(m.path, m.v, 'panel'); break
      case 'act': core.act(m.act, m.edge, 'panel'); break
      case 'range': core.range(m.path, m.min, m.max, 'panel'); break
      case 'preset': core.preset(m.op, m.scope, m.name, 'panel', m.to); break
      case 'reset': core.reset(m.scope, m.path, 'panel'); break
      case 'home': core.home(m.root, m.to, 'panel'); break
      case 'tbl': if (core.tables[m.name]) send(core.tbl(m.name, m)); break
      case 'tblop': core.tblop(m.op, m.name, m.id, 'panel'); break
      case 'bye': setUp(false); break
    }
  }
  setInterval(() => send({ t: 'beat', n: ++n, e: epoch, ms: c.beatMs }), c.beatMs)
  addEventListener('pagehide', () => send({ t: 'gone' }))
  send({ t: 'beat', n: 0, e: epoch, ms: c.beatMs })                        // 启动完成立刻亮一次心跳：已经开着的面板页见到陌生 epoch 会重新 hello → 拿新 schema，游戏侧也因此知道面板页在线（s09 §10.3）
  const url = () => `${new URL(panelUrl, location.href).href}#${pair}`
  return {
    code, pair, panelUrl: url,
    /** 「↗ 独立窗口」：popup 特性避免开成标签页把游戏页挂后台；命名目标避免重复窗口；被拦返回 false */
    popOut: () => !!window.open(url(), `${c.channel}-win`, 'popup,width=440,height=800'),
  }
}

export function link(ctx, { code, ...conf }) {
  const c = { ...CONF, ...conf }, ch = new BroadcastChannel(`${c.channel}:${code}`), pend = new Map()
  let seq = 0, q = {}, timer = 0, last = 0, epoch = null, ms = c.beatMs
  const post = m => ch.postMessage(m)
  const tkey = (name, o) => `${name}|${o.q ?? ''}|${o.from ?? 0}`
  const io = {
    set(path, v) { q[path] = v; timer ||= setTimeout(() => { timer = 0; for (const [p, x] of Object.entries(q)) post({ t: 'set', path: p, v: x, seq: ++seq }); q = {} }, c.batchMs) },
    act: (act, edge) => post({ t: 'act', act, edge }),
    range: (path, min, max) => post({ t: 'range', path, min, max }),
    preset: (op, scope, name, to) => post({ t: 'preset', op, scope, name, to }),
    reset: (scope, path) => post({ t: 'reset', scope, path }),
    home: (root, to) => post({ t: 'home', root, to }),
    tblop: (op, name, id) => post({ t: 'tblop', op, name, id }),
    tbl: (name, o = {}) => new Promise(ok => { const k = tkey(name, o); (pend.get(k) ?? pend.set(k, []).get(k)).push(ok); post({ t: 'tbl', name, ...o }) }),
  }
  const hello = () => post({ t: 'hello', v: V })
  ch.onmessage = ({ data: m }) => {
    last = performance.now()
    if (m.t === 'tbl') { const k = tkey(m.name, m); for (const f of pend.get(k) ?? []) f(m); pend.delete(k) }
    else if (m.t === 'gone') ctx.setAlive(false)
    else if (m.t === 'beat') { ms = m.ms ?? ms; if (m.e !== epoch) { ctx.setAlive(false); hello() } else ctx.setAlive(true) }   // 陌生 epoch：游戏窗口重启过，手里的 schema 过期了；同一个 epoch 的心跳 = 活着（节流后恢复也靠它）
    else if (m.t === 'schema') { epoch = m.e; ctx.msg(m); ctx.setAlive(true) }
    else if (epoch != null) ctx.msg(m)                                                                 // 没有 schema 之前的零散消息没有可应用的对象
  }
  hello()
  const iv = setInterval(() => { if (epoch == null) hello(); else if (performance.now() - last > 3 * ms) ctx.setAlive(false) }, c.beatMs)   // 还没拿到 schema 就重发 hello；3 个心跳没动静就变灰
  addEventListener('pagehide', () => post({ t: 'bye' }))
  return { io, close() { clearInterval(iv); post({ t: 'bye' }); ch.close() }, got: () => epoch != null }
}
