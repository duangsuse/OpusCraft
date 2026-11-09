#!/usr/bin/env node
/**
 * gd — gode 的 Agent 工具：常驻守护进程独占一个浏览器，CLI 每条命令一个请求（gode/s12-agent-tools.md §2）。
 * 零依赖，Node ≥ 22（内置 WebSocket / fetch）或 Bun。
 *
 * 用法  node gode/tools/gd.js <命令> [参数]        （下文 gd = 这一串）
 *   gd up [--ss] [--seed N] [--rd N] [--size 1280x720] [--url Q]   起守护进程 + 浏览器 + 宿主 B（已在跑则复用）
 *   gd down                                  关浏览器、杀进程组、删 profile
 *   gd ps                                    守护进程 / 浏览器 pid、空闲时长、当前 URL、残留进程数
 *   gd go '<query>'                          'gode/viz/?g=gp' = 换页面；'?seed=1' = 换整个查询串；'&r=lite' = 合并参数；相同则跳过
 *   gd reload                                强制重载（gode/ rgl/ 宿主 B 的 js 有改动时 shot / check 前自动做）
 *   gd pose <名字|@x,z^y,yaw,pitch[,fov]|iso-ne>   名字查 defl/c_.json 的 c_.Bench.poses['<seed>@<g>']，
 *                                            没有就按 plain canopy cave water uw 的规则搜一次并写回
 *   gd shot [pose…] [--tag T] [--note N] [--sheet] [--vs -1|SEQ] [--ref]
 *                                            settle → 截图 → gode/shots/；多机位 + --sheet 拼一张联系表；
 *                                            --vs 每格左右并排「上一张 / 这一张」并标粗差异 Δ%；
 *                                            --ref 按 c_.Bench.ref 拍视觉目标机位，与 gode/reference-vision/ 左右对照
 *   gd xz <file.xz|-> [--at @x,z^y] [--frame] [--shot] [--tag T]   追加 XZ1 文本体素（s06 §5）
 *   gd mark | gd revert                      改块打点 / 回滚到打点
 *   gd hash <x0,y0,z0,x1,y1,z1|LAST>         区域体素哈希
 *   gd set c_.Path=v …                       值按 JSON 解析，失败当字符串
 *   gd eval '<js>'                           页面里执行（可 await），按值返回
 *   gd check [name…|all]                     跑 gode/tools/checks.tsv；不给名字 = 与 git 改动相关的几条
 *   gd perf [--frames 120]                   低频：帧时间中位数 / p95 + 渲染器 stats()，追加到 gode/shots/perf.tsv
 *   gd log [-f]                              页面 console / 异常（自上次调用以来）；-f 持续跟随
 *   gd inbox [--wait N] [--keep] [-f]        收件箱：用户在页面里点「→ Agent」或任何「⎘ 复制」按钮时，页面经 CDP binding（window.gdSend）把
 *                                            { kind, text/选区/点列表/统计, ctx } 递给守护进程。默认取走并清空；--wait N（≤ 280）= 空则阻塞到有消息；
 *                                            --keep 只看不清；-f 持续跟随（每条一行，给 Monitor 用）。后台跑 `gd inbox --wait 280` 或 Monitor `gd inbox -f` 就能被唤醒
 *
 * 输出：一行一个结果（tsv / 文本），stderr 末行是耗时；失败退出码 1 并带页面日志最后 20 行。
 *
 * 环境变量
 *   GD_BASE=http://localhost:8765/   静态服务根（gd 不自带服务器；用户的 http-server -p 8765 -c 1 常驻在仓库根）
 *   GD_IDLE=600    空闲多少秒后守护进程自动 down
 *   GD_SLOW=8      单条命令超过这么多秒时打印卡在哪
 *   GD_HEADLESS=1  无头（仍用 prime-run 独显；--ss 则是 SwiftShader 无头）
 *
 * 进程模型：up fork 出守护进程（unix socket /tmp/gode-gd/sock 上的 HTTP，只给 CLI 用），守护进程 spawn 浏览器
 * （detached → 自成进程组）。守护进程退出的所有路径（down、空闲、浏览器挂掉、信号、未捕获异常）都先 kill(-pgid) 再删 profile；
 * up 前 sweepStale：/tmp/gode-gd-*（带 owner 文件且 owner 已死）的残留浏览器按 /proc cmdline 匹配杀掉，不碰别的浏览器。
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, rmSync, mkdtempSync, readdirSync, statSync, copyFileSync, openSync } from 'node:fs';
import { join, dirname, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createServer as netServer } from 'node:net';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';

//// Lib ///////////////////////////////////////////////////////////////
// 与具体业务无关的通用件：不得引用下方 App 段的任何变量。

const PROFILE_PREFIX = 'gode-gd-';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rmDir = dir => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} };
const isAlive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** 读 TSV：去 BOM、兼容 CRLF、跳过 # 注释行；返回 { header, rows: [{列名: 值}] } */
function readTsv(file) {
  if (!existsSync(file)) return { header: [], rows: [] };
  const [header = '', ...lines] = readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(l => !l.startsWith('#'));
  const h = header.split('\t');
  return { header: h, rows: lines.filter(Boolean).map(l => Object.fromEntries(l.split('\t').map((v, i) => [h[i] ?? i, v]))) };
}
const tsvCell = v => String(v ?? '').replace(/[\t\r\n]+/g, ' ');

