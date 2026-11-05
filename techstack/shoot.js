#!/usr/bin/env bun
/**
 * shoot.js — semi-automatic, responsive website screenshotter (zero deps, drives Chrome over CDP;
 * Linux / macOS / Windows). A human browses in a real (non-headless) window; the tool captures.
 *
 * PURPOSE
 *   Build a screenshot corpus of websites AND of their features, at several viewport sizes
 *   (responsive: e.g. desktop + phone). Shots of one site are numbered 0, 1, 2 ... (counter shown
 *   in the HUD, starts at 0, reset by Next); numbers are split into groups of ten so that each
 *   group = one feature walkthrough of the site. A later agent can read <OUT>/index.tsv, chunk
 *   it by host + `group`, view the images and summarize one feature per group.
 *
 * USAGE
 *   [ALL=<tsv>] [OUT=<dir>] [SIZES=<spec>] node techstack/shoot.js [start]     (bun works too)
 *   Windows: set the variables first (PowerShell: $env:ALL='x.tsv'; cmd: set ALL=x.tsv).
 *   -h | --help prints this text.
 *   start    optional first site: a number (1-based row), URL, id or domain; default = row 1.
 *   The browser window is resized at startup so its viewport is exactly SIZES[0].
 *
 * INPUT
 *   ALL=<file.tsv>   site list; tab-separated, first line is a header (skipped), columns:
 *                      id  category  url  host
 *                    rows whose url does not start with http(s):// are ignored.
 *                    default: techstack/data.tsv
 *   SIZES=<spec>     comma-separated viewports, each [tag=]WxH (CSS px); tag defaults to "WxH".
 *                    default: L=1440x960,M=440x956
 *                    Scrollbars are hidden while shooting and do not count toward WxH.
 *
 * OUTPUT   (OUT=<dir>, default: techstack/res)
 *   <OUT>/<host>/<N>-<tag>.webp    one image per viewport per shot, exactly WxH, no scrollbar,
 *                                  quality 82. N = HUD counter "next #N". e.g. shulkr.com/0-L.webp,
 *                                  shulkr.com/0-M.webp, shulkr.com/10-L.webp. Shooting the same
 *                                  N again overwrites. <host> is sanitized to [\w.-].
 *   <OUT>/index.tsv                one line per shot, tab-separated, header first (read columns
 *                                  by header name, order may change):
 *                                  seq    global shot number, only ever increases (own counter)
 *                                  ts     ISO-8601 UTC time
 *                                  group  floor(N/10)*10 (0, 10, 20, ...) = feature walkthrough
 *                                  id     site id from ALL (sanitized)
 *                                  url    page URL at shot time; carries the page selection as a
 *                                         URL text fragment "#:~:text=..." (percent-encoded; long
 *                                         text as "start,end"); plain URL if nothing was selected
 *                                  files  comma-separated paths relative to OUT, one per viewport
 *                                  scroll window scroll per viewport: ";"-joined tag=x,y/pageHeight
 *                                         (CSS px; the shot shows the page at that scroll, it is
 *                                         NOT reset to the top)
 *                                  xy     right-click position "x,y" (CSS px in the window viewport,
 *                                         i.e. SIZES[0]); empty when shot via the HUD button
 *                                  host   directory name under OUT (kept last)
 *
 * HUD / MOUSE (UI is English)
 *   PrtSc    right click   shoot the current page at every SIZES viewport; file number N = HUD
 *                          counter "next #N", then the counter becomes N+1
 *   Next     middle click  go to the next site in ALL (wraps at the end), counter -> 0
 *   +Group                 align the counter up to a multiple of 10 (1 -> 10; no-op if already
 *                          aligned). Press it between two features so each feature starts a
 *                          new group of ten. (index.tsv seq is not affected.)
 *   Shift+right click      native context menu. HUD buttons also work with left click.
 *   Status bar items (click): "i/n" = Goto (counter untouched); "#N" = type the counter;
 *                          "freeze" = disable page JS while shooting;
 *                          "del" = button: then click one element to delete it;
 *                          "edit" = click, then click one element: it becomes contentEditable
 *                          (edit ON); click "edit" again = turn it off. Esc cancels picking
 *                          (the picker swallows page clicks while armed).
 *
 * ENV (misc)
 *   CHROME=<bin>       browser executable (default: auto-detect Chrome/Chromium/Edge)
 *   SHOOT_PORT=<port>  fixed debugging port
 *   SHOOT_HEADLESS=1   headless, self-test only
 */
