#!/usr/bin/env node
/**
 * dev — gode 的开发服务器：取代 `http-server -p 8765 -c 1`（gode/s16-module.md §13.4，kernel.ts 的 DevEvent / HOT）。
 * 零依赖，Node ≥ 20。不再是单纯的静态页：文件一改，页面就能热更新；面板的「✎ 写回」也走它。
 *
 * 用法  node gode/tools/dev.js [-p 8765] [--host 0.0.0.0] [--root <仓库根>] [-c 1] [--debounce 200] [--defl gode/defl] [-q|-v]
 *   -c N    Cache-Control: max-age=N（同 http-server：-c 1 = 一秒；-c -1 = no-cache）。默认 1
 *   -q / -v 静默（只打印启动与错误）/ 详细（每个请求一行）。默认只打印文件事件与写回
 *   环境变量 DEV_PORT 同 -p
 *
 * 端点（仓库根 = 服务根；路径都是相对仓库根、用 /）
 *   GET  /*                  静态。目录有 index.html 就给它，没有就列目录（同 http-server）；支持 ETag / 304 / Range；带点的路径段（.git 等）一律 404；
 *                            绑 0.0.0.0（手机测触屏要走局域网，局域网上的页面也收得到热更新）
 *   GET  /__dev/events       SSE。默认事件 = 一个 DevEvent JSON { path, kind: 'change'|'add'|'unlink', t }；另有两种命名事件：
 *                              hello  每次连上发一次 { epoch, seq, t }；
 *                              reset  服务器重启过（epoch 变了）或掉线太久（环形缓冲溢出）：页面应当全部重新检查一遍。
 *                            每条带 id: <epoch>:<seq>，断线重连时浏览器自动带 Last-Event-ID，服务器补发漏掉的；15 s 心跳 `: ping`
 *   PUT  /__dev/write?path=  面板写回。只收本机（127.0.0.1 / ::1，且 Host 是 localhost）；只写 <defl>/ 下的 .tsv .json（拒绝 .. 、点段、符号链接）；
 *                            .json 必须能 JSON.parse；原子写（临时文件 + rename）；最大 4 MB。
 *                            并发保护：改已有文件要带 If-Match（= 你读到它时的 ETag），新建要带 If-None-Match: *；别处先改过 → 409 并给当前 ETag；
 *                            两个头都没有 → 428；?force=1 跳过检查。成功返回 200 { path, etag, size }
 *   POST /__dev/patch?path=  面板 ✎ 落盘：改 JS 源码里的参数声明 `c_.X = { k: [默认, 最小, 最大, 标签] }`（gode/pane 的 core.js 登记时取 caller sloc）。
 *                            body { line, col, topic, edits: [{ key, idx, old, value }] }；只收本机；只改 gode/ 下的 .js（不含 gode/tools/、gode/vendor/）；
 *                            line:col 必须正好是 `c_.<topic> =` 的 `=`，旧值必须是字面量且等于 old，新值由服务端从 JSON 值生成字面量（见 decl.js）；
 *                            对不上整体拒绝（409，文件没动）；原子写。不要 If-Match：是否改过由「旧值核对」判断，比 ETag 更严。成功 200 { path, etag, size, changed }
 *   GET  /__dev/ls?dir=      列 <defl>/ 与其子目录（JSON 数组，目录带 /，跳过点开头的）
 *   GET  /__dev/info         { name:'gode-dev', pid, ... }：gd 用它区分「这是 dev.js」还是「端口上是别的静态服务」
 *   POST /t   GET /agg       性能投送与聚合（goal-panify §4 的 perf-collect 并进来）。/t 收 JSON / JSONL，追加到 --perf 文件（默认 gode/shots/perf-collect.jsonl）；
 *                            /agg 按 path 聚合：{ path: { n, topic, from, to, fps, gpu, t } }，fps / gpu = 各记录的中位数（记录里的 fps / gpu 约定为前后差）
 *
 * 监听：自己遍历目录、每个目录一个 fs.watch（排除点开头的段、node_modules、gode/shots/、tools/out/、编辑器临时文件），所以不会被截图和构建产物刷屏；
 *   新目录自动加入。同一路径在 --debounce 毫秒内的多次写合并成一个事件（编辑器保存常是多次写）；kind 靠「已知文件集」判断，所以「写临时文件再 rename 覆盖」
 *   这种原子保存报的是 change，不是 add。
 *
 * 也可以当库用：import { createDev } from './dev.js'（返回 { server, hub, listen, close }）。
 */