function freePort() {
  return new Promise((res, rej) => {
    const s = netServer(); s.unref(); s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

// ── 极简 CDP 客户端（browser 级 ws + flatten session），同 techstack/shoot.js ──
const rpc = send => new Proxy({}, {
  get: (_, domain) => typeof domain === 'symbol' ? undefined : new Proxy({}, {
    get: (_, method) => typeof method === 'symbol' ? undefined : (params = {}) => send(`${domain}.${method}`, params),
  }),
});

class Cdp {
  #id = 0;
  #pending = new Map();
  #subs = new Set();
  constructor(ws) {
    this.ws = ws;
    ws.addEventListener('message', ev => {
      let m;
      try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch { return; }
      if (m.id && this.#pending.has(m.id)) {
        const p = this.#pending.get(m.id);
        this.#pending.delete(m.id); clearTimeout(p.timer);
        m.error ? p.reject(new Error(`${p.method} → ${m.error.message}`)) : p.resolve(m.result);
      } else if (m.method) for (const fn of this.#subs) fn(m);
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#pending.delete(id); reject(new Error(`${method} 超时`)); }, 90000);
      this.#pending.set(id, { resolve, reject, method, timer });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }
  session(sessionId) { return rpc((method, params) => this.send(method, params, sessionId)); }
  on(fn) { this.#subs.add(fn); return () => this.#subs.delete(fn); }
  waitEvent(method, sessionId, ms = 30000) {
    return new Promise(resolve => {
      const off = this.on(m => { if (m.method !== method || (sessionId && m.sessionId !== sessionId)) return; clearTimeout(t); off(); resolve(m); });
      const t = setTimeout(() => { off(); resolve(null); }, ms);
    });
  }
}

// ── 浏览器进程：起、找、杀 ──
const HAS_PROC = process.platform === 'linux' && existsSync('/proc');

/** cmdline 含 sub 的进程 pid */
function pidsMatching(sub) {
  if (!HAS_PROC) return [];
  const out = [];
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    let cmd = '';
    try { cmd = readFileSync(`/proc/${d}/cmdline`, 'utf8'); } catch { continue; }
    if (cmd.includes(sub)) out.push(Number(d));
  }
  return out;
}

/** 上次被硬杀残留的浏览器：带 owner 文件、owner 已死的 profile → 杀进程、删目录。没有 owner 文件的不是 gd 的，不碰 */
function sweepStale() {
  let killed = 0;
  for (const name of readdirSync(tmpdir())) {
    if (!name.startsWith(PROFILE_PREFIX)) continue;
    const dir = join(tmpdir(), name);
    let owner = 0;
    try { owner = Number(readFileSync(join(dir, 'owner'), 'utf8')); } catch { continue; }
    if (owner > 0 && isAlive(owner)) continue;
    for (const pid of pidsMatching(`--user-data-dir=${dir}`)) { try { process.kill(pid, 'SIGKILL'); killed++; } catch {} }
    rmDir(dir);
  }
  return killed;
}

/** 起 Chromium（detached = 自成进程组，pgid = child.pid），返回 { child, port, profile, wsUrl } */
async function launch({ width, height, ss, headless, owner }) {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), PROFILE_PREFIX));
  writeFileSync(join(profile, 'owner'), String(owner));
  const flags = [
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-features=Translate,MediaRouter', '--hide-crash-restore-bubble',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    `--window-size=${width},${height}`, '--window-position=0,0',
    ...(ss ? ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
           : ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', ...(headless ? ['--headless=new'] : [])]),
    'about:blank',
  ];
  const cmd = ss ? ['chromium', ...flags] : ['prime-run', 'chromium', '--ozone-platform=x11', ...flags];
  const child = spawn(cmd[0], cmd.slice(1), { stdio: 'ignore', detached: true });
  let wsUrl = null;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(100); }
  }
  if (!wsUrl) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} rmDir(profile); throw new Error('Chromium 调试端口没起来'); }
  return { child, port, profile, wsUrl };
}

//// App ///////////////////////////////////////////////////////////////

const SELF = fileURLToPath(import.meta.url);
const TOOLS = dirname(SELF), GODE = resolve(TOOLS, '..'), ROOT = resolve(GODE, '..');
const SHOTS = join(GODE, 'shots'), INDEX = join(SHOTS, 'index.tsv'), CJSON = join(GODE, 'defl', 'c_.json'), CHECKS = join(TOOLS, 'checks.tsv');
const DIR = join(tmpdir(), 'gode-gd'), SOCK = join(DIR, 'sock'), STATE = join(DIR, 'state.json'), DLOG = join(DIR, 'daemon.log');
const BASE = (process.env.GD_BASE || 'http://localhost:8765/').replace(/\/?$/, '/');
const IDLE = +(process.env.GD_IDLE || 600) * 1000, SLOW = +(process.env.GD_SLOW || 8) * 1000;
const INDEX_COLS = ['seq', 'ts', 'tag', 'pose', 'url', 'files', 'note', 'verdict', 'ms'];
const QUALITY = 82;
const VALUED = new Set(['seed', 'rd', 'size', 'url', 'tag', 'note', 'vs', 'at', 'frames', 'wait']);

function parseArgs(argv) {
  const pos = [], o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-f') o.f = true;
    else if (a.startsWith('--')) { const k = a.slice(2); o[k] = VALUED.has(k) ? argv[++i] : true; }
    else pos.push(a);
  }
  return { pos, o };
}