import { readFileSync, mkdirSync, writeFileSync, appendFileSync, existsSync, rmSync, mkdtempSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';

//// Lib ///////////////////////////////////////////////////////////////
// 与具体业务无关的通用件：不得引用下方 App 段的任何变量。

const PROFILE_PREFIX = 'mcshoot-';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const die = msg => { console.error(msg); process.exit(1); };

/** 删目录；Windows 上浏览器刚退出时常 EBUSY，所以带重试 */
const rmDir = dir => {
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
};

/** 进程是否还活着（跨平台；EPERM 说明存在但无权限） */
const isAlive = pid => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

/** 读 TSV：去 BOM、兼容 CRLF；返回 { header, rows }（rows 为字符串数组的数组，去空行） */
function readTsv(file) {
  const [header = '', ...lines] = readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  return {
    header: header.split('\t'),
    rows: lines.filter(Boolean).map(l => l.split('\t')),
  };
}

/** 选中文本 → URL 文本片段指令 ":~:text=…"（规范要求 - , & 也转义；长文本取首尾 start,end） */
function textDirective(raw) {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const enc = s => encodeURIComponent(s.trim()).replace(/-/g, '%2D');
  return `:~:text=${t.length <= 120 ? enc(t) : `${enc(t.slice(0, 50))},${enc(t.slice(-50))}`}`;
}

/** 把 ":~:text=…" 指令接到 URL 的 fragment 上（已有的指令先去掉） */
function withFragment(href, directive) {
  if (!directive) return href;
  const [base, ...rest] = href.split('#');
  const frag = rest.join('#').split(':~:')[0];
  return `${base}#${frag}${directive}`;
}

function webpSize(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') {
    const b = buf.readUIntLE(21, 4);
    return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)];
  }
  return null;
}

function freePort() {
  if (process.env.SHOOT_PORT) return Promise.resolve(Number(process.env.SHOOT_PORT));
  return new Promise((res, rej) => {
    const s = createServer();
    s.unref();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

// ── 极简 CDP 客户端（browser 级 ws + flatten session） ─────────────────
/** `api.Domain.method(params)` → `send('Domain.method', params)`，免去字符串方法名 */
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
        this.#pending.delete(m.id);
        clearTimeout(p.timer);
        m.error ? p.reject(new Error(`${p.method} → ${m.error.message}`)) : p.resolve(m.result);
      } else if (m.method) {
        for (const fn of this.#subs) fn(m);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.#id;
    const msg = sessionId ? { id, method, params, sessionId } : { id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`${method} 超时`));
      }, 90000);
      this.#pending.set(id, { resolve, reject, method, timer });
      this.ws.send(JSON.stringify(msg));
    });
  }
  /** 类型化入口：session() 为 browser 级，session(sid) 绑定到某个 target */
  session(sessionId) { return rpc((method, params) => this.send(method, params, sessionId)); }
  on(fn) { this.#subs.add(fn); return () => this.#subs.delete(fn); }
  /** 等一个事件（超时返回 null，不抛） */
  waitEvent(method, sessionId, ms = 30000) {
    return new Promise(resolve => {
      const off = this.on(m => {
        if (m.method !== method || (sessionId && m.sessionId !== sessionId)) return;
        clearTimeout(t); off(); resolve(m);
      });
      const t = setTimeout(() => { off(); resolve(null); }, ms);
    });
  }
}

