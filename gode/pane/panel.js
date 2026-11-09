// gode/pane/panel.js —— 独立面板页的启动：配对串 → Web Locks（同一时刻只开一个，s09 §10.3）→ 协议客户端 → 窗口外壳。
//   ns（存储键前缀）与配对码都来自 URL 片段 #k=…&ns=…（游戏窗口的 popOut / 内嵌 iframe 自动带上），所以这个页面不认游戏，也不认 mock。
import { $, makeCtx } from './view.js'
import { mountPanelWindow } from './shell-panel.js'
import { link, pairOf } from './chan.js'
import { hot } from './devlink.js'

const app = document.getElementById('app'), sleep = ms => new Promise(r => setTimeout(r, ms))
const mem = { get: () => { try { return sessionStorage['pane.pair'] } catch {} }, set: v => { try { sessionStorage['pane.pair'] = v } catch {} } }   // 本页自己的引导：刷新后沿用配对串（每个窗口各一份，不是应用数据）

/** 全屏提示层：一段字 + 可选的输入框 / 按钮 */
const overlay = (text, ...kids) => { const d = $('div', 'pair'); d.append($('div', '', text), ...kids); document.body.append(d); return d }

let pair = pairOf(location.hash) || pairOf(mem.get())
if (!pair) pair = await new Promise(ok => {
  const i = $('input'); i.placeholder = 'k=…&ns=…'; i.autofocus = true
  const d = overlay('粘贴游戏窗口给的配对串（#k=配对码&ns=前缀）', i)
  i.onkeydown = e => { if (e.key !== 'Enter') return; const p = pairOf(i.value); if (p) { d.remove(); ok(p) } else i.select() }
})
mem.set(pair.hash); history.replaceState(null, '', '#' + pair.hash)      // 刷新后沿用；不进历史

const ctx = makeCtx({}, 'panel', pair.ns), shell = mountPanelWindow(app, ctx, { code: pair.code })
const msg = ctx.msg; ctx.msg = m => { msg(m); if (m.t === 'schema') shell.ready() }
hot([[/^gode\/(pane\/|panel\.html)/, 'reload']]); window.ctx = ctx
if (parent !== window) addEventListener('keydown', e => { if (e.code === 'F3') { e.preventDefault(); parent.postMessage({ gode: 'F3' }, location.origin) } })   // 内嵌时 F3 交给游戏窗口

// ── 单例：Web Locks。拿到锁就一直持有到页面关闭；steal 时旧持有者的 request 以 AbortError 结束（gone 随之 resolve）
const name = `${pair.ns}pane-panel`
function hold(opts) {
  let lost; const gone = new Promise(r => lost = r)
  const got = new Promise(ok => navigator.locks.request(name, opts, lock => { ok(!!lock); return lock ? new Promise(() => {}) : undefined }).catch(() => lost()))
  return { got, gone }
}
let net = null
function run(h) {                                                          // 开始工作：连游戏窗口；被接管就收线、变灰、提示
  net = link(ctx, pair); ctx.io = net.io; app.classList.remove('gone')
  h?.gone.then(() => { net.close(); app.classList.add('gone'); busy('已被另一个面板页接管（同一时刻只开一个面板页）') })
}
function busy(text) {
  const b = $('button', '', '接管'), d = overlay(text, b)
  b.onclick = async () => { const h = hold({ steal: true }); await h.got; d.remove(); run(h) }
}
if (!navigator.locks) run(null)                                            // 没有 Web Locks（非安全上下文）：不限制
else {
  let h = null
  for (let i = 0; i < 8 && !h; i++) { const x = hold({ ifAvailable: true }); if (await x.got) h = x; else await sleep(250) }   // 重试 ~2 s：游戏窗口刚摘掉内嵌面板 / 旧面板页刚关，锁释放要一点时间
  h ? run(h) : busy('已有另一个面板页（同一时刻只开一个）')
}
