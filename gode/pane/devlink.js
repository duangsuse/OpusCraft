// gode/pane/devlink.js —— 与开发服务器（gode/tools/dev.js，s16 §13.4）的全部往来：SSE 热更新、带 ETag 的 PUT 写回。
//   允许耦合 dev server，所以集中在这一个文件，别处不出现 /__dev。要写哪个文件、要监听哪些路径都由页面传入，这里不认任何具体文件名。
const DEV = '/__dev'
const quiet = new Map()
/** 接下来 ms 毫秒里这个路径的变更事件不触发热更新：自己写回的文件，页面不该因此重载（重载会丢掉别的参数当前的改动） */
export const mute = (path, ms = 3000) => quiet.set(path, Date.now() + ms)

/** rules = [[路径正则, 'reload' | (path, ev) => void]]，第一条匹配的生效。没有 EventSource 就不监听 */
export function hot(rules) {
  if (!window.EventSource) return null
  const es = new EventSource(`${DEV}/events`)
  es.onmessage = e => {
    let ev; try { ev = JSON.parse(e.data) } catch { return }
    if (quiet.get(ev.path) > Date.now()) return
    for (const [re, act] of rules) if (re.test(ev.path)) { act === 'reload' ? location.reload() : act(ev.path, ev); return }
  }
  return es
}

/** 写回 path（相对仓库根，dev.js 只收 defl/ 下的 .tsv / .json）。body = 字符串，或 (现有文本 | null) => 字符串。
 *  带读到的 ETag（If-Match），新建带 If-None-Match: *；别处先改过（409）就强制覆盖：✎ 是用户明确的动作，最后写入者赢。 */
export async function putFile(path, body) {
  const r = await fetch('/' + path, { cache: 'no-store' }), etag = r.ok ? r.headers.get('etag') : null
  const text = typeof body === 'function' ? body(r.ok ? await r.text() : null) : body
  const send = f => fetch(`${DEV}/write?path=${path}${f}`, { method: 'PUT', headers: etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }, body: text })
  let w = await send(''); if (w.status === 409) w = await send('&force=1')
  return { ok: w.ok, status: w.status, text: w.ok ? '' : await w.text() }
}

/** 读一个文本文件（不走缓存）；不存在返回 null */
export async function getText(path) {
  const r = await fetch('/' + path, { cache: 'no-store' }); return r.ok ? r.text() : null
}

/** ✎ 落盘：改源码里 `c_.<topic> = {…}` 的字面量（dev.js 的 POST /__dev/patch，tools/decl.js 校验）。
 *  spec = { line, col, topic, edits: [{ key, idx, old, value }] }；对不上整体拒绝（409）。返回 { ok, status, text: 失败原因 } */
export async function patchDecl(path, spec) {
  mute(path)
  const w = await fetch(`${DEV}/patch?path=${path}`, { method: 'POST', body: JSON.stringify(spec) })
  const j = await w.json().catch(() => ({}))
  return { ok: w.ok, status: w.status, text: j.error ?? '' }
}