// ── 启动 Chromium ─────────────────────────────────────────────────────
function browserCandidates() {
  const e = process.env;
  const under = (roots, ...rel) => roots.filter(Boolean).map(r => join(r, ...rel));
  switch (process.platform) {
    case 'win32': {
      const roots = [e.PROGRAMFILES, e['PROGRAMFILES(X86)'], e.LOCALAPPDATA];
      return [
        ...under(roots, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        ...under(roots, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ];
    }
    case 'darwin':
      return [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      ];
    default:
      return ['/usr/bin/chromium', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'];
  }
}

/** 有 /proc 才能找回孤儿进程（Linux）；其他平台跳过清扫，只靠退出时删 profile */
const HAS_PROC = process.platform === 'linux' && existsSync('/proc');

function pidsMatching(dir) {
  const out = [];
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    let cmd = '';
    try { cmd = readFileSync(`/proc/${d}/cmdline`, 'utf8'); } catch { continue; }
    if (cmd.includes(`--user-data-dir=${dir}`)) out.push(Number(d));
  }
  return out;
}

/** 上次被硬杀（SIGKILL/timeout）残留的浏览器：profile 里没有活着的 owner 就清掉 */
function sweepStale() {
  if (!HAS_PROC) return;
  let killed = 0;
  for (const name of readdirSync(tmpdir())) {
    if (!name.startsWith(PROFILE_PREFIX)) continue;
    const dir = join(tmpdir(), name);
    let owner = 0;
    try { owner = Number(readFileSync(join(dir, 'owner'), 'utf8')); } catch {}
    if (owner > 0 && isAlive(owner)) continue; // 另一个实例还活着
    for (const pid of pidsMatching(dir)) {
      try { process.kill(pid, 'SIGTERM'); killed++; } catch {}
    }
    rmDir(dir);
  }
  if (killed) log(`清掉上次残留的浏览器进程 ${killed} 个`);
}

/** 起一个带独立 profile 的 Chromium，返回 { child, port, profile, wsUrl } */
async function launch({ width, height }) {
  const bin = [process.env.CHROME, ...browserCandidates()].find(p => p && existsSync(p));
  if (!bin) throw new Error('没找到 chromium / chrome / edge（可用 CHROME=<bin> 指定）');
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    throw new Error('没有 DISPLAY/WAYLAND_DISPLAY，非无头窗口起不来（自测可设 SHOOT_HEADLESS=1）');
  }
  sweepStale();
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), PROFILE_PREFIX));
  writeFileSync(join(profile, 'owner'), String(process.pid));
  const flags = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,MediaRouter',
    '--hide-crash-restore-bubble',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    `--window-size=${width},${height}`,
    '--window-position=60,60',
    'about:blank',
  ];
  if (process.env.SHOOT_HEADLESS === '1') flags.unshift('--headless=new');

  const child = spawn(bin, flags, { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', () => {}); // 别让 Chromium 的噪声刷屏

  let wsUrl = null;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      const j = await r.json();
      wsUrl = j.webSocketDebuggerUrl;
    } catch { await sleep(150); }
  }
  if (!wsUrl) { child.kill('SIGKILL'); throw new Error('Chromium 调试端口没起来'); }
  return { child, port, profile, wsUrl };
}

//// App ///////////////////////////////////////////////////////////////

// Bun 有 import.meta.dir；Node 没有，回落到 fileURLToPath
const SELF = fileURLToPath(import.meta.url);
const TECH = import.meta.dir ?? dirname(SELF);
const QUALITY = 82;
const GROUP = 10;
const INDEX_COLS = ['seq', 'ts', 'group', 'id', 'url', 'files', 'scroll', 'xy', 'host'];

// ── 参数 ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  console.log(readFileSync(SELF, 'utf8').split('*/')[0].replace(/^#![^\n]*\n/, '').trim());
  process.exit(0);
}

const ALL = resolve(process.env.ALL || join(TECH, 'data.tsv'));
const OUT = resolve(process.env.OUT || join(TECH, 'res'));
const INDEX = join(OUT, 'index.tsv');

/** "L=1440x960,440x956" → [{tag, w, h}] */
function parseSizes(spec) {
  return spec.split(',').map(s => s.trim()).filter(Boolean).map(item => {
    const m = /^(?:([\w.-]+)=)?(\d+)x(\d+)$/i.exec(item);
    if (!m) die(`SIZES 项 "${item}" 不合法，应为 [tag=]WxH，如 L=1440x960,440x956`);
    const [, tag, w, h] = m;
    return { tag: tag || `${w}x${h}`, w: +w, h: +h };
  });
}
const SIZES = parseSizes(process.env.SIZES || 'L=1440x960,M=440x956');
if (!SIZES.length) die('SIZES 为空');