import { createServer } from 'node:http';
import { watch, createReadStream, readdirSync, statSync, lstatSync, realpathSync, mkdirSync, writeFileSync, renameSync, unlinkSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, relative, extname, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchDecl, PatchError } from './decl.js';

//// Lib ///////////////////////////////////////////////////////////////
// 与具体业务无关的通用件：不得引用下方 App 段的任何变量。

const MIME = {
  '.html': 'text/html', '.htm': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.tsv': 'text/tab-separated-values', '.csv': 'text/csv', '.txt': 'text/plain', '.md': 'text/markdown', '.ts': 'text/plain', '.glsl': 'text/plain', '.xz': 'text/plain',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.avif': 'image/avif',
  '.wasm': 'application/wasm', '.zip': 'application/zip', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm',
};
const TEXTY = /^(text\/|application\/json$|image\/svg\+xml$)/;
const mimeOf = f => { const t = MIME[extname(f).toLowerCase()] ?? 'application/octet-stream'; return TEXTY.test(t) ? t + '; charset=utf-8' : t; };
/** 弱 ETag：大小 + 毫秒 mtime。面板读到文件时记下它，写回时放 If-Match */
const etagOf = st => `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
const bare = e => String(e).trim().replace(/^W\//, '');
const hhmmss = () => new Date().toTimeString().slice(0, 8);
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** 路径段是否可用：非空、不是 ..、不以 . 开头（.git、.env、编辑器临时文件都挡掉） */
const okSeg = s => !!s && s !== '..' && !s.startsWith('.') && !s.includes('\\') && !s.includes('\0');
/** 'a/b/c' → ['a','b','c']；有不可用的段返回 null */
const segsOf = rel => { const a = String(rel).split('/').filter(Boolean); return a.length && a.every(okSeg) ? a : null; };
/** URL 路径 → 根下的绝对路径；越界 / 带点段 / 解码失败返回 null（符号链接照 http-server 的做法跟随） */
function resolveUnder(root, urlPath) {
  let p; try { p = decodeURIComponent(urlPath); } catch { return null; }
  const a = p.split('/').filter(Boolean);
  if (!a.every(okSeg)) return null;
  return join(root, ...a);
}
const isLoop = a => a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
const hostOk = h => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(h ?? '');   // 挡 DNS rebinding：写回只认 localhost 这几个主机名

/** 读正文，超过 max 报 413。超限后不存、只丢弃剩余部分（让客户端把请求发完，才读得到干净的 413）；超过 8 倍 max 才掐连接 */
function readBody(req, max) {
  return new Promise((ok, no) => {
    const chunks = []; let n = 0, over = false;
    req.on('data', c => {
      n += c.length;
      if (n <= max) chunks.push(c);
      else if (!over) { over = true; no(Object.assign(new Error(`正文超过 ${max} 字节`), { status: 413 })); }
      if (n > max * 8) req.destroy();
    });
    req.on('end', () => { if (!over) ok(Buffer.concat(chunks)); });
    req.on('error', e => { if (!over) no(e); });
  });
}
const send = (res, code, body, headers = {}) => { res.writeHead(code, { 'Content-Length': Buffer.byteLength(body), ...headers }); res.end(body); };
const text = (res, code, s, headers = {}) => send(res, code, s, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
const json = (res, code, o, headers = {}) => send(res, code, JSON.stringify(o), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ...headers });

/** SSE 广播：环形缓冲 + epoch，断线重连补发；epoch 变了（服务器重启）或缓冲溢出就发 reset */
function createHub({ ring = 200, heartbeat = 15000 } = {}) {
  const epoch = Date.now().toString(36), clients = new Set(), buf = []; let seq = 0;
  const frame = (id, ev) => `id: ${epoch}:${id}\ndata: ${JSON.stringify(ev)}\n\n`;
  const write = (res, s) => { try { res.write(s); } catch { clients.delete(res); } };
  const timer = setInterval(() => { for (const r of clients) write(r, ': ping\n\n'); }, heartbeat); timer.unref?.();
  return {
    epoch, get seq() { return seq; }, get size() { return clients.size; },
    emit(ev) { const id = ++seq; buf.push([id, ev]); if (buf.length > ring) buf.shift(); for (const r of clients) write(r, frame(id, ev)); },
    add(req, res, last) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
      res.socket?.setNoDelay(true);
      write(res, `retry: 1000\nevent: hello\ndata: ${JSON.stringify({ epoch, seq, t: Date.now() })}\n\n`);
      const m = /^([0-9a-z]+):(\d+)$/.exec(last ?? '');
      if (m) {
        const n = +m[2];
        if (m[1] !== epoch || (buf.length && n < buf[0][0] - 1) || n > seq) write(res, 'event: reset\ndata: {}\n\n');
        else for (const [id, ev] of buf) if (id > n) write(res, frame(id, ev));
      }
      clients.add(res);
      req.on('close', () => clients.delete(res));
    },
    close() { clearInterval(timer); for (const r of clients) { try { r.end(); } catch {} } clients.clear(); },
  };
}

/** 文件监听：每个目录一个 fs.watch；去抖；已知文件集决定 add / change / unlink。ignore(rel) 为真的路径不监听、不报 */
function createWatcher(root, { ignore, debounce, onEvent }) {
  const dirs = new Map(), known = new Set(), pending = new Set(); let timer = null;
  const relOf = abs => relative(root, abs).split(sep).join('/');
  const emit = (path, kind) => onEvent({ path, kind, t: Date.now() });
  function drop(abs) {                                   // 目录没了：关掉它和它下面的监听，已知文件报 unlink
    const rel = relOf(abs) + '/';
    for (const [d, w] of dirs) if (d === abs || d.startsWith(abs + sep)) { try { w.close(); } catch {} dirs.delete(d); }
    for (const f of [...known]) if (f.startsWith(rel)) { known.delete(f); emit(f, 'unlink'); }
  }
  function touch(abs) { if (ignore(relOf(abs))) return; pending.add(abs); clearTimeout(timer); timer = setTimeout(flush, debounce); }
  function walk(abs, announce) {                         // 监听 abs 及其下未忽略的目录；announce = 新出现的目录里的文件报 add（启动扫描不报）
    if (dirs.has(abs)) return;
    let ents; try { ents = readdirSync(abs, { withFileTypes: true }); } catch { return; }
    let w; try { w = watch(abs, (_ev, name) => { if (name) touch(join(abs, String(name))); }); } catch { return; }
    w.on('error', () => { try { w.close(); } catch {} dirs.delete(abs); });
    dirs.set(abs, w);
    for (const e of ents) {
      const p = join(abs, e.name), rel = relOf(p);
      if (ignore(rel)) continue;
      if (e.isDirectory()) walk(p, announce);
      else { known.add(rel); if (announce) emit(rel, 'add'); }
    }
  }
  function flush() {
    const batch = [...pending]; pending.clear();
    for (const abs of batch) {
      const rel = relOf(abs); let st = null; try { st = lstatSync(abs); } catch {}
      if (st?.isDirectory()) { walk(abs, true); continue; }
      if (st) { const kind = known.has(rel) ? 'change' : 'add'; known.add(rel); emit(rel, kind); }
      else if (known.delete(rel)) emit(rel, 'unlink');
      else if (dirs.has(abs)) drop(abs);
    }
  }
  walk(root, false);
  return { get dirs() { return dirs.size; }, get files() { return known.size; }, close() { clearTimeout(timer); for (const w of dirs.values()) { try { w.close(); } catch {} } dirs.clear(); } };
}

//// App ///////////////////////////////////////////////////////////////

const HERE = dirname(fileURLToPath(import.meta.url));
/** 不监听、不报告的路径：点开头的段（.git、编辑器临时文件）、node_modules、截图与构建产物、常见临时后缀 */
const IGNORE_SEG = new Set(['node_modules']);
const IGNORE_PREFIX = ['gode/shots/', 'tools/out/'];
const IGNORE_FILE = /(~|\.sw[a-z]|\.tmp|\.part|\.crdownload)$|^4913$/;
const defaultIgnore = rel => {
  const a = rel.split('/');
  return a.some(s => s.startsWith('.') || IGNORE_SEG.has(s)) || IGNORE_PREFIX.some(p => (rel + '/').startsWith(p)) || IGNORE_FILE.test(a.at(-1));
};

export function createDev(o = {}) {
  const ROOT = resolve(o.root ?? join(HERE, '..', '..'));
  const DEFL = (o.defl ?? 'gode/defl').replace(/\/+$/, '');
  const CACHE = (o.cache ?? 1) < 0 ? 'no-cache' : `max-age=${o.cache ?? 1}`;
  const PERF = resolve(ROOT, o.perf ?? 'gode/shots/perf-collect.jsonl');
  const WRITE_MAX = 4 << 20;
  const log = o.log ?? ((...a) => console.error(hhmmss(), ...a));
  const verbose = !!o.verbose, quiet = !!o.quiet;
  const t0 = Date.now();

  const hub = createHub();
  const watcher = createWatcher(ROOT, {
    ignore: o.ignore ?? defaultIgnore, debounce: o.debounce ?? 200,
    onEvent: ev => { hub.emit(ev); if (!quiet) log(ev.kind.padEnd(6), ev.path); },
  });

  // ---- 静态
  function sendFile(req, res, file, st) {
    const etag = etagOf(st), h = { 'Content-Type': mimeOf(file), ETag: etag, 'Last-Modified': st.mtime.toUTCString(), 'Cache-Control': CACHE, 'Accept-Ranges': 'bytes' };
    const inm = req.headers['if-none-match'], ims = req.headers['if-modified-since'];
    if (inm ? inm.split(',').some(t => t.trim() === '*' || bare(t) === bare(etag)) : ims && Date.parse(ims) >= Math.floor(st.mtimeMs / 1000) * 1000) { res.writeHead(304, h); return res.end(); }
    let start = 0, end = st.size - 1, code = 200;
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');      // 只认单段 Range；多段 / 看不懂的当没有
    if (m && (m[1] || m[2])) {
      if (m[1]) { start = +m[1]; end = m[2] ? Math.min(+m[2], end) : end; } else { start = Math.max(0, st.size - +m[2]); }
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      code = 206; h['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
    }
    h['Content-Length'] = st.size ? end - start + 1 : 0;
    res.writeHead(code, h);
    if (req.method === 'HEAD' || !st.size) return res.end();
    createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
  }
  function listing(res, dir, urlPath) {
    const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const ents = readdirSync(dir, { withFileTypes: true }).filter(e => !e.name.startsWith('.'))
      .map(e => { let d = e.isDirectory(); if (e.isSymbolicLink()) { try { d = statSync(join(dir, e.name)).isDirectory(); } catch {} } return { n: e.name + (d ? '/' : ''), d }; })
      .sort((a, b) => b.d - a.d || a.n.localeCompare(b.n));
    const up = urlPath === '/' ? '' : '<li><a href="../">../</a></li>';
    send(res, 200, `<!doctype html><meta charset=utf-8><title>${esc(urlPath)}</title><h1>${esc(urlPath)}</h1><ul>${up}${ents.map(e => `<li><a href="${encodeURI(e.n)}">${esc(e.n)}</a></li>`).join('')}</ul>`,
      { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': CACHE });
  }
  function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    const file = resolveUnder(ROOT, url.pathname); let st;
    try { st = file && statSync(file); } catch {}
    if (!st) return text(res, 404, 'Not Found');
    if (st.isDirectory()) {
      if (!url.pathname.endsWith('/')) { res.writeHead(301, { Location: url.pathname + '/' + url.search }); return res.end(); }
      const idx = join(file, 'index.html');
      return existsSync(idx) ? sendFile(req, res, idx, statSync(idx)) : listing(res, file, url.pathname);
    }
    sendFile(req, res, file, st);
  }

  // ---- 写回：只写 DEFL 下的 .tsv / .json
  function writable(rel) {
    const segs = segsOf(rel), d = segsOf(DEFL);
    if (!segs || segs.length <= d.length || d.some((s, i) => segs[i] !== s)) return { err: [403, `只能写 ${DEFL}/ 下的文件`] };
    if (!/\.(tsv|json)$/.test(segs.at(-1))) return { err: [403, '只收 .tsv / .json'] };
    const abs = join(ROOT, ...segs); let rp, rd;
    try { rp = realpathSync(dirname(abs)); rd = realpathSync(join(ROOT, ...d)); } catch { return { err: [404, '目录不存在（先建目录）'] }; }
    if (rp !== rd && !rp.startsWith(rd + sep)) return { err: [403, '目录越界（符号链接？）'] };
    try { const l = lstatSync(abs); if (!l.isFile()) return { err: [403, l.isSymbolicLink() ? '拒绝符号链接' : '目标不是普通文件'] }; } catch {}
    return { abs, rel: segs.join('/') };
  }
  async function handleWrite(req, res, url) {
    if (req.method !== 'PUT') return json(res, 405, { error: '只收 PUT' }, { Allow: 'PUT' });
    if (!isLoop(req.socket.remoteAddress) || !hostOk(req.headers.host)) return json(res, 403, { error: '写回只收本机（127.0.0.1，Host 为 localhost）' });
    const v = writable(url.searchParams.get('path') ?? '');
    if (v.err) return json(res, v.err[0], { error: v.err[1] });
    const cur = existsSync(v.abs) ? etagOf(statSync(v.abs)) : null;
    if (!url.searchParams.has('force')) {
      const im = req.headers['if-match'], inm = req.headers['if-none-match'];
      if (im === undefined && inm === undefined) return json(res, 428, { error: '要带 If-Match（改已有文件）或 If-None-Match: *（新建）；或 ?force=1', etag: cur });
      if (inm?.trim() === '*' && cur) return json(res, 409, { error: '文件已存在', etag: cur });
      if (im !== undefined && (!cur || (im.trim() !== '*' && !im.split(',').some(t => bare(t) === bare(cur))))) return json(res, 409, { error: '文件已被别处改过', etag: cur });
    }
    const body = await readBody(req, WRITE_MAX);
    let s; try { s = new TextDecoder('utf-8', { fatal: true }).decode(body); } catch { return json(res, 400, { error: '不是合法的 UTF-8' }); }
    if (v.rel.endsWith('.json')) { try { JSON.parse(s); } catch (e) { return json(res, 400, { error: 'JSON 解析失败：' + e.message }); } }
    const tmp = join(dirname(v.abs), `.${basename(v.abs)}.tmp-${process.pid}-${Date.now()}`);   // 点开头：监听器不报它
    try { writeFileSync(tmp, body); renameSync(tmp, v.abs); } catch (e) { try { unlinkSync(tmp); } catch {} return json(res, 500, { error: String(e.message) }); }
    const st = statSync(v.abs);
    log('write ', v.rel, `${body.length}B`);
    json(res, 200, { path: v.rel, etag: etagOf(st), size: st.size }, { ETag: etagOf(st) });
  }
  // ---- 改源码里的参数声明（✎ 落盘）：只改 gode/ 下的 .js，且只改 `c_.X = {…}` 里的字面量（decl.js 校验）
  const PATCH_DENY = ['gode/tools', 'gode/vendor'];
  function patchable(rel) {
    const segs = segsOf(rel);
    if (!segs || segs[0] !== 'gode' || segs.length < 2) return { err: [403, '只能改 gode/ 下的文件'] };
    if (!/\.js$/.test(segs.at(-1))) return { err: [403, '只收 .js'] };
    const j = segs.join('/'), deny = PATCH_DENY.find(d => j.startsWith(d + '/'));
    if (deny) return { err: [403, `${deny}/ 下的文件不收`] };
    const abs = join(ROOT, ...segs); let st;
    try { st = lstatSync(abs); } catch { return { err: [404, '文件不存在'] }; }
    if (!st.isFile()) return { err: [403, st.isSymbolicLink() ? '拒绝符号链接' : '目标不是普通文件'] };
    try { if (!realpathSync(abs).startsWith(realpathSync(join(ROOT, 'gode')) + sep)) return { err: [403, '越界（符号链接？）'] }; } catch { return { err: [404, '文件不存在'] }; }
    return { abs, rel: j, mode: st.mode & 0o777 };
  }
  async function handlePatch(req, res, url) {
    if (req.method !== 'POST') return json(res, 405, { error: '只收 POST' }, { Allow: 'POST' });
    if (!isLoop(req.socket.remoteAddress) || !hostOk(req.headers.host)) return json(res, 403, { error: '改源码只收本机（127.0.0.1，Host 为 localhost）' });
    const v = patchable(url.searchParams.get('path') ?? '');
    if (v.err) return json(res, v.err[0], { error: v.err[1] });
    let spec; try { spec = JSON.parse((await readBody(req, 1 << 20)).toString('utf8')); } catch { return json(res, 400, { error: '正文不是 JSON' }); }
    let src; try { src = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(v.abs)); } catch { return json(res, 400, { error: '源文件不是合法的 UTF-8' }); }
    let r; try { r = patchDecl(src, spec ?? {}); } catch (e) { if (e instanceof PatchError) return json(res, e.status, { error: e.message }); throw e; }
    const tmp = join(dirname(v.abs), `.${basename(v.abs)}.tmp-${process.pid}-${Date.now()}`);
    try { writeFileSync(tmp, r.src, { mode: v.mode }); renameSync(tmp, v.abs); } catch (e) { try { unlinkSync(tmp); } catch {} return json(res, 500, { error: String(e.message) }); }
    const st = statSync(v.abs);
    log('patch ', v.rel, `${r.changed.length} 处`, r.changed.map(c => `${spec.topic}.${c.key}[${c.idx}] ${JSON.stringify(c.from)}→${JSON.stringify(c.to)}`).join(' '));
    json(res, 200, { path: v.rel, etag: etagOf(st), size: st.size, changed: r.changed }, { ETag: etagOf(st) });
  }
  function handleLs(req, res, url) {
    if (req.method !== 'GET') return json(res, 405, { error: '只收 GET' }, { Allow: 'GET' });
    const segs = segsOf(url.searchParams.get('dir') ?? DEFL), d = segsOf(DEFL);
    if (!segs || d.some((s, i) => segs[i] !== s)) return json(res, 403, { error: `只列 ${DEFL}/ 与其子目录` });
    try {
      const names = readdirSync(join(ROOT, ...segs), { withFileTypes: true }).filter(e => !e.name.startsWith('.')).map(e => e.name + (e.isDirectory() ? '/' : '')).sort();
      json(res, 200, names);
    } catch { json(res, 404, { error: '目录不存在' }); }
  }

  // ---- perf-collect（goal-panify §4）
  async function handlePerf(req, res, url) {
    if (url.pathname === '/t') {
      if (req.method !== 'POST') return text(res, 405, 'POST only', { Allow: 'POST' });
      const raw = (await readBody(req, 1 << 20)).toString('utf8').trim(); let recs;
      try { recs = raw.startsWith('[') ? JSON.parse(raw) : raw.split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)); } catch { return text(res, 400, 'JSON / JSONL 解析失败'); }
      recs = recs.filter(r => r && typeof r === 'object' && !Array.isArray(r)).map(r => ({ t: Date.now(), ...r }));
      if (recs.length) { mkdirSync(dirname(PERF), { recursive: true }); appendFileSync(PERF, recs.map(r => JSON.stringify(r)).join('\n') + '\n'); }
      res.writeHead(204); return res.end();
    }
    if (req.method !== 'GET') return text(res, 405, 'GET only', { Allow: 'GET' });
    const by = {};
    if (existsSync(PERF)) for (const l of readFileSync(PERF, 'utf8').split('\n').slice(-5000)) {
      let r; try { r = l && JSON.parse(l); } catch {} if (!r || typeof r.path !== 'string') continue;
      (by[r.path] ??= []).push(r);
    }
    const want = url.searchParams.get('path'), out = {};
    for (const [p, rs] of Object.entries(by)) {
      if (want && p !== want) continue;
      const num = k => rs.map(r => r[k]).filter(Number.isFinite), last = rs.at(-1);
      out[p] = { n: rs.length, topic: last.topic ?? null, from: last.from ?? null, to: last.to ?? null, fps: median(num('fps')), gpu: median(num('gpu')), t: last.t ?? null };
    }
    json(res, 200, out);
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost'), p = url.pathname;
    if (verbose) res.on('finish', () => log(String(res.statusCode), req.method, req.url));
    try {
      if (p === '/__dev/events') return hub.add(req, res, req.headers['last-event-id'] ?? url.searchParams.get('since'));
      if (p === '/__dev/write') return await handleWrite(req, res, url);
      if (p === '/__dev/patch') return await handlePatch(req, res, url);
      if (p === '/__dev/ls') return handleLs(req, res, url);
      if (p === '/__dev/info') return json(res, 200, { name: 'gode-dev', version: 1, pid: process.pid, root: ROOT, defl: DEFL, cache: CACHE, clients: hub.size, epoch: hub.epoch, seq: hub.seq, dirs: watcher.dirs, files: watcher.files, uptime: Math.round((Date.now() - t0) / 1000) });
      if (p.startsWith('/__dev/')) return json(res, 404, { error: '没有这个端点' });
      if (p === '/t' || p === '/agg') return await handlePerf(req, res, url);
      serveStatic(req, res, url);
    } catch (e) {
      if (!res.headersSent) json(res, e.status ?? 500, { error: String(e.message ?? e) }); else res.destroy();
      if (!e.status) log('错误', req.method, req.url, e.stack ?? e);
    }
  });
  server.requestTimeout = 0;           // SSE 与大文件不要被默认的 300 s 请求超时误伤

  return {
    server, hub, watcher, root: ROOT, defl: DEFL, cache: CACHE,
    listen: (port, host) => new Promise((ok, no) => { server.once('error', no); server.listen(port, host, () => { server.off('error', no); ok(server.address()); }); }),
    close: () => new Promise(ok => { hub.close(); watcher.close(); server.close(() => ok()); server.closeAllConnections?.(); }),
  };
}

function parseArgs(argv) {
  const o = { port: +(process.env.DEV_PORT ?? 8765), host: '0.0.0.0' };
  for (let i = 0; i < argv.length; i++) {
    const [k, eq] = argv[i].split(/=(.*)/s), v = () => eq ?? argv[++i];
    if (k === '-p' || k === '--port') o.port = +v();
    else if (k === '--host') o.host = v();
    else if (k === '--root') o.root = v();
    else if (k === '--defl') o.defl = v();
    else if (k === '--perf') o.perf = v();
    else if (k === '-c' || k === '--cache') o.cache = +v();
    else if (k === '--debounce') o.debounce = +v();
    else if (k === '-q' || k === '--quiet') o.quiet = true;
    else if (k === '-v' || k === '--verbose') o.verbose = true;
    else if (k === '-h' || k === '--help') o.help = true;
    else { console.error(`不认识的参数 ${argv[i]}（-h 看用法）`); process.exit(2); }
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n/, '').replace(/^ \* ?/gm, '')); return; }
  const dev = createDev(o);
  try { await dev.listen(o.port, o.host); }
  catch (e) {
    console.error(e.code === 'EADDRINUSE' ? `端口 ${o.port} 已被占用（可能是 http-server？先停掉它，或换端口：-p ${o.port + 1}）` : `起不来：${e.message}`);
    process.exit(1);
  }
  console.error(`${hhmmss()} dev 服务 http://localhost:${o.port}/  根 ${dev.root}  cache ${dev.cache}  监听 ${dev.watcher.dirs} 个目录 / ${dev.watcher.files} 个文件`);
  const bye = () => { dev.close().then(() => process.exit(0)); setTimeout(() => process.exit(0), 500).unref(); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