const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };

//// App · 守护进程 ////////////////////////////////////////////////////

async function daemon(opts) {
  const [W, H] = (opts.size || '1280x720').split('x').map(Number);
  const log = (...a) => appendFileSync(DLOG, `${new Date().toISOString().slice(11, 19)} ${a.join(' ')}\n`);
  mkdirSync(DIR, { recursive: true }); rmSync(SOCK, { force: true });
  const { child, port, profile, wsUrl } = await launch({ width: W, height: H, ss: opts.ss, headless: process.env.GD_HEADLESS === '1', owner: process.pid });
  const pgid = child.pid;
  const st = { pid: process.pid, pgid, port, profile, url: null, since: Date.now(), last: Date.now(), size: [W, H], ss: !!opts.ss };
  const save = () => writeFileSync(STATE, JSON.stringify(st, null, 1));
  let dead = false;
  const down = (why, code = 0) => {
    if (dead) return; dead = true; log('down:', why);
    try { process.kill(-pgid, 'SIGKILL'); } catch {}
    for (const pid of pidsMatching(`--user-data-dir=${profile}`)) { try { process.kill(pid, 'SIGKILL'); } catch {} }
    rmDir(profile); rmSync(SOCK, { force: true }); rmSync(STATE, { force: true });
    process.exit(code);
  };
  for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => down(s));
  process.on('uncaughtException', e => { log('uncaught', e.stack); down('uncaught', 1); });
  process.on('unhandledRejection', e => { log('rejection', e?.stack || e); });
  child.on('exit', c => down(`浏览器退出 ${c}`, 1));
  setInterval(() => { if (Date.now() - st.last > IDLE) down(`空闲 ${IDLE / 1000}s`); }, 15000).unref();

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  const cdp = new Cdp(ws);
  const { targetInfos } = await cdp.session().Target.getTargets();
  const targetId = targetInfos.find(t => t.type === 'page')?.targetId ?? (await cdp.session().Target.createTarget({ url: 'about:blank' })).targetId;
  const { sessionId: sid } = await cdp.session().Target.attachToTarget({ targetId, flatten: true });
  const page = cdp.session(sid);
  await page.Runtime.enable(); await page.Page.enable(); await page.Log.enable();
  await page.Runtime.addBinding({ name: 'gdSend' });   // 页面 → Agent 的单向通道：window.gdSend(jsonString)，导航后仍在
  await page.Emulation.setDeviceMetricsOverride({ width: W, height: H, deviceScaleFactor: 1, mobile: false });

  // 页面日志：环形 500 行；logSeen = 上次 gd log 读到哪
  const logs = []; let logBase = 0, logSeen = 0;
  const pushLog = s => { logs.push(s); if (logs.length > 500) { logs.shift(); logBase++; } };
  cdp.on(m => {
    if (m.sessionId !== sid) return;
    if (m.method === 'Runtime.consoleAPICalled') pushLog(`${m.params.type}: ` + m.params.args.map(a => a.value ?? a.description ?? a.type).join(' '));
    else if (m.method === 'Runtime.exceptionThrown') pushLog('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    else if (m.method === 'Log.entryAdded' && m.params.entry.level !== 'verbose') pushLog(`${m.params.entry.level}: ${m.params.entry.text} ${m.params.entry.url || ''}`);
  });
  const tail = n => logs.slice(-n);

  // 收件箱（页面 → Agent）：binding 调用进队列；inbox 命令取走。listening = 有人在等 / 最近 3 s 内有人取过，页面用它提示「Agent 在听」
  const inbox = []; let inSeq = 0, lastPollAt = 0; const waiters = new Set();
  const listening = () => (waiters.size || Date.now() - lastPollAt < 3000 ? 1 : 0);
  const fmtMsg = m => { const { seq, ts, kind, ...rest } = m; return `#${seq}\t${new Date(ts).toTimeString().slice(0, 8)}\t${kind}\t${JSON.stringify(rest)}`; };
  cdp.on(m => {
    if (m.sessionId !== sid || m.method !== 'Runtime.bindingCalled' || m.params.name !== 'gdSend') return;
    let d; try { d = JSON.parse(m.params.payload); } catch { d = { kind: 'raw', text: String(m.params.payload).slice(0, 2000) }; }
    const msg = { seq: ++inSeq, ts: Date.now(), ...d, kind: String(d.kind ?? 'msg') };
    inbox.push(msg); if (inbox.length > 200) inbox.shift(); st.last = Date.now();
    pushLog(`inbox #${msg.seq} ${msg.kind}`);
    for (const w of [...waiters]) w();
    page.Runtime.evaluate({ expression: `window.gdAck?.(${msg.seq}, ${listening()}, ${inbox.length}, ${JSON.stringify(msg.kind)})` }).catch(() => {});
  });

  // ── 页面求值 ──
  const evalJS = async (expr, ms = 60000) => {
    const r = await page.Runtime.evaluate({ expression: expr, awaitPromise: true, returnByValue: true, timeout: ms });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const call = (fn, ...a) => evalJS(`(${fn})(...${JSON.stringify(a)})`);
  const T = 'window.gm?.test ?? window.viz';

  // ── 导航 + 就绪 ──
  let loadedAt = 0;
  const isHostB = u => { const p = new URL(u).pathname; return p === '/' || p === '/index.html'; };
  const resolveUrl = q => {
    const cur = st.url || `${BASE}index.html?r=gl&seed=${opts.seed || 20240607}&rd=${opts.rd || 6}`;
    let u;
    if (!q) u = new URL(cur);
    else if (/^https?:/.test(q)) u = new URL(q);
    else if (q.startsWith('?')) { u = new URL(cur); u.search = q; }
    else if (q.startsWith('&')) { u = new URL(cur); for (const [k, v] of new URLSearchParams(q.slice(1))) u.searchParams.set(k, v); }
    else u = new URL(q, BASE);
    if (isHostB(u.href) && !u.searchParams.has('test')) u.searchParams.set('test', '1');
    return u.href;
  };
  const waitReady = async () => {
    for (let i = 0; i < 100; i++) { if (await evalJS(`!!(${T})`).catch(() => false)) break; await sleep(100); }
    const r = await evalJS(`(async () => { const t = ${T}; if (!t) return { warn: '页面没有 gm.test / viz（不是宿主 B &test 也不是 pgviz）' };
      return await Promise.race([typeof t.ready === 'function' ? t.ready() : t.ready, new Promise((_, j) => setTimeout(() => j(new Error('ready 超时 40s')), 40000))]); })()`, 45000);
    loadedAt = Date.now();
    return r;
  };
  const navigate = async url => {
    const ev = cdp.waitEvent('Page.loadEventFired', sid, 30000);
    await page.Page.navigate({ url }); await ev;
    st.url = url; save(); log('go', url);
    return waitReady();
  };
  const reload = async () => {
    const ev = cdp.waitEvent('Page.loadEventFired', sid, 30000);
    await page.Page.reload({ ignoreCache: true }); await ev;
    log('reload'); return waitReady();
  };
  // 改了 js / html 就在 shot / check 前自动重载（只看会被页面加载的目录）
  const WATCH = ['gode', 'rgl', 'vendor', 'index.html', 'gls.js', 'gen.js', 'mobsim.js', 'res_vam.js', 'bwebp.js'];
  const newest = () => {
    let t = 0;
    const walk = p => {
      let s; try { s = statSync(p); } catch { return; }
      if (s.isDirectory()) { if (p === SHOTS || basename(p) === 'node_modules') return; for (const n of readdirSync(p)) walk(join(p, n)); }
      else if (/\.(js|html|glsl|json|tsv)$/.test(p) && !p.startsWith(join(GODE, 'defl')) && p !== SELF && p !== CHECKS) t = Math.max(t, s.mtimeMs);   // gd.js 自身改了要 down / up
    };
    for (const w of WATCH) walk(join(ROOT, w));
    return t;
  };
  const autoReload = async () => { if (st.url && newest() > loadedAt) return { reloaded: true, ...(await reload()) }; };

  // ── 机位 ──
  const pageInfo = () => evalJS(`(() => { const t = window.gm?.test; return t ? { host: t.host, seed: t.seed, gen: t.gen } : window.viz ? { host: 'viz' } : { host: '?' }; })()`);
  const RULES = new Set(['plain', 'canopy', 'cave', 'water', 'uw']);
  const resolvePose = async p => {
    if (typeof p !== 'string' || p.startsWith('@') || p.startsWith('iso-')) return p;
    const info = await pageInfo(), key = `${info.seed}@${info.gen}`, c = readJson(CJSON, {});
    if (info.host === 'viz' || info.host === '?') throw new Error(`当前页面（${st.url}）没有机位概念；先 gd go '?seed=…' 回宿主 B`);
    const v = c.Bench?.poses?.[key]?.[p];
    if (v) return v;
    if (!RULES.has(p)) throw new Error(`机位 ${p} 不在 c_.Bench.poses['${key}']，也没有搜索规则（${[...RULES].join(' ')}）`);
    const f = await call(r => window.gm.test.find(r), p);
    if (!f) throw new Error(`机位 ${p}：已加载区块里没搜到`);
    const r = n => Math.round(n * 100) / 100;
    ((c.Bench ??= {}).poses ??= {})[key] ??= {};
    c.Bench.poses[key][p] = { x: r(f.x), y: r(f.y), z: r(f.z), yaw: r(f.yaw), pitch: r(f.pitch) };
    writeFileSync(CJSON, JSON.stringify(c, null, 1) + '\n'); log('机位写回', key, p);
    return c.Bench.poses[key][p];
  };
  const poseLabel = p => typeof p === 'string' ? p : p ? `@${p.x.toFixed(1)},${p.z.toFixed(1)}^${p.y.toFixed(1)}` : '-';
  const doPose = async p => { const v = await resolvePose(p); return evalJS(`(${T}).pose?.(${JSON.stringify(v)}) ?? null`); };
  const settle = () => evalJS(`(async () => { const t = ${T}; return t.settle ? await t.settle() : t.ready && await (typeof t.ready === 'function' ? t.ready() : t.ready); })()`, 30000);

  // ── 截图目录 ──
  mkdirSync(SHOTS, { recursive: true });
  const day = () => { const d = new Date(); return `${d.getFullYear() % 100}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
  const indexRows = () => readTsv(INDEX).rows;
  const nextSeq = () => indexRows().reduce((m, r) => Math.max(m, +r.seq || 0), 0) + 1;
  const appendIndex = row => {
    if (!existsSync(INDEX)) writeFileSync(INDEX, INDEX_COLS.join('\t') + '\n');
    appendFileSync(INDEX, INDEX_COLS.map(k => tsvCell(row[k])).join('\t') + '\n');
  };
  // 超过 500 张或最老的超过 7 天：每个 tag 只留最后 20 张
  const prune = () => {
    const rows = indexRows(), old = Date.now() - 7 * 864e5;
    if (rows.length <= 500 && !(rows.length && Date.parse(rows[0].ts) < old)) return;
    const keep = new Set(), byTag = {};
    for (const r of rows) (byTag[r.tag] ??= []).push(r);
    for (const list of Object.values(byTag)) for (const r of list.slice(-20)) keep.add(r);
    for (const r of rows) if (!keep.has(r) && r.files) for (const f of r.files.split(',')) rmSync(join(SHOTS, f), { force: true });
    writeFileSync(INDEX, INDEX_COLS.join('\t') + '\n' + rows.filter(r => keep.has(r)).map(r => INDEX_COLS.map(k => tsvCell(r[k])).join('\t') + '\n').join(''));
  };
  const writeShot = (b64, { tag, pose, note, verdict, ms }) => {
    const seq = nextSeq(), d = day(), slug = s => String(s).replace(/[^\w.@^,-]+/g, '_').slice(0, 40);
    mkdirSync(join(SHOTS, d), { recursive: true });
    const file = `${d}/${String(seq).padStart(4, '0')}-${slug(tag)}${pose && pose !== '-' ? '-' + slug(pose) : ''}.webp`;
    const buf = Buffer.from(b64, 'base64');
    writeFileSync(join(SHOTS, file), buf); writeFileSync(join(SHOTS, 'latest.webp'), buf);
    appendIndex({ seq, ts: new Date().toISOString(), tag, pose, url: st.url?.replace(BASE, ''), files: file, note, verdict, ms });
    prune();
    return { seq, file: relative(ROOT, join(SHOTS, file)) };
  };
  const capture = async () => (await page.Page.captureScreenshot({ format: 'webp', quality: QUALITY })).data;
  // 联系表：在页面里用 canvas 拼。cells = [{ label, srcs: [url | dataURL …] }]；两张一格时标粗差异 Δ%（1/8 缩放，RGB 距离 > 24 的比例）
  const compose = (cells, W, H) => call(async (cells, W, H) => {
    const load = src => new Promise(res => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    const per = Math.max(...cells.map(c => c.srcs.length)), cw = per > 1 ? 560 : 640, chh = Math.round(cw * H / W), lab = 22;
    const cols = Math.min(cells.length, per > 1 ? 2 : cells.length <= 4 ? 2 : 3), rows = Math.ceil(cells.length / cols);
    const cv = document.createElement('canvas'); cv.width = cols * per * cw; cv.height = rows * (chh + lab);
    const g = cv.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, cv.width, cv.height); g.font = '13px monospace'; g.textBaseline = 'middle';
    const diff = (a, b) => {
      const w = Math.max(1, cw >> 3), h = Math.max(1, chh >> 3), c = document.createElement('canvas'); c.width = w * 2; c.height = h;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(a, 0, 0, w, h); x.drawImage(b, w, 0, w, h);
      const p = x.getImageData(0, 0, w * 2, h).data; let n = 0;
      for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) { const j = (y * w * 2 + i) * 4, k = j + w * 4; if (Math.hypot(p[j] - p[k], p[j + 1] - p[k + 1], p[j + 2] - p[k + 2]) > 24) n++; }
      return n / (w * h) * 100;
    };
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i], X = (i % cols) * per * cw, Y = Math.floor(i / cols) * (chh + lab), imgs = await Promise.all(c.srcs.map(load));
      imgs.forEach((im, j) => {
        if (!im) { g.fillStyle = '#555'; g.fillText('（无）', X + j * cw + 8, Y + lab + chh / 2); return; }
        const s = Math.min(cw / im.width, chh / im.height), w = im.width * s, h = im.height * s;
        g.drawImage(im, X + j * cw + (cw - w) / 2, Y + lab + (chh - h) / 2, w, h);
      });
      let label = c.label;
      if (c.diff && imgs[0] && imgs[1]) label += `  Δ${diff(imgs[0], imgs[1]).toFixed(1)}%`;
      g.fillStyle = '#222'; g.fillRect(X, Y, per * cw, lab); g.fillStyle = '#ddd'; g.fillText(label, X + 6, Y + lab / 2);
      g.strokeStyle = '#000'; g.strokeRect(X + 0.5, Y + 0.5, per * cw - 1, chh + lab - 1);
    }
    return cv.toDataURL('image/webp', 0.82).split(',')[1];
  }, cells, W, H);
  // --vs：同 tag 同机位的上一张（-1）或指定 seq
  const vsFile = (vs, tag, pose) => {
    const rows = indexRows().filter(r => r.files && !r.files.includes(','));
    const r = vs === '-1' || vs === true ? rows.filter(r => r.tag === tag && r.pose === pose).at(-1) : rows.find(r => r.seq === String(vs));
    return r && `${BASE}gode/shots/${r.files}`;
  };

  const shot = async ({ poses = [], tag = 'shot', note = '', sheet, vs, ref }) => {
    const out = [], t0 = Date.now(), rl = await autoReload();
    if (rl) out.push('# 代码有改动，已重载');
    if (ref) return shotRef({ tag: tag === 'shot' ? 'ref' : tag, note, out });
    const list = poses.length ? poses : [null], shots = [];
    for (const p of list) {
      const t1 = Date.now();
      if (p) await doPose(p);
      await settle();
      shots.push({ pose: p ? poseLabel(p) : '-', b64: await capture(), ms: Date.now() - t1 });
    }
    if (sheet || vs) {
      const prev = shots.map(s => vs && vsFile(vs, tag, s.pose));
      // 先把单张也存下来（下一次 --vs 要找它们），再拼表
      const saved = shots.map(s => writeShot(s.b64, { tag, pose: s.pose, note, ms: s.ms }));
      const cells = shots.map((s, i) => ({ label: `${s.pose} · ${s.ms}ms${note ? ' · ' + note : ''}`, srcs: vs ? [prev[i], `data:image/webp;base64,${s.b64}`] : [`data:image/webp;base64,${s.b64}`], diff: !!vs }));
      const r = writeShot(await compose(cells, ...st.size), { tag: tag + '.sheet', pose: shots.map(s => s.pose).join('+'), note, ms: Date.now() - t0 });
      for (const s of saved) out.push(`${s.seq}\t${s.file}`);
      out.push(`${r.seq}\t${r.file}\tsheet`);
    } else for (const s of shots) { const r = writeShot(s.b64, { tag, pose: s.pose, note, ms: s.ms }); out.push(`${r.seq}\t${r.file}\t${s.ms}ms`); }
    return out;
  };
  // --ref：c_.Bench.ref = { 名字: { img, pose?, hour? } }；没有 pose 的格只放参考图
  const shotRef = async ({ tag, note, out }) => {
    const refs = readJson(CJSON, {}).Bench?.ref || {}, cells = [];
    for (const [name, r] of Object.entries(refs)) {
      let src = null, lab = name;
      if (r.pose) {
        try {
          await evalJS(`window.gm?.test?.freeze({ hour: ${+(r.hour ?? 10)}, hud: false })`);
          await doPose(r.pose); await settle(); src = `data:image/webp;base64,${await capture()}`;
        } catch (e) { lab += ` ✗ ${e.message.split('\n')[0]}`; }
        finally { await evalJS('window.gm?.test?.freeze()'); }
      } else lab += '（还没有机位）';
      cells.push({ label: `${lab} · ${r.img}`, srcs: [`${BASE}gode/reference-vision/${r.img}`, src] });
    }
    const w = writeShot(await compose(cells, ...st.size), { tag: tag + '.sheet', pose: Object.keys(refs).join('+'), note });
    out.push(`${w.seq}\t${w.file}\tref ${cells.length} 格`);
    return out;
  };

  // ── 检查（checks.tsv）──
  const gitChanged = () => { try { return execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean).map(l => l.slice(3)); } catch { return []; } };
  const globRe = g => new RegExp('^' + g.trim().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '.*') + '$');
  const check = async names => {
    const rl = await autoReload(); await evalJS('window.gdQuiet = true').catch(() => {});   // 检查里点的复制按钮不进收件箱
    const info = await pageInfo(), all = readTsv(CHECKS).rows.filter(r => r.host.split(',').includes(info.host));
    let sel;
    if (names.includes('all')) sel = all;
    else if (names.length) { sel = all.filter(r => names.includes(r.name)); const miss = names.filter(n => !all.some(r => r.name === n)); if (miss.length) throw new Error(`当前页面（${info.host}）没有检查：${miss.join(' ')}`); }
    else { const ch = gitChanged(); sel = all.filter(r => r.files && r.files.split(',').some(g => ch.some(f => globRe(g).test(f)))); if (!sel.length) sel = all.filter(r => r.name === 'errors'); }
    const xz = {}, xd = join(TOOLS, 'xz');
    if (existsSync(xd)) for (const f of readdirSync(xd)) if (f.endsWith('.xz')) xz[f] = readFileSync(join(xd, f), 'utf8');
    const out = rl ? ['# 代码有改动，已重载'] : []; let fail = 0;
    for (const r of sel) {
      const t0 = Date.now(); let v;
      try { v = await evalJS(`(async () => { const GD = ${JSON.stringify({ xz })}; return await (${r.js}); })()`, 30000); }
      catch (e) { v = { ok: false, msg: e.message.split('\n')[0] }; }
      const ms = Date.now() - t0, verdict = v?.ok ? 'ok' : 'FAIL';
      if (!v?.ok) fail++;
      appendIndex({ seq: nextSeq(), ts: new Date().toISOString(), tag: 'check', pose: r.name, url: st.url?.replace(BASE, ''), files: '', note: v?.msg, verdict, ms });
      out.push(`${r.name}\t${verdict}\t${ms}ms\t${tsvCell(v?.msg)}`);
    }
    return { out, fail };
  };

  // ── 命令表 ──
  const CMD = {
    async ping() { return ['pong']; },
    async up(o) {
      const r = st.url ? null : await navigate(resolveUrl(o.url || ''));
      return [`daemon ${st.pid}\tbrowser pgid ${pgid}\t${st.url}`, ...(r ? [JSON.stringify(r)] : [])];
    },
    async ps() {
      const idle = Math.round((Date.now() - st.last) / 1000);
      return [`daemon\t${st.pid}`, `browser\tpgid ${pgid}\talive ${isAlive(pgid)}\tport ${port}\t${st.ss ? 'swiftshader' : 'prime-run'}`, `url\t${st.url}`, `idle\t${idle}s / ${IDLE / 1000}s`, `inbox\t待取 ${inbox.length}\t在听 ${listening()}`, `profiles\t${pidsMatching(PROFILE_PREFIX).length} 个进程匹配 ${PROFILE_PREFIX}`];
    },
    async down() { setTimeout(() => down('gd down'), 50); return ['down']; },
    async go(o) {
      const url = resolveUrl(o.q);
      if (url === st.url) return ['# 与当前 URL 相同，跳过', url];
      return [url, JSON.stringify(await navigate(url))];
    },
    async reload() { return [JSON.stringify(await reload())]; },
    async pose(o) { const rl = await autoReload(); return [...(rl ? ['# 代码有改动，已重载'] : []), JSON.stringify(await doPose(o.p))]; },
    async shot(o) { return shot(o); },
    async xz(o) {
      const rl = await autoReload();
      if (rl) await evalJS('gm.test.mark()');   // 重载丢了打点：重新打，revert 仍然只撤本次
      const r = await call((t, at) => window.gm.test.xz(t, { at }), o.text, o.at || undefined), out = [`${r.name || '-'}\tplaced ${r.placed}\tmissing ${r.missing}\tbbox ${r.bbox?.join(',')}\thash ${r.hash}${r.unknown.length ? '\t未知方块 ' + r.unknown.join(',') : ''}`];
      if (o.frame && r.bbox) await call(b => window.gm.test.frame(b), r.bbox);
      if (o.shot) out.push(...await shot({ tag: o.tag || 'xz', note: r.name }));
      return out;
    },
    async mark() { const rl = await autoReload(); await evalJS('gm.test.mark()'); return [...(rl ? ['# 代码有改动，已重载'] : []), 'mark']; },
    async revert() { return [`revert ${await evalJS('gm.test.revert()')} 格`]; },
    async hash(o) { const b = o.b === 'LAST' ? 'window.LAST.bbox' : JSON.stringify(o.b.split(',').map(Number)); return [await evalJS(`gm.test.hash(${b})`)]; },
    async set(o) {
      const out = [];
      for (const kv of o.kv) {
        const i = kv.indexOf('='), k = kv.slice(0, i), s = kv.slice(i + 1); let v; try { v = JSON.parse(s); } catch { v = s; }
        out.push(`${k}\t${JSON.stringify(await call((k, v) => (window.gm?.test ?? window.viz).set(k, v), k, v))}`);
      }
      return out;
    },
    async eval(o) { const v = await evalJS(`(async () => (${o.js}))()`); return [typeof v === 'string' ? v : JSON.stringify(v, null, 1)]; },
    async check(o) { try { return await check(o.names); } finally { await evalJS('window.gdQuiet = false').catch(() => {}); } },
    async perf(o) {
      const n = +(o.frames || 120);
      const r = await evalJS(`(async () => { const d = []; let t = performance.now(); for (let i = 0; i < ${n}; i++) { await new Promise(r => requestAnimationFrame(r)); const u = performance.now(); d.push(u - t); t = u; }
        d.sort((a, b) => a - b); const t2 = ${T}; return { med: d[d.length >> 1], p95: d[Math.floor(d.length * 0.95)], stats: t2?.stats?.() }; })()`);
      const line = [new Date().toISOString(), st.url?.replace(BASE, ''), n, r.med.toFixed(2), r.p95.toFixed(2), JSON.stringify(r.stats)].map(tsvCell).join('\t');
      const pf = join(SHOTS, 'perf.tsv'); if (!existsSync(pf)) writeFileSync(pf, 'ts\turl\tframes\tmed_ms\tp95_ms\tstats\n');
      appendFileSync(pf, line + '\n');
      return [`med ${r.med.toFixed(2)}ms\tp95 ${r.p95.toFixed(2)}ms`, JSON.stringify(r.stats)];
    },
    async inbox(o, ctl) {
      lastPollAt = Date.now();
      const ms = Math.min(280, Math.max(0, +o.wait || 0)) * 1000;
      if (!inbox.length && ms) await new Promise(res => { const w = () => { clearTimeout(t); waiters.delete(w); res(); }, t = setTimeout(w, ms); waiters.add(w); ctl.onGone = w; });
      if (ctl.gone) return [];   // 死客户端：消息留在收件箱
      lastPollAt = Date.now();
      const out = o.keep ? inbox.slice() : inbox.splice(0);
      return out.map(fmtMsg);
    },
    async log() { const from = Math.max(0, logSeen - logBase); const r = logs.slice(from); logSeen = logBase + logs.length; return r; },
  };

  createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      const name = req.url.slice(1), t0 = Date.now(); st.last = Date.now(); save();
      let reply;
      try {
        if (!CMD[name]) throw new Error(`未知命令 ${name}`);
        const ctl = { gone: false, onGone: null };   // 客户端断开（Ctrl-C / 超时杀掉 / Monitor 停了）：inbox 不能把消息交给死客户端
        res.on('close', () => { if (!res.writableEnded) { ctl.gone = true; ctl.onGone?.(); } });
        const r = await CMD[name](body ? JSON.parse(body) : {}, ctl);
        reply = Array.isArray(r) ? { ok: true, out: r } : { ok: !r.fail, out: r.out, fail: r.fail };
      } catch (e) {
        reply = { ok: false, err: e.message, log: tail(20) };
        if (Date.now() - t0 > SLOW) reply.slow = await evalJS(`(${T})?.stats?.()`).catch(() => null);
      }
      reply.ms = Date.now() - t0; st.last = Date.now();
      res.end(JSON.stringify(reply));
    });
  }).listen(SOCK, () => { save(); log('listening', SOCK, 'browser', pgid); });
}

//// App · CLI /////////////////////////////////////////////////////////

const req = (name, body = {}, ms = 120000) => new Promise((resolve, reject) => {
  const r = request({ socketPath: SOCK, path: '/' + name, method: 'POST', timeout: ms }, res => {
    let s = ''; res.on('data', c => s += c); res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } });
  });
  r.on('error', reject); r.on('timeout', () => r.destroy(new Error(`${name} 超时 ${ms / 1000}s`)));
  r.end(JSON.stringify(body));
});
const alive = async () => { const s = readJson(STATE, null); return !!(s && isAlive(s.pid) && await req('ping', {}, 2000).then(() => true, () => false)); };

async function ensureUp(o) {
  if (await alive()) return false;
  try { const r = await fetch(BASE + 'gode/', { method: 'HEAD' }); if (!r.ok) throw 0; }
  catch { console.error(`静态服务 ${BASE} 不通。在仓库根启动：http-server -p 8765 -c 1（或设 GD_BASE）`); process.exit(1); }
  const n = sweepStale(); if (n) console.error(`# 清掉残留浏览器进程 ${n} 个`);
  const s = readJson(STATE, null); if (s && !isAlive(s.pid)) rmSync(STATE, { force: true });
  mkdirSync(DIR, { recursive: true });
  const fd = openSync(DLOG, 'a');
  spawn(process.execPath, [SELF, '__daemon', JSON.stringify(o)], { detached: true, stdio: ['ignore', fd, fd] }).unref();
  for (let i = 0; i < 150; i++) { await sleep(100); if (await alive()) return true; }
  console.error('守护进程没起来；看 ' + DLOG); console.error(readFileSync(DLOG, 'utf8').split('\n').slice(-10).join('\n')); process.exit(1);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '__daemon') return daemon(JSON.parse(argv[1] || '{}'));
  const { pos, o } = parseArgs(argv), cmd = pos[0];
  if (!cmd || cmd === 'help' || o.h || o.help) { console.log(readFileSync(SELF, 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, '')); return; }
  const t0 = Date.now();
  let body = {};
  switch (cmd) {
    case 'up': await ensureUp(o); body = { url: o.url }; break;
    case 'down': if (!await alive()) { const n = sweepStale(); console.log(`没有在跑的守护进程${n ? `；清掉残留 ${n} 个` : ''}`); return; } break;
    case 'ps': if (!await alive()) { console.log(`没有在跑的守护进程\t匹配 ${PROFILE_PREFIX} 的进程 ${pidsMatching(PROFILE_PREFIX).length} 个`); return; } break;
    case 'log': if (o.f) { if (!await alive()) process.exit(1); for (;;) { const r = await req('log'); for (const l of r.out) console.log(l); await sleep(1000); } } break;
    case 'go': body = { q: pos[1] || '' }; break;
    case 'pose': body = { p: pos[1] }; break;
    case 'shot': body = { poses: pos.slice(1), tag: o.tag, note: o.note, sheet: o.sheet, vs: o.vs, ref: o.ref }; break;
    case 'xz': body = { text: !pos[1] || pos[1] === '-' ? readFileSync(0, 'utf8') : readFileSync(pos[1], 'utf8'), at: o.at, frame: o.frame, shot: o.shot, tag: o.tag }; break;
    case 'hash': body = { b: pos[1] || 'LAST' }; break;
    case 'set': body = { kv: pos.slice(1) }; break;
    case 'eval': body = { js: pos.slice(1).join(' ') }; break;
    case 'check': body = { names: pos.slice(1) }; break;
    case 'perf': body = { frames: o.frames }; break;
    case 'inbox': if (o.f) { if (!await alive()) process.exit(1); for (;;) { const r = await req('inbox', { wait: 25 }, 40000); for (const l of r.out ?? []) console.log(l); } } body = { wait: o.wait, keep: o.keep }; break;
  }
  if (cmd !== 'up' && cmd !== 'down' && cmd !== 'ps' && !await alive()) await ensureUp(o).then(() => req('up', {}));   // 没在跑就顺手 up
  const r = await req(cmd, body, 300000);
  for (const l of r.out ?? []) console.log(l);
  if (!r.ok && r.err) { console.error('✗ ' + r.err); if (r.slow) console.error('卡在：' + JSON.stringify(r.slow)); if (r.log?.length) console.error('--- 页面日志（最后 20 行）\n' + r.log.join('\n')); }
  const ms = Date.now() - t0;
  console.error(`# ${cmd} ${(ms / 1000).toFixed(2)}s${ms > SLOW ? '（慢）' : ''}`);
  process.exit(r.ok ? 0 : 1);
}

main().catch(e => { console.error('✗ ' + (e.stack || e.message)); process.exit(1); });