// ── 站点清单 ──────────────────────────────────────────────────────────
if (!existsSync(ALL)) die(`清单不存在: ${ALL}`);
const rows = readTsv(ALL).rows
  .filter(c => c.length >= 4 && /^https?:/.test(c[2] || ''))
  .map(([id, category, url, host]) => ({ id, category, url, host: host.trim() }));
if (!rows.length) die(`${ALL} 没读到任何站点`);

/** 数字（1 基序号）/ URL / id / 域名 → 清单下标，没有则 -1 */
function findRow(input) {
  const s = input.trim();
  if (!s) return -1;
  if (/^\d+$/.test(s)) return +s >= 1 && +s <= rows.length ? +s - 1 : -1;
  const exact = rows.findIndex(r => r.url === s || r.id === s);
  if (exact >= 0) return exact;
  let h = s;
  try { h = new URL(s).hostname; } catch { /* 不是 URL，按域名处理 */ }
  h = h.replace(/^www\./, '');
  return rows.findIndex(r => r.host === h || r.host.includes(h) || h.includes(r.host));
}

const startIdx = (() => {
  if (!args[0]) return 0;
  const hit = findRow(args[0]);
  if (hit < 0) console.warn(`起点 "${args[0]}" 没匹配到清单，从第一行开始`);
  return Math.max(hit, 0);
})();

// ── 截图索引（<OUT>/index.tsv）与全局序号（从 0 起） ───────────────────
const lastSeq = () => {
  if (!existsSync(INDEX)) return -1;
  const { header, rows } = readTsv(INDEX);
  const k = Math.max(0, header.indexOf('seq'));
  return Math.max(-1, ...rows.map(c => Number(c[k])).filter(Number.isFinite));
};

/** 保证 index.tsv 表头 = INDEX_COLS；旧文件按列名重排（缺列补空），不丢数据 */
function ensureIndex() {
  mkdirSync(OUT, { recursive: true });
  const head = INDEX_COLS.join('\t');
  if (!existsSync(INDEX)) return writeFileSync(INDEX, head + '\n');
  const { header, rows } = readTsv(INDEX);
  if (header.join('\t') === head) return;
  const col = (c, k) => c[header.indexOf(k)] ?? '';
  const lines = rows.map(c => INDEX_COLS.map(k => (
    k === 'url' ? withFragment(col(c, 'url'), col(c, 'sel')) : col(c, k))).join('\t')); // 旧 sel 列并入 url
  writeFileSync(INDEX, [head, ...lines].join('\n') + '\n');
}

const appendShot = entry => {
  ensureIndex();
  appendFileSync(INDEX, INDEX_COLS.map(k => entry[k] ?? '').join('\t') + '\n');
};

let nextSeq = lastSeq() + 1; // index.tsv 的 seq：全局只增，只作流水号
let shown = 0;               // 页面计数器 = 下一张的编号 = 文件名编号；Next 归零，可手输

/** 下一张的编号对齐到 GROUP 的倍数（已对齐则不变） */
const alignGroup = () => { shown = Math.ceil(shown / GROUP) * GROUP; };

