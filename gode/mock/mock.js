// gode/mock/mock.js —— 游戏窗口的替身：一张 canvas + 事件日志 + 任务栏 / 停靠（用 mock 参数测面板 UIUX）。不是游戏，只是让参数有点可看的反应。
//   所有「这是哪个页面」的信息都在这里传给 gode/pane/*：存储键前缀 ns、落盘文件、表目录、独立面板页地址；pane/ 里没有 mock 的名字
import { createCore } from '../pane/core.js'
import { serve } from '../pane/chan.js'
import { makeCtx } from '../pane/view.js'
import { mountGame } from '../pane/shell-game.js'
import { hot } from '../pane/devlink.js'

const NS = 'mock.'

const $ = id => document.getElementById(id)
const log = (s, cls = '') => { const d = document.createElement('div'); d.className = cls; d.textContent = `${(performance.now() / 1000).toFixed(1)}  ${s}`; $('log').prepend(d); while ($('log').children.length > 40) $('log').lastChild.remove() }

// ── 假帧率：每帧记「真实帧间隔 + 开关的代价」，host.fps(ms) 取最近 ms 的中位数（所以 timeit 能看出差）。
//    代价是查表加上去的（TAA 6 ms、焦散 3 ms…），不在主线程上空转：空转 9–18 ms 会默认占掉一半主线程，还和同源的内嵌面板 iframe 抢同一个线程（滑块卡）；
//    而且空转不到一帧时 rAF 仍被 vsync 锁在 60，单开一个开关根本量不出差。每帧记的是当时的代价，所以切换前后两个窗口的中位数才不同
const cost = () => (Gl.taa ? 6 : 0) + (Water.caustics ? 3 : 0) + (Ctl.timeit ? 5 : 0) + (Fog.godrays ? 4 : 0)
//    记录放在定长环形缓冲里（时间戳 / 帧时间两个 Float64Array）：帧被调得再勤也是 O(1)、不分配对象。原来是数组 push + shift，窗口里攒过约 1.6 万项后 V8 的 shift 退化成整段搬移（F12 里 L65 跑满）
const RING = 1024, ft = new Float64Array(RING), fd = new Float64Array(RING); let fi = 0, fn = 0
const host = {
  paused: false,
  fps(ms) { const now = performance.now(), a = []; for (let k = 1; k <= fn; k++) { const i = (fi - k + RING) % RING; if (now - ft[i] >= ms) break; a.push(fd[i]) } a.sort((x, y) => x - y); const dt = a[a.length >> 1] ?? 16.7; return { fps: 1000 / dt, gpu: dt } },
  set(path, v, m) { log(`set ${path} = ${JSON.stringify(v)}${m.fx ? '  → fx:' + m.fx : ''}`, m.fx ? 'fx' : ''); },
  act(a) { log(`act ${a}`, 'act'); if (a === 'pause') { host.paused = !host.paused; $('app').classList.toggle('paused', host.paused) } if (a === 'regen') log('重生成视野…', 'fx') },
  cmd(c) { log(`命令 ${c}`, 'act'); const m = /^\/time (\d+)/.exec(c); if (m) c_.Time.hour = +m[1] },
}
const core = createCore({ ns: NS, host, tblDir: 'gode/defl' })
const { c_ } = core

// ── 帧对象（rgl/pass.js 的 setFrame(F) / Fps / Fpv 的形状）：F 本身 = Fpv（F.x 是立即值），Fps.x = 带 key + owner 的命名引用（getter）。面板把 Fps.x 登记成只读读数，按 hz 采样
const F = { fps: 60, pos: '' }, fps = new Map()
const Fps = new Proxy({}, { get: (_, k) => { let r = fps.get(k); if (!r) { r = () => F[k]; r.key = k; r.owner = F; fps.set(k, r) } return r } })

// ── 声明脚本：照 s16 的写法，gg / c_ 作为形参注入，不写 export / import。//# sourceURL 让调用栈里是真实路径 + 行:列（✎ 落盘靠它定位）
async function runScript(path, scope) {
  const src = await (await fetch('/' + path, { cache: 'no-store' })).text()
  ;(0, eval)(`(function (${Object.keys(scope)}) {${src}\n})\n//# sourceURL=${location.origin}/${path}`)(...Object.values(scope))
}
await runScript('gode/mock/data.js', { c_, gg: core.api })
core.api.watch(Fps.fps, { path: '$Stat.fps', label: 'fps', min: 0, max: 120, graph: true })
core.api.watch(Fps.pos, { path: '$Stat.pos', label: '位置' })
await core.seal()
const net = serve(core, { ns: NS, panelUrl: '/gode/panel.html' }); window.core = core; window.net = net      // 自测 / 控制台用
core.on(m => { if (m.t === 'panel') log(m.up ? '独立面板页已连上' : '独立面板页断开', 'act') })