// ── 注入页面里的 HUD + 键位 ───────────────────────────────────────────
// 以真函数书写（可 lint / 高亮），用 Function#toString 序列化注入；
// 函数体必须自包含，不能引用外层变量。
function inject() {
  if (window.__shoot_hud) return;

  const CSS = `
    :host{all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;
      font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#f3e6d2}
    .hud{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
    .row{display:flex;gap:6px}
    button{all:unset;cursor:pointer;display:flex;align-items:center;gap:7px;
      padding:7px 11px;border-radius:6px;background:rgba(24,17,11,.86);border:1px solid #7c5c34;
      color:#f0c069;box-shadow:0 2px 8px rgba(0,0,0,.5);transition:opacity .15s ease,transform .1s ease}
    button b{font-weight:700}button span{color:#c9b394;font-size:11px}
    .row:hover button{opacity:0}.row button:hover{opacity:.45}
    button:active{transform:translateY(1px)}
    .meta{background:rgba(24,17,11,.72);border:1px solid #544026;border-radius:6px;
      padding:3px 8px;color:#c9b394;font-size:11px;max-width:62vw;text-align:right}
    .meta a{cursor:pointer;color:#f0c069;text-decoration:underline dotted}
    .meta a:hover{color:#fff}
    .toast{background:rgba(30,45,20,.92);border:1px solid #4b7a24;border-radius:6px;
      padding:4px 9px;color:#b6ff7a;font-size:11px;opacity:0;transform:translateY(4px);
      transition:opacity .2s,transform .2s;max-width:62vw}
    .toast.on{opacity:1;transform:none}`;

  const act = (type, value, extra) => {
    if (typeof window.__shoot !== 'function') return;
    window.__shoot(JSON.stringify({ type, value, ...extra, host: location.hostname, url: location.href }));
  };

  const mount = () => {
    if (window.__shoot_hud || !document.body) return;
    const host = document.createElement('div');
    host.id = '__shoot_host';
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    const wrap = document.createElement('div');
    wrap.className = 'hud';
    wrap.innerHTML = `
      <div class="row">
        <button type="button" data-act="shot"><b>PrtSc</b><span>RMB</span></button>
        <button type="button" data-act="next"><b>Next</b><span>MMB</span></button>
        <button type="button" data-act="group"><b>+Group</b></button>
      </div><div class="meta"></div><div class="toast"></div>`;
    root.appendChild(wrap);
    const metaEl = root.querySelector('.meta');
    const toastEl = root.querySelector('.toast');

    wrap.addEventListener('mousedown', ev => ev.preventDefault()); // 点 HUD 不清掉页面选区
    wrap.addEventListener('click', ev => {
      const el = ev.target.closest('[data-act]');
      if (!el) return;
      ev.preventDefault();
      ev.stopPropagation();
      const [type, value] = el.dataset.act.split(':');
      if (type === 'goto') {
        const s = window.__shoot_state || {};
        const v = prompt(`Go to site: number 1-${s.n ?? '?'}, id or domain`, String(s.i ?? ''));
        if (v && v.trim()) act('goto', v.trim());
      } else if (type === 'num') {
        const s = window.__shoot_state || {};
        const v = prompt('Shot counter (number of the next shot)', String(s.seq ?? 0));
        if (v && /^\d+$/.test(v.trim())) act('num', Number(v.trim()));
      } else act(type, value);
    });

    let toastTimer = 0;
    window.__shoot_hud = on => { host.style.display = on ? '' : 'none'; };
    const mk = (text, act, title) => {
      const a = document.createElement('a');
      a.textContent = text;
      a.dataset.act = act;
      a.title = title;
      return a;
    };
    window.__shoot_meta = m => {
      window.__shoot_state = m;
      const on = v => (v ? 'ON' : 'off');
      metaEl.replaceChildren(
        mk(`${m.i}/${m.n}`, 'goto', 'Go to site (number, id or domain)'),
        ` · ${m.id} · ${m.host} · next `,
        mk(`#${m.seq}`, 'num', 'Shot counter: click to type a number (files are named <N>-<tag>.webp)'),
        ' · ',
        mk(`freeze ${on(m.freeze)}`, 'freeze', 'Disable page JS while shooting'),
        ' · ',
        mk(m.pick === 'del' ? 'del…' : 'del', 'pick:del', 'Click, then click one element to delete it (Esc cancels)'),
        ' · ',
        mk(m.pick === 'edit' ? 'edit…' : `edit ${on(m.editing)}`, 'pick:edit',
          'ON: click one element to make it contentEditable; click again to turn it off (Esc cancels picking)'));
    };
    window.__shoot_toast = txt => {
      toastEl.textContent = txt;
      toastEl.classList.add('on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2800);
    };
  };

  // 右键 = 截图；Shift+右键 放行原生菜单
  addEventListener('contextmenu', e => {
    if (e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    act('shot', undefined, { xy: [Math.round(e.clientX), Math.round(e.clientY)] });
  }, true);
  // 中键 = 下一站；先掐掉自动滚动
  addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); }, true);
  addEventListener('auxclick', e => {
    if (e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    act('next');
  }, true);

  // Esc = 退出元素拾取（拾取层会吞掉鼠标点击，状态条点不到，只能靠键盘）
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && window.__shoot_state?.pick) act('pickoff');
  }, true);

  if (document.body) mount();
  else addEventListener('DOMContentLoaded', mount, { once: true });
}