const ctx = makeCtx({
  set: (p, v) => core.set(p, v, 'ui'), act: (a, e) => core.act(a, e), range: (p, a, b) => core.range(p, a, b),
  preset: (op, scope, name, to) => core.preset(op, scope, name, 'ui', to), reset: (s, p) => core.reset(s, p), home: (r, to) => core.home(r, to),
  tbl: (n, o) => Promise.resolve(core.tbl(n, o)), tblop: (op, n, id) => core.tblop(op, n, id),
}, 'ui', NS)
core.on(m => ctx.msg(m))
mountGame($('app'), ctx, { popOut: net.popOut, panelUrl: net.panelUrl })
ctx.load(core.schema())
if (core.errors.length) { core.errors.forEach(e => log(e, 'bad')); core.toast(`面板声明有 ${core.errors.length} 处问题，已跳过（console / core.errors）`, true) }
log(`F3 开关面板层；手动打开 panel.html 时粘贴配对串 ${net.pair}`)
hot([
  [/^gode\/(pane\/|mock\/|mock\.html)/, 'reload'],
  [/^gode\/defl\/[^/]+\.tsv$/, f => { core.reloadTables(f); log(`${f} 变了，已热重载`, 'fx') }],
])

// ── canvas
const { Time, Sky, Sun, Cam, Weather, Cloud, Fog, Gl, Water, Ctl } = c_      // owner 表（活的）：拼错键直接抛错，不会悄悄变成 NaN
const cv = $('cv'), g = cv.getContext('2d'); let last = performance.now(), fpsAcc = 0
const hex2 = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
function frame(now) {
  const dt = now - last; last = now; ft[fi] = now; fd[fi] = dt + cost(); fi = (fi + 1) % RING; if (fn < RING) fn++
  const w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight, hr = Time.hour
  const day = Math.max(0, Math.sin((hr - 6) / 24 * Math.PI * 2)), [r, gg, b] = hex2(Sky.tint)
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, `rgb(${r * day + 10},${gg * day + 10},${b * day + 30})`); gr.addColorStop(1, `rgb(${200 * day + 20},${190 * day + 20},${170 * day + 25})`)
  g.fillStyle = gr; g.fillRect(0, 0, w, h)
  const a = (hr - 6) / 24 * Math.PI * 2, sx = w / 2 - Math.cos(a) * w * .4 + Sun.azOff * 3, sy = h * .9 - Math.sin(a) * h * .8 - Sun.elOff * 4
  g.fillStyle = '#ffe9a0'; g.beginPath(); g.arc(sx, sy, 22 * 70 / Cam.fov, 0, 7); g.fill()
  if (Weather.state !== '晴') { g.strokeStyle = 'rgba(180,200,255,.5)'; for (let i = 0; i < 80; i++) { const x = (i * 97 + now * .4) % w, y = (i * 53 + now * .9) % h; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 12); g.stroke() } }
  g.fillStyle = `rgba(255,255,255,${Cloud.cover * .5})`; for (let i = 0; i < 6; i++) g.fillRect((i * 220 + now * .02 * Cloud.speed) % (w + 200) - 100, 60 + i * 18, 160, 22)
  if (Fog.morning > 0) { g.fillStyle = `rgba(220,225,235,${Fog.morning * .6})`; g.fillRect(0, 0, w, h) }
  g.fillStyle = '#2a3a22'; g.fillRect(0, h * .78, w, h * .22)
  if (now - fpsAcc > 250) { fpsAcc = now; const f = host.fps(1000); F.fps = Math.round(f.fps); F.pos = `${hr.toFixed(1)}h · ${Weather.state}`; $('fps').textContent = `${f.fps.toFixed(0)} fps · ${f.gpu.toFixed(1)} ms${host.paused ? ' · 暂停' : ''}` }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
addEventListener('keydown', e => { if (e.code === 'Escape' && !e.defaultPrevented) core.act('pause') })