// ── 主流程 ────────────────────────────────────────────────────────────
const { child, port, profile, wsUrl } = await launch(SIZES[0]);
log(`chromium pid ${child.pid} · CDP ${port} · ${SIZES.map(s => `${s.tag} ${s.w}×${s.h}`).join(' / ')}`);
log(`清单 ${ALL}（${rows.length} 站）→ 输出 ${OUT} · 下一张 #${nextSeq}`);
if (process.env.SHOOT_HEADLESS === '1') log('（SHOOT_HEADLESS=1：这一轮是无头自测）');

let closed = false;
function shutdown(code = 0) {
  if (closed) return;
  closed = true;
  try { child.kill('SIGTERM'); } catch {}
  setTimeout(() => rmDir(profile), 300);
  setTimeout(() => process.exit(code), 400);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
child.on('exit', () => { if (!closed) { log('浏览器已关闭'); shutdown(0); } });

const ws = await new Promise((res, rej) => {
  const s = new WebSocket(wsUrl);
  s.addEventListener('open', () => res(s), { once: true });
  s.addEventListener('error', () => rej(new Error('CDP WebSocket 连不上')), { once: true });
});
const cdp = new Cdp(ws);

const { targetId } = await cdp.session().Target.createTarget({ url: 'about:blank' });
const { sessionId: sid } = await cdp.session().Target.attachToTarget({ targetId, flatten: true });
const page = cdp.session(sid);
await page.Page.enable();
await page.Runtime.enable();
await page.Runtime.addBinding({ name: '__shoot' });
await page.Page.addScriptToEvaluateOnNewDocument({ source: `(${inject})()` });

/** 在页面里执行函数：args 经 JSON 传入，返回值按值带回；失败返回 undefined */
const evalJS = async (fn, ...fnArgs) => {
  try {
    const r = await page.Runtime.evaluate({
      expression: `(${fn})(...${JSON.stringify(fnArgs)})`,
      returnByValue: true,
    });
    return r?.result?.value;
  } catch { return undefined; }
};

let cur = startIdx;
let busy = false;
let freeze = false;
let pick = null; // 'del' | 'edit' | null：F12 式拾取模式

const PICK_ACTIONS = {
  del: function () { this.remove(); },
  edit: function () { this.contentEditable = 'true'; this.focus(); },
};
let editObj = null; // 当前处于 contentEditable 的元素（远端对象 id）；再点 edit = 直接关掉

let overlayReady = false;
/** 开/关页面里的元素拾取覆盖层（Overlay 域，F12 picker 同款） */
async function overlayMode(mode) {
  if (!overlayReady) {
    await page.DOM.enable();
    await page.Overlay.enable();
    overlayReady = true;
  }
  await page.Overlay.setInspectMode({
    mode: mode ? 'searchForNode' : 'none',
    highlightConfig: {
      contentColor: { r: 111, g: 168, b: 220, a: 0.35 },
      borderColor: { r: 240, g: 192, b: 105, a: 0.9 },
    },
  });
}

async function setPick(mode) {
  pick = mode;
  await overlayMode(mode);
  log(`Pick ${mode ?? 'off'}`);
  await showMeta();
  toast(mode ? `${mode}: click an element · Esc to stop` : 'pick off');
}

const showMeta = () => {
  const row = rows[cur];
  return evalJS(m => window.__shoot_meta?.(m), {
    i: cur + 1, n: rows.length, id: row.id, host: row.host, seq: shown, freeze, pick, editing: !!editObj,
  });
};
const toast = text => evalJS(t => window.__shoot_toast?.(t), text);

async function goto(i) {
  const row = rows[i];
  cur = i;
  editObj = null;
  const loaded = cdp.waitEvent('Page.loadEventFired', sid, 30000);
  try {
    const r = await page.Page.navigate({ url: row.url });
    if (r?.errorText) log(`  ! 导航报错 ${r.errorText}`);
  } catch (e) {
    log(`  ! 导航失败 ${e.message}`);
  }
  if (!await loaded) log('  ! 等 load 超时，照常继续');
  await sleep(600);
  await showMeta();
  log(`[${i + 1}/${rows.length}] ${row.id} → ${row.url}`);
}

/** 当前实际 URL 对应的清单行（用户手动跳走也能对号），附带实际 href */
async function currentRow() {
  const href = (await evalJS(() => location.href)) || '';
  let host = '';
  try { host = new URL(href).hostname.replace(/^www\./, ''); } catch {}
  const row = rows.find(r => r.url === href)
    || rows.find(r => r.host === host || r.host.endsWith('.' + host) || host.endsWith('.' + r.host))
    || { id: host || 'unknown', host: host || 'unknown' };
  return { ...row, href };
}

const setViewport = (width, height) => page.Emulation.setDeviceMetricsOverride({
  width, height, deviceScaleFactor: 1, mobile: false,
  screenWidth: width, screenHeight: height,
  screenOrientation: { type: height > width ? 'portraitPrimary' : 'landscapePrimary', angle: 0 },
});

/** 调整真实浏览器窗口，使可视区域（视口）恰为 w×h；与截图时的尺寸模拟无关 */
async function fitWindow(w, h) {
  const browser = cdp.session();
  const { windowId, bounds } = await browser.Browser.getWindowForTarget({ targetId });
  const inner = await evalJS(() => [innerWidth, innerHeight]);
  if (!inner) return;
  await browser.Browser.setWindowBounds({ windowId, bounds: { windowState: 'normal' } });
  await browser.Browser.setWindowBounds({
    windowId,
    bounds: { width: bounds.width + w - inner[0], height: bounds.height + h - inner[1] },
  });
  await sleep(300);
  const now = await evalJS(() => [innerWidth, innerHeight]);
  if (now?.[0] !== w || now?.[1] !== h) log(`  ! 窗口视口 ${now?.join('×')} ≠ ${w}×${h}（可能超出屏幕）`);
}

async function capture(xy) {
  if (busy) return;
  busy = true;
  const num = shown; // 文件名编号；成功后才推进
  const seq = nextSeq;
  const row = await currentRow();
  const id = (row.id || 'unknown').replace(/[^\w.-]/g, '_');
  const hostDir = row.host.replace(/[^\w.-]/g, '_'); // Windows 不允许目录名含 ':' 等
  const dir = join(OUT, hostDir);
  mkdirSync(dir, { recursive: true });
  const sel = textDirective(await evalJS(() => String(getSelection())) || ''); // 选区先读，后面会隐藏 HUD
  if (pick) await overlayMode(null).catch(() => {}); // 拾取高亮不进图
  await evalJS(() => window.__shoot_hud(false));
  const files = [];
  const scroll = [];
  try {
    await page.Emulation.setScrollbarsHidden({ hidden: true }); // 滚动条不进图，也不占 WxH 的布局宽度
    // 冻结 JS：各尺寸下页面脚本不再运行，内容一致（CSS 媒体查询照常响应尺寸）
    if (freeze) await page.Emulation.setScriptExecutionDisabled({ value: true });
    for (const { tag, w, h } of SIZES) {
      await setViewport(w, h);
      await sleep(w > 700 ? 500 : 700);
      // 不回顶：保持用户正在看的滚动位置，并按尺寸记下实际位置（缩放后可能被钳制）
      const pos = await evalJS(() => [scrollX, scrollY, document.documentElement.scrollHeight].map(Math.round)) || [0, 0, 0];
      scroll.push(`${tag}=${pos[0]},${pos[1]}/${pos[2]}`);
      await sleep(120);
      const { data } = await page.Page.captureScreenshot(
        { format: 'webp', quality: QUALITY, fromSurface: true, captureBeyondViewport: false });
      const buf = Buffer.from(data, 'base64');
      const name = `${num}-${tag}.webp`;
      writeFileSync(join(dir, name), buf);
      files.push(`${hostDir}/${name}`);
      const dim = webpSize(buf) || [w, h];
      log(`  ${hostDir}/${name} ${dim[0]}×${dim[1]} ${(buf.length / 1024).toFixed(0)}KB`);
      if (dim[0] !== w || dim[1] !== h) log(`  ! ${name} 尺寸 ${dim[0]}×${dim[1]} ≠ ${w}×${h}`);
    }
  } finally {
    await page.Emulation.setScriptExecutionDisabled({ value: false }).catch(() => {});
    await page.Emulation.setScrollbarsHidden({ hidden: false }).catch(() => {});
    await page.Emulation.clearDeviceMetricsOverride().catch(() => {}); // 回到真实窗口尺寸
    await sleep(150);
    await evalJS(() => window.__shoot_hud(true));
    if (pick) await overlayMode(pick).catch(() => {});
    busy = false;
  }
  nextSeq = seq + 1;
  shown = num + 1;
  appendShot({
    seq, ts: new Date().toISOString(), group: Math.floor(num / GROUP) * GROUP, id, url: withFragment(row.href, sel),
    files: files.join(','), scroll: scroll.join(';'), xy: xy ? xy.join(',') : '', host: hostDir,
  });
  log(`✔ #${num} (seq ${seq}) ${hostDir}/${id} (${files.length} 张)${sel ? ` sel ${sel.slice(0, 40)}` : ''}${xy ? ` @${xy}` : ''}`);
  await showMeta();
  await toast(`#${num} saved ${hostDir}/${id}`);
}

cdp.on(m => {
  if (m.method !== 'Runtime.bindingCalled' || m.sessionId !== sid) return;
  if (m.params.name !== '__shoot') return;
  let p;
  try { p = JSON.parse(m.params.payload); } catch { return; }
  if (p.type === 'shot') capture(p.xy);
  else if (busy) return;
  else if (p.type === 'next') { shown = 0; goto((cur + 1) % rows.length); }
  else if (p.type === 'num') { shown = Number(p.value); log(`Counter → ${shown}`); showMeta(); }
  else if (p.type === 'goto') {
    const i = findRow(String(p.value ?? ''));
    if (i < 0) toast(`no site matches "${p.value}"`);
    else goto(i);
  } else if (p.type === 'freeze') {
    freeze = !freeze;
    log(`Freeze ${freeze ? 'on' : 'off'}`);
    showMeta();
    toast(`freeze JS while shooting: ${freeze ? 'on' : 'off'}`);
  } else if (p.type === 'pick') {
    if (p.value === 'edit' && editObj) {
      const objectId = editObj;
      editObj = null;
      page.Runtime.callFunctionOn({ objectId, functionDeclaration: String(function () { this.contentEditable = 'false'; }) })
        .catch(() => {}).then(showMeta);
    } else setPick(pick === p.value ? null : p.value);
  } else if (p.type === 'pickoff') setPick(null);
  else if (p.type === 'group') {
    alignGroup();
    log(`+Group → 下一张 #${shown}`);
    showMeta();
    toast(`next shot #${shown}`);
  }
});

// F12 式元素拾取：一次一个——点中的节点交给 PICK_ACTIONS，随即退出拾取
cdp.on(async m => {
  if (m.method !== 'Overlay.inspectNodeRequested' || m.sessionId !== sid || !pick || busy) return;
  const mode = pick;
  pick = null;
  try {
    await overlayMode(null);
    const { object } = await page.DOM.resolveNode({ backendNodeId: m.params.backendNodeId });
    await page.Runtime.callFunctionOn({ objectId: object.objectId, functionDeclaration: String(PICK_ACTIONS[mode]) });
    if (mode === 'edit') editObj = object.objectId;
    log(`  pick ${mode} ✔`);
  } catch (e) {
    log(`  ! pick 失败 ${e.message}`);
  }
  await showMeta();
});

await fitWindow(SIZES[0].w, SIZES[0].h);
await goto(startIdx);
log('右键 PrtSc · 中键 Next · 状态条: 点序号 Goto 跳站 / 点 freeze 切换截图时冻结 JS · +Group 序号对齐到下个十位 · Shift+右键放行原生菜单 · Ctrl+C 退出');

ws.addEventListener('close', () => { if (!closed) { log('CDP 断开，退出'); shutdown(0); } });
